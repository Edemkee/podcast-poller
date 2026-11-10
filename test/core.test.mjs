import assert from "node:assert/strict";
import { handle, mondayOf, addDays, todayIn } from "../src/poll-core.mjs";

function memoryStore(initial = null) {
  let data = initial, version = 0, failNext = 0;
  return {
    failTimes(n) { failNext = n; },
    peek: () => data,
    async read() { return { data: data && structuredClone(data), etag: data ? String(version) : null }; },
    async write(next, etag) {
      if (failNext > 0) { failNext--; version++; return false; }
      if ((etag ?? null) !== (data ? String(version) : null)) return false;
      data = structuredClone(next); version++; return true;
    },
  };
}
const at = (iso) => ({ now: new Date(iso), tz: "Europe/Budapest" });
let n = 0;
const ok = (name) => console.log("ok", ++n, name);

// dates
assert.equal(mondayOf("2026-11-10"), "2026-11-09");
assert.equal(mondayOf("2026-11-15"), "2026-11-09"); // Sunday belongs to the week before it ends
assert.equal(mondayOf("2026-11-16"), "2026-11-16");
assert.equal(addDays("2026-11-30", 6), "2026-12-06");
assert.equal(addDays("2026-12-28", 7), "2027-01-04");
assert.equal(todayIn("Europe/Budapest", new Date("2026-11-15T23:30:00Z")), "2026-11-16"); // past midnight locally
assert.equal(mondayOf("2026-03-29"), "2026-03-23"); // DST change day
ok("week maths, month/year rollover, timezone");

const tue = at("2026-11-10T12:00:00Z");
const s = memoryStore();

let r = await handle(s, "GET", null, tue);
assert.deepEqual(r.json.weeks, { this: "2026-11-09", next: "2026-11-16" });
assert.deepEqual(r.json.polls, {});
assert.equal(s.peek(), null);
ok("empty state, nothing written on a plain read");

r = await handle(s, "POST", { action: "create", week: "this" }, tue);
r = await handle(s, "POST", { action: "create", week: "next" }, tue);
assert.deepEqual(Object.keys(r.json.polls).sort(), ["2026-11-09", "2026-11-16"]);
ok("create this week and next week");

r = await handle(s, "POST", { action: "vote", weekStart: "2026-11-09", name: "  Edem ",
  slots: { "2026-11-12": ["20:00", "19:00", "20:00"], "2026-11-13": ["21:30"], "2026-11-14": [] } }, tue);
const id = r.json.id;
assert.deepEqual(r.json.polls["2026-11-09"].responses[id].slots, { "2026-11-12": ["19:00", "20:00"], "2026-11-13": ["21:30"] });
assert.equal(r.json.polls["2026-11-09"].responses[id].name, "Edem");
ok("vote stored, trimmed, de-duplicated, custom time kept");

r = await handle(s, "POST", { action: "vote", weekStart: "2026-11-09", id, name: "Edem", slots: { "2026-11-11": ["19:00"] } }, tue);
assert.equal(Object.keys(r.json.polls["2026-11-09"].responses).length, 1);
assert.deepEqual(r.json.polls["2026-11-09"].responses[id].slots, { "2026-11-11": ["19:00"] });
ok("editing replaces the answer");

r = await handle(s, "POST", { action: "vote", weekStart: "2026-11-09", name: "edem", slots: {} }, tue);
assert.equal(r.json.id, id);
assert.equal(Object.keys(r.json.polls["2026-11-09"].responses).length, 1);
ok("same name without an id updates instead of duplicating");

r = await handle(s, "POST", { action: "vote", weekStart: "2026-11-09", name: "Anna", slots: { "2026-11-11": ["19:00"] } }, tue);
const anna = r.json.id;
r = await handle(s, "POST", { action: "vote", weekStart: "2026-11-09", id: anna, name: "Edem", slots: {} }, tue);
assert.equal(r.status, 409);
ok("renaming onto another person's name is refused");

for (const [bad, why] of [
  [{ action: "vote", weekStart: "2026-11-09", name: "", slots: {} }, "empty name"],
  [{ action: "vote", weekStart: "2026-11-09", name: "X", slots: { "2026-11-16": ["19:00"] } }, "day outside week"],
  [{ action: "vote", weekStart: "2026-11-09", name: "X", slots: { "2026-11-12": ["25:00"] } }, "bad time"],
  [{ action: "vote", weekStart: "2026-11-09", name: "X", slots: { "2026-11-12": "19:00" } }, "times not a list"],
  [{ action: "vote", weekStart: "2026-11-09", name: "X".repeat(41), slots: {} }, "long name"],
  [{ action: "create", week: "2027" }, "bad week"],
  [{ action: "nope", weekStart: "2026-11-09" }, "unknown action"],
  [null, "no body"],
]) {
  r = await handle(s, "POST", bad, tue);
  assert.equal(r.status, 400, why);
}
r = await handle(s, "POST", { action: "vote", weekStart: "2026-11-02", name: "X", slots: {} }, tue);
assert.equal(r.status, 404);
assert.equal((await handle(s, "DELETE", null, tue)).status, 405);
ok("bad input refused with clear statuses");

r = await handle(s, "POST", { action: "remove", weekStart: "2026-11-09", id: anna }, tue);
assert.equal(Object.keys(r.json.polls["2026-11-09"].responses).length, 1);
ok("remove an answer");

// concurrent save: first two writes lose the race, third wins
s.failTimes(2);
r = await handle(s, "POST", { action: "vote", weekStart: "2026-11-16", name: "Bea", slots: { "2026-11-18": ["20:00"] } }, tue);
assert.equal(r.status, 200);
s.failTimes(99);
r = await handle(s, "POST", { action: "vote", weekStart: "2026-11-16", name: "Cili", slots: {} }, tue);
assert.equal(r.status, 409);
s.failTimes(0);
ok("retries on a clashing save, gives up cleanly");

// rolling purge
r = await handle(s, "GET", null, at("2026-11-15T22:30:00Z")); // Sunday 23:30 in Budapest
assert.ok(r.json.polls["2026-11-09"], "still there on Sunday night");
r = await handle(s, "GET", null, at("2026-11-15T23:30:00Z")); // Monday 00:30 in Budapest
assert.deepEqual(Object.keys(r.json.polls), ["2026-11-16"]);
assert.deepEqual(r.json.weeks, { this: "2026-11-16", next: "2026-11-23" });
assert.deepEqual(Object.keys(s.peek().polls), ["2026-11-16"]);
assert.equal(Object.values(r.json.polls["2026-11-16"].responses)[0].name, "Bea");
ok("past week purged from the file on Monday; next week's poll becomes this week's with its answers");

r = await handle(s, "GET", null, at("2026-12-01T12:00:00Z"));
assert.deepEqual(r.json.polls, {});
ok("everything old is gone later");

console.log("\nall", n, "checks passed");
