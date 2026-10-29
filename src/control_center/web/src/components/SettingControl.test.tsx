/**
 * @file A money setting shows its policy ceiling and saves the new cap.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { fakeServer, renderPage } from "../test/render";
import { makeMoneySetting } from "../test/factories";
import { SettingRow } from "./SettingControl";

test("saving a cap sends the new value", async () => {
  const sent = fakeServer({
    "PUT /api/settings/budget.voice": () => makeMoneySetting({ value: "10" }),
  });
  renderPage(<SettingRow setting={makeMoneySetting()} />);

  expect(screen.getByText("max $20")).toBeInTheDocument();
  const field = screen.getByLabelText("Approval calls: monthly cap in dollars a month");
  await userEvent.clear(field);
  await userEvent.type(field, "10");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Approval calls: monthly cap: $10")).toBeInTheDocument();
  expect(sent.find((r) => r.method === "PUT")?.body).toEqual({ value: "10" });
});
