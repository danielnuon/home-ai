/**
 * @file A setting shows its default and history, and reverts in one step (spec 7.9).
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { fakeServer, renderPage } from "../test/render";
import { makeMoneySetting } from "../test/factories";
import { SettingRow } from "./SettingControl";

const changed = makeMoneySetting({
  value: "15",
  history: [{ at: "2026-10-25T14:05:00Z", old: "5", new: "15", via: "discord" }],
});

test("a setting at its default says so and offers no history", () => {
  renderPage(<SettingRow setting={makeMoneySetting()} />);

  expect(screen.getByText("At default")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
});

test("a changed setting shows its default, its history, and reverts in one step", async () => {
  const sent = fakeServer({
    "POST /api/settings/budget.voice/revert": () => makeMoneySetting({ value: "5" }),
  });
  renderPage(<SettingRow setting={changed} />);

  expect(screen.getByText("Default: $0")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "History" }));
  expect(screen.getByText("$5 → $15")).toBeInTheDocument();
  expect(screen.getByText(/in Discord/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Revert to $5" }));

  expect(await screen.findByText("Approval calls: monthly cap: $5")).toBeInTheDocument();
  expect(sent.some((r) => r.method === "POST" && r.path.endsWith("/revert"))).toBe(true);
});
