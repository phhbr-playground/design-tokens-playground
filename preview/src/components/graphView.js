import { escAttr, escHtml } from "../lib/dom.js";
import { truncate } from "../lib/format.js";
import { buildGraphData } from "./graphLayout.js";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.6;
const ZOOM_STEP = 1.1;
const FIT_MAX_ZOOM = 1.45;
const FIT_PADDING = 42;

const NODE_TITLE_LENGTH = 34;

/**
 * Owns SVG rendering, viewport pan/zoom, and inspector for the graph view.
 * State lives here (transform, selection) because it has to persist across
 * re-renders that happen when the host filters change.
 */
export class GraphView {
  /**
   * `onOpenInList` exists so the inspector can hand off to the host without
   * the GraphView needing to know how the list is wired up.
   */
  constructor({ svg, inspector, searchInput, fitButton, clearButton, onOpenInList }) {
    this.svg = svg;
    this.inspector = inspector;
    this.searchInput = searchInput;
    this.fitButton = fitButton;
    this.clearButton = clearButton;
    this.onOpenInList = onOpenInList ?? (() => {});

    this.entries = [];
    this.data = null;
    this.viewport = null;
    this.selectedName = "";
    this.transform = { x: 0, y: 0, k: 1 };
    this.pan = { active: false, lastX: 0, lastY: 0 };
    this.needsFit = true;
    this.active = false;

    this.bindEvents();
  }

  setActive(active) {
    this.active = active;
    if (active) {
      this.needsFit = true;
      this.render(this.entries);
    }
  }

  render(entries) {
    this.entries = entries;
    this.data = buildGraphData(entries);

    if (!this.data.nodes.length) {
      this.svg.innerHTML = "";
      this.viewport = null;
      this.renderInspectorEmpty("No nodes to display for the current filter.");
      return;
    }

    if (!this.data.nodes.some((node) => node.name === this.selectedName)) {
      this.selectedName = "";
    }

    if (this.needsFit) {
      this.fitToViewport();
      this.needsFit = false;
    }

    this.draw();
    this.renderInspector();
    this.applyTransform();
  }

  bindEvents() {
    this.fitButton.addEventListener("click", () => {
      this.needsFit = true;
      this.render(this.entries);
    });

    this.clearButton.addEventListener("click", () => {
      this.selectedName = "";
      this.render(this.entries);
    });

    this.searchInput.addEventListener("input", () => this.handleSearch());

    // Wheel must be on the SVG with passive: false so we can preventDefault
    // and avoid the page scrolling while the user zooms.
    this.svg.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });

    this.svg.addEventListener("mousedown", (event) => this.handlePanStart(event));
    this.svg.addEventListener("click", (event) => this.handleNodeClick(event));

    // Pan listeners attach to window so dragging continues even if the
    // pointer leaves the SVG element mid-drag.
    window.addEventListener("mousemove", (event) => this.handlePanMove(event));
    window.addEventListener("mouseup", () => this.handlePanEnd());
    window.addEventListener("resize", () => this.handleResize());
  }

  handleSearch() {
    if (!this.data) return;
    const query = (this.searchInput.value || "").trim().toLowerCase();
    if (!query) return;

    const match = this.data.nodes.find((node) => node.name.toLowerCase().includes(query));
    if (!match) return;

    this.selectedName = match.name;
    this.centerOnNode(match.name);
    this.render(this.entries);
  }

  handleWheel(event) {
    if (!this.active) return;
    event.preventDefault();

    const rect = this.svg.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const next = clamp(this.transform.k * factor, MIN_ZOOM, MAX_ZOOM);

    // Anchor zoom on the cursor by re-centering around the pre-zoom world
    // coordinate so the point under the pointer stays fixed.
    const worldX = (px - this.transform.x) / this.transform.k;
    const worldY = (py - this.transform.y) / this.transform.k;
    this.transform.k = next;
    this.transform.x = px - worldX * next;
    this.transform.y = py - worldY * next;
    this.applyTransform();
  }

  handlePanStart(event) {
    if (event.target.closest(".graph-node")) return;
    this.pan.active = true;
    this.pan.lastX = event.clientX;
    this.pan.lastY = event.clientY;
    this.svg.classList.add("is-panning");
  }

  handlePanMove(event) {
    if (!this.pan.active || !this.active) return;
    this.transform.x += event.clientX - this.pan.lastX;
    this.transform.y += event.clientY - this.pan.lastY;
    this.pan.lastX = event.clientX;
    this.pan.lastY = event.clientY;
    this.applyTransform();
  }

  handlePanEnd() {
    if (!this.pan.active) return;
    this.pan.active = false;
    this.svg.classList.remove("is-panning");
  }

  handleResize() {
    if (!this.active) return;
    this.needsFit = true;
    this.render(this.entries);
  }

  handleNodeClick(event) {
    const nodeEl = event.target.closest(".graph-node");
    if (!nodeEl) return;
    this.selectedName = nodeEl.dataset.name;
    this.render(this.entries);
  }

  draw() {
    const { nodes, edges, positions, nodeWidth, nodeHeight } = this.data;

    const edgeMarkup = edges
      .map((edge) => renderEdge(edge, positions, nodeWidth, nodeHeight, this.isRelatedEdge(edge)))
      .filter(Boolean)
      .join("");

    const nodeMarkup = nodes
      .map((node) =>
        renderNode(
          node,
          positions.get(node.name),
          nodeWidth,
          nodeHeight,
          node.name === this.selectedName,
          this.isRelatedNode(node.name),
        ),
      )
      .filter(Boolean)
      .join("");

    this.svg.innerHTML = `${MARKER_DEFS}<g id="graphViewport">${edgeMarkup}${nodeMarkup}</g>`;
    this.viewport = this.svg.querySelector("#graphViewport");
  }

  renderInspector() {
    if (!this.selectedName) {
      this.renderInspectorOverview();
      return;
    }

    const node = this.data.nodes.find((n) => n.name === this.selectedName);
    if (!node) return;

    this.inspector.innerHTML = renderInspectorBody(node);
    this.bindInspector();
  }

  renderInspectorOverview() {
    const total = this.data.nodes.length;
    const tokenCount = this.data.nodes.filter((n) => !n.virtual).length;
    const virtualCount = total - tokenCount;

    this.inspector.innerHTML =
      '<h3 class="inspector-title">Graph Inspector</h3>' +
      `<p class="inspector-muted">${tokenCount} token nodes, ${virtualCount} virtual nodes, ${this.data.edges.length} dependency edges.</p>` +
      '<p class="inspector-muted">Tip: click a node to inspect dependencies and jump back to the list view.</p>';
  }

  renderInspectorEmpty(message) {
    this.inspector.innerHTML =
      '<h3 class="inspector-title">Graph Inspector</h3>' +
      `<p class="inspector-muted">${escHtml(message)}</p>`;
  }

  bindInspector() {
    this.inspector.querySelectorAll(".inspector-link").forEach((link) => {
      link.addEventListener("click", () => {
        this.selectedName = link.dataset.node;
        this.centerOnNode(this.selectedName);
        this.render(this.entries);
      });
    });

    const openButton = this.inspector.querySelector("#openInListBtn");
    if (openButton) {
      openButton.addEventListener("click", () => this.onOpenInList(this.selectedName));
    }
  }

  fitToViewport() {
    if (!this.data) return;

    const rect = this.svg.getBoundingClientRect();
    const viewW = Math.max(rect.width, 100);
    const viewH = Math.max(rect.height, 100);
    const { bounds } = this.data;

    const scale = clamp(
      Math.min(
        (viewW - FIT_PADDING * 2) / bounds.width,
        (viewH - FIT_PADDING * 2) / bounds.height,
      ),
      MIN_ZOOM,
      FIT_MAX_ZOOM,
    );

    this.transform.k = scale;
    this.transform.x = (viewW - bounds.width * scale) / 2 - bounds.minX * scale;
    this.transform.y = (viewH - bounds.height * scale) / 2 - bounds.minY * scale;
  }

  centerOnNode(name) {
    if (!this.data) return;
    const pos = this.data.positions.get(name);
    if (!pos) return;

    const rect = this.svg.getBoundingClientRect();
    const viewW = Math.max(rect.width, 100);
    const viewH = Math.max(rect.height, 100);
    const cx = pos.x + this.data.nodeWidth / 2;
    const cy = pos.y + this.data.nodeHeight / 2;

    this.transform.x = viewW / 2 - cx * this.transform.k;
    this.transform.y = viewH / 2 - cy * this.transform.k;
    this.applyTransform();
  }

  applyTransform() {
    if (!this.viewport) return;
    const { x, y, k } = this.transform;
    this.viewport.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
  }

  isRelatedNode(name) {
    if (!this.selectedName || this.selectedName === name) return false;
    const selected = this.data.nodes.find((n) => n.name === this.selectedName);
    if (!selected) return false;
    return selected.incoming.includes(name) || selected.outgoing.includes(name);
  }

  isRelatedEdge(edge) {
    if (!this.selectedName) return false;
    return edge.source === this.selectedName || edge.target === this.selectedName;
  }
}

const MARKER_DEFS =
  '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">' +
  '<polygon points="0 0, 10 3.5, 0 7" fill="#7c8ba3"></polygon></marker></defs>';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderEdge(edge, positions, nodeWidth, nodeHeight, related) {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  if (!source || !target) return "";

  const startX = source.x + nodeWidth;
  const startY = source.y + nodeHeight / 2;
  const endX = target.x;
  const endY = target.y + nodeHeight / 2;
  const c1x = startX + 36;
  const c2x = endX - 36;

  const cls = related ? "graph-edge related" : "graph-edge";
  return `<path class="${cls}" d="M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}" marker-end="url(#arrowhead)"></path>`;
}

function renderNode(node, position, nodeWidth, nodeHeight, selected, related) {
  if (!position) return "";

  const classes = ["graph-node"];
  if (node.virtual) classes.push("virtual");
  if (selected) classes.push("selected");
  else if (related) classes.push("related");

  const typeLabel = node.virtual ? "virtual" : node.type || "token";

  return (
    `<g class="${classes.join(" ")}" data-name="${escAttr(node.name)}">` +
    `<rect x="${position.x}" y="${position.y}" width="${nodeWidth}" height="${nodeHeight}" rx="12"></rect>` +
    `<text x="${position.x + 12}" y="${position.y + 22}" class="graph-node-title">${escHtml(truncate(node.name, NODE_TITLE_LENGTH))}</text>` +
    `<text x="${position.x + 12}" y="${position.y + 40}" class="graph-node-sub">${escHtml(typeLabel)}</text>` +
    `<text x="${position.x + 12}" y="${position.y + 56}" class="graph-node-preview">${escHtml(node.preview || "")}</text>` +
    `</g>`
  );
}

function renderInspectorBody(node) {
  const incoming = [...node.incoming].sort((a, b) => a.localeCompare(b));
  const outgoing = [...node.outgoing].sort((a, b) => a.localeCompare(b));

  return (
    '<h3 class="inspector-title">Graph Inspector</h3>' +
    `<p class="inspector-name">${escHtml(node.name)}</p>` +
    `<p class="inspector-meta">Type: <strong>${escHtml(node.virtual ? "virtual" : node.type || "token")}</strong></p>` +
    `<p class="inspector-meta">Preview: <strong>${escHtml(node.preview || "-")}</strong></p>` +
    renderInspectorList("Depends On", incoming) +
    renderInspectorList("Used By", outgoing) +
    (node.virtual
      ? '<p class="inspector-muted">Virtual nodes are references that are currently filtered out.</p>'
      : '<button type="button" class="inspector-open-list" id="openInListBtn">Open In List View</button>')
  );
}

function renderInspectorList(title, names) {
  const body = names.length
    ? names
        .map(
          (name) =>
            `<button type="button" class="inspector-link" data-node="${escAttr(name)}">${escHtml(name)}</button>`,
        )
        .join("")
    : `<p class="inspector-muted">No ${title === "Depends On" ? "dependencies" : "dependents"}.</p>`;

  return `<div class="inspector-section"><h4>${escHtml(title)}</h4>${body}</div>`;
}
