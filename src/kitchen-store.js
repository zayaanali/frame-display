// Reads and writes kitchen.json for the web app. Every change goes through
// update(), which runs one at a time and saves atomically, so two phones
// editing at once can't interleave writes or leave a half-written file.

import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

export const FILE = "kitchen.json";
export const LISTS = ["use", "make"];

export const newId = () => randomUUID().slice(0, 8);

// Missing file means empty lists. Items get an id the first time they're
// loaded, so older files without ids keep working.
export async function load() {
  let data = {};
  try {
    data = JSON.parse(await readFile(FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  for (const list of LISTS) data[list] = (data[list] ?? []).map((item) => ({ id: newId(), ...item }));
  return data;
}

async function save(data) {
  await writeFile(`${FILE}.tmp`, JSON.stringify(data, null, 2) + "\n");
  await rename(`${FILE}.tmp`, FILE);
}

let chain = Promise.resolve();

// Runs fn(data) against the latest file contents and saves the result. If fn
// throws, nothing is written and the error propagates to the caller.
export function update(fn) {
  const run = chain.then(async () => {
    const data = await load();
    const result = fn(data);
    await save(data);
    return { data, result };
  });
  chain = run.catch(() => {});
  return run;
}

// Waits for queued writes so a read never sees a state older than the last update.
export const read = () => chain.then(load);
