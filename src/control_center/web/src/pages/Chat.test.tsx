/**
 * @file Chat shows each lead as a contact circle with their live state (spec 7.2, Chat), and each
 * lead's threads: picking one continues it, and New starts one with the first message (15.8.9).
 * Tests run in the phone layout, where the list and the conversation are two screens.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { ChatLead, ChatMessage, ChatThread, Thread } from "../api/types";
import { fakeServer, renderPage, type SentRequest } from "../test/render";
import Chat from "./Chat";

const ATLAS: ChatLead = {
  id: "atlas",
  name: "Atlas",
  title: "Chief of Staff",
  department: "personal",
  state: "generating",
  now: "Writing the brief",
};

const SPARK: ChatLead = {
  id: "spark",
  name: "Spark",
  title: "Ideation Lead",
  department: "ideation",
  state: "blocked",
  now: "",
};

const LEADS = [ATLAS, SPARK];

const PASSPORT: Thread = {
  id: "TH-0216",
  title: "Passport renewal",
  kind: "conversation",
  unit_id: null,
  lead_id: "atlas",
  lead_name: "Atlas",
  lead_department: "personal",
  pipeline: "Personal",
  principal: "owner",
  state: "needs_owner",
  detail: "Waiting on your approval",
  since: "today",
  closing_summary: null,
  approval_id: "AP-0110",
  branched_from: null,
  temporary_until: null,
  learning: true,
};

const message = (id: string, text: string, threadId: string): ChatMessage => ({
  id,
  lead_id: "atlas",
  thread_id: threadId,
  parent_id: null,
  author: "owner",
  text,
  at: "2026-10-25T16:00:00Z",
  note: null,
  approval_id: null,
  streaming: false,
  stopped: false,
  branch: 1,
  sibling_ids: [],
});

/** Answers like the server: the lead's threads, and the picked thread's messages. */
function chat(lead: ChatLead, threads: Thread[], messages: Record<string, ChatMessage[]> = {}) {
  return ({ query }: SentRequest): ChatThread => {
    const id = query.get("thread");
    return {
      lead,
      leads: LEADS,
      threads,
      thread: threads.find((t) => t.id === id) ?? null,
      messages: id ? (messages[id] ?? []) : [],
    };
  };
}

test("each lead is a contact circle with what they are doing", async () => {
  fakeServer({
    "GET /api/v1/chat/atlas": chat(ATLAS, [PASSPORT]),
    "GET /api/v1/chat/spark": chat(SPARK, []),
  });
  renderPage(<Chat />);

  const atlas = await screen.findByRole("button", { name: /Atlas/ });
  expect(atlas).toHaveAttribute("aria-pressed", "true");
  // With nothing to say, the circle falls back to the state in words.
  expect(screen.getByRole("button", { name: /Spark/ })).toHaveTextContent("blocked");

  await userEvent.click(screen.getByRole("button", { name: /Spark/ }));
  expect(await screen.findByRole("navigation", { name: "Chats with Spark" })).toHaveTextContent(
    "No chats with Spark yet.",
  );
});

test("picking a thread continues it, with a way back to the list", async () => {
  fakeServer({
    "GET /api/v1/chat/atlas": chat(ATLAS, [PASSPORT], {
      "TH-0216": [message("M-1", "Renew my passport", "TH-0216")],
    }),
  });
  renderPage(<Chat />);

  const row = await screen.findByRole("link", { name: /Passport renewal/ });
  expect(row).toHaveTextContent("Needs you");
  await userEvent.click(row);

  expect(await screen.findByText("Renew my passport")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("link", { name: "All chats with Atlas" }));
  expect(await screen.findByRole("navigation", { name: "Chats with Atlas" })).toBeInTheDocument();
});

test("New chat starts a thread with the first message and stays on it", async () => {
  const started = { ...PASSPORT, id: "TH-9A0B", title: "Book the dentist", state: "idle" as const };
  const threads: Thread[] = [PASSPORT];
  const messages: Record<string, ChatMessage[]> = {};
  const sent = fakeServer({
    "GET /api/v1/chat/atlas": chat(ATLAS, threads, messages),
    "POST /api/v1/chat/atlas": () => {
      threads.unshift(started);
      messages[started.id] = [message("M-2", "Book the dentist", started.id)];
      return chat(
        ATLAS,
        threads,
        messages,
      )({ query: new URLSearchParams("thread=TH-9A0B") } as SentRequest);
    },
  });
  renderPage(<Chat />);

  await userEvent.click(await screen.findByRole("link", { name: "New chat" }));
  await userEvent.type(await screen.findByLabelText("Message Atlas"), "Book the dentist");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(sent.find((r) => r.method === "POST")?.body).toEqual({
    text: "Book the dentist",
    thread_id: null,
    temporary: false,
  });
  const region = await screen.findByRole("region", { name: "Chat with Atlas" });
  await waitFor(() => expect(region).toHaveTextContent("Book the dentist"));
  expect(screen.getAllByText("Book the dentist").length).toBeGreaterThan(0);
});

test("a reply can be regenerated, its branches switched, and a reply being written stopped", async () => {
  const reply = { ...message("M-2", "First answer", "TH-0216"), author: "lead" as const };
  const second = { ...reply, id: "M-3", text: "Second answer", branch: 2 };
  const branches = { sibling_ids: ["M-2", "M-3"] };
  const writing = { ...reply, id: "M-4", text: "Still writ", streaming: true };
  const owner = message("M-1", "Renew my passport", "TH-0216");
  // The server keeps the conversation; each control changes it, and a refetch reads it back.
  let current: ChatMessage[] = [owner, reply];
  const answer = (messages?: ChatMessage[]) => () => {
    current = messages ?? current;
    return { lead: ATLAS, leads: LEADS, threads: [PASSPORT], thread: PASSPORT, messages: current };
  };
  const sent = fakeServer({
    "GET /api/v1/chat/atlas": answer(),
    "POST /api/v1/chat/atlas/TH-0216/messages/M-2/regenerate": answer([
      owner,
      { ...second, ...branches },
    ]),
    "POST /api/v1/chat/atlas/TH-0216/messages/M-2/switch": answer([owner, writing]),
    "POST /api/v1/chat/atlas/TH-0216/stop": answer([owner, { ...writing, streaming: false }]),
  });
  renderPage(<Chat />, "/chat?lead=atlas&thread=TH-0216");

  await userEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
  expect(await screen.findByText("Second answer")).toBeInTheDocument();
  expect(screen.getByText("2 / 2")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Previous branch" }));
  await userEvent.click(await screen.findByRole("button", { name: "Stop" }));

  const posted = sent.filter((r) => r.method === "POST").map((r) => r.path);
  expect(posted).toEqual([
    "/api/v1/chat/atlas/TH-0216/messages/M-2/regenerate",
    "/api/v1/chat/atlas/TH-0216/messages/M-2/switch",
    "/api/v1/chat/atlas/TH-0216/stop",
  ]);
});

test("a private chat is temporary until kept, and any chat can stop learning", async () => {
  const until = new Date(Date.now() + 24 * 3_600_000).toISOString();
  const secret = { ...PASSPORT, id: "TH-7C1D", title: "Gift idea", state: "idle" as const };
  let current: Thread = { ...secret, temporary_until: until, learning: false };
  const answer = (change?: Partial<Thread>) => () => {
    current = { ...current, ...change };
    const messages = [message("M-9", "Gift idea", current.id)];
    return { lead: ATLAS, leads: LEADS, threads: [current], thread: current, messages };
  };
  const sent = fakeServer({
    "GET /api/v1/chat/atlas": ({ query }: SentRequest) =>
      query.get("thread")
        ? answer()()
        : { lead: ATLAS, leads: LEADS, threads: [], thread: null, messages: [] },
    "POST /api/v1/chat/atlas": answer(),
    "POST /api/v1/chat/atlas/TH-7C1D/keep": answer({ temporary_until: null }),
    "PUT /api/v1/chat/atlas/TH-7C1D/learning": answer({ learning: true }),
  });
  renderPage(<Chat />, "/chat?lead=atlas&thread=new");

  await userEvent.click(await screen.findByRole("switch", { name: "Private" }));
  await userEvent.type(screen.getByLabelText("Message Atlas"), "Gift idea");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(sent.find((r) => r.method === "POST")?.body).toMatchObject({ temporary: true });

  expect(await screen.findByText(/Temporary chat · 24 h left/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Keep this chat" }));

  const learn = await screen.findByRole("switch", { name: "Learn from this chat" });
  expect(learn).toHaveAttribute("aria-checked", "false");
  await userEvent.click(learn);
  expect(sent.find((r) => r.method === "PUT")?.body).toEqual({ learning: true });
  expect(await screen.findByRole("switch", { name: "Learn from this chat" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
