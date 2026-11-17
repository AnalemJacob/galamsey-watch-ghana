import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { validateDraft } from "../docs/model.js";

const webRoot = fileURLToPath(new URL("../docs", import.meta.url));
const regions = JSON.parse(await readFile(resolve(webRoot, "data/regions.geojson"), "utf8"));
const dbPath = process.env.PILOT_DB ?? fileURLToPath(new URL("./.private/pilot.sqlite", import.meta.url));
if (dbPath !== ":memory:") await mkdir(dirname(dbPath), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;
`);
const insertReport = db.prepare("INSERT INTO reports(id, payload) VALUES (?, ?) ON CONFLICT(id) DO NOTHING");
const findReport = db.prepare("SELECT payload FROM reports WHERE id = ?");
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".geojson": "application/geo+json", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json", ".png": "image/png"
};

function json(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

async function receiveExample(request, response) {
  if (request.headers.origin && request.headers.origin !== "http://" + request.headers.host) {
    return json(response, 403, { error: "Use the local pilot from this server." });
  }
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    return json(response, 415, { error: "Expected JSON." });
  }

  let body = "";
  request.setEncoding("utf8");
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 4096) {
      return json(response, 413, { error: "Example is too large." });
    }
  }
  let example;
  try {
    example = validateDraft(JSON.parse(body), regions);
  } catch (error) {
    return json(response, 400, { error: error instanceof SyntaxError ? "Invalid JSON." : error.message });
  }

  const payload = JSON.stringify(example);
  const result = insertReport.run(example.id, payload);
  if (!result.changes && findReport.get(example.id).payload !== payload) {
    return json(response, 409, { error: "This identifier already has a different example." });
  }
  return json(response, result.changes ? 201 : 200, { id: example.id });
}

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json(response, 200, { protocol: "galamsey-demo-v1" });
    }
    if (url.pathname === "/api/reports" && request.method === "POST") {
      return await receiveExample(request, response);
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return json(response, 405, { error: "Method unavailable." });
    }
    const path = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(webRoot, path);
    const type = mime[extname(file)];
    if (!file.startsWith(webRoot + sep) || !type) return json(response, 404, { error: "File unavailable." });
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": type, "Content-Length": content.length });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      return json(response, 404, { error: "File unavailable." });
    }
    if (!response.headersSent) json(response, 500, { error: "Request could not be completed." });
    else response.end();
  }
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, "127.0.0.1", () => {
  console.log("Galamsey Watch trial server: http://127.0.0.1:" + server.address().port);
});
