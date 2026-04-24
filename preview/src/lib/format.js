/**
 * Token values can be primitives, objects, or arrays after resolution.
 * A single coercion point keeps rendering deterministic across views.
 */
export function toDisplayString(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * Used in compact UI contexts (graph nodes, previews) where overflow would
 * break layout; the ellipsis is intentionally part of the budget.
 */
export function truncate(value, length) {
  const text = String(value ?? "");
  if (text.length <= length) return text;
  return `${text.slice(0, Math.max(0, length - 3))}...`;
}

/**
 * Delegates to the browser CSS parser so we accept anything the platform
 * accepts (named colors, modern color() syntax, etc.) without maintaining
 * our own allow-list.
 */
export function isValidColor(color) {
  try {
    const probe = new Option().style;
    probe.color = color;
    return Boolean(probe.color);
  } catch {
    return false;
  }
}
