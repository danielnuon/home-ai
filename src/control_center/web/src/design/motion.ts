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

/** A spring that settles without bounce (spec 7.14), for sheets and anything that moves. */
export const SETTLE = { type: "spring", stiffness: 380, damping: 40 } as const;

/**
 * How content arrives: a short rise and fade, opacity and transform only, so it runs on the
 * compositor (7.14, "nothing pops in").
 */
export const ARRIVE = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] },
} as const;

/**
 * How a card joins a list that a filter just widened: it fades in from slightly smaller where it
 * will sit, while the cards already there glide aside (decision 128).
 */
export const ENTER = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
} as const;

/** How a card leaves a list: it fades and settles back while the rest close the gap. */
export const LEAVE = { opacity: 0, scale: 0.98, transition: { duration: 0.16 } } as const;

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
