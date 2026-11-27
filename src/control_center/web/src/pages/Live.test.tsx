/**
 * @file Live puts what needs the Owner first and gives each thread one card, whose sessions read as
 * a relay (spec 15.8.9; decision 125).
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeSession } from "../test/factories";
import { fakeServer, renderPage } from "../test/render";
import Live from "./Live";

const sessions = () => [
  makeSession(),
  makeSession({
    id: "T-2",
    employee_name: "Redline",
    department: "quality",
    item: "Review WI-0031",
    state: "idle",
    doing: "is waiting for Bolt",
    tokens_per_second: null,
    session_state: "queued",
  }),
  makeSession({
    id: "T-3",
    employee_name: "Foreman",
    department: "governance",
    item: "WI-0029 Receipt scanner",
    doing: "is waiting for your yes on the design",
    tokens_per_second: null,
    waiting_on: "owner",
    session_state: "waiting",
    thread_id: "TH-2",
    thread_title: "Receipt scanner",
  }),
  makeSession({
    id: "T-4",
    employee_name: "Atlas",
    department: "personal",
    item: "Daily brief",
    thread_id: null,
    thread_title: null,
    lead_name: null,
  }),
];

test("what needs you comes first, then a card per thread with its sessions as a relay", async () => {
  fakeServer({
    "GET /api/v1/models": () => ({ pool_mode: "Mode L" }),
    "GET /api/v1/live": sessions,
  });
  renderPage(<Live />);

  const needs = await screen.findByRole("region", { name: "Needs you" });
  expect(within(needs).getByText(/Foreman is waiting for your yes/)).toBeInTheDocument();

  const thread = screen.getByRole("article", { name: "Lease Reminders 1.2" });
  const relay = within(thread).getByRole("list", { name: "Sessions on this thread" });
  const stops = within(relay).getAllByRole("button");
  expect(stops).toEqual([
    within(relay).getByRole("button", { name: "Bolt, running: WI-0031 Lease Reminders" }),
    within(relay).getByRole("button", { name: "Redline, queued: Review WI-0031" }),
  ]);

  const brief = screen.getByRole("article", { name: "Daily brief" });
  expect(within(brief).getByText("Scheduled · Atlas")).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Receipt scanner" })).not.toBeInTheDocument();
});

test("a filter narrows the feed to the sessions in that state", async () => {
  fakeServer({
    "GET /api/v1/models": () => ({ pool_mode: "Mode L" }),
    "GET /api/v1/live": sessions,
  });
  renderPage(<Live />);

  await userEvent.click(await screen.findByRole("button", { name: /^Needs you 1/ }));
  expect(screen.getByRole("region", { name: "Needs you" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Daily brief" })).not.toBeInTheDocument();
});
