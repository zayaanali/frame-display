// Builds the HTML for one frame: transit departures on top, the kitchen
// queue below. Pure black and white only: e-ink panels render greys as
// dither noise, so contrast comes from weight and size instead.

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const minsUntil = (iso, now) => Math.max(0, Math.round((new Date(iso) - now) / 60_000));

const fmtTime = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDate = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

const ARROW = { North: "↑", South: "↓" };

// --- transit ------------------------------------------------------------------

function direction({ label, toward, departures, error }, now) {
  const [next, ...later] = departures.map((d) => minsUntil(d, now));
  const big =
    next === undefined
      ? `<span class="none">${error ? "No data" : "No service"}</span>`
      : next === 0
        ? '<span class="num">Due</span>'
        : `<span class="num">${next}</span><span class="unit">min</span>`;
  return `
    <div class="dir">
      <div class="toward"><span class="arrow">${ARROW[label] ?? ""}</span>${esc(toward || `${label}bound`)}</div>
      <div class="next">${big}${later.length ? `<span class="later">${later.slice(0, 2).join(", ")}</span>` : ""}</div>
    </div>`;
}

function line({ id, mode, directions }, now) {
  return `
    <div class="line ${mode}">
      <div class="badge${id.length > 2 ? " long" : ""}">${esc(id)}</div>
      <div class="dirs">${directions.map((d) => direction(d, now)).join("")}</div>
    </div>`;
}

// --- kitchen ------------------------------------------------------------------

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

function toMake(list) {
  if (!list.length) return '<p class="empty">Nothing planned</p>';
  return `<ol class="list">
    ${list.map((r) => `<li><span class="item">${esc(r.name)}</span></li>`).join("")}
  </ol>`;
}

function toUse(list) {
  if (!list.length) return '<p class="empty">All used up</p>';
  return `<ul class="list use">
    ${list.map((g) => `<li><span class="item">${esc(g.name)}</span>${g.qty ? `<span class="qty">${esc(g.qty)}</span>` : ""}</li>`).join("")}
  </ul>`;
}

// --- page ---------------------------------------------------------------------

export function renderHtml({ transit, kitchen, now, width, height, fontUrl }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: Inter; src: url("${fontUrl}") format("woff2"); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; background: #fff; color: #000; overflow: hidden; }
  body {
    font-family: Inter, sans-serif;
    font-feature-settings: "tnum", "ss01", "cv11";
    -webkit-font-smoothing: none;
    display: flex; flex-direction: column;
    padding: 18px 28px 16px;
  }

  header { display: flex; justify-content: space-between; align-items: baseline;
           padding-bottom: 8px; border-bottom: 4px solid #000; }
  .time { font-size: 30px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
  .date { font-size: 17px; font-weight: 700; }

  /* Transit takes 60% of the space under the clock, the kitchen 40%. */
  .transit { flex: 3 1 0; min-height: 0; display: flex; flex-direction: column; }
  .line { flex: 1; display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #000; }
  .line:last-child { border-bottom: none; }
  /* Buses get a rounded square, the train a circle, so they read apart at a glance. */
  .badge { flex: none; width: 70px; height: 70px; background: #000; color: #fff; border-radius: 8px;
           display: grid; place-items: center; font-size: 32px; font-weight: 800; letter-spacing: -0.03em; }
  .train .badge { border-radius: 50%; }
  .badge.long { font-size: 22px; letter-spacing: 0; }
  .dirs { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .dir { padding-left: 16px; min-width: 0; }
  .dir + .dir { border-left: 2px solid #000; }
  .toward { font-size: 16px; font-weight: 700; }
  .arrow { font-weight: 800; margin-right: 5px; }
  .next { display: flex; align-items: baseline; gap: 4px; height: 56px; margin-top: 2px; }
  .num { font-size: 54px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
  .unit { font-size: 16px; font-weight: 700; }
  .later { font-size: 16px; font-weight: 500; margin-left: 8px; }
  .none { font-size: 19px; font-weight: 600; align-self: center; }

    .kitchen { flex: 2 1 0; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); grid-template-rows: minmax(0, 1fr);
             border-top: 4px solid #000; padding-top: 10px; }
  .col { min-height: 0; overflow: hidden; }
  .col + .col { border-left: 2px solid #000; padding-left: 18px; }
  .col:first-child { padding-right: 18px; }
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; line-height: 1;
       padding-bottom: 6px; border-bottom: 2px solid #000; margin-bottom: 2px; }
  .list { list-style: none; }
  .list li { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
  .item { flex: 1; min-width: 0; font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qty { flex: none; font-size: 14px; font-weight: 500; }
  .list .more { font-size: 15px; font-weight: 700; }

  /* Stuff to use is outlined pills that wrap; stuff to make is rows split by thin rules. */
  .list:not(.use) li + li { border-top: 1px solid #000; }
  .use { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 7px; padding-top: 8px; }
  .use li { padding: 4px 11px; border: 2px solid #000; border-radius: 999px; gap: 6px; max-width: 100%; }
  .use .item { flex: 0 1 auto; font-size: 15px; }
  .use .qty { font-size: 13px; }
  .use .more { border: none; padding-left: 4px; }
  .empty { font-size: 17px; font-weight: 600; }
</style></head>
<body>
  <header>
    <div class="time">${fmtTime(now)}</div>
    <div class="date">${fmtDate(now)}</div>
  </header>

  <section class="transit">
    ${transit.lines.map((l) => line(l, now)).join("")}
  </section>

  <section class="kitchen">
    <div class="col"><h2>Stuff to use</h2>${toUse(kitchen.use ?? [])}</div>
    <div class="col"><h2>Stuff to make</h2>${toMake(kitchen.make ?? [])}</div>
  </section>
  <script>${FIT_LISTS}</script>
</body></html>`;
}
