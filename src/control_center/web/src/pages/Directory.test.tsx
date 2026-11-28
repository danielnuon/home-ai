/**
 * @file Directory filters and views, and Suggest a role (spec 7.11, 7.2).
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { fakeServer, renderPage } from "../test/render";
import Directory from "./Directory";

const person = (id: string, name: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name,
  title: "Role",
  department: "personal",
  group: "Personal",
  state: "idle",
  now: "Idle",
  tagline: "",
  mission: "",
  tools: [],
  model: "conversation model",
  hired: "Phase 9",
  tasks_done: 0,
  enabled: true,
  status: "idle",
  pipeline: "Personal",
  reports_to: "PO-1",
  ...overrides,
});

const DIRECTORY = {
  employees: [
    person("PO-1", "Atlas", { title: "Chief of Staff", group: "Leads", reports_to: null }),
    person("GOV-1", "Foreman", {
      title: "Development Lead",
      department: "governance",
      group: "Leads",
      pipeline: "Development",
      reports_to: null,
    }),
    person("PO-2", "Chrono"),
    person("ENG-1", "Bolt", {
      department: "engineering",
      group: "Engineering and quality",
      pipeline: "Development",
      reports_to: "GOV-1",
      status: "active_now",
      now: "Writing code",
    }),
  ],
  proposals: [],
  instruments: 7,
};

test("the org view puts each lead with the employees who report to it", async () => {
  fakeServer({ "GET /api/v1/directory": () => DIRECTORY });
  renderPage(<Directory />, "/directory?view=org");

  const foreman = await screen.findByRole("region", { name: "Foreman · Development Lead" });
  expect(within(foreman).getByText("Bolt")).toBeInTheDocument();
  expect(within(foreman).queryByText("Chrono")).not.toBeInTheDocument();
});

test("the status filter keeps only matching employees", async () => {
  fakeServer({ "GET /api/v1/directory": () => DIRECTORY });
  renderPage(<Directory />);

  await userEvent.click(await screen.findByRole("button", { name: "Status: All" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Active now" }));

  expect(await screen.findByRole("button", { name: "Status: Active now" })).toBeInTheDocument();
  expect(screen.getByText("Bolt")).toBeInTheDocument();
  expect(screen.queryByText("Chrono")).not.toBeInTheDocument();
});

test("Suggest a role sends it to become a proposal", async () => {
  const sent = fakeServer({
    "GET /api/v1/directory": () => DIRECTORY,
    "POST /api/v1/directory/role-suggestions": () => ({
      id: "LP-1",
      text: "New role: Gardener.",
      source: "Your suggestion",
      state: "open",
    }),
  });
  renderPage(<Directory />);

  await userEvent.click(await screen.findByRole("button", { name: "Suggest a role" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Role" }), "Gardener");
  await userEvent.click(screen.getByRole("button", { name: "Suggest it" }));

  expect(sent.find((r) => r.path === "/api/v1/directory/role-suggestions")?.body).toEqual({
    title: "Gardener",
    reason: "",
  });
  expect(
    await screen.findByText("Cadence will review it. It's under Proposals now."),
  ).toBeInTheDocument();
});
