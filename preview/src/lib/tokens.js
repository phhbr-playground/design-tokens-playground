/**
 * @typedef {Object} TokenEntry
 * @property {string} name
 * @property {unknown} resolvedValue
 * @property {unknown} preScriptValue
 * @property {string} type
 * @property {string} description
 */

const REFERENCE_PATTERN = /\{([^}]+)\}/g;

async function fetchJson(path, errorMessage) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(errorMessage);
  return res.json();
}

/**
 * The preview prefers `tokens.pre-script.json` (pre-interpretation) so the UI
 * can show the original calculation alongside the resolved value, but tolerates
 * its absence to keep older builds renderable.
 */
async function fetchJsonWithFallback(paths, errorMessage) {
  for (const path of paths) {
    const res = await fetch(path);
    if (res.ok) return res.json();
  }
  throw new Error(errorMessage);
}

/**
 * Resolved + raw are loaded in parallel because they're independent files
 * and combined latency dominates the preview startup time.
 */
export async function loadTokenSources() {
  const [resolved, raw] = await Promise.all([
    fetchJson("../dist/tokens.resolved.json", "tokens.resolved.json not found"),
    fetchJsonWithFallback(
      ["../dist/tokens.pre-script.json", "../dist/tokens.json"],
      "pre-script token JSON not found",
    ),
  ]);
  return { resolved, raw };
}

function getPath(obj, dotPath) {
  return dotPath
    .split(".")
    .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);
}

/**
 * Walks the resolved tree and pairs each leaf with its raw counterpart so
 * downstream rendering only deals with a flat, fully-typed list.
 *
 * @returns {TokenEntry[]}
 */
export function flattenTokens(resolved, raw) {
  const result = [];
  walk(resolved, "", result, raw);
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function walk(node, prefix, out, rawRoot) {
  if (!node || typeof node !== "object") return;

  for (const key of Object.keys(node)) {
    const value = node[key];
    if (!value || typeof value !== "object") continue;

    const path = prefix ? `${prefix}.${key}` : key;
    if ("$value" in value) {
      const rawLeaf = getPath(rawRoot, path) || {};
      out.push({
        name: path,
        resolvedValue: value.$value,
        preScriptValue: rawLeaf.$value,
        type: value.$type || rawLeaf.$type || "",
        description: value.$description || rawLeaf.$description || "",
      });
      continue;
    }
    walk(value, path, out, rawRoot);
  }
}

/**
 * Deduplicates because the same reference can appear multiple times in a
 * single calculation; rendering and graph edges both want the unique set.
 *
 * @returns {string[]}
 */
export function extractReferences(value) {
  if (!value || typeof value !== "string") return [];

  const refs = [];
  const seen = new Set();
  REFERENCE_PATTERN.lastIndex = 0;

  let match;
  while ((match = REFERENCE_PATTERN.exec(value)) !== null) {
    const name = (match[1] || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    refs.push(name);
  }

  return refs;
}

/**
 * Token paths contain dots that aren't valid in CSS selectors used by
 * `getElementById` lookups; this keeps the mapping reversible by convention.
 */
export function tokenIdFromName(name) {
  return `tok-${name.replace(/\./g, "-")}`;
}

export { REFERENCE_PATTERN };
