/**
 * @file The preview's lead chat: each lead's threads, their message trees, the streamed reply and
 * the reply controls (stop, edit, regenerate, switch, branch). A port of `backends/mock/chat.py`
 * and `chat_tree.py` (spec 15.8.9, 15.9.8).
 */
import type { ChatLead, ChatMessage, ChatThread, Thread } from "../api/types";
import { conflict, notFound } from "./errors";
import { THREAD_PAGES, threads } from "./work";
import type { MockWorld } from "./world";

/** Replies being written, by thread: the message and the timers that write its words. */
const streams = new WeakMap<MockWorld, Map<string, { message: ChatMessage; timers: number[] }>>();

function streamsOf(world: MockWorld) {
  let found = streams.get(world);
  if (!found) streams.set(world, (found = new Map()));
  return found;
}

// The tree (`chat_tree.py`) ---------------------------------------------------------------------

const children = (messages: ChatMessage[], parent: string | null) =>
  messages.filter((m) => (m.parent_id ?? null) === parent);

function leaf(messages: ChatMessage[], id: string): string {
  const newest = children(messages, id).at(-1);
  return newest ? leaf(messages, newest.id) : id;
}

function path(messages: ChatMessage[], head: string | undefined): ChatMessage[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const shown: ChatMessage[] = [];
  for (let m = byId.get(head ?? ""); m; m = byId.get(m.parent_id ?? "")) shown.push(m);
  return shown.reverse();
}

function withBranches(messages: ChatMessage[], message: ChatMessage): ChatMessage {
  const siblings = children(messages, message.parent_id ?? null).map((m) => m.id);
  return {
    ...message,
    sibling_ids: siblings.length > 1 ? siblings : [],
    branch: siblings.indexOf(message.id) + 1,
  };
}

const shown = (messages: ChatMessage[], head: string | undefined) =>
  path(messages, head).map((m) => withBranches(messages, m));

// Leads and threads -----------------------------------------------------------------------------

function lead(world: MockWorld, id: string): ChatLead {
  const found = world.fixtures.chat_leads.find((item) => item.id === id);
  if (!found) throw notFound("Brain can chat only with the five leads.");
  return found;
}

function withStatus(world: MockWorld, item: ChatLead): ChatLead {
  const employee = Object.values(world.employees).find((e) => e.name === item.name);
  return employee ? { ...item, state: employee.state, now: employee.now } : item;
}

function titleFrom(world: MockWorld, text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const title = words.slice(0, world.constants.title_words).join(" ");
  return words.length > world.constants.title_words ? `${title}…` : title;
}

function leadThreads(world: MockWorld, leadId: string): Thread[] {
  const overview = threads(world, true);
  return [...overview.open, ...overview.recently_resolved].filter((t) => t.lead_id === leadId);
}

/** Chat with a lead: its threads, and the branch on show of the one picked (none for a new chat). */
export function chatThread(
  world: MockWorld,
  id: string,
  threadId: string | null = null,
): ChatThread {
  const item = withStatus(world, lead(world, id));
  const list = leadThreads(world, id);
  const picked = list.find((t) => t.id === threadId) ?? null;
  if (threadId !== null && picked === null) {
    throw notFound(`${item.name} has no thread ${threadId}.`);
  }
  return {
    lead: item,
    leads: world.fixtures.chat_leads.map((other) => withStatus(world, other)),
    threads: list,
    thread: picked,
    messages: shown(world.chats[threadId ?? ""] ?? [], world.chat_heads[threadId ?? ""]),
  };
}

interface NewThread {
  title: string;
  from?: string | null;
  temporary?: boolean;
}

function newThread(world: MockWorld, leadId: string, { title, from = null, temporary }: NewThread) {
  const known = world.fixtures.thread_leads[leadId];
  if (!known) throw notFound("Brain can chat only with the five leads.");
  const [name, department, pipeline] = known;
  const id = `TH-${world.ids(2).toUpperCase()}`;
  world.threads[id] = {
    id,
    title,
    kind: "conversation",
    unit_id: null,
    lead_id: leadId,
    lead_name: name,
    lead_department: department,
    pipeline,
    principal: "owner",
    since: "today",
    owner_decision: null,
    approval_id: null,
    proposed_resolution: null,
    waiting_for: null,
    outcome: null,
    branched_from: from,
    temporary_until: temporary ? retainUntil(world) : null,
    learning: !temporary,
    paused: false,
    archived: false,
  };
  world.bus.changed(...THREAD_PAGES);
  return id;
}

function retainUntil(world: MockWorld): string {
  const hours = world.constants.temporary_retain_hours;
  return new Date(world.clock().getTime() + hours * 3_600_000).toISOString();
}

function shownMessage(world: MockWorld, leadId: string, threadId: string, messageId: string) {
  const found = chatThread(world, leadId, threadId).messages.find((m) => m.id === messageId);
  if (!found) throw notFound("That message isn't on the branch you're looking at.");
  return found;
}

// Messages and the streamed reply ---------------------------------------------------------------

function blank(world: MockWorld, leadId: string, threadId: string, parent: string | null) {
  return {
    id: `M-${world.ids(4)}`,
    lead_id: leadId,
    thread_id: threadId,
    parent_id: parent,
    text: "",
    at: world.clock().toISOString(),
    note: null,
    approval_id: null,
    streaming: false,
    stopped: false,
    branch: 1,
    sibling_ids: [],
  };
}

function addOwnerMessage(
  world: MockWorld,
  ids: { lead: string; thread: string },
  text: string,
  parent: string | null,
): string {
  const message: ChatMessage = {
    ...blank(world, ids.lead, ids.thread, parent),
    author: "owner",
    text,
  };
  (world.chats[ids.thread] ??= []).push(message);
  world.chat_heads[ids.thread] = message.id;
  return message.id;
}

function publish(world: MockWorld, message: ChatMessage): void {
  const tree = world.chats[message.thread_id ?? ""] ?? [];
  world.bus.publish("chat.message", withBranches(tree, message));
}

/** Stops the reply streaming in a thread, if any; says whether one was stopped. */
function halt(world: MockWorld, threadId: string): boolean {
  const stream = streamsOf(world).get(threadId);
  if (!stream) return false;
  streamsOf(world).delete(threadId);
  stream.timers.forEach((timer) => clearTimeout(timer));
  stream.message.streaming = false;
  stream.message.stopped = true;
  publish(world, stream.message);
  return true;
}

function startReply(
  world: MockWorld,
  ids: { lead: string; thread: string },
  parent: string,
  template: string,
): void {
  const message: ChatMessage = {
    ...blank(world, ids.lead, ids.thread, parent),
    author: "lead",
    note: "Mock chat · nothing sent anywhere",
    streaming: true,
  };
  (world.chats[ids.thread] ??= []).push(message);
  world.chat_heads[ids.thread] = message.id;
  const words = template.replaceAll("{name}", lead(world, ids.lead).name).split(" ");
  const delay = world.constants.word_delay_seconds * 1000;
  const timers = words.map((word, index) =>
    window.setTimeout(
      () => {
        message.text = `${message.text} ${word}`.trim();
        publish(world, message);
        if (index < words.length - 1) return;
        message.streaming = false;
        streamsOf(world).delete(ids.thread);
        publish(world, message);
      },
      delay * (index + 1),
    ),
  );
  streamsOf(world).set(ids.thread, { message, timers });
}

// The endpoints ---------------------------------------------------------------------------------

/** Stores the Owner's message at the end of the branch on show, and starts the reply. */
export function chatSend(
  world: MockWorld,
  id: string,
  text: string,
  threadId: string | null = null,
  temporary = false,
): ChatThread {
  lead(world, id);
  if (threadId === null)
    threadId = newThread(world, id, { title: titleFrom(world, text), temporary });
  else chatThread(world, id, threadId);
  halt(world, threadId);
  const ids = { lead: id, thread: threadId };
  const owner = addOwnerMessage(world, ids, text, world.chat_heads[threadId] ?? null);
  startReply(world, ids, owner, world.fixtures.mock_reply);
  return chatThread(world, id, threadId);
}

/** Re-runs the turn from an edited Owner message, as a new branch beside the original. */
export function chatEdit(
  world: MockWorld,
  ids: { lead: string; thread: string },
  messageId: string,
  text: string,
): ChatThread {
  const original = shownMessage(world, ids.lead, ids.thread, messageId);
  if (original.author !== "owner") {
    throw conflict("Only your own messages can be edited. Regenerate a reply instead.");
  }
  if (!text.trim()) throw conflict("Write the new message first.");
  halt(world, ids.thread);
  const owner = addOwnerMessage(world, ids, text.trim(), original.parent_id ?? null);
  startReply(world, ids, owner, world.fixtures.mock_reply);
  return chatThread(world, ids.lead, ids.thread);
}

/** Writes a lead's reply again, as a new branch beside the one it replaces. */
export function chatRegenerate(
  world: MockWorld,
  ids: { lead: string; thread: string },
  messageId: string,
): ChatThread {
  const reply = shownMessage(world, ids.lead, ids.thread, messageId);
  if (reply.author !== "lead" || !reply.parent_id) {
    throw conflict("Only a lead's reply can be regenerated. Edit your message instead.");
  }
  halt(world, ids.thread);
  startReply(world, ids, reply.parent_id, world.fixtures.mock_retry);
  return chatThread(world, ids.lead, ids.thread);
}

/** Shows the branch that runs through a message, down to its newest message. */
export function chatSwitch(
  world: MockWorld,
  ids: { lead: string; thread: string },
  messageId: string,
): ChatThread {
  chatThread(world, ids.lead, ids.thread);
  const messages = world.chats[ids.thread] ?? [];
  if (!messages.some((m) => m.id === messageId)) {
    throw notFound("That message isn't in this conversation.");
  }
  world.chat_heads[ids.thread] = leaf(messages, messageId);
  return chatThread(world, ids.lead, ids.thread);
}

/** Starts a new conversation thread from the branch on show, up to a message; it links back. */
export function chatBranch(
  world: MockWorld,
  ids: { lead: string; thread: string },
  messageId: string,
): ChatThread {
  shownMessage(world, ids.lead, ids.thread, messageId);
  const title = `${world.threads[ids.thread]?.title ?? "Chat"} (branch)`;
  const created = newThread(world, ids.lead, { title, from: ids.thread });
  const upto = path(world.chats[ids.thread] ?? [], messageId);
  const renamed = new Map(upto.map((m) => [m.id, `M-${world.ids(4)}`]));
  const copy = (id: string | null) => renamed.get(id ?? "") ?? null;
  world.chats[created] = upto.map((m) => ({
    ...m,
    id: copy(m.id) ?? m.id,
    thread_id: created,
    parent_id: copy(m.parent_id ?? null),
  }));
  world.chat_heads[created] = copy(messageId) ?? messageId;
  return chatThread(world, ids.lead, created);
}

/** "Keep this chat": a temporary chat becomes a normal thread; learning stays off (15.9.6). */
export function chatKeep(world: MockWorld, ids: { lead: string; thread: string }): ChatThread {
  chatThread(world, ids.lead, ids.thread);
  const record = world.threads[ids.thread];
  if (!record || record.temporary_until === null) throw conflict("This chat is already kept.");
  record.temporary_until = null;
  world.bus.changed(...THREAD_PAGES);
  return chatThread(world, ids.lead, ids.thread);
}

/** Turns "Don't learn from this chat" off or on; a temporary chat never learns (15.9.6). */
export function chatLearning(
  world: MockWorld,
  ids: { lead: string; thread: string },
  learning: boolean,
): ChatThread {
  chatThread(world, ids.lead, ids.thread);
  const record = world.threads[ids.thread];
  if (!record) throw notFound("That thread doesn't exist.");
  if (record.temporary_until !== null) {
    throw conflict("A temporary chat never learns. Keep it first.");
  }
  record.learning = learning;
  world.bus.changed(...THREAD_PAGES);
  return chatThread(world, ids.lead, ids.thread);
}

/** Ends the reply being written at once, keeping what it wrote so far. */
export function chatStop(world: MockWorld, ids: { lead: string; thread: string }): ChatThread {
  chatThread(world, ids.lead, ids.thread);
  if (!halt(world, ids.thread)) throw conflict("Nothing is being written right now.");
  return chatThread(world, ids.lead, ids.thread);
}
