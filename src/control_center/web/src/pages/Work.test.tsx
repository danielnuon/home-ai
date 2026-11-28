/**
 * @file Work opens on threads grouped by state, and a thread's state decides what it offers
 * (spec 15.8.9, 15.8.10).
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeThread } from "../test/factories";
import { fakeServer, renderPage } from "../test/render";
import Work from "./Work";

const board = (
  open: ReturnType<typeof makeThread>[],
  resolved = [] as typeof open,
  archived = [] as typeof open,
  extra: Record<string, unknown> = {},
) => ({
  threads: { open, recently_resolved: resolved, archived },
  items: [],
  ideas: [],
  reviews: [],
  products: [],
  wip: { in_progress: 0, limit: 3 },
  leads: [
    { id: "foreman", name: "Foreman", department: "governance", pipeline: "Development" },
    { id: "atlas", name: "Atlas", department: "personal", pipeline: "Personal" },
  ],
  ...extra,
});

const idea = (overrides: Record<string, unknown> = {}) => ({
  id: "ID-1",
  title: "Garden planner",
  state: "Exploring",
  lead: "Spark",
  summary: "Water from the forecast.",
  priority: "normal",
  paused: false,
  withdrawn: false,
  thread_id: "TH-9",
  ...overrides,
});

test("threads are the default view, grouped under their state", async () => {
  fakeServer({
    "GET /api/v1/work": () =>
      board([
        makeThread({ id: "TH-1", title: "Calendar digest", state: "blocked" }),
        makeThread({ id: "TH-2", title: "Lease Reminders 1.2", state: "working" }),
      ]),
  });
  renderPage(<Work />);

  const blocked = await screen.findByRole("region", { name: "Blocked" });
  expect(within(blocked).getByText("Calendar digest")).toBeInTheDocument();
  const working = screen.getByRole("region", { name: "Working" });
  expect(within(working).getByText("Lease Reminders 1.2")).toBeInTheDocument();
});

test("looks good resolves a thread that is ready for review", async () => {
  const ready = makeThread({ state: "review_ready", detail: "Booked for Saturday." });
  const sent = fakeServer({
    "GET /api/v1/work": () => board([ready]),
    "POST /api/v1/threads/TH-1/resolve": () => ({ ...ready, state: "resolved" }),
  });
  renderPage(<Work />);

  await userEvent.click(await screen.findByRole("button", { name: "Looks good" }));

  expect(sent.some((r) => r.path === "/api/v1/threads/TH-1/resolve")).toBe(true);
  expect(await screen.findByText("Resolved: Lease Reminders 1.2")).toBeInTheDocument();
});

test("a thread that needs the Owner offers the decision, never Resolve", async () => {
  fakeServer({
    "GET /api/v1/work": () =>
      board([makeThread({ state: "needs_owner", detail: "Foreman needs a yes on the design." })]),
  });
  renderPage(<Work />);

  expect(await screen.findByRole("link", { name: "Answer Foreman" })).toHaveAttribute(
    "href",
    "/chat?lead=foreman&thread=TH-1",
  );
  expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
});

test("a resolved thread can be reopened", async () => {
  const resolved = makeThread({ state: "resolved", detail: "Released." });
  const sent = fakeServer({
    "GET /api/v1/work": () => board([], [resolved]),
    "POST /api/v1/threads/TH-1/reopen": () => ({ ...resolved, state: "idle" }),
  });
  renderPage(<Work />);

  await userEvent.click(await screen.findByRole("button", { name: "Reopen" }));

  expect(sent.some((r) => r.path === "/api/v1/threads/TH-1/reopen")).toBe(true);
});

test("the lead filter shows each lead's face in its live state, and All shows them together", async () => {
  fakeServer({
    "GET /api/v1/work": () =>
      board([
        makeThread({ id: "TH-1" }),
        makeThread({ id: "TH-2", lead_name: "Atlas", lead_department: "personal" }),
      ]),
    "GET /api/v1/directory": () => ({
      employees: [{ name: "Atlas", department: "personal", state: "generating" }],
      proposals: [],
      instruments: 0,
    }),
  });
  renderPage(<Work />);

  const filter = await screen.findByRole("group", { name: "Lead" });
  const all = within(filter).getByRole("button", { name: /All leads/ });
  expect(within(all).getAllByRole("img")).toHaveLength(2);
  expect(await within(filter).findAllByRole("img", { name: "Atlas, writing" })).toHaveLength(2);
  expect(within(all).getByRole("img", { name: "Foreman, idle" })).toBeInTheDocument();
});

test("pipeline and state filters narrow the threads, and Archived shows archived ones", async () => {
  fakeServer({
    "GET /api/v1/work": () =>
      board(
        [
          makeThread({ id: "TH-1", title: "Lease Reminders 1.2", state: "working" }),
          makeThread({
            id: "TH-2",
            title: "Book the oil change",
            state: "idle",
            pipeline: "Personal",
            lead_name: "Atlas",
          }),
        ],
        [],
        [makeThread({ id: "TH-3", title: "Water heater claim", state: "resolved" })],
      ),
  });
  renderPage(<Work />);

  await userEvent.click(await screen.findByRole("button", { name: "Pipeline: All" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Personal" }));
  expect(await screen.findByRole("button", { name: "Pipeline: Personal" })).toBeInTheDocument();
  expect(screen.queryByText("Lease Reminders 1.2")).not.toBeInTheDocument();
  expect(screen.getByText("Book the oil change")).toBeInTheDocument();
  expect(screen.queryByText("Water heater claim")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Pipeline: Personal" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "All" }));
  await userEvent.click(screen.getByRole("button", { name: "Archived" }));
  const archived = await screen.findByRole("region", { name: "Archived" });
  expect(within(archived).getByText("Water heater claim")).toBeInTheDocument();
});

test("a thread's menu moves it to another lead, with Undo", async () => {
  const thread = makeThread({ state: "working" });
  const sent = fakeServer({
    "GET /api/v1/work": () => board([thread]),
    "POST /api/v1/threads/TH-1/move": () => ({ ...thread, lead_id: "atlas", lead_name: "Atlas" }),
  });
  renderPage(<Work />);

  await userEvent.click(
    await screen.findByRole("button", { name: `More actions for ${thread.title}` }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Move to Atlas" }));

  expect(sent.find((r) => r.path === "/api/v1/threads/TH-1/move")?.body).toEqual({
    lead_id: "atlas",
  });
  expect(await screen.findByText(`Moved to Atlas: ${thread.title}`)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
});

test("Submit an idea sends the title and description", async () => {
  const sent = fakeServer({
    "GET /api/v1/work": () => board([]),
    "POST /api/v1/ideas": () => idea({ title: "Pantry tracker", state: "Captured" }),
  });
  renderPage(<Work />, "/work?view=boards");

  await userEvent.click(await screen.findByRole("button", { name: "Submit an idea" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Pantry tracker");
  await userEvent.click(screen.getByRole("button", { name: "Submit the idea" }));

  expect(sent.find((r) => r.path === "/api/v1/ideas")?.body).toEqual({
    title: "Pantry tracker",
    summary: "",
  });
  expect(await screen.findByText("Spark has your idea: Pantry tracker")).toBeInTheDocument();
});

test("an idea's menu withdraws it, with Undo", async () => {
  const sent = fakeServer({
    "GET /api/v1/work": () => board([], [], [], { ideas: [idea()] }),
    "POST /api/v1/ideas/ID-1/withdraw": () => idea({ withdrawn: true }),
  });
  renderPage(<Work />, "/work?view=boards");

  await userEvent.click(
    await screen.findByRole("button", { name: "More actions for Garden planner" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Withdraw" }));

  expect(sent.some((r) => r.path === "/api/v1/ideas/ID-1/withdraw")).toBe(true);
  expect(await screen.findByText("Withdrawn: Garden planner")).toBeInTheDocument();
});
