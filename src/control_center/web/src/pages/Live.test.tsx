/**
 * @file Live lists sessions by state, each sub-agent under its thread and lead (spec 15.8.9).
 */
import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { makeSession } from "../test/factories";
import { fakeServer, renderPage } from "../test/render";
import Live from "./Live";

test("sessions are grouped by state, with sub-agents under their thread and lead", async () => {
  fakeServer({
    "GET /api/v1/models": () => ({ pool_mode: "Mode L" }),
    "GET /api/v1/live": () => [
      makeSession(),
      makeSession({
        id: "T-2",
        employee_name: "Foreman",
        doing: "is waiting for your yes",
        tokens_per_second: null,
        waiting_on: "owner",
        session_state: "waiting",
      }),
      makeSession({
        id: "T-3",
        employee_name: "Atlas",
        item: "Daily brief",
        thread_id: null,
        thread_title: null,
        lead_name: null,
      }),
    ],
  });
  renderPage(<Live />);

  const running = await screen.findByRole("region", { name: "Running" });
  const bolt = within(running).getByRole("button", { name: /Bolt · WI-0031/ });
  expect(within(running).getByText("Foreman · Lease Reminders 1.2")).toBeInTheDocument();
  expect(within(bolt).getByText("sub-agent")).toBeInTheDocument();
  expect(within(running).getByText("Scheduled work")).toBeInTheDocument();

  const waiting = screen.getByRole("region", { name: "Waiting" });
  const foreman = within(waiting).getByRole("button", { name: /Foreman · WI-0031/ });
  expect(within(foreman).queryByText("sub-agent")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Blocked" })).not.toBeInTheDocument();
});
