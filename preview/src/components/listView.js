import { escAttr, escHtml } from "../lib/dom.js";
import { writeClipboard } from "../lib/clipboard.js";
import { isValidColor, toDisplayString } from "../lib/format.js";
import { REFERENCE_PATTERN, tokenIdFromName } from "../lib/tokens.js";

const HIGHLIGHT_DURATION_MS = 1700;
const COPY_FEEDBACK_MS = 1500;

/**
 * Renders the categorized token list. Kept as a class because it owns
 * mutable DOM state (highlighted card, copy animations) tied to the
 * lifetime of the root element it manages.
 */
export class ListView {
  /**
   * `onMissingTarget` lets the host clear filters before retrying a jump,
   * so this view stays unaware of global filter state.
   */
  constructor({ root, onMissingTarget }) {
    this.root = root;
    this.onMissingTarget = onMissingTarget ?? (() => false);
    this.root.addEventListener("click", (event) => this.handleClick(event));
  }

  render(entries) {
    if (!entries.length) {
      this.root.innerHTML = '<div class="empty-state">No tokens found. Try adjusting your search.</div>';
      return;
    }

    const grouped = groupByCategory(entries);
    this.root.innerHTML = Object.keys(grouped)
      .sort()
      .map((category) => renderCategory(category, grouped[category]))
      .join("");
  }

  /**
   * Two-pass jump: try direct lookup first, otherwise let the host widen
   * the filter and try once more before giving up.
   */
  jumpTo(targetId) {
    let target = document.getElementById(targetId);
    if (!target) {
      const widened = this.onMissingTarget(targetId);
      if (widened) target = document.getElementById(targetId);
    }
    if (!target) return false;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("highlight");
    // Force reflow so the animation restarts cleanly when re-applied.
    void target.offsetWidth;
    target.classList.add("highlight");
    setTimeout(() => target.classList.remove("highlight"), HIGHLIGHT_DURATION_MS);
    return true;
  }

  /**
   * Single delegated listener instead of per-element binding so re-renders
   * don't accumulate event handlers and we avoid manual cleanup.
   */
  handleClick(event) {
    const refBadge = event.target.closest(".ref-badge");
    if (refBadge) {
      event.stopPropagation();
      const targetId = refBadge.dataset.ref;
      const refPath = refBadge.dataset.refPath || targetId;
      if (!this.jumpTo(targetId)) {
        this.dispatch("listview:missing", { targetId, refPath });
      }
      return;
    }

    const valueBox = event.target.closest(".value-box");
    if (valueBox) {
      copyFromValueBox(valueBox);
    }
  }

  dispatch(type, detail) {
    this.root.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }
}

function groupByCategory(entries) {
  const grouped = {};
  for (const entry of entries) {
    const category = entry.name.split(".")[0];
    (grouped[category] ||= []).push(entry);
  }
  return grouped;
}

function renderCategory(category, entries) {
  return `
    <div class="category-card">
      <div class="category-header">
        <span class="category-name">${escHtml(category)}</span>
        <span class="category-count">${entries.length}</span>
      </div>
      <div class="tokens-list">
        ${entries.map(renderToken).join("")}
      </div>
    </div>`;
}

function renderToken(entry) {
  const id = tokenIdFromName(entry.name);
  const preScript = toDisplayString(entry.preScriptValue);
  const resolved = toDisplayString(entry.resolvedValue);
  const hasReferences = REFERENCE_PATTERN.test(preScript);
  REFERENCE_PATTERN.lastIndex = 0;

  const isCalculated =
    entry.preScriptValue !== undefined && (hasReferences || preScript !== resolved);

  return `
    <div id="${id}" class="token-item">
      <div class="token-item-inner">
        ${renderSwatch(entry, resolved)}
        <div class="token-body">
          <div class="token-header">
            <code class="token-name">${escHtml(entry.name)}</code>
            ${entry.type ? `<span class="type-badge">${escHtml(entry.type)}</span>` : ""}
          </div>
          ${isCalculated ? renderCalculationRows(preScript, resolved) : renderPlainRow(resolved)}
          ${entry.description ? `<p class="token-desc">${escHtml(entry.description)}</p>` : ""}
        </div>
      </div>
    </div>`;
}

function renderSwatch(entry, resolved) {
  if (entry.type !== "color" || !isValidColor(resolved)) return "";
  return `<div class="color-swatch" style="background:${escAttr(resolved)}" title="${escAttr(resolved)}"></div>`;
}

function renderCalculationRows(preScript, resolved) {
  return `
    <div class="value-section">
      ${renderValueRow("CALCULATION", preScript, "calc", renderWithRefs(preScript))}
      ${renderValueRow("RESOLVED", resolved, "resolved", escHtml(resolved))}
    </div>`;
}

function renderPlainRow(resolved) {
  return `
    <div class="value-section">
      ${renderValueRow("VALUE", resolved, "plain", escHtml(resolved))}
    </div>`;
}

function renderValueRow(label, copyValue, modifier, content) {
  return `
    <div class="value-row">
      <label class="value-label">${label}</label>
      <div class="value-box ${modifier}" data-copy="${escAttr(copyValue)}" title="Click to copy">
        <span class="value-content">${content}</span>
        <i class="copy-icon" aria-hidden="true">cp</i>
      </div>
    </div>`;
}

/**
 * Rebuilds the value string with reference badges interleaved so users can
 * navigate token graphs by clicking; reuses a fresh regex iteration to
 * avoid sharing state with extractReferences.
 */
function renderWithRefs(raw) {
  const pattern = /\{([^}]+)\}/g;
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(raw)) !== null) {
    if (match.index > lastIndex) result += escHtml(raw.slice(lastIndex, match.index));

    const refPath = match[1].trim();
    const targetId = tokenIdFromName(refPath);
    result +=
      `<button type="button" class="ref-badge"` +
      ` data-ref="${escAttr(targetId)}" data-ref-path="${escAttr(refPath)}"` +
      ` title="Jump to ${escAttr(refPath)}">${escHtml(refPath)}</button>`;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < raw.length) result += escHtml(raw.slice(lastIndex));
  return result;
}

async function copyFromValueBox(valueBox) {
  await writeClipboard(valueBox.dataset.copy ?? "");

  valueBox.classList.add("copying");
  const icon = valueBox.querySelector(".copy-icon");
  if (icon) {
    icon.textContent = "ok";
    icon.style.opacity = "1";
    icon.style.color = "#166534";
  }

  setTimeout(() => {
    valueBox.classList.remove("copying");
    if (icon) {
      icon.textContent = "cp";
      icon.style.opacity = "";
      icon.style.color = "";
    }
  }, COPY_FEEDBACK_MS);
}
