/**
 * @file Countdown wording.
 */
import { expect, test } from "vitest";
import { timeLeft } from "./time";

const NOW = Date.parse("2026-10-28T12:00:00Z");

test.each([
  ["2026-10-29T06:00:00Z", "18 h left"],
  ["2026-10-28T12:40:00Z", "40 min left"],
  ["2026-10-28T11:00:00Z", "ending now"],
])("%s reads as %s", (until, words) => {
  expect(timeLeft(until, NOW)).toBe(words);
});
