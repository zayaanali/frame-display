// Recipe suggestions for the phone app's IDEAS tab: sends the TO USE list
// (in priority order) and the guidance in suggestions.md to a model on
// OpenRouter, and returns a handful of recipes.
//
// Settings live in config.json and are read on every request, as is
// suggestions.md, so edits apply without restarting the server:
//   OPENROUTER_API_KEY         required
//   OPENROUTER_MODEL           required, an OpenRouter model slug
//   OPENROUTER_FALLBACK_MODEL  optional, tried once if the provider is down
//
// The last result is kept in .cache/suggestions.json so reopening the tab
// doesn't cost another request.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const API = "https://openrouter.ai/api/v1/chat/completions";
const GUIDE = "suggestions.md";
const CACHE = ".cache/suggestions.json";
const COUNT = 5;
const TIMEOUT = 90_000;

// Errors carry an HTTP status so the server passes the message on to the phone.
function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

// What the list looked like when suggestions were made; the app compares it
// with the current list to tell when they've gone stale.
const signature = (items) => items.map((i) => (i.qty ? `${i.name} (${i.qty})` : i.name));

// --- prompt ---------------------------------------------------------------------

// HTML comments in the guide are notes to whoever edits it, not to the model.
async function loadGuide() {
  const text = await readFile(GUIDE, "utf8").catch(() => "");
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function buildMessages({ use, make }, guide) {
  const system = [
    "You suggest recipes for a home kitchen, based on ingredients that need using up.",
    "The ingredients are listed in priority order: the first is the most urgent to use.",
    guide ? `Follow this guidance from the cook:\n\n${guide}` : "",
    `Reply with JSON only, in this shape, with exactly ${COUNT} recipes:`,
    '{ "recipes": [{ "name": "string", "time": "string, e.g. 30 min",',
    '  "uses": ["ingredients taken from the list"], "needs": ["other ingredients to have or buy"],',
    '  "method": "string, a few sentences" }] }',
  ].filter(Boolean).join("\n\n");

  const user = [
    "Ingredients to use up, most urgent first:",
    ...signature(use).map((line, i) => `${i + 1}. ${line}`),
    make.length ? `\nAlready planned, so don't suggest these again:\n${make.map((i) => `- ${i.name}`).join("\n")}` : "",
  ].join("\n");

  return [{ role: "system", content: system }, { role: "user", content: user }];
}

// --- OpenRouter -----------------------------------------------------------------

async function complete({ key, model, messages }) {
  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Kitchen display" },
      body: JSON.stringify({ model, messages, response_format: { type: "json_object" }, temperature: 0.7 }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (err) {
    throw fail(503, err.name === "TimeoutError" ? "The model took too long to answer." : "Couldn't reach OpenRouter.");
  }
  const body = await res.json().catch(() => ({}));
  // OpenRouter can also report a provider failure inside a 200 response.
  const error = res.ok ? body.error : body.error ?? {};
  if (error) throw fail(Number(error.code) || res.status || 502, error.message || `OpenRouter returned ${res.status}`);
  return body.choices?.[0]?.message?.content ?? "";
}

const providerDown = (err) => [502, 503, 504].includes(err.status) || /provider returned error/i.test(err.message);

const FRIENDLY = {
  401: "OpenRouter rejected the key. Check OPENROUTER_API_KEY in config.json.",
  402: "OpenRouter is out of credits.",
  403: "OpenRouter denied access to this model.",
  404: "OpenRouter doesn't know this model. Check OPENROUTER_MODEL in config.json.",
  429: "OpenRouter rate limit reached. Try again in a minute.",
};

// --- reply ----------------------------------------------------------------------

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const texts = (value) => (Array.isArray(value) ? value.map((v) => text(v, 60)).filter(Boolean).slice(0, 12) : []);

function parseRecipes(content) {
  let json;
  try {
    // Some models wrap JSON in a code fence despite being asked not to.
    json = JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    throw fail(502, "The model's reply wasn't valid JSON. Try again.");
  }
  const recipes = (Array.isArray(json) ? json : json.recipes ?? [])
    .map((r) => ({
      name: text(r?.name, 80), time: text(r?.time, 30), uses: texts(r?.uses), needs: texts(r?.needs),
      method: text(r?.method, 1200),
    }))
    .filter((r) => r.name)
    .slice(0, COUNT);
  if (!recipes.length) throw fail(502, "The model didn't return any recipes. Try again.");
  return recipes;
}

// --- public ---------------------------------------------------------------------

export async function lastSuggestions() {
  try {
    return JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    return null;
  }
}

async function generate(kitchen) {
  const use = kitchen.use ?? [];
  if (!use.length) throw fail(400, "Add something to TO USE first.");

  const config = JSON.parse(await readFile("config.json", "utf8"));
  const key = config.OPENROUTER_API_KEY;
  const model = config.OPENROUTER_MODEL;
  const fallback = config.OPENROUTER_FALLBACK_MODEL;
  if (!key) throw fail(500, "OPENROUTER_API_KEY is not set in config.json.");
  if (!model) throw fail(500, "OPENROUTER_MODEL is not set in config.json.");

  const messages = buildMessages({ use, make: kitchen.make ?? [] }, await loadGuide());
  let content;
  let used = model;
  try {
    content = await complete({ key, model, messages });
  } catch (err) {
    if (providerDown(err) && fallback && fallback !== model) {
      used = fallback;
      content = await complete({ key, model: fallback, messages }).catch((e) => { throw fail(e.status, FRIENDLY[e.status] ?? e.message); });
    } else {
      console.warn(`suggestions: ${err.status} ${err.message}`);
      throw fail(err.status, FRIENDLY[err.status] ?? err.message);
    }
  }

  const result = { at: new Date().toISOString(), model: used, use: signature(use), recipes: parseRecipes(content) };
  await mkdir(".cache", { recursive: true });
  await writeFile(`${CACHE}.tmp`, JSON.stringify(result, null, 2) + "\n");
  await rename(`${CACHE}.tmp`, CACHE);
  return result;
}

// Two phones tapping at once share one request.
let pending = null;
export function suggest(kitchen) {
  pending ??= generate(kitchen).finally(() => { pending = null; });
  return pending;
}
