/**
 * @file The System page's memory-zone colors: every zone in the 8.3 budget gets its own color.
 */
import { describe, expect, it } from "vitest";

import { ZONE_COLORS, zoneColor } from "./System";

describe("zoneColor", () => {
  it("gives each of the five budget zones a distinct color", () => {
    const colors = [0, 1, 2, 3, 4].map(zoneColor);
    expect(new Set(colors).size).toBe(5);
  });

  it("keeps headroom, the last zone, neutral", () => {
    expect(zoneColor(4)).toBe("var(--line-strong)");
  });

  it("wraps around when there are more zones than colors", () => {
    expect(zoneColor(ZONE_COLORS.length)).toBe(zoneColor(0));
  });
});
