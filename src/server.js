// Phone-friendly web app for editing the kitchen lists shown on the display.
//   node src/server.js        PORT=8080 by default; RENDER=0 to skip re-rendering
// Serves the app at / and a small JSON API under /api. After each change the
// frame is re-rendered (debounced), so out/frame-bw.png stays current.
//
// For the Kindle:
//   GET /frame.png   the latest rendered frame (8-bit greyscale, as eips needs)
//   GET /kindle      a bare page showing the frame and reloading every minute,
//                    for the Kindle's built-in browser (no jailbreak needed)
//
// API (every response is the full { use, make } state):
//   GET    /api/kitchen
//   POST   /api/:list              { name, qty?, index? }  add (at index, else end)
//   PATCH  /api/:list/:id          { name?, qty? }         edit
//   DELETE /api/:list/:id                                  remove
//   PUT    /api/:list/order        { ids: [...] }          reorder

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import sharp from "sharp";
import { LISTS, newId, read, update } from "./kitchen-store.js";

const PORT = Number(process.env.PORT ?? 8080);
const RENDER = process.env.RENDER !== "0";
const MAX_NAME = 80;
const MAX_QTY = 20;

const require = createRequire(import.meta.url);
const font = (pkg, weight) => require.resolve(`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff2`);

const STATIC = {
  "/": ["web/index.html", "text/html; charset=utf-8"],
  "/manifest.webmanifest": ["web/manifest.webmanifest", "application/manifest+json"],
  "/sortable.js": [require.resolve("sortablejs/Sortable.min.js"), "text/javascript"],
  "/fonts/serif-500.woff2": [font("ibm-plex-serif", 500), "font/woff2"],
  "/fonts/serif-700.woff2": [font("ibm-plex-serif", 700), "font/woff2"],
  "/fonts/mono-500.woff2": [font("ibm-plex-mono", 500), "font/woff2"],
  "/fonts/mono-700.woff2": [font("ibm-plex-mono", 700), "font/woff2"],
};

const FRAME = "out/frame-bw.png";

// Kept to what the Kindle's old WebKit browser handles: no scripts, meta refresh,
// and a timestamp on the image URL so it can't show a cached frame.
const kindlePage = () => `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="60">
<meta name="viewport" content="width=600">
<style>html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
img { display: block; width: 600px; height: 800px; }</style></head>
<body><img src="/frame.png?t=${Date.now()}" alt=""></body></html>`;

// Home-screen icon in the display's style: a black tile with a serif mark.
const ICON = await sharp(Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <rect width="512" height="512" fill="#000"/>
    <text x="256" y="350" text-anchor="middle" font-family="serif" font-weight="700" font-size="300" fill="#fff">K</text>
  </svg>`)).png().toBuffer();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- request helpers --------------------------------------------------------

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new HttpError(413, "Body too large");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function cleanText(value, max, field, { required }) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (required && !text) throw new HttpError(400, `${field} is required`);
  if (text.length > max) throw new HttpError(400, `${field} is too long (max ${max})`);
  return text;
}

function findIndex(items, id) {
  const i = items.findIndex((item) => item.id === id);
  if (i === -1) throw new HttpError(404, "Item not found");
  return i;
}

// --- API --------------------------------------------------------------------

async function api(req, list, id) {
  if (!list) {
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
    return read();
  }
  const body = req.method === "GET" || req.method === "DELETE" ? {} : await readBody(req);

  const change = {
    "POST:": (items) => {
      const item = { id: newId(), name: cleanText(body.name, MAX_NAME, "name", { required: true }) };
      const qty = cleanText(body.qty, MAX_QTY, "qty", { required: false });
      if (qty) item.qty = qty;
      const at = Number.isInteger(body.index) ? Math.max(0, Math.min(body.index, items.length)) : items.length;
      items.splice(at, 0, item);
    },
    "PUT:order": (items) => {
      if (!Array.isArray(body.ids)) throw new HttpError(400, "ids must be an array");
      const byId = new Map(items.map((item) => [item.id, item]));
      const ordered = [];
      for (const x of body.ids) {
        if (byId.has(x)) ordered.push(byId.get(x));
        byId.delete(x);
      }
      // Anything the client didn't know about (added elsewhere meanwhile) goes at the end.
      items.splice(0, items.length, ...ordered, ...byId.values());
    },
    "PATCH:id": (items) => {
      const item = items[findIndex(items, id)];
      if ("name" in body) item.name = cleanText(body.name, MAX_NAME, "name", { required: true });
      if ("qty" in body) {
        const qty = cleanText(body.qty, MAX_QTY, "qty", { required: false });
        if (qty) item.qty = qty;
        else delete item.qty;
      }
    },
    "DELETE:id": (items) => {
      items.splice(findIndex(items, id), 1);
    },
  }[`${req.method}:${id === "order" ? "order" : id ? "id" : ""}`];

  if (!change) throw new HttpError(405, "Method not allowed");
  const { data } = await update((data) => change(data[list]));
  scheduleRender();
  return data;
}

// --- re-render after changes --------------------------------------------------

let renderTimer;
let rendering = false;
let renderAgain = false;

function scheduleRender() {
  if (!RENDER) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, 1500);
}

function renderNow() {
  if (rendering) {
    renderAgain = true;
    return;
  }
  rendering = true;
  execFile(process.execPath, ["src/render.js"], (err, _stdout, stderr) => {
    if (err) console.warn(`render failed: ${stderr.trim() || err.message}`);
    rendering = false;
    if (renderAgain) {
      renderAgain = false;
      renderNow();
    }
  });
}

// --- server -------------------------------------------------------------------

const API_PATH = new RegExp(`^/api/(?:kitchen|(${LISTS.join("|")})(?:/([\\w-]+))?)$`);

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    const match = pathname.match(API_PATH);
    if (match) return send(res, 200, await api(req, match[1], match[2]));
    if (pathname === "/icon.png") return send(res, 200, ICON, "image/png");
    if (pathname === "/kindle") return send(res, 200, kindlePage(), "text/html; charset=utf-8");
    if (pathname === "/frame.png") {
      const png = await readFile(FRAME).catch(() => null);
      if (!png) throw new HttpError(404, "No frame rendered yet");
      return send(res, 200, png, "image/png");
    }
    const file = STATIC[pathname];
    if (file && req.method === "GET") return send(res, 200, await readFile(file[0]), file[1]);
    throw new HttpError(404, "Not found");
  } catch (err) {
    if (!err.status) console.error(err);
    send(res, err.status ?? 500, { error: err.status ? err.message : "Server error" });
  }
}).listen(PORT, () => {
  const lan = Object.values(networkInterfaces()).flat().find((a) => a.family === "IPv4" && !a.internal);
  console.log(`Kitchen app on http://localhost:${PORT}${lan ? `  (phone on same Wi-Fi: http://${lan.address}:${PORT})` : ""}`);
});
