/**
 * @file Motion's animation engine, in the initial bundle.
 *
 * It is not loaded lazily, though that would save first-paint bytes (spec 7.17): until the engine
 * arrives, `m` elements stay in their *initial* state, which for sheets and toasts is invisible.
 * A chunk that failed to load (a stale tab after a deploy, a dropped connection) would hide the
 * passkey and veto sheets, so the gate's prompts must not depend on a second request (17.15).
 *
 * `domMax` rather than the smaller `domAnimation` because toasts use layout animation.
 */
export { domMax as default } from "motion/react";
