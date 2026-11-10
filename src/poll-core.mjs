// All poll rules live here so the same code runs on Netlify and in the local dev server.
// The whole dataset is ONE JSON document: { polls: { "<monday ISO date>": poll } }.
// Polls for weeks that have ended are dropped every time the file is read.

export const DEFAULT_TZ = "Europe/Budapest";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(tz = DEFAULT_TZ, now = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
}

export function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(iso) {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalise(raw) {
  return raw && typeof raw === "object" && raw.polls && typeof raw.polls === "object"
    ? raw
    : { polls: {} };
}

// Remove every poll whose Sunday is already behind us. Returns true if anything went.
export function purge(data, today) {
  let changed = false;
  for (const weekStart of Object.keys(data.polls)) {
    if (!DATE.test(weekStart) || addDays(weekStart, 6) < today) {
      delete data.polls[weekStart];
      changed = true;
    }
  }
  return changed;
}

function cleanSlots(slots, weekStart) {
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) {
    throw new Refusal(400, "The answer is missing its day choices.");
  }
  const weekEnd = addDays(weekStart, 6);
  const out = {};
  for (const [day, times] of Object.entries(slots)) {
    if (!DATE.test(day) || day < weekStart || day > weekEnd) {
      throw new Refusal(400, "One of the days is not in this poll's week.");
    }
    if (!Array.isArray(times) || times.some((t) => typeof t !== "string" || !TIME.test(t))) {
      throw new Refusal(400, "Start times must look like 19:00.");
    }
    const unique = [...new Set(times)].sort();
    if (unique.length > 6) throw new Refusal(400, "Too many start times for one day.");
    if (unique.length) out[day] = unique;
  }
  return out;
}

function apply(data, body, today, newId) {
  if (!body || typeof body !== "object") throw new Refusal(400, "Nothing was sent.");
  const thisWeek = mondayOf(today);

  if (body.action === "create") {
    const weekStart =
      body.week === "this" ? thisWeek : body.week === "next" ? addDays(thisWeek, 7) : null;
    if (!weekStart) throw new Refusal(400, "Choose this week or next week.");
    if (!data.polls[weekStart]) {
      data.polls[weekStart] = { weekStart, createdAt: new Date().toISOString(), responses: {} };
    }
    return {};
  }

  const poll = data.polls[body.weekStart];
  if (!poll) throw new Refusal(404, "That poll no longer exists. Reload the page.");

  if (body.action === "vote") {
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name) throw new Refusal(400, "Add a name first.");
    if (name.length > 40) throw new Refusal(400, "Keep the name under 40 characters.");
    const slots = cleanSlots(body.slots, poll.weekStart);

    // Reuse the existing answer when the id matches, or when someone with the same
    // name already answered (so a cleared browser cache does not create a duplicate).
    let id = typeof body.id === "string" && poll.responses[body.id] ? body.id : null;
    const sameName = Object.values(poll.responses).find(
      (r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== id
    );
    if (sameName) {
      if (id) throw new Refusal(409, `Someone else already answered as ${sameName.name}.`);
      id = sameName.id;
    }
    if (!id) {
      if (Object.keys(poll.responses).length >= 50) {
        throw new Refusal(400, "This poll already has 50 answers.");
      }
      id = newId();
    }
    poll.responses[id] = { id, name, slots, updatedAt: new Date().toISOString() };
    return { id };
  }

  if (body.action === "remove") {
    delete poll.responses[body.id];
    return {};
  }

  throw new Refusal(400, "Unknown action.");
}

/**
 * store: { read(): Promise<{data, etag}>, write(data, etag): Promise<boolean> }
 * write must return false when the file changed since read (so we retry on the fresh copy).
 */
export async function handle(store, method, body, opts = {}) {
  if (method !== "GET" && method !== "POST") {
    return { status: 405, json: { error: "Use GET or POST." } };
  }
  const today = todayIn(opts.tz || DEFAULT_TZ, opts.now);
  const newId = opts.newId || (() => crypto.randomUUID());

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: raw, etag } = await store.read();
    const data = normalise(raw);
    let changed = purge(data, today);
    let extra = {};

    if (method === "POST") {
      try {
        extra = apply(data, body, today, newId);
        changed = true;
      } catch (err) {
        if (err instanceof Refusal) return { status: err.status, json: { error: err.message } };
        throw err;
      }
    }

    if (!changed || (await store.write(data, etag))) {
      const thisWeek = mondayOf(today);
      return {
        status: 200,
        json: {
          today,
          weeks: { this: thisWeek, next: addDays(thisWeek, 7) },
          polls: data.polls,
          ...extra,
        },
      };
    }
  }
  return { status: 409, json: { error: "Someone else saved at the same moment. Try again." } };
}
