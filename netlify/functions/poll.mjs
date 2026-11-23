// Netlify Function: GET/POST /api/poll
// Keeps every poll in a single JSON file ("polls.json") in Netlify Blobs, and the
// wrong-password counts per connection in "attempts.json" next to it.
import { getStore } from "@netlify/blobs";
import { handle } from "../../src/poll-core.mjs";
import { turnstileVerifier } from "../../src/turnstile.mjs";

// Netlify's storage now and then refuses a call (seen as "401" in the function log).
// Try each call a few times before giving up. Repeating a conditional save is safe:
// if the first try did land, the repeat is rejected and the core re-reads the file.
async function steady(what, fn) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      console.error(`storage ${what} failed (try ${attempt} of 3):`, err && err.message);
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
  throw last;
}

// One JSON document in the store, read and saved conditionally (etag).
function document(blobs, key) {
  return {
    async read() {
      const found = await steady(`read ${key}`, () => blobs.getWithMetadata(key, { type: "json" }));
      return found ? { data: found.data, etag: found.etag } : { data: null, etag: null };
    },
    async write(data, etag) {
      // Only save if nobody else saved in between; the core retries on a fresh copy.
      const { modified } = await steady(`save ${key}`, () =>
        blobs.setJSON(key, data, etag ? { onlyIfMatch: etag } : { onlyIfNew: true })
      );
      return modified;
    },
  };
}

export default async (req, context) => {
  const blobs = getStore({ name: "podcast-poll", consistency: "strong" });
  const store = document(blobs, "polls.json");

  let body = null;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = null;
    }
  }

  // Settings, all Netlify environment variables (see .env.example):
  // POLL_TZ decides when a week "ends"; POLL_PASSWORD is the password for answers;
  // TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are the Cloudflare Turnstile widget's keys.
  const headers = { "cache-control": "no-store" };
  try {
    const { status, json } = await handle(store, req.method, body, {
      tz: process.env.POLL_TZ,
      password: process.env.POLL_PASSWORD,
      siteKey: process.env.TURNSTILE_SITE_KEY,
      verifyHuman: turnstileVerifier({ secret: process.env.TURNSTILE_SECRET_KEY }),
      attempts: document(blobs, "attempts.json"),
      client: (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "",
    });
    return Response.json(json, { status, headers });
  } catch (err) {
    console.error("poll request failed:", err);
    return Response.json(
      { error: "The poll's storage did not answer. Try again in a moment." },
      { status: 503, headers }
    );
  }
};

export const config = { path: "/api/poll" };
