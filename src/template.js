// Builds the HTML for one frame: a departure board on top (60%) and the
// kitchen lists below (40%). Pure black and white only: e-ink panels render
// greys as dither noise, so contrast comes from weight, size and inverted bands.
//
// Type: IBM Plex Serif for anything read at a distance (clock, routes, minute
// tiles) and for list items; IBM Plex Mono for the small uppercase captions.

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const minsUntil = (iso, now) => Math.max(0, Math.round((new Date(iso) - now) / 60_000));

const ARROW = { North: "↑", South: "↓" };

// Lists render every item; FIT_LISTS (run in the page once fonts load)
// drops whatever doesn't fit its column and adds a "+ N more" line instead.
const FIT_LISTS = `
  document.fonts.ready.then(() => {
    for (const ul of document.querySelectorAll(".list")) {
      const col = ul.closest(".col");
      const overflows = () => col.scrollHeight > col.clientHeight;
      if (!overflows()) continue;
      const items = [...ul.children];
      const more = document.createElement("li");
      more.className = "more";
      ul.append(more);
      let hidden = 0;
      while (overflows() && items.length) {
        items.pop().remove();
        more.textContent = "+ " + ++hidden + " more";
      }
    }
  });`;

// --- transit ------------------------------------------------------------------

function caption({ label, toward }) {
  return `<div class="toward">${ARROW[label] ?? ""} ${esc(toward || `${label}bound`)}</div>`;
}

function times({ departures }, now) {
  const [next, ...later] = departures.map((d) => minsUntil(d, now));
  const tile =
    next === undefined ? '<span class="tile">--</span>'
      : next === 0 ? '<span class="tile due">DUE</span>'
        : `<span class="tile">${next}</span>`;
  // The unit slot is always present (empty for DUE/--) so later times stay aligned.
  return `<div class="times">${tile}<span class="unit">${next ? "MIN" : ""}</span><span class="later">${later.slice(0, 2).join(" · ")}</span></div>`;
}

// Each line is a 3x2 grid (captions on the first row, route and minute tiles
// on the second) so routes line up with their tiles, not with the captions.
function line({ id, mode, directions }, now) {
  return `
    <div class="line ${mode}">
      <span></span>${directions.map(caption).join("")}
      <div class="route">${esc(id)}</div>${directions.map((d) => times(d, now)).join("")}
    </div>`;
}

// --- kitchen ------------------------------------------------------------------

function list(items, empty) {
  if (!items.length) return `<p class="empty">${empty}</p>`;
  return `<ul class="list">
    ${items.map((i) => `<li>${esc(i.name)}${i.qty ? ` <span class="qty">${esc(i.qty)}</span>` : ""}</li>`).join("")}
  </ul>`;
}

// --- page ---------------------------------------------------------------------

export function renderHtml({ transit, kitchen, now, width, height, fonts }) {
  const [time, ampm] = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).split(" ");
  const date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${fonts}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; background: #fff; color: #000; overflow: hidden; }
  body { font-family: "IBM Plex Mono", monospace; font-feature-settings: "tnum", "lnum";
         -webkit-font-smoothing: none; display: flex; flex-direction: column; }

  header { background: #000; color: #fff; display: flex; justify-content: space-between; align-items: center;
           padding: 12px 24px; }
  .time { font-family: "IBM Plex Serif", serif; font-size: 36px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
  .ampm { font-size: 15px; font-weight: 700; margin-left: 6px; }
  .date { font-size: 16px; font-weight: 700; letter-spacing: 0.08em; }

  .transit { flex: 3 1 0; display: flex; flex-direction: column; padding: 0 24px; }
  .line { flex: 1; display: grid; grid-template-columns: 88px minmax(0,1fr) minmax(0,1fr);
          align-content: center; align-items: center; row-gap: 6px; border-bottom: 2px dashed #000; }
  .line:last-child { border-bottom: none; }
  .route { font-family: "IBM Plex Serif", serif; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
  .toward { font-size: 13px; font-weight: 700; text-transform: uppercase; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis; padding-left: 12px; }
  .times { display: flex; align-items: center; gap: 6px; padding-left: 12px; }
  /* Fixed width so MIN and the later times line up down the board. */
  .tile { flex: none; width: 56px; height: 44px; display: grid; place-items: center; background: #000; color: #fff;
          border-radius: 4px; font-family: "IBM Plex Serif", serif; font-size: 30px; font-weight: 700; line-height: 1; }
  .tile.due { font-size: 19px; }
  .unit { flex: none; width: 26px; font-size: 12px; font-weight: 700; }
  .later { font-size: 15px; font-weight: 600; margin-left: 6px; }

  .kitchen { flex: 2 1 0; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
             grid-template-rows: minmax(0,1fr); border-top: 4px solid #000; }
  .col { min-height: 0; overflow: hidden; padding: 0 24px 16px; }
  .col + .col { border-left: 4px solid #000; }
  h2 { background: #000; color: #fff; font-size: 14px; font-weight: 700; letter-spacing: 0.12em;
       margin: 0 -24px 8px; padding: 7px 24px; }
  .list { list-style: none; }
  .list li { font-family: "IBM Plex Serif", serif; font-size: 17px; font-weight: 500; line-height: 1.2; padding: 4px 0;
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list li::before { content: "› "; font-weight: 700; }
  .list .more { font-family: "IBM Plex Mono", monospace; font-size: 13px; font-weight: 700; }
  .list .more::before { content: ""; }
  .qty { font-family: "IBM Plex Mono", monospace; font-size: 13px; font-weight: 600; }
  .empty { font-family: "IBM Plex Serif", serif; font-size: 17px; font-style: italic; }
</style></head>
<body>
  <header><span><span class="time">${time}</span><span class="ampm">${ampm}</span></span><span class="date">${date}</span></header>
  <section class="transit">${transit.lines.map((l) => line(l, now)).join("")}</section>
  <section class="kitchen">
    <div class="col"><h2>STUFF TO USE</h2>${list(kitchen.use ?? [], "All used up")}</div>
    <div class="col"><h2>STUFF TO MAKE</h2>${list(kitchen.make ?? [], "Nothing planned")}</div>
  </section>
  <script>${FIT_LISTS}</script>
</body></html>`;
}
