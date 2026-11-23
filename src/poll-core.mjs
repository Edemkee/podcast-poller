// All poll rules live here so the same code runs on Netlify and in the local dev server.
// The whole dataset is ONE JSON document: { polls: { "<monday ISO date>": poll } }.
// Polls for weeks that have ended are dropped every time the file is read.
import { createHash, timingSafeEqual } from "node:crypto";

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

// Saving (new or changed) or removing an answer needs the shared password. The password itself is never in the
// repository: the server reads it from the POLL_PASSWORD environment variable.
function checkPassword(given, expected) {
  if (typeof expected !== "string" || !expected) {
    throw new Refusal(403, "Answers are switched off: the site's password has not been set up yet.");
  }
  if (typeof given !== "string" || !given) throw new Refusal(403, "Enter the password first.");
  // Compare fixed-length digests so the check takes the same time whatever was typed.
  const digest = (s) => createHash("sha256").update(s, "utf8").digest();
  if (!timingSafeEqual(digest(given), digest(expected))) {
    throw new Refusal(403, "Wrong password. Nothing was changed.");
  }
}

// ---------- the gate in front of saving and removing answers ----------
// Every vote or removal passes three checks before anything is read or saved:
//   1. the visitor is not timed out (MAX_TRIES wrong passwords in a row lock them out
//      for LOCK_MINUTES; the count is kept per connection, under a hash of its IP address),
//   2. Cloudflare Turnstile confirms a human (opts.verifyHuman, see src/turnstile.mjs),
//   3. the password is right.
// Only a wrong password counts towards the timeout. A right one clears the count.
export const MAX_TRIES = 3;
export const LOCK_MINUTES = 15;
const FORGET_MINUTES = 60; // wrong passwords further apart than this do not add up

const PROTECTED = new Set(["vote", "remove"]);
const clientKey = (ip) => createHash("sha256").update("podcast-poll:" + (ip || "unknown")).digest("hex").slice(0, 24);
const ms = (iso) => (iso ? Date.parse(iso) || 0 : 0);
const minutes = (n) => `${n} ${n === 1 ? "minute" : "minutes"}`;
const tries = (n) => `${n} ${n === 1 ? "try" : "tries"}`;

// Read-change-save on the attempts document, retried if someone saved in between.
async function updateAttempts(store, nowMs, change) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, etag } = await store.read();
    const doc = data && typeof data === "object" && data.clients && typeof data.clients === "object" ? data : { clients: {} };
    change(doc.clients);
    for (const [key, rec] of Object.entries(doc.clients)) {
      // Tidy up: forget entries whose count has lapsed and whose timeout is over.
      if (Math.max(ms(rec.last) + FORGET_MINUTES * 60000, ms(rec.until)) < nowMs) delete doc.clients[key];
    }
    if (await store.write(doc, etag)) return;
  }
}

async function gate(body, opts, nowMs) {
  const attempts = opts.attempts;
  if (!attempts) throw new Error("poll-core: opts.attempts store is required for votes and removals");
  const key = clientKey(opts.client);

  // 1. Timed out?
  const { data } = await attempts.read();
  const rec = data && data.clients && data.clients[key];
  if (rec && ms(rec.until) > nowMs) {
    const left = Math.max(1, Math.ceil((ms(rec.until) - nowMs) / 60000));
    throw new Refusal(429, `Too many wrong passwords. Try again in ${minutes(left)}.`);
  }

  // 2. Human?
  const human = opts.verifyHuman ? await opts.verifyHuman(body.human, opts.client) : { ok: false, reason: "not-configured" };
  if (!human.ok) {
    if (human.reason === "not-configured") throw new Refusal(403, "Answers are switched off: the human check has not been set up yet.");
    if (human.reason === "unreachable") throw new Refusal(503, "Could not reach the human check. Try again in a moment.");
    throw new Refusal(403, "Could not confirm you are human. Wait for the check above the Submit button, then try again.");
  }

  // 3. Password?
  try {
    checkPassword(body.password, opts.password);
  } catch (err) {
    if (!(err instanceof Refusal) || /not been set up/.test(err.message)) throw err;
    let fails = 0;
    await updateAttempts(attempts, nowMs, (clients) => {
      const prev = clients[key];
      // Start counting again after a finished timeout or a long quiet spell.
      const lapsed = !prev || ms(prev.until) || ms(prev.last) + FORGET_MINUTES * 60000 < nowMs;
      fails = (lapsed ? 0 : prev.fails || 0) + 1;
      clients[key] = { fails, last: new Date(nowMs).toISOString() };
      if (fails >= MAX_TRIES) clients[key].until = new Date(nowMs + LOCK_MINUTES * 60000).toISOString();
    });
    if (fails >= MAX_TRIES) {
      throw new Refusal(429, `Wrong password, ${MAX_TRIES} times in a row. Try again in ${minutes(LOCK_MINUTES)}.`);
    }
    throw new Refusal(403, `${err.message} ${tries(MAX_TRIES - fails)} left before a ${LOCK_MINUTES}-minute wait.`);
  }
  if (rec && rec.fails) await updateAttempts(attempts, nowMs, (clients) => delete clients[key]);
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

  if (method === "POST" && body && typeof body === "object" && PROTECTED.has(body.action)) {
    try {
      await gate(body, opts, (opts.now || new Date()).getTime());
    } catch (err) {
      if (err instanceof Refusal) return { status: err.status, json: { error: err.message } };
      throw err;
    }
  }

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
          siteKey: opts.siteKey || null, // Cloudflare Turnstile's public site key for the page
          ...extra,
        },
      };
    }
  }
  return { status: 409, json: { error: "Someone else saved at the same moment. Try again." } };
}
