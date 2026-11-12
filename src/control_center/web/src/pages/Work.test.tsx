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

const board = (open: ReturnType<typeof makeThread>[], resolved = [] as typeof open) => ({
  threads: { open, recently_resolved: resolved },
  items: [],
  ideas: [],
  reviews: [],
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
    "/chat?lead=foreman",
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
