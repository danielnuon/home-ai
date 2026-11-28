/**
 * @file A work item's page shows its history, gates and diff, and pauses it with Undo
 * (spec 7.2, Work; 7.10).
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { GuideProvider } from "../shell/Guide";
import { fakeServer, renderPage } from "../test/render";
import WorkItemPage from "./WorkItem";

const ITEM = {
  id: "WI-0031",
  title: "Lease Reminders 1.2",
  risk: "R2",
  status: { status: "in_progress", label: "Build · D4 implement" },
  stages: [{ code: "D4", state: "current" }],
  progress: 0.4,
  employee_name: "Bolt",
  department: "engineering",
  employee_state: "generating",
  now: "Bolt is writing the reminder schedule",
  eta: "About 2–4 h left",
  cost_usd: 0,
  waiting_on_owner: false,
  priority: "normal",
  paused: false,
  rework_count: 1,
  product_id: "PR-lease",
  thread_id: "TH-0131",
  kind: "build",
};

const DETAIL = {
  item: ITEM,
  product: null,
  history: [{ code: "D4", text: "Bolt is implementing the reminder schedule", when: "today" }],
  gates: [{ code: "G3", name: "Design", state: "passed", note: "" }],
  review: null,
  diff: [
    {
      path: "src/reminders/schedule.py",
      added: 1,
      removed: 1,
      lines: [
        { kind: "remove", text: "REMINDER_DAYS = 30" },
        { kind: "add", text: "REMINDER_DAYS = (30, 14, 3)" },
      ],
    },
  ],
  transcripts: [],
};

const page = () => (
  <GuideProvider>
    <Routes>
      <Route path="/work/items/:id" element={<WorkItemPage />} />
    </Routes>
  </GuideProvider>
);

test("the page shows the stage history, the gates and the diff, marked without colour too", async () => {
  fakeServer({ "GET /api/v1/work-items/WI-0031": () => DETAIL });
  renderPage(page(), "/work/items/WI-0031");

  expect(await screen.findByRole("heading", { name: "Lease Reminders 1.2" })).toBeInTheDocument();
  expect(screen.getByText("Bolt is implementing the reminder schedule")).toBeInTheDocument();
  const gates = screen.getByRole("region", { name: "Gates" });
  expect(within(gates).getByText("Passed")).toBeInTheDocument();
  const diff = screen.getByLabelText("Changes to src/reminders/schedule.py");
  expect(within(diff).getByText("Added:", { exact: false })).toBeInTheDocument();
  expect(within(diff).getByText("Removed:", { exact: false })).toBeInTheDocument();
});

test("Pause pauses the item and offers Undo", async () => {
  const sent = fakeServer({
    "GET /api/v1/work-items/WI-0031": () => DETAIL,
    "PUT /api/v1/work-items/WI-0031/paused": () => ({ ...ITEM, paused: true }),
  });
  renderPage(page(), "/work/items/WI-0031");

  await userEvent.click(await screen.findByRole("button", { name: "Pause" }));

  expect(sent.find((r) => r.path === "/api/v1/work-items/WI-0031/paused")?.body).toEqual({
    paused: true,
  });
  expect(await screen.findByText("Paused: Lease Reminders 1.2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
});
