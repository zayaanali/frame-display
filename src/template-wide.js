// Landscape, full-colour version of the board for tablets (1280x800 by
// default): departures on the left, kitchen lists stacked on the right.
// Train routes wear their CTA line colours; minute counts are in amber, as on
// a station departure board. The e-ink frame keeps using template.js.

import { esc, FIT_LISTS, minsUntil } from "./template.js";

const ARROW = { North: "↑", South: "↓", East: "→", West: "←" };

// CTA's published line colours, and the text colour that reads on each.
const TRAIN = {
  RED: ["#c60c30", "#fff", "Red"],
  BLUE: ["#00a1de", "#fff", "Blue"],
  BRN: ["#62361b", "#fff", "Brown"],
  G: ["#009b3a", "#fff", "Green"],
  ORG: ["#f9461c", "#fff", "Orange"],
  P: ["#522398", "#fff", "Purple"],
  PINK: ["#e27ea6", "#1a1a1a", "Pink"],
  Y: ["#f9e300", "#1a1a1a", "Yellow"],
};

// --- transit ------------------------------------------------------------------

function route({ id, mode }) {
  const [bg, fg, name] = TRAIN[id] ?? [];
  if (mode === "train" && bg) {
    return `<div class="route train" style="background:${bg};color:${fg}">${name}<small>LINE</small></div>`;
  }
  return `<div class="route bus">${esc(id)}<small>BUS</small></div>`;
}

function direction({ label, toward, departures, error }, now) {
  const [next, ...later] = departures.map((d) => minsUntil(d, now));
  const tile =
    next === undefined ? `<span class="tile none">${error ? "··" : "--"}</span>`
      : next === 0 ? '<span class="tile due">DUE</span>'
        : `<span class="tile">${next}<small>MIN</small></span>`;
  return `
    <div class="dir">
      <div class="toward"><b>${ARROW[label] ?? ""}</b> ${esc(toward || `${label}bound`)}</div>
      <div class="times">${tile}<span class="later">${later.slice(0, 2).map((m) => `<span>${m}</span>`).join("")}</span></div>
    </div>`;
}

const line = (l, now) => `<div class="line">${route(l)}${l.directions.map((d) => direction(d, now)).join("")}</div>`;

// --- kitchen ------------------------------------------------------------------

function list(items, empty) {
  if (!items.length) return `<p class="empty">${empty}</p>`;
  return `<ul class="list">
    ${items.map((i) => `<li><span class="name">${esc(i.name)}</span>${i.qty ? `<span class="qty">${esc(i.qty)}</span>` : ""}</li>`).join("")}
  </ul>`;
}

// --- page ---------------------------------------------------------------------

export function renderWideHtml({ transit, kitchen, now, width, height, fonts }) {
  const [time, ampm] = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).split(" ");
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const stop = transit.stop?.name ? `<span class="stop">${esc(transit.stop.name)}</span>` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${fonts}
  :root { --bg: #12161c; --panel: #1b2129; --rule: #2b333e; --ink: #f3efe6; --dim: #9aa3ae;
          --amber: #ffb627; --due: #3ddc84; --use: #ff7a59; --make: #4cc9b0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; background: var(--bg); color: var(--ink); overflow: hidden; }
  body { font-family: "IBM Plex Mono", monospace; font-feature-settings: "tnum", "lnum";
         display: flex; flex-direction: column; padding: 28px 32px 32px; }

  header { display: flex; align-items: baseline; margin-bottom: 24px; }
  .time { font-family: "IBM Plex Serif", serif; font-size: 64px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
  .ampm { font-size: 22px; font-weight: 700; color: var(--dim); margin-left: 8px; }
  .date { font-family: "IBM Plex Serif", serif; font-size: 26px; font-weight: 500; margin-left: 20px; }
  .stop { margin-left: auto; font-size: 15px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--dim); }

  main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 4fr);
          grid-template-rows: minmax(0, 1fr); grid-gap: 24px; }

  .transit { display: flex; flex-direction: column; background: var(--panel); border-radius: 16px; padding: 4px 24px; }
  .line { flex: 1; display: grid; grid-template-columns: 112px minmax(0,1fr) minmax(0,1fr); align-items: center;
          grid-column-gap: 20px; border-bottom: 1px solid var(--rule); }
  .line:last-child { border-bottom: none; }
  .route { height: 76px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center;
           font-family: "IBM Plex Serif", serif; font-size: 36px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; }
  .route.train { font-size: 26px; }
  .route.bus { background: var(--ink); color: var(--bg); }
  .route small { font-family: "IBM Plex Mono", monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.14em;
                 margin-top: 5px; opacity: 0.75; }
  .toward { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dim);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
  .toward b { color: var(--ink); }
  .times { display: flex; align-items: baseline; }
  .tile { font-family: "IBM Plex Serif", serif; font-size: 52px; font-weight: 700; line-height: 1; color: var(--amber);
          min-width: 116px; margin-right: 14px; }
  .tile small { font-family: "IBM Plex Mono", monospace; font-size: 14px; font-weight: 700; margin-left: 4px; }
  .tile.due { color: var(--due); font-size: 38px; }
  .tile.none { color: var(--rule); }
  .later { display: flex; font-size: 20px; font-weight: 600; color: var(--dim); }

  .kitchen { display: flex; flex-direction: column; min-height: 0; }
  .later span + span { margin-left: 10px; }
  .col { flex: 1; min-height: 0; overflow: hidden; background: var(--panel); border-radius: 16px; padding: 20px 24px;
         border-top: 6px solid var(--accent); }
  .col + .col { margin-top: 24px; }
  .col.use { --accent: var(--use); }
  .col.make { --accent: var(--make); }
  h2 { font-size: 15px; font-weight: 700; letter-spacing: 0.14em; color: var(--accent); margin-bottom: 10px; }
  .list { list-style: none; }
  .list li { display: flex; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--rule); }
  .list li:last-child { border-bottom: none; }
  .name { flex: 1; min-width: 0; font-family: "IBM Plex Serif", serif; font-size: 22px; font-weight: 500;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
                  margin-right: 12px; vertical-align: middle; }
  .qty { flex: none; margin-left: 10px; font-size: 14px; font-weight: 600; color: var(--dim); }
  .list .more { font-size: 14px; font-weight: 700; color: var(--dim); border-bottom: none; }
  .empty { font-family: "IBM Plex Serif", serif; font-size: 20px; font-style: italic; color: var(--dim); }
</style></head>
<body>
  <header><span><span class="time">${time}</span><span class="ampm">${ampm}</span></span><span class="date">${date}</span>${stop}</header>
  <main>
    <section class="transit">${transit.lines.map((l) => line(l, now)).join("")}</section>
    <section class="kitchen">
      <div class="col use"><h2>STUFF TO USE</h2>${list(kitchen.use ?? [], "All used up")}</div>
      <div class="col make"><h2>STUFF TO MAKE</h2>${list(kitchen.make ?? [], "Nothing planned")}</div>
    </section>
  </main>
  <script>${FIT_LISTS}</script>
</body></html>`;
}
