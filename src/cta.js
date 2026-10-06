// Live departures from CTA Bus Tracker and Train Tracker, in the shape the
// template expects (see src/sample.js).
//
// Stops are picked automatically: for each bus route and direction, the stop
// nearest config.LOCATION; for each train line, the nearest station. The picks
// are cached in .cache/stops.json, so delete that file after moving LOCATION.

import { mkdir, readFile, writeFile } from "node:fs/promises";

const BUS_API = "https://www.ctabustracker.com/bustime/api/v2";
const TRAIN_API = "https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx";
const STATIONS_API = "https://data.cityofchicago.org/resource/8pix-ypme.json";
const CACHE = ".cache/stops.json";

// Train Tracker "trDr" codes and Chicago Data Portal line flags per line.
// For the north/south lines, 1 is the northern terminal and 5 the southern.
const TRAIN_LINES = {
  RED: { name: "Red", flag: "red" },
  BLUE: { name: "Blue", flag: "blue" },
  BRN: { name: "Brn", flag: "brn" },
  G: { name: "G", flag: "g" },
  ORG: { name: "Org", flag: "o" },
  P: { name: "P", flag: "p" },
  PINK: { name: "Pink", flag: "pnk" },
  Y: { name: "Y", flag: "y" },
};
const TRAIN_DIRS = { 1: "North", 5: "South" };

// --- helpers --------------------------------------------------------------

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

// Squared distance is enough for picking the nearest stop within one city.
const dist2 = (a, b) => (a.lat - b.lat) ** 2 + ((a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180)) ** 2;
const nearest = (items, here) => items.reduce((best, s) => (dist2(s, here) < dist2(best, here) ? s : best));

// CTA returns wall-clock Chicago times with no offset, e.g. "20261005 23:32"
// or "2026-10-05T23:32:10". Convert to a real instant.
function chicagoTime(str) {
  const nums = str.match(/\d+/g).map(Number);
  const [y, mo, d, h, mi, s = 0] = nums[0] > 9999 ? splitCompact(str) : nums;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    }).formatToParts(new Date(asUtc)).map((p) => [p.type, Number(p.value)]),
  );
  const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - asUtc;
  return new Date(asUtc - offset).toISOString();
}

// "20261005 23:32" -> [2026, 10, 5, 23, 32]
function splitCompact(str) {
  const [date, time] = str.split(" ");
  const [h, mi] = time.split(":").map(Number);
  return [Number(date.slice(0, 4)), Number(date.slice(4, 6)), Number(date.slice(6, 8)), h, mi];
}

const shortDir = (dir) => dir.replace(/bound$/, "");

// The destination most departures in a direction are heading to.
function commonDest(names) {
  const counts = {};
  for (const n of names) counts[n] = (counts[n] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

// --- stop resolution --------------------------------------------------------

async function resolveStops(config) {
  const here = config.LOCATION;
  const key = JSON.stringify({ here, buses: config.BUSES, trains: config.TRAINS });
  try {
    const cached = JSON.parse(await readFile(CACHE, "utf8"));
    if (cached.key === key) return cached.stops;
  } catch {}

  const stops = { buses: {}, trains: {} };

  for (const route of config.BUSES.map(String)) {
    const { directions = [] } = (await getJson(busUrl(config, "getdirections", { rt: route })))["bustime-response"];
    stops.buses[route] = {};
    for (const { dir } of directions) {
      const res = (await getJson(busUrl(config, "getstops", { rt: route, dir })))["bustime-response"];
      const s = nearest(res.stops, here);
      stops.buses[route][dir] = { stpid: s.stpid, name: s.stpnm.replace(/\s*\(.*\)$/, "") };
    }
  }

  const stations = await getJson(`${STATIONS_API}?$limit=1000`);
  for (const code of config.TRAINS.map((t) => String(t).toUpperCase())) {
    const line = TRAIN_LINES[code];
    if (!line) throw new Error(`Unknown train line "${code}". Use one of ${Object.keys(TRAIN_LINES).join(", ")}`);
    const onLine = stations
      .filter((s) => s[line.flag])
      .map((s) => ({ mapid: s.map_id, name: s.station_name, lat: +s.location.latitude, lon: +s.location.longitude }));
    const s = nearest(onLine, here);
    stops.trains[code] = { mapid: s.mapid, name: s.name };
  }

  await mkdir(".cache", { recursive: true });
  await writeFile(CACHE, JSON.stringify({ key, stops }, null, 2));
  return stops;
}

function busUrl(config, endpoint, params) {
  const qs = new URLSearchParams({ key: config.BUS_API_KEY, format: "json", ...params });
  return `${BUS_API}/${endpoint}?${qs}`;
}

// --- departures -------------------------------------------------------------

async function busLines(config, stops) {
  const stpids = Object.values(stops.buses).flatMap((dirs) => Object.values(dirs).map((s) => s.stpid));
  const res = (await getJson(busUrl(config, "getpredictions", {
    rt: config.BUSES.join(","), stpid: [...new Set(stpids)].join(","), top: 30,
  })))["bustime-response"];
  // "No service scheduled" comes back as an error rather than an empty list.
  const prds = res.prd ?? [];

  return config.BUSES.map(String).map((route) => ({
    id: route,
    mode: "bus",
    directions: Object.entries(stops.buses[route]).map(([dir, stop]) => {
      const mine = prds.filter((p) => p.rt === route && p.rtdir === dir && p.stpid === stop.stpid);
      return {
        label: shortDir(dir),
        toward: commonDest(mine.map((p) => p.des)),
        departures: mine.slice(0, 3).map((p) => chicagoTime(p.prdtm)),
      };
    }),
  }));
}

async function trainLine(config, code, station) {
  const line = TRAIN_LINES[code];
  const qs = new URLSearchParams({
    key: config.TRAIN_API_KEY, mapid: station.mapid, rt: line.name, max: 20, outputType: "JSON",
  });
  const { ctatt } = await getJson(`${TRAIN_API}?${qs}`);
  if (ctatt.errCd !== "0") throw new Error(`Train Tracker: ${ctatt.errNm}`);

  return {
    id: code,
    mode: "train",
    directions: Object.entries(TRAIN_DIRS).map(([trDr, label]) => {
      const mine = (ctatt.eta ?? []).filter((e) => e.trDr === trDr);
      return {
        label,
        toward: commonDest(mine.map((e) => e.destNm)),
        departures: mine.slice(0, 3).map((e) => chicagoTime(e.arrT)),
      };
    }),
  };
}

// A line that fails to load still gets a section, showing "No data".
const unavailable = (id, mode) => ({
  id, mode,
  directions: ["North", "South"].map((label) => ({ label, toward: "", departures: [], error: true })),
});

export async function getDepartures(config) {
  const stops = await resolveStops(config);

  const buses = await busLines(config, stops).catch((err) => {
    console.warn(`bus: ${err.message}`);
    return config.BUSES.map((r) => unavailable(String(r), "bus"));
  });
  const trains = await Promise.all(
    Object.entries(stops.trains).map(([code, station]) =>
      trainLine(config, code, station).catch((err) => {
        console.warn(`train ${code}: ${err.message}`);
        return unavailable(code, "train");
      }),
    ),
  );

  const firstTrain = Object.values(stops.trains)[0];
  return {
    stop: {
      name: config.TITLE ?? Object.values(Object.values(stops.buses)[0] ?? {})[0]?.name ?? "Departures",
      code: firstTrain ? `${firstTrain.name} station` : "",
    },
    lines: [...buses, ...trains],
  };
}
