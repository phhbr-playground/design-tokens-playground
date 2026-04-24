import { byId, escAttr, escHtml } from "./lib/dom.js";
import { loadTokenSources, flattenTokens, tokenIdFromName } from "./lib/tokens.js";
import { toDisplayString } from "./lib/format.js";
import { createToast } from "./components/toast.js";
import { ListView } from "./components/listView.js";
import { GraphView } from "./components/graphView.js";

/**
 * Top-level orchestrator: owns filter state and view-switching, delegates
 * rendering to ListView and GraphView so each surface stays focused on its
 * own DOM and interactions.
 */
class TokenPreviewApp {
  constructor() {
    this.entries = [];
    // Two-level taxonomic filter: first segment is the hierarchy layer
    // (design-values, universal, ...), second is the namespace group (e.g. bluu).
    this.filter = { search: "", hierarchies: [], groups: [] };
    this.currentView = "list";

    this.dom = this.cacheDom();
    this.toast = createToast(this.dom.toast);

    this.listView = new ListView({
      root: this.dom.categories,
      onMissingTarget: (targetId) => this.handleMissingListTarget(targetId),
    });

    this.graphView = new GraphView({
      svg: this.dom.graphSvg,
      inspector: this.dom.graphInspector,
      searchInput: this.dom.graphSearchInput,
      fitButton: this.dom.graphFitBtn,
      clearButton: this.dom.graphResetSelectionBtn,
      onOpenInList: (name) => this.openInListView(name),
    });

    this.bindEvents();
  }

  async start() {
    try {
      const { resolved, raw, hierarchyMap } = await loadTokenSources();
      this.entries = flattenTokens(resolved, raw, hierarchyMap);
      this.renderFilterTags();
      this.applyFilters();
    } catch (err) {
      console.error(err);
      this.dom.categories.innerHTML =
        '<div class="empty-state">' +
        "Failed to load tokens.<br>" +
        "<small>Run <code>npm run build</code>, then serve via <code>npm run preview</code>.</small>" +
        "</div>";
    }
  }

  cacheDom() {
    return {
      categories: byId("categories"),
      searchInput: byId("searchInput"),
      resetBtn: byId("resetBtn"),
      filterTags: byId("filterTags"),
      listViewBtn: byId("listViewBtn"),
      graphViewBtn: byId("graphViewBtn"),
      listView: byId("listView"),
      graphView: byId("graphView"),
      graphSearchInput: byId("graphSearchInput"),
      graphFitBtn: byId("graphFitBtn"),
      graphResetSelectionBtn: byId("graphResetSelectionBtn"),
      graphSvg: byId("graphSvg"),
      graphInspector: byId("graphInspector"),
      toast: byId("toast"),
    };
  }

  bindEvents() {
    this.dom.searchInput.addEventListener("input", (event) => {
      this.filter.search = (event.target.value || "").toLowerCase();
      this.applyFilters();
    });

    this.dom.resetBtn.addEventListener("click", () => {
      this.filter = { search: "", hierarchies: [], groups: [] };
      this.dom.searchInput.value = "";
      this.applyFilters();
    });

    this.dom.listViewBtn.addEventListener("click", () => this.switchView("list"));
    this.dom.graphViewBtn.addEventListener("click", () => this.switchView("graph"));

    // Listen for jump misses so we can toast a hint without coupling
    // ListView to the global toast helper.
    this.dom.categories.addEventListener("listview:missing", (event) => {
      const { refPath, targetId } = event.detail;
      this.toast(`Token not found: ${refPath || targetId}`);
    });
  }

  switchView(nextView) {
    if (nextView === this.currentView) return;
    this.currentView = nextView;

    const isList = nextView === "list";
    this.dom.listView.classList.toggle("hidden", !isList);
    this.dom.graphView.classList.toggle("hidden", isList);
    this.dom.graphView.setAttribute("aria-hidden", isList ? "true" : "false");

    this.dom.listViewBtn.classList.toggle("active", isList);
    this.dom.graphViewBtn.classList.toggle("active", !isList);
    this.dom.listViewBtn.setAttribute("aria-selected", String(isList));
    this.dom.graphViewBtn.setAttribute("aria-selected", String(!isList));

    this.graphView.setActive(!isList);
    if (isList) this.listView.render(this.filteredEntries());
    else this.graphView.render(this.filteredEntries());
  }

  applyFilters() {
    this.renderFilterTags();
    const filtered = this.filteredEntries();

    if (this.currentView === "list") this.listView.render(filtered);
    else this.graphView.render(filtered);
  }

  filteredEntries() {
    const { search, hierarchies, groups } = this.filter;

    return this.entries.filter((entry) => {
      const group = getFilterPrefix(entry.name);
      if (hierarchies.length && !hierarchies.includes(entry.hierarchy)) return false;
      if (groups.length && !groups.includes(group)) return false;
      if (!search) return true;
      return searchableParts(entry).some((part) => part.toLowerCase().includes(search));
    });
  }

  /**
   * Two filter rows: the hierarchy layer (source folder) and a two-segment
   * path prefix (for example `bluu.cornflower-100`). The prefix row narrows to
   * whatever is reachable under the active hierarchies so users never see a
   * tag that would yield zero results.
   */
  renderFilterTags() {
    const hierarchies = this.collectHierarchies();
    const groups = this.collectGroups(this.filter.hierarchies);

    // Drop any active group selections that are no longer reachable; without
    // this the user could end up with an unreachable filter after toggling.
    const reachable = new Set(groups);
    this.filter.groups = this.filter.groups.filter((g) => reachable.has(g));

    this.dom.filterTags.innerHTML =
      renderFilterRow("Hierarchy", "hierarchy", hierarchies, this.filter.hierarchies) +
      renderFilterRow("Prefix", "group", groups, this.filter.groups);

    this.dom.filterTags.querySelectorAll(".filter-tag").forEach((button) => {
      button.addEventListener("click", () => {
        const { kind, value } = button.dataset;
        this.toggleFilter(kind, value);
      });
    });
  }

  collectHierarchies() {
    const set = new Set();
    for (const entry of this.entries) {
      if (entry.hierarchy) set.add(entry.hierarchy);
    }
    return [...set].sort();
  }

  collectGroups(hierarchyScope) {
    const scope = hierarchyScope?.length ? new Set(hierarchyScope) : null;
    const groups = new Set();
    for (const entry of this.entries) {
      if (scope && !scope.has(entry.hierarchy)) continue;
      const group = getFilterPrefix(entry.name);
      if (group) groups.add(group);
    }
    return [...groups].sort();
  }

  toggleFilter(kind, value) {
    const key = kind === "hierarchy" ? "hierarchies" : "groups";
    const list = this.filter[key];
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
    else list.push(value);
    this.applyFilters();
  }

  /**
   * Called when the list view can't find a jump target: clearing filters
   * is a one-shot widening so the missing token becomes reachable again.
   */
  handleMissingListTarget() {
    if (!this.filter.search && !this.filter.hierarchies.length && !this.filter.groups.length) {
      return false;
    }
    this.filter = { search: "", hierarchies: [], groups: [] };
    this.dom.searchInput.value = "";
    this.applyFilters();
    return true;
  }

  openInListView(name) {
    this.switchView("list");
    if (!this.listView.jumpTo(tokenIdFromName(name))) {
      this.toast(`Token not found: ${name}`);
    }
  }
}

function renderFilterRow(label, kind, values, active) {
  if (!values.length) return "";
  const activeSet = new Set(active);
  const tags = values
    .map((value) => {
      const isActive = activeSet.has(value);
      return (
        `<button class="filter-tag${isActive ? " active" : ""}"` +
        ` data-kind="${escAttr(kind)}" data-value="${escAttr(value)}">` +
        `${escHtml(value)}</button>`
      );
    })
    .join("");
  return `<div class="filter-row"><span class="filter-row-label">${escHtml(label)}</span><div class="filter-row-tags">${tags}</div></div>`;
}

function getFilterPrefix(name) {
  const segments = name.split(".");
  return segments.slice(0, 2).join(".") || name;
}

function searchableParts(entry) {
  return [
    entry.name,
    entry.description,
    toDisplayString(entry.preScriptValue),
    toDisplayString(entry.resolvedValue),
  ].filter(Boolean);
}

new TokenPreviewApp().start();
