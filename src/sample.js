// Sample departures in the same shape src/cta.js returns. Use with --sample.
//
// Shape:
//   { stop: { name, code },
//     lines: [{ id, mode: "bus" | "train",
//               directions: [{ label, toward, departures: [ISO time, ...] }] }] }

const minutesFromNow = (now, m) => new Date(now.getTime() + m * 60_000).toISOString();

export async function getSampleDepartures(now = new Date()) {
  const t = (...ms) => ms.map((m) => minutesFromNow(now, m));
  return {
    stop: { name: "Clark & Schiller", code: "Clark/Division station" },
    lines: [
      {
        id: "156",
        mode: "bus",
        directions: [
          { label: "North", toward: "Belmont/Halsted", departures: t(5, 13, 22) },
          { label: "South", toward: "Union Station", departures: t(6, 7) },
        ],
      },
      {
        id: "22",
        mode: "bus",
        directions: [
          { label: "North", toward: "Howard", departures: t(9, 15) },
          { label: "South", toward: "Harrison", departures: t(15, 18, 20) },
        ],
      },
      {
        id: "36",
        mode: "bus",
        directions: [
          { label: "North", toward: "Devon/Clark", departures: t(5, 10, 16) },
          { label: "South", toward: "LaSalle Metra Station", departures: t(15, 26) },
        ],
      },
      {
        id: "RED",
        mode: "train",
        directions: [
          { label: "North", toward: "Howard", departures: t(0, 4, 10) },
          { label: "South", toward: "95th/Dan Ryan", departures: t(2, 10, 12) },
        ],
      },
    ],
  };
}
