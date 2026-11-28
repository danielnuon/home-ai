/**
 * @file The Memory tab of Chat (spec 15.9.7): saved notes by scope with Pin, Edit and Forget (with
 * Undo), proposals to confirm, "don't bring this up" and Pause memory; and in a conversation, the
 * notes a reply used and Remember on the Owner's messages (15.9.3).
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { ChatThread, MemoryItem, MemoryNote, MemoryOverview } from "../api/types";
import { fakeServer, renderPage } from "../test/render";
import { makeThread } from "../test/factories";
import Chat from "./Chat";

const NOW = new Date().toISOString();

const note = (overrides: Partial<MemoryItem>): MemoryItem => ({
  id: "MEM-1",
  text: "Call me Danny.",
  kind: "note",
  scope: "owner",
  scope_label: "Everyone",
  lead_id: null,
  principal: "owner",
  status: "active",
  how: "said",
  pinned: false,
  source_thread_id: null,
  source_thread_title: null,
  source_lead_id: null,
  source: null,
  saved_at: NOW,
  last_used: null,
  use_count: 0,
  superseded_by: null,
  ...overrides,
});

test("the Memory tab pins, forgets with Undo, confirms and adds a topic to avoid", async () => {
  let items = [
    note({ id: "MEM-1" }),
    note({ id: "MEM-3", text: "The car is serviced at Midtown Auto.", scope: "domain" }),
    note({
      id: "MEM-7",
      text: "I prefer an aisle seat.",
      status: "proposed",
      source: "from an email",
    }),
  ];
  const view = (): MemoryOverview => ({ items, paused: false, pinned_max: 10, forgotten: [] });
  const change = (next: typeof items) => () => {
    items = next;
    return view();
  };
  const sent = fakeServer({
    "GET /api/v1/memory": view,
    "PUT /api/v1/memory/MEM-1": () =>
      change(items.map((i) => (i.id === "MEM-1" ? { ...i, pinned: true } : i)))(),
    "POST /api/v1/memory/MEM-3/forget": () => change(items.filter((i) => i.id !== "MEM-3"))(),
    "POST /api/v1/memory/MEM-3/restore": view,
    "POST /api/v1/memory/MEM-7/confirm": () =>
      change(items.map((i) => (i.id === "MEM-7" ? { ...i, status: "active" as const } : i)))(),
    "POST /api/v1/memory": () =>
      change([note({ id: "MEM-x", text: "The old gym.", kind: "avoid" }), ...items])(),
  });
  renderPage(<Chat />, "/chat?view=memory");

  const saved = await screen.findByRole("region", { name: "Saved notes" });
  const danny = within(saved).getByText("Call me Danny.").closest("li") as HTMLElement;
  await userEvent.click(within(danny).getByRole("button", { name: "Pin" }));
  expect(await within(saved).findByText("Pinned")).toBeInTheDocument();

  const car = within(saved)
    .getByText(/Midtown Auto/)
    .closest("li") as HTMLElement;
  await userEvent.click(within(car).getByRole("button", { name: "Forget" }));
  await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
  expect(sent.some((r) => r.path === "/api/v1/memory/MEM-3/restore")).toBe(true);

  const confirm = screen.getByRole("region", { name: "To confirm" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Save it" }));
  expect(await within(saved).findByText("I prefer an aisle seat.")).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("Don't bring this up"), "The old gym");
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(sent.find((r) => r.method === "POST" && r.path === "/api/v1/memory")?.body).toEqual({
    text: "The old gym",
    kind: "avoid",
  });
  expect(await within(saved).findByText("Don't bring up")).toBeInTheDocument();
});

test("a reply lists the memory it used, and Remember saves one of your messages", async () => {
  const thread = makeThread({ id: "TH-0216", lead_id: "atlas", kind: "conversation" });
  const atlas = {
    id: "atlas",
    name: "Atlas",
    title: "Chief of Staff",
    department: "personal" as const,
    state: "idle" as const,
    now: "",
  };
  const base = {
    lead_id: "atlas",
    thread_id: "TH-0216",
    at: NOW,
    note: null,
    approval_id: null,
    streaming: false,
    stopped: false,
    branch: 1,
    sibling_ids: [],
    memory_notes: [] as MemoryNote[],
    memory_used: [] as { id: string; text: string }[],
  };
  const owner = {
    ...base,
    id: "M-1",
    parent_id: null,
    author: "owner" as const,
    text: "Book the dentist",
  };
  const reply = {
    ...base,
    id: "M-2",
    parent_id: "M-1",
    author: "lead" as const,
    text: "Booked for a morning.",
    memory_used: [{ id: "MEM-2", text: "I prefer morning appointments." }],
  };
  let messages = [owner, reply];
  const answer = (): ChatThread => ({
    lead: atlas,
    leads: [atlas],
    threads: [thread],
    thread,
    messages,
  });
  const sent = fakeServer({
    "GET /api/v1/chat/atlas": answer,
    "POST /api/v1/chat/atlas/TH-0216/messages/M-1/remember": () => {
      const saved = { outcome: "saved" as const, item_id: "MEM-9", text: "Book the dentist." };
      messages = [{ ...owner, memory_notes: [saved] }, reply];
      return answer();
    },
  });
  renderPage(<Chat />, "/chat?lead=atlas&thread=TH-0216");

  await userEvent.click(await screen.findByRole("button", { name: "Used memory · 1" }));
  expect(screen.getByRole("link", { name: "I prefer morning appointments." })).toHaveAttribute(
    "href",
    "/chat?view=memory&item=MEM-2",
  );

  await userEvent.click(screen.getByRole("button", { name: "Remember" }));
  expect(await screen.findByText("Saved to memory: Book the dentist.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remember" })).not.toBeInTheDocument();
  expect(sent.some((r) => r.path.endsWith("/M-1/remember"))).toBe(true);
});
