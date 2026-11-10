// Netlify Function: GET/POST /api/poll
// Keeps every poll in a single JSON file ("polls.json") in Netlify Blobs.
import { getStore } from "@netlify/blobs";
import { handle } from "../../src/poll-core.mjs";

const KEY = "polls.json";

export default async (req) => {
  const blobs = getStore({ name: "podcast-poll", consistency: "strong" });

  const store = {
    async read() {
      const found = await blobs.getWithMetadata(KEY, { type: "json" });
      return found ? { data: found.data, etag: found.etag } : { data: null, etag: null };
    },
    async write(data, etag) {
      // Only save if nobody else saved in between; the core retries on a fresh copy.
      const { modified } = await blobs.setJSON(
        KEY,
        data,
        etag ? { onlyIfMatch: etag } : { onlyIfNew: true }
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
  const { status, json } = await handle(store, req.method, body, { tz: process.env.POLL_TZ });
  return Response.json(json, { status, headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/poll" };
