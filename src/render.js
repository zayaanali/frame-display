// Renders the fridge display (transit + kitchen queue) to PNG for an e-ink panel.
//   node src/render.js [--width 600] [--height 800] [--out out] [--sample]
// Writes frame.png (what the browser drew) and frame-bw.png (thresholded to
// pure black/white, ready to push to the display). frame-bw.png is stored as
// 8-bit greyscale rather than a 1-bit palette PNG, which some viewers
// (Windows Photos among them) decode incorrectly.

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import path from "node:path";
import { getDepartures } from "./cta.js";
import { getSampleDepartures } from "./sample.js";
import { renderHtml } from "./template.js";

const { values: args } = parseArgs({
  options: {
    width: { type: "string", default: "600" },
    height: { type: "string", default: "800" },
    out: { type: "string", default: "out" },
    sample: { type: "boolean", default: false },
  },
});
const width = Number(args.width);
const height = Number(args.height);

const require = createRequire(import.meta.url);
const fontUrl = pathToFileURL(
  require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
).href;

const now = new Date();
const transit = args.sample
  ? await getSampleDepartures(now)
  : await getDepartures(JSON.parse(await readFile("config.json", "utf8")));
const kitchen = JSON.parse(await readFile("kitchen.json", "utf8"));
const html = renderHtml({ transit, kitchen, now, width, height, fontUrl });

await mkdir(args.out, { recursive: true });
const htmlPath = path.resolve(args.out, "frame.html");
await writeFile(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href);
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot({ type: "png" });
await browser.close();

// Write to a temp file and rename, so a viewer never opens a half-written image.
async function writeAtomic(file, buffer) {
  await writeFile(`${file}.tmp`, buffer);
  await rename(`${file}.tmp`, file);
}

const rawPath = path.join(args.out, "frame.png");
const bwPath = path.join(args.out, "frame-bw.png");
await writeAtomic(rawPath, await sharp(png).png().toBuffer());
await writeAtomic(bwPath, await sharp(png).threshold(128).toColourspace("b-w").png().toBuffer());
await rm(path.join(args.out, "frame-1bit.png"), { force: true });

console.log(`wrote ${rawPath} and ${bwPath} (${width}x${height})`);
