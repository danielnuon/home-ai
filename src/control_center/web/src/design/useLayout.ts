/**
 * @file Which of the three layouts is showing, chosen by available width (spec 7.12).
 *
 * CSS does the layout itself with the same breakpoints; this hook is for the few behaviors that
 * differ in script, such as a sheet rising from the bottom on a phone but sliding in from the side
 * on wider screens.
 */
import { useSyncExternalStore } from "react";

/** Phone under 600, tablet from 600 to 1180, desktop above (CSS pixels, which are iOS points). */
export type Layout = "phone" | "tablet" | "desktop";

const TABLET = "(min-width: 600px)";
const DESKTOP = "(min-width: 1181px)";

function current(): Layout {
  if (window.matchMedia(DESKTOP).matches) return "desktop";
  return window.matchMedia(TABLET).matches ? "tablet" : "phone";
}

function subscribe(onChange: () => void): () => void {
  const queries = [window.matchMedia(TABLET), window.matchMedia(DESKTOP)];
  queries.forEach((query) => query.addEventListener("change", onChange));
  return () => queries.forEach((query) => query.removeEventListener("change", onChange));
}

/** The current layout, updated when the window is resized or the tablet rotates. */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, current, () => "phone");
}
