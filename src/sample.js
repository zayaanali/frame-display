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
    stop: { name: "Main St & 5th Ave", code: "Stop 4021" },
    lines: [
      {
        id: "12",
        mode: "bus",
        directions: [
          { label: "North", toward: "Northgate", departures: t(2, 14, 29) },
          { label: "South", toward: "Downtown", departures: t(9, 24, 39) },
        ],
      },
      {
        id: "7X",
        mode: "bus",
        directions: [
          { label: "North", toward: "University", departures: t(6, 21) },
          { label: "South", toward: "Transit Ctr", departures: t(0, 15, 30) },
        ],
      },
      {
        id: "45",
        mode: "bus",
        directions: [
          { label: "North", toward: "Lake City", departures: t(11, 41) },
          { label: "South", toward: "Airport", departures: [] },
        ],
      },
      {
        id: "Red",
        mode: "train",
        directions: [
          { label: "North", toward: "Lynnwood", departures: t(4, 12, 20) },
          { label: "South", toward: "Angle Lake", departures: t(7, 15, 23) },
        ],
      },
    ],
  };
}
