/**
 * @file Every employee has a face of their own (spec 7.12, "Avatars"): a mark for their job, and
 * no two marks alike.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import world from "../preview/mock-world.json";
import { EMBLEMS } from "./emblems";

/** Every name given a face in the mock world, wherever it appears. */
function facesIn(value: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => facesIn(item, names));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string" && typeof record.department === "string") {
      names.add(record.name);
    }
    Object.values(record).forEach((item) => facesIn(item, names));
  }
  return names;
}

describe("employee marks", () => {
  it("gives every employee in the Directory a mark of their own", () => {
    const missing = [...facesIn(world)].filter((name) => !EMBLEMS[name]);
    expect(missing).toEqual([]);
  });

  it("draws no two employees the same", () => {
    const drawings = Object.values(EMBLEMS).map((mark) => renderToStaticMarkup(<>{mark}</>));
    expect(new Set(drawings).size).toBe(drawings.length);
  });
});
