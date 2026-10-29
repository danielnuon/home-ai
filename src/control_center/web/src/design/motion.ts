/**
 * @file Motion loading and the reduced-motion preference.
 *
 * Components animate with Motion's lightweight `m` elements; the engine behind them arrives in a
 * separate chunk once the page has painted (spec 7.17). Until then, elements render in their final
 * state without animating.
 */
import { useSyncExternalStore } from "react";

/** Fetches Motion's animation features; passed to `LazyMotion`. */
export const loadMotionFeatures = () =>
  import("./motionFeatures")
    .then((module) => module.default)
    // Animation is optional. If the chunk fails to load (offline, or replaced by a deploy), stay
    // pending forever: elements keep rendering in their final state, as before the chunk
    // arrives, instead of raising an unhandled rejection LazyMotion has nowhere to report.
    .catch(() => new Promise<never>(() => undefined));

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the person has asked their device for less motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}
