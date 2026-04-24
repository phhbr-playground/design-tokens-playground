/**
 * @typedef {Object} TokenEntry
 * @property {string} name
 * @property {unknown} resolvedValue
 * @property {unknown} preScriptValue
 * @property {string} type
 * @property {string} description
 * @property {string} hierarchy
 */

const REFERENCE_PATTERN = /\{([^}]+)\}/g;

// Hierarchy is determined by the source folder under /tokens/, not by the
// token path itself, so we have to load each layer file directly to recover
// that grouping for the preview UI.
const HIERARCHY_LAYERS = [
  "design-values",
  "universal",
  "system",
  "semantic",
  "component",
];

async function fetchJson(path, errorMessage) {
  const res = await fetch(path, { cache: "no-store" });
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
    const res = await fetch(path, { cache: "no-store" });
    if (res.ok) return res.json();
  }
  throw new Error(errorMessage);
}

/**
 * Resolved + raw + hierarchy sources are loaded in parallel because they're
 * independent files and combined latency dominates preview startup.
 */
export async function loadTokenSources() {
  const [resolved, raw, hierarchyMap] = await Promise.all([
    fetchJson("/dist/tokens.resolved.json", "tokens.resolved.json not found"),
    fetchJsonWithFallback(
      ["/dist/tokens.pre-script.json", "/dist/tokens.json"],
      "pre-script token JSON not found",
    ),
    buildHierarchyMap(),
  ]);
  return { resolved, raw, hierarchyMap };
}

/**
 * Maps every leaf token path to its source folder. Missing layer files are
 * tolerated so the preview still renders if a build only emits a subset.
 */
async function buildHierarchyMap() {
  const entries = await Promise.all(
    HIERARCHY_LAYERS.map(async (layer) => {
      try {
        const tree = await fetchJson(
          `/tokens/${layer}/tokens.json`,
          `tokens/${layer}/tokens.json not found`,
        );
        return [layer, tree];
      } catch {
        return [layer, null];
      }
    }),
  );

  const map = new Map();
  for (const [layer, tree] of entries) {
    if (!tree) continue;
    collectLeafPaths(tree, "", (path) => map.set(path, layer));
  }
  return map;
}

function collectLeafPaths(node, prefix, visit) {
  if (!node || typeof node !== "object") return;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (!value || typeof value !== "object") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if ("$value" in value) visit(path);
    else collectLeafPaths(value, path, visit);
  }
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
export function flattenTokens(resolved, raw, hierarchyMap = new Map()) {
  const result = [];
  walk(resolved, "", result, raw, hierarchyMap);
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function walk(node, prefix, out, rawRoot, hierarchyMap) {
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
        hierarchy: hierarchyMap.get(path) || "",
      });
      continue;
    }
    walk(value, path, out, rawRoot, hierarchyMap);
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
