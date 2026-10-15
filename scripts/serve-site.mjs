/**
 * Kleiner statischer Server zum Prüfen der Pages-Fassung.
 *
 * Bewusst ohne Weiterleitung unbekannter Pfade auf index.html: GitHub Pages
 * antwortet dort mit 404, und genau dieses Verhalten soll lokal nachstellbar
 * sein (die Seite erkennt daran, dass kein Worker läuft).
 *
 *   npm run build:site && npm run serve:site -- 8803
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[3] ?? "dist-site");
const port = Number(process.argv[2] ?? 8803);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  if (relative.includes("..")) return null;
  let target = join(root, relative);
  if (!target.startsWith(root)) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, "index.html");
    const fileInfo = await stat(target);
    return fileInfo.isFile() ? target : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const file = await resolveFile(pathname);
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("404 – nicht gefunden\n");
    return;
  }
  response.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": file.endsWith(".html") ? "public, max-age=0, must-revalidate" : "public, max-age=60",
  });
  createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Statische Fassung aus ${root} läuft unter http://127.0.0.1:${port}/`);
});
