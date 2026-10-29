/**
 * @file Motion's animation engine, kept in its own chunk so it loads after first paint (spec 7.17).
 *
 * `domMax` rather than the smaller `domAnimation` because toasts use layout animation.
 */
export { domMax as default } from "motion/react";
