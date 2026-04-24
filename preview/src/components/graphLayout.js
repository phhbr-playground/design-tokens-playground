import { extractReferences } from "../lib/tokens.js";
import { toDisplayString, truncate } from "../lib/format.js";

const NODE_WIDTH = 232;
const NODE_HEIGHT = 62;
const COLUMN_GAP = 86;
const ROW_GAP = 30;
const MARGIN = 56;
const PREVIEW_LENGTH = 56;

/**
 * @typedef {Object} GraphNode
 * @property {string} name
 * @property {string} type
 * @property {string} category
 * @property {string} preview
 * @property {boolean} virtual
 * @property {string[]} incoming
 * @property {string[]} outgoing
 * @property {number} depth
 *
 * @typedef {Object} GraphEdge
 * @property {string} source
 * @property {string} target
 *
 * @typedef {Object} GraphData
 * @property {GraphNode[]} nodes
 * @property {GraphEdge[]} edges
 * @property {Map<string, {x:number,y:number}>} positions
 * @property {{minX:number,minY:number,width:number,height:number}} bounds
 * @property {number} nodeWidth
 * @property {number} nodeHeight
 */

/**
 * Builds a layered graph from token entries. Layering uses dependency depth
 * so dependents flow left-to-right, matching reading order and minimizing
 * crossing edges for typical design-token hierarchies.
 *
 * @returns {GraphData}
 */
export function buildGraphData(entries) {
  const nodes = collectNodes(entries);
  const edges = collectEdges(entries, nodes);
  assignDepths(nodes);

  const layers = groupByDepth(nodes);
  const positions = layoutLayers(layers);
  const bounds = computeBounds(layers);

  return {
    nodes: Array.from(nodes.values()),
    edges,
    positions,
    bounds,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
  };
}

function collectNodes(entries) {
  const nodes = new Map();
  for (const entry of entries) {
    nodes.set(entry.name, {
      name: entry.name,
      type: entry.type || "",
      category: entry.name.split(".")[0] || "",
      preview: truncate(toDisplayString(entry.resolvedValue), PREVIEW_LENGTH),
      virtual: false,
      incoming: [],
      outgoing: [],
      depth: 0,
    });
  }
  return nodes;
}

/**
 * Edges are deduplicated implicitly because extractReferences yields a unique
 * set per source token, so we don't need a second pass.
 */
function collectEdges(entries, nodes) {
  const edges = [];
  for (const entry of entries) {
    const refs = extractReferences(toDisplayString(entry.preScriptValue));
    for (const refName of refs) {
      ensureVirtualNode(nodes, refName);
      nodes.get(refName).outgoing.push(entry.name);
      nodes.get(entry.name).incoming.push(refName);
      edges.push({ source: refName, target: entry.name });
    }
  }
  return edges;
}

/**
 * Virtual nodes represent references whose target token isn't in the current
 * entry set (filtered out, or genuinely missing); rendering them keeps the
 * graph honest about edges instead of dropping them silently.
 */
function ensureVirtualNode(nodes, name) {
  if (nodes.has(name)) return;
  nodes.set(name, {
    name,
    type: "virtual",
    category: name.split(".")[0] || "",
    preview: "Referenced token",
    virtual: true,
    incoming: [],
    outgoing: [],
    depth: 0,
  });
}

/**
 * Memoized DFS with cycle short-circuiting; cycles fall back to depth 0 so
 * the layout still produces a usable diagram if the token graph is malformed.
 */
function assignDepths(nodes) {
  const memo = new Map();

  const compute = (name, trail) => {
    if (memo.has(name)) return memo.get(name);
    if (trail.has(name)) return 0;

    trail.add(name);
    const node = nodes.get(name);
    let depth = 0;
    for (const dep of node?.incoming ?? []) {
      depth = Math.max(depth, compute(dep, new Set(trail)) + 1);
    }
    memo.set(name, depth);
    return depth;
  };

  for (const name of nodes.keys()) {
    nodes.get(name).depth = compute(name, new Set());
  }
}

function groupByDepth(nodes) {
  const layers = new Map();
  for (const node of nodes.values()) {
    if (!layers.has(node.depth)) layers.set(node.depth, []);
    layers.get(node.depth).push(node.name);
  }
  for (const layer of layers.values()) {
    layer.sort((a, b) => a.localeCompare(b));
  }
  return layers;
}

function layoutLayers(layers) {
  const positions = new Map();
  const depths = [...layers.keys()].sort((a, b) => a - b);

  for (const depth of depths) {
    const names = layers.get(depth) || [];
    names.forEach((name, rowIndex) => {
      positions.set(name, {
        x: MARGIN + depth * (NODE_WIDTH + COLUMN_GAP),
        y: MARGIN + rowIndex * (NODE_HEIGHT + ROW_GAP),
      });
    });
  }
  return positions;
}

function computeBounds(layers) {
  const depths = [...layers.keys()];
  const maxDepth = depths.length ? Math.max(...depths) : 0;
  const maxRows = Math.max(
    ...Array.from(layers.values(), (layer) => layer.length),
    1,
  );
  return {
    minX: MARGIN,
    minY: MARGIN,
    width: (maxDepth + 1) * NODE_WIDTH + maxDepth * COLUMN_GAP,
    height: maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP,
  };
}
