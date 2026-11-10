// Netlify Function: GET/POST /api/poll
// Keeps every poll in a single JSON file ("polls.json") in Netlify Blobs.
import { getStore } from "@netlify/blobs";
import { handle } from "../../src/poll-core.mjs";

const KEY = "polls.json";

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

export default async (req) => {
  const blobs = getStore({ name: "podcast-poll", consistency: "strong" });

  const store = {
    async read() {
      const found = await steady("read", () => blobs.getWithMetadata(KEY, { type: "json" }));
      return found ? { data: found.data, etag: found.etag } : { data: null, etag: null };
    },
    async write(data, etag) {
      // Only save if nobody else saved in between; the core retries on a fresh copy.
      const { modified } = await steady("save", () =>
        blobs.setJSON(KEY, data, etag ? { onlyIfMatch: etag } : { onlyIfNew: true })
      );
      return modified;
    },
  };

  let body = null;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = null;
    }
  }

  // Set POLL_TZ in Netlify's environment variables to change when a week "ends".
  const headers = { "cache-control": "no-store" };
  try {
    const { status, json } = await handle(store, req.method, body, { tz: process.env.POLL_TZ });
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
