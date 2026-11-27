/**
 * @file Today's layout: moves, sizes and visibility, and reading whatever storage holds.
 */
import { expect, test } from "vitest";
import {
  DEFAULT_LAYOUT,
  hideWidget,
  moveWidget,
  parseLayout,
  placeAt,
  resizeWidget,
  showWidget,
  sizeOf,
  visible,
} from "./homeLayout";

test("the default leads with what needs the Owner and what is happening", () => {
  expect(visible(DEFAULT_LAYOUT).slice(0, 2)).toEqual(["needs", "live"]);
});

test("moving and dropping reorder only the visible widgets", () => {
  expect(visible(moveWidget(DEFAULT_LAYOUT, "live", -1)).slice(0, 2)).toEqual(["live", "needs"]);
  expect(moveWidget(DEFAULT_LAYOUT, "needs", -1)).toBe(DEFAULT_LAYOUT);
  expect(visible(placeAt(DEFAULT_LAYOUT, "needs", "agenda")).slice(0, 3)).toEqual([
    "live",
    "agenda",
    "needs",
  ]);
  expect(visible(placeAt(DEFAULT_LAYOUT, "systems", "needs"))[0]).toBe("systems");
});

test("Needs you is pinned, and a widget takes only the sizes it supports", () => {
  expect(hideWidget(DEFAULT_LAYOUT, "needs")).toBe(DEFAULT_LAYOUT);
  expect(sizeOf(resizeWidget(DEFAULT_LAYOUT, "needs", "s"), "needs")).toBe("m");
  expect(sizeOf(resizeWidget(DEFAULT_LAYOUT, "systems", "l"), "systems")).toBe("l");
});

test("a removed widget comes back at the end", () => {
  const hidden = hideWidget(DEFAULT_LAYOUT, "team");
  expect(visible(hidden)).not.toContain("team");
  expect(visible(showWidget(hidden, "team")).at(-1)).toBe("team");
});

test("reading storage repairs anything unexpected", () => {
  expect(parseLayout(null)).toBe(DEFAULT_LAYOUT);
  expect(parseLayout("not json")).toBe(DEFAULT_LAYOUT);
  const stored = parseLayout(
    JSON.stringify({
      order: ["live", "gone", "needs"],
      hidden: ["needs"],
      size: { live: "s", systems: "l" },
    }),
  );
  // Unknown ids drop, pinned widgets cannot hide, new widgets join hidden, bad sizes are ignored.
  expect(visible(stored)).toEqual(["live", "needs"]);
  expect(stored.hidden).toContain("systems");
  expect(stored.size).toEqual({ systems: "l" });
});
