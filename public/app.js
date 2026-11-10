(() => {
  "use strict";
  const API = "/api/poll";
  const PRESETS = ["19:00", "20:00"];
  const $ = (id) => document.getElementById(id);

  // ---------- browser cache (name + which answer is yours) ----------
  const cache = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("recnight." + key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("recnight." + key, JSON.stringify(value));
      } catch {}
    },
  };

  // ---------- state ----------
  let server = null;                 // { today, weeks: {this, next}, polls }
  let which = "this";                // which week is on screen
  let draft = {};                    // { "2026-11-12": { "19:00": true, "20:00": false, other: false, otherTime: "21:00" } }
  let editingId = null;              // id of the answer in the form (null = a new one)
  let mode = "edit";                 // "edit" = choosing, "done" = submitted and locked
  let editingOther = false;          // true while changing someone else's answer
  let busy = false;
  let note = { text: "", bad: false };

  // ---------- dates ----------
  const asDate = (iso) => new Date(iso + "T00:00:00Z");
  const addDays = (iso, n) => {
    const d = asDate(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const fmt = (iso, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(asDate(iso));
  const rangeLabel = (start) => {
    const end = addDays(start, 6);
    const sameMonth = start.slice(0, 7) === end.slice(0, 7);
    return sameMonth
      ? `${fmt(start, { day: "numeric" })}–${fmt(end, { day: "numeric", month: "short" })}`
      : `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short" })}`;
  };

  const weekStart = () => server.weeks[which];
  const poll = () => server.polls[weekStart()] || null;
  const days = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart(), i));
  const mineId = () => cache.get("mine", {})[weekStart()] || null;

  // ---------- tiny DOM helper (text is always set as text, never as HTML) ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== "list") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  // ---------- draft <-> saved answer ----------
  function emptyDraft() {
    const d = {};
    for (const day of days()) d[day] = { "19:00": false, "20:00": false, other: false, otherTime: "21:00" };
    return d;
  }
  function draftFrom(response) {
    const d = emptyDraft();
    for (const [day, times] of Object.entries(response.slots || {})) {
      if (!d[day]) continue;
      for (const t of times) {
        if (PRESETS.includes(t)) d[day][t] = true;
        else {
          d[day].other = true;
          d[day].otherTime = t;
        }
      }
    }
    return d;
  }
  function slotsFromDraft() {
    const slots = {};
    for (const [day, pick] of Object.entries(draft)) {
      const times = PRESETS.filter((t) => pick[t]);
      if (pick.other && pick.otherTime) times.push(pick.otherTime);
      if (times.length) slots[day] = [...new Set(times)];
    }
    return slots;
  }

  // Put the right thing in the form for the week on screen.
  function loadForm() {
    editingOther = false;
    const p = poll();
    const mine = p && mineId() && p.responses[mineId()];
    if (mine) {
      editingId = mine.id;
      draft = draftFrom(mine);
      mode = "done";
    } else {
      editingId = null;
      draft = emptyDraft();
      mode = "edit";
    }
  }

  // ---------- talking to the server ----------
  async function call(body) {
    const res = await fetch(API, body
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : { cache: "no-store" });
    let json = null;
    try {
      json = await res.json();
    } catch {}
    if (!res.ok || !json) throw new Error((json && json.error) || "Could not reach the poll. Check your connection and try again.");
    return json;
  }
  async function act(body, after) {
    if (busy) return;
    busy = true;
    note = { text: "", bad: false };
    renderBar();
    try {
      const json = await call(body);
      server = json;
      if (after) after(json);
    } catch (err) {
      note = { text: err.message, bad: true };
    }
    busy = false;
    render();
  }

  // ---------- counting ----------
  function tally() {
    const p = poll();
    const byDay = {};
    let top = 0;
    const responses = p ? Object.values(p.responses) : [];
    for (const r of responses) {
      for (const [day, times] of Object.entries(r.slots)) {
        for (const t of times) {
          const list = ((byDay[day] ||= {})[t] ||= []);
          list.push(r.name);
          top = Math.max(top, list.length);
        }
      }
    }
    const leaders = [];
    for (const day of Object.keys(byDay).sort()) {
      for (const t of Object.keys(byDay[day]).sort()) {
        if (byDay[day][t].length === top) leaders.push({ day, t });
      }
    }
    return { byDay, top, leaders, total: responses.length };
  }

  // ---------- rendering ----------
  function renderWeeks() {
    $("weeks").replaceChildren(
      ...["this", "next"].map((w) =>
        h("button", {
          type: "button",
          role: "tab",
          "aria-selected": String(which === w),
          onclick: () => {
            if (which === w) return;
            which = w;
            note = { text: "", bad: false };
            loadForm();
            render();
          },
        }, w === "this" ? "This week" : "Next week", h("small", {}, rangeLabel(server.weeks[w])))
      )
    );
  }

  function renderVerdict(t) {
    const box = $("verdict");
    const range = rangeLabel(weekStart());
    if (!poll()) {
      box.replaceChildren(
        h("h1", {}, `No poll for ${which === "this" ? "this" : "next"} week yet`),
        h("p", {}, `Create one and everyone with this link can mark the evenings they can record, Monday to Sunday, ${range}.`),
        h("button", { type: "button", class: "btn primary", disabled: busy, onclick: () => act({ action: "create", week: which }, loadForm) }, `Create poll for ${range}`)
      );
      return;
    }
    if (!t.top) {
      box.replaceChildren(
        h("h1", {}, "No evening picked yet"),
        h("p", {}, t.total
          ? `${t.total} ${t.total === 1 ? "person has" : "people have"} answered, and none of the days work so far.`
          : "Mark every evening you can record, then submit your answer.")
      );
      return;
    }
    const names = t.leaders.slice(0, 3).map(({ day, t: time }) => `${fmt(day, { weekday: "long" })} ${time}`);
    const more = t.leaders.length - names.length;
    const headline = names.join(" or ") + (more > 0 ? ` or ${more} more` : "");
    const count = `${t.top} of ${t.total} ${t.total === 1 ? "person" : "people"}`;
    box.replaceChildren(
      h("h1", {}, h("span", { class: "lamp", "aria-hidden": "true" }), headline),
      h("p", {}, t.leaders.length > 1 ? `Tied, with ${count} free for each.` : `${count} can make it.`)
    );
  }

  function renderWeek(t) {
    const box = $("week");
    if (!poll()) {
      box.replaceChildren();
      return;
    }
    const locked = mode === "done" || busy;
    box.replaceChildren(
      ...days().map((day) => {
        const past = day < server.today;
        const pick = draft[day];
        const off = locked || past;
        const toggle = (key) => () => {
          pick[key] = !pick[key];
          renderWeek(tally());
        };
        const rows = Object.keys(t.byDay[day] || {}).sort().map((time) => {
          const who = t.byDay[day][time];
          const lead = who.length === t.top;
          return h("li", { class: lead ? "lead" : "" },
            h("span", { class: "t" }, time),
            h("span", { class: "n", "aria-label": `${who.length} ${who.length === 1 ? "person" : "people"}${lead ? ", leading" : ""}` }, String(who.length)),
            h("span", { class: "who" }, who.join(", ")));
        });
        return h("article", { class: "day" + (past ? " past" : "") + (day === server.today ? " today" : "") },
          h("p", { class: "date" },
            h("b", {}, fmt(day, { weekday: "short" })),
            h("span", {}, fmt(day, { day: "numeric", month: "short" })),
            day === server.today ? h("em", {}, "Today") : past ? h("em", {}, "Passed") : null),
          h("div", { class: "picks", role: "group", "aria-label": `Start times on ${fmt(day, { weekday: "long", day: "numeric", month: "long" })}` },
            ...PRESETS.map((time) => h("button", { type: "button", class: "chip", "aria-pressed": String(pick[time]), disabled: off, onclick: toggle(time) }, time)),
            h("div", { class: "other" },
              h("button", { type: "button", class: "chip", "aria-pressed": String(pick.other), disabled: off, onclick: toggle("other") }, pick.other ? "Other, at" : "Other time"),
              pick.other && clock(pick, off))),
          h("ul", { class: "tally" }, rows));
      })
    );
  }

  // Hour and minute lists instead of the browser's own time field, which shows
  // AM/PM on some devices. This one is 24-hour everywhere.
  function clock(pick, off) {
    const [hh, mm] = pick.otherTime.split(":");
    const two = (n) => String(n).padStart(2, "0");
    const minutes = [...new Set(["00", "15", "30", "45", mm])].sort();
    const set = (part) => (e) => {
      const now = pick.otherTime.split(":");
      now[part] = e.target.value;
      pick.otherTime = now.join(":");
    };
    const list = (label, values, current, part) =>
      h("select", { "aria-label": label, disabled: off, onchange: set(part) },
        ...values.map((v) => h("option", { value: v, selected: v === current }, v)));
    return h("span", { class: "clock" },
      list("Hour", Array.from({ length: 24 }, (_, i) => two(i)), hh, 0),
      h("span", { "aria-hidden": "true" }, ":"),
      list("Minutes", minutes, mm, 1));
  }

  function describe(r) {
    const parts = Object.keys(r.slots).sort().map((day) => `${fmt(day, { weekday: "short" })} ${r.slots[day].join(" / ")}`);
    return parts.length ? parts.join(", ") : "Can't make any evening";
  }

  function renderPeople() {
    const box = $("people");
    const p = poll();
    const list = p ? Object.values(p.responses).sort((a, b) => a.name.localeCompare(b.name)) : [];
    if (!list.length) {
      box.replaceChildren();
      return;
    }
    box.replaceChildren(
      h("h2", {}, `${list.length} ${list.length === 1 ? "answer" : "answers"}`),
      h("ul", {}, ...list.map((r) =>
        h("li", { class: mode === "edit" && editingId === r.id ? "editing" : "" },
          h("span", { class: "who" }, r.name, r.id === mineId() ? h("small", {}, " (you)") : null),
          h("span", { class: "what" }, describe(r)),
          h("span", { class: "acts" },
            h("button", { type: "button", disabled: busy, "aria-label": `Edit ${r.name}'s answer`, onclick: () => startEdit(r) }, "Edit"),
            h("button", { type: "button", disabled: busy, "aria-label": `Remove ${r.name}'s answer`, onclick: () => removeAnswer(r) }, "Remove")))))
    );
  }

  function renderBar() {
    const bar = $("bar");
    bar.hidden = !poll();
    if (bar.hidden) return;
    const done = mode === "done";
    bar.classList.toggle("done", done);
    const p = poll();
    const current = editingId && p.responses[editingId];
    let text = note.text;
    if (!text) {
      if (done && current) text = `Submitted as ${current.name}. Your answer is saved.`;
      else if (editingOther && current) text = `Changing ${current.name}'s answer.`;
    }
    $("barNote").textContent = text;
    $("barNote").classList.toggle("bad", note.bad);
    $("name").disabled = busy;
    $("submit").disabled = busy;
    $("submit").textContent = busy ? "Saving…" : done ? "Change my answer" : current ? "Save changes" : "Submit my answer";
    $("cancel").hidden = done || !current;
  }

  function render() {
    const t = tally();
    renderWeeks();
    renderVerdict(t);
    renderWeek(t);
    renderPeople();
    renderBar();
  }

  // ---------- actions ----------
  function startEdit(r) {
    editingId = r.id;
    editingOther = r.id !== mineId();
    draft = draftFrom(r);
    mode = "edit";
    note = { text: "", bad: false };
    $("name").value = r.name;
    render();
    $("week").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function removeAnswer(r) {
    if (!confirm(`Remove ${r.name}'s answer?`)) return;
    const wasMine = r.id === mineId();
    act({ action: "remove", weekStart: weekStart(), id: r.id }, () => {
      if (wasMine) {
        const mine = cache.get("mine", {});
        delete mine[weekStart()];
        cache.set("mine", mine);
      }
      $("name").value = cache.get("name", "");
      loadForm();
    });
  }

  $("cancel").addEventListener("click", () => {
    note = { text: "", bad: false };
    $("name").value = cache.get("name", "");
    loadForm();
    render();
  });

  $("name").addEventListener("input", (e) => {
    if (!editingOther) cache.set("name", e.target.value.trim());
  });

  $("bar").addEventListener("submit", (e) => {
    e.preventDefault();
    if (mode === "done") {
      mode = "edit";
      note = { text: "", bad: false };
      render();
      return;
    }
    const name = $("name").value.trim();
    if (!name) {
      note = { text: "Add your name so the others know whose answer this is.", bad: true };
      renderBar();
      $("name").focus();
      return;
    }
    const forOther = editingOther;
    const week = weekStart();
    act({ action: "vote", weekStart: week, id: editingId, name, slots: slotsFromDraft() }, (json) => {
      if (!forOther) {
        cache.set("name", name);
        cache.set("mine", { ...cache.get("mine", {}), [week]: json.id });
      }
      $("name").value = cache.get("name", "");
      loadForm();
      if (forOther) note = { text: `Saved ${name}'s answer.`, bad: false };
    });
  });

  // ---------- keep everyone's screen fresh ----------
  async function refresh() {
    if (busy || document.hidden) return;
    try {
      const json = await call();
      if (busy) return;
      const weekChanged = server.weeks.this !== json.weeks.this;
      server = json;
      // Leave a half-finished answer alone; only refresh the counts around it.
      if (weekChanged || mode === "done" || (editingId && !poll()?.responses[editingId])) loadForm();
      if (document.activeElement && document.activeElement.tagName === "SELECT") {
        const t = tally();
        renderVerdict(t);
        renderPeople();
      } else render();
    } catch {}
  }

  (async function start() {
    $("name").value = cache.get("name", "");
    try {
      server = await call();
      // Open on next week's poll if that is the only one that exists.
      if (!server.polls[server.weeks.this] && server.polls[server.weeks.next]) which = "next";
      loadForm();
      render();
      setInterval(refresh, 20000);
      document.addEventListener("visibilitychange", refresh);
    } catch (err) {
      $("verdict").replaceChildren(
        h("h1", {}, "The poll did not load"),
        h("p", {}, err.message),
        h("button", { type: "button", class: "btn primary", onclick: () => location.reload() }, "Reload the page"));
    }
  })();
})();
