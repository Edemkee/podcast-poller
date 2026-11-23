// Local preview without Netlify: `node dev-server.mjs` then open http://localhost:8888
// Uses the same rules as the live site, with data kept in ./data/polls.json
// (or the file named by DATA_FILE, which the browser test uses).
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "./src/poll-core.mjs";
import { turnstileVerifier, SITEVERIFY } from "./src/turnstile.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataFile = process.env.DATA_FILE || join(root, "data", "polls.json");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

// A JSON file standing in for a Netlify Blobs document.
const fileStore = (file) => ({
  async read() {
    try {
      return { data: JSON.parse(await readFile(file, "utf8")), etag: null };
    } catch {
      return { data: null, etag: null };
    }
  },
  async write(data) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data, null, 2));
    return true;
  },
});
const store = fileStore(dataFile);
const attempts = fileStore(join(dirname(dataFile), "attempts.json"));
// Locally, use Cloudflare's test keys (see README). TURNSTILE_VERIFY_URL is only for the
// browser test's stand-in when Cloudflare cannot be reached.
const verifyHuman = turnstileVerifier({
  secret: process.env.TURNSTILE_SECRET_KEY,
  url: process.env.TURNSTILE_VERIFY_URL || SITEVERIFY,
});

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/poll") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {}
      const now = process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW) : undefined;
      const { status, json } = await handle(store, req.method, body, {
        tz: process.env.POLL_TZ,
        password: process.env.POLL_PASSWORD,
        siteKey: process.env.TURNSTILE_SITE_KEY,
        verifyHuman,
        attempts,
        client: req.socket.remoteAddress,
        now,
      });
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(json));
    }
    const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    try {
      const file = await readFile(join(root, "public", path));
      res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
      res.end(file);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(process.env.PORT || 8888, () => console.log("http://localhost:" + (process.env.PORT || 8888)));
