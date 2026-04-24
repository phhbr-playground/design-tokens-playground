const DEFAULT_DURATION_MS = 2600;

/**
 * Returned as a closure so callers don't have to manage the dismiss timer
 * or worry about overlapping messages — the latest message always wins.
 */
export function createToast(element, durationMs = DEFAULT_DURATION_MS) {
  let timer = null;

  return function show(message) {
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove("show"), durationMs);
  };
}
