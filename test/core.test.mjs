import assert from "node:assert/strict";
import { handle, mondayOf, addDays, todayIn, MAX_TRIES, LOCK_MINUTES } from "../src/poll-core.mjs";
import { turnstileVerifier } from "../src/turnstile.mjs";

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
// A made-up password for the tests; the real one lives only in Netlify's settings.
const PW = "test-only-password";
// A stand-in for Cloudflare Turnstile: only this token counts as human.
const HUMAN = "token-from-a-human";
const fakeHuman = async (token) => (token === HUMAN ? { ok: true } : { ok: false, reason: token ? "invalid-input-response" : "missing" });
const at = (iso) => ({
  now: new Date(iso), tz: "Europe/Budapest", password: PW,
  verifyHuman: fakeHuman, attempts: memoryStore(), client: "203.0.113.7", siteKey: "site-key-for-tests",
});
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

r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "  Edem ",
  slots: { "2026-11-12": ["20:00", "19:00", "20:00"], "2026-11-13": ["21:30"], "2026-11-14": [] } }, tue);
const id = r.json.id;
assert.deepEqual(r.json.polls["2026-11-09"].responses[id].slots, { "2026-11-12": ["19:00", "20:00"], "2026-11-13": ["21:30"] });
assert.equal(r.json.polls["2026-11-09"].responses[id].name, "Edem");
ok("vote stored, trimmed, de-duplicated, custom time kept");

r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", id, name: "Edem", slots: { "2026-11-11": ["19:00"] } }, tue);
assert.equal(Object.keys(r.json.polls["2026-11-09"].responses).length, 1);
assert.deepEqual(r.json.polls["2026-11-09"].responses[id].slots, { "2026-11-11": ["19:00"] });
ok("editing replaces the answer");

r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "edem", slots: {} }, tue);
assert.equal(r.json.id, id);
assert.equal(Object.keys(r.json.polls["2026-11-09"].responses).length, 1);
ok("same name without an id updates instead of duplicating");

r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "Anna", slots: { "2026-11-11": ["19:00"] } }, tue);
const anna = r.json.id;
r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", id: anna, name: "Edem", slots: {} }, tue);
assert.equal(r.status, 409);
ok("renaming onto another person's name is refused");

for (const [bad, why] of [
  [{ action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "", slots: {} }, "empty name"],
  [{ action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "X", slots: { "2026-11-16": ["19:00"] } }, "day outside week"],
  [{ action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "X", slots: { "2026-11-12": ["25:00"] } }, "bad time"],
  [{ action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "X", slots: { "2026-11-12": "19:00" } }, "times not a list"],
  [{ action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "X".repeat(41), slots: {} }, "long name"],
  [{ action: "create", week: "2027" }, "bad week"],
  [{ action: "nope", weekStart: "2026-11-09" }, "unknown action"],
  [null, "no body"],
]) {
  r = await handle(s, "POST", bad, tue);
  assert.equal(r.status, 400, why);
}
r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-02", name: "X", slots: {} }, tue);
assert.equal(r.status, 404);
assert.equal((await handle(s, "DELETE", null, tue)).status, 405);
ok("bad input refused with clear statuses");

// password on submit
const before = structuredClone(s.peek());
for (const [given, why] of [[undefined, "no password"], ["", "empty password"], ["test-only-passwor", "wrong password"], [PW.toUpperCase(), "wrong case"], [42, "not a string"]]) {
  r = await handle(s, "POST", { action: "vote", password: given, human: HUMAN, weekStart: "2026-11-09", name: "Zed", slots: {} }, { ...tue, attempts: memoryStore() });
  assert.equal(r.status, 403, why);
  assert.match(r.json.error, /password/i, why);
}
r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-09", name: "Zed", slots: {} }, { ...tue, password: undefined });
assert.equal(r.status, 403, "server without a password refuses every answer");
assert.match(r.json.error, /not been set up/);
assert.deepEqual(s.peek(), before, "nothing was saved by a refused answer");
r = await handle(s, "GET", null, tue);
assert.ok(!JSON.stringify(r.json).includes(PW), "the password is never sent back");
ok("submitting needs the right password; wrong or missing ones save nothing");

for (const given of [undefined, "", "nope"]) {
  r = await handle(s, "POST", { action: "remove", password: given, human: HUMAN, weekStart: "2026-11-09", id: anna }, { ...tue, attempts: memoryStore() });
  assert.equal(r.status, 403);
}
assert.ok(s.peek().polls["2026-11-09"].responses[anna], "a refused removal keeps the answer");
r = await handle(s, "POST", { action: "remove", password: PW, human: HUMAN, weekStart: "2026-11-09", id: anna }, tue);
assert.equal(Object.keys(r.json.polls["2026-11-09"].responses).length, 1);
ok("removing an answer needs the password too");

// the human check (Cloudflare Turnstile) comes before the password
{
  const opts = { ...tue, attempts: memoryStore() };
  const before = structuredClone(s.peek());
  const zed = (extra) => ({ action: "vote", password: PW, weekStart: "2026-11-09", name: "Zed", slots: {}, ...extra });
  for (const token of [undefined, "", "made-up-token"]) {
    r = await handle(s, "POST", zed({ human: token }), opts);
    assert.equal(r.status, 403);
    assert.match(r.json.error, /human/);
  }
  r = await handle(s, "POST", zed({ human: "made-up-token", password: "wrong" }), opts);
  assert.match(r.json.error, /human/, "a bot never gets to try a password");
  assert.equal(opts.attempts.peek(), null, "failed human checks do not count towards the timeout");
  r = await handle(s, "POST", { action: "remove", password: PW, weekStart: "2026-11-09", id: Object.keys(s.peek().polls["2026-11-09"].responses)[0] }, opts);
  assert.equal(r.status, 403, "removing needs the human check too");
  r = await handle(s, "POST", zed({ human: HUMAN }), { ...opts, verifyHuman: undefined });
  assert.match(r.json.error, /not been set up/);
  r = await handle(s, "POST", zed({ human: HUMAN }), { ...opts, verifyHuman: async () => ({ ok: false, reason: "unreachable" }) });
  assert.equal(r.status, 503);
  assert.deepEqual(s.peek(), before, "nothing was saved");
  r = await handle(s, "GET", null, opts);
  assert.equal(r.json.siteKey, "site-key-for-tests", "the page gets the public site key");
  ok("votes and removals need the human check; without it nothing is saved and no password is tried");
}

// three wrong passwords in a row time the connection out
{
  const attempts = memoryStore();
  const when = (iso, client = "198.51.100.1") => ({ ...at(iso), attempts, client });
  const vote = (password, name = "Lock") => ({ action: "vote", password, human: HUMAN, weekStart: "2026-11-09", name, slots: {} });
  assert.equal(MAX_TRIES, 3);
  r = await handle(s, "POST", vote("nope"), when("2026-11-10T12:00:00Z"));
  assert.equal(r.status, 403); assert.match(r.json.error, /2 tries left/);
  r = await handle(s, "POST", vote("nope"), when("2026-11-10T12:01:00Z"));
  assert.equal(r.status, 403); assert.match(r.json.error, /1 try left/);
  r = await handle(s, "POST", vote("nope"), when("2026-11-10T12:02:00Z"));
  assert.equal(r.status, 429); assert.match(r.json.error, new RegExp(`${LOCK_MINUTES} minutes`));
  r = await handle(s, "POST", vote(PW), when("2026-11-10T12:10:00Z"));
  assert.equal(r.status, 429, "even the right password waits"); assert.match(r.json.error, /Try again in 7 minutes/);
  r = await handle(s, "POST", { action: "remove", password: PW, human: HUMAN, weekStart: "2026-11-09", id: "x" }, when("2026-11-10T12:10:00Z"));
  assert.equal(r.status, 429, "removing waits too");
  assert.ok(!Object.values(s.peek().polls["2026-11-09"].responses).some((x) => x.name === "Lock"));
  r = await handle(s, "POST", vote(PW), when("2026-11-10T12:10:00Z", "198.51.100.2"));
  assert.equal(r.status, 200, "another connection is not affected");
  const stored = JSON.stringify(attempts.peek());
  assert.ok(!stored.includes("198.51.100"), "IP addresses are stored only as a hash");
  r = await handle(s, "POST", vote(PW), when("2026-11-10T12:17:01Z"));
  assert.equal(r.status, 200, "the timeout ends");
  assert.deepEqual(attempts.peek().clients, {}, "a right password clears the count");
  ok(`${MAX_TRIES} wrong passwords in a row: ${LOCK_MINUTES} minutes' wait, per connection, even for the right one`);

  r = await handle(s, "POST", vote("nope"), when("2026-11-10T13:00:00Z"));
  r = await handle(s, "POST", vote("nope"), when("2026-11-10T13:01:00Z"));
  r = await handle(s, "POST", vote(PW), when("2026-11-10T13:02:00Z"));
  assert.equal(r.status, 200);
  r = await handle(s, "POST", vote("nope"), when("2026-11-10T13:03:00Z"));
  assert.match(r.json.error, /2 tries left/, "a right password started the count again");
  r = await handle(s, "POST", vote("nope"), when("2026-11-10T13:04:00Z"));
  r = await handle(s, "POST", vote("nope"), when("2026-11-10T14:30:00Z"));
  assert.equal(r.status, 403, "wrong passwords more than an hour apart do not add up");
  assert.match(r.json.error, /2 tries left/);
  ok("a right password or an hour's quiet starts the count again");
}

// the Turnstile verifier itself, with a pretend Cloudflare
{
  const calls = [];
  const cloudflare = (answer) => async (url, init) => {
    calls.push({ url, form: Object.fromEntries(init.body) });
    if (answer instanceof Error) throw answer;
    return { json: async () => answer };
  };
  let v = turnstileVerifier({ secret: "sec", fetchImpl: cloudflare({ success: true }) });
  assert.deepEqual(await v("tok", "203.0.113.9"), { ok: true, reason: "" });
  assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.deepEqual(calls[0].form, { secret: "sec", response: "tok", remoteip: "203.0.113.9" });
  v = turnstileVerifier({ secret: "sec", fetchImpl: cloudflare({ success: false, "error-codes": ["timeout-or-duplicate"] }) });
  assert.deepEqual(await v("tok"), { ok: false, reason: "timeout-or-duplicate" });
  v = turnstileVerifier({ secret: "sec", fetchImpl: cloudflare(new Error("offline")) });
  assert.equal((await v("tok")).reason, "unreachable");
  assert.equal((await turnstileVerifier({ fetchImpl: cloudflare({ success: true }) })("tok")).reason, "not-configured");
  const n = calls.length;
  assert.equal((await turnstileVerifier({ secret: "sec", fetchImpl: cloudflare({ success: true }) })("x".repeat(2049))).reason, "missing");
  assert.equal((await turnstileVerifier({ secret: "sec", fetchImpl: cloudflare({ success: true }) })(undefined)).reason, "missing");
  assert.equal(calls.length, n, "no call to Cloudflare without a usable token");
  ok("the Turnstile verifier asks Cloudflare correctly and fails closed");
}

// concurrent save: first two writes lose the race, third wins
s.failTimes(2);
r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-16", name: "Bea", slots: { "2026-11-18": ["20:00"] } }, tue);
assert.equal(r.status, 200);
s.failTimes(99);
r = await handle(s, "POST", { action: "vote", password: PW, human: HUMAN, weekStart: "2026-11-16", name: "Cili", slots: {} }, tue);
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
