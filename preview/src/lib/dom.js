/**
 * Escapes via the browser's own text serializer so we don't have to
 * maintain a hand-rolled entity table that risks drifting from spec.
 */
export function escHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

/**
 * Attribute escaping is intentionally separate from text escaping because
 * attribute contexts must also neutralize quote characters.
 */
export function escAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Centralized lookup so missing IDs surface immediately during development
 * rather than as confusing null-deref errors deep inside event handlers.
 */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el;
}
