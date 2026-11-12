/**
 * @file The one module that names the animation library (spec 17.18, design practice 8), and the
 * reduced-motion preference.
 *
 * Components import `m`, `AnimatePresence` and the providers from here, so replacing Motion
 * changes this file and the props those components pass, not every import in the app.
 *
 * The engine (`motionFeatures`) is in the initial bundle. It is not loaded lazily, though that
 * would save first-paint bytes (spec 7.17): until the engine arrives, `m` elements stay in their
 * *initial* state, which for sheets and toasts is invisible. A chunk that failed to load (a stale
 * tab after a deploy, a dropped connection) would hide the passkey and veto sheets, so the gate's
 * prompts must not depend on a second request (17.15). It is `domMax` rather than the smaller
 * `domAnimation` because toasts use layout animation.
 */
import { useSyncExternalStore } from "react";

export {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domMax as motionFeatures,
  m,
} from "motion/react";

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
