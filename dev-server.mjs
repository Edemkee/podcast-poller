// Local preview without Netlify: `node dev-server.mjs` then open http://localhost:8888
// Uses the same rules as the live site, with data kept in ./data/polls.json.
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "./src/poll-core.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataFile = join(root, "data", "polls.json");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

const store = {
  async read() {
    try {
      return { data: JSON.parse(await readFile(dataFile, "utf8")), etag: null };
    } catch {
      return { data: null, etag: null };
    }
  },
  async write(data) {
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(dataFile, JSON.stringify(data, null, 2));
    return true;
  },
};

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
      const { status, json } = await handle(store, req.method, body, { tz: process.env.POLL_TZ, now });
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
