/**
 * @file The trash pattern in the preview, as areas use it: send what was deleted, register how it
 * goes back, and restoring hands the restorer what was sent.
 */
import { expect, test } from "vitest";
import { Bus } from "./bus";
import { handle } from "./server";
import { RESTORERS, sendToTrash } from "./shell";
import { buildWorld } from "./world";

test("an area restores what it sent to the trash", () => {
  const world = buildWorld(new Bus(), () => new Date("2026-11-28T12:00:00Z"));
  const putBack: unknown[] = [];
  RESTORERS.rule = (_world, payload) => putBack.push(payload);
  try {
    const item = sendToTrash(
      world,
      { kind: "rule", title: "A rule", meta: "Finance", home: "/finance" },
      { id: 1 },
    );
    const answer = handle(world, { method: "POST", path: `/trash/${item.id}/restore` });
    expect(answer.status).toBe(200);
  } finally {
    delete RESTORERS.rule;
  }
  expect(putBack).toEqual([{ id: 1 }]);
});
