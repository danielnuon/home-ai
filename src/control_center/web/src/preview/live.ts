/**
 * @file The preview's lead chat and simulated activity: the streamed chat reply, drifting token
 * rates, Bolt's growing transcript line and the periodic health sample. A port of
 * `backends/mock/chat.py` and `activity.py`.
 */
import type { ChatLead, ChatMessage, ChatThread, Thread } from "../api/types";
import { notFound } from "./errors";
import { THREAD_PAGES, threads } from "./work";
import type { MockWorld } from "./world";

function lead(world: MockWorld, id: string): ChatLead {
  const found = world.fixtures.chat_leads.find((item) => item.id === id);
  if (!found) throw notFound("Brain can chat only with the five leads.");
  return found;
}

function withStatus(world: MockWorld, item: ChatLead): ChatLead {
  const employee = Object.values(world.employees).find((e) => e.name === item.name);
  return employee ? { ...item, state: employee.state, now: employee.now } : item;
}

/** A new conversation's title: its first few words, with an ellipsis when cut. */
function titleFrom(world: MockWorld, text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const title = words.slice(0, world.constants.title_words).join(" ");
  return words.length > world.constants.title_words ? `${title}…` : title;
}

function leadThreads(world: MockWorld, leadId: string): Thread[] {
  const overview = threads(world);
  return [...overview.open, ...overview.recently_resolved].filter((t) => t.lead_id === leadId);
}

/** Chat with a lead: its threads, and the messages of the one picked (none for a new chat). */
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
    messages: threadId === null ? [] : (world.chats[threadId] ?? []),
  };
}

function newThread(world: MockWorld, leadId: string, text: string): string {
  const known = world.fixtures.thread_leads[leadId];
  if (!known) throw notFound("Brain can chat only with the five leads.");
  const [name, department, pipeline] = known;
  const id = `TH-${world.ids(2).toUpperCase()}`;
  world.threads[id] = {
    id,
    title: titleFrom(world, text),
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
  };
  world.bus.changed(...THREAD_PAGES);
  return id;
}

function streamReply(world: MockWorld, leadId: string, threadId: string, reply: string): void {
  const message: ChatMessage = {
    id: `M-${world.ids(4)}`,
    lead_id: leadId,
    thread_id: threadId,
    author: "lead",
    text: "",
    at: world.clock().toISOString(),
    note: "Mock chat · nothing sent anywhere",
    approval_id: null,
    streaming: true,
  };
  (world.chats[threadId] ??= []).push(message);
  const words = reply.split(" ");
  const delay = world.constants.word_delay_seconds * 1000;
  words.forEach((word, index) => {
    setTimeout(
      () => {
        message.text = `${message.text} ${word}`.trim();
        world.bus.publish("chat.message", { ...message });
        if (index < words.length - 1) return;
        message.streaming = false;
        world.bus.publish("chat.message", { ...message });
      },
      delay * (index + 1),
    );
  });
}

/** Stores the Owner's message, in a new thread if none is given, and starts the reply. */
export function chatSend(
  world: MockWorld,
  id: string,
  text: string,
  threadId: string | null = null,
): ChatThread {
  const item = lead(world, id);
  if (threadId === null) threadId = newThread(world, id, text);
  else chatThread(world, id, threadId);
  const target = threadId;
  (world.chats[target] ??= []).push({
    id: `M-${world.ids(4)}`,
    lead_id: id,
    thread_id: target,
    author: "owner",
    text,
    at: world.clock().toISOString(),
    note: null,
    approval_id: null,
    streaming: false,
  });
  const thread = structuredClone(chatThread(world, id, target));
  setTimeout(() =>
    streamReply(world, id, target, world.fixtures.mock_reply.replaceAll("{name}", item.name)),
  );
  return thread;
}

function driftTokenRates(world: MockWorld): void {
  const [low, high] = world.constants.rate_bounds;
  for (const task of Object.values(world.tasks)) {
    if (task.paused || task.tokens_per_second === null) continue;
    const drifted = task.tokens_per_second + (Math.random() * 6 - 3);
    task.tokens_per_second = Math.round(Math.min(high, Math.max(low, drifted)) * 10) / 10;
    world.bus.publish("task.progress", {
      task_id: task.id,
      tokens_per_second: task.tokens_per_second,
      state: task.state,
    });
  }
}

function growTranscript(world: MockWorld, step: number): void {
  const taskId = "T-5521";
  const task = world.tasks[taskId];
  const generating = [...(world.transcripts[taskId] ?? [])]
    .reverse()
    .find((entry) => entry.kind === "generating");
  if (!task || task.paused || !generating) return;
  const words = world.constants.streamed_code.split(" ");
  const position = step % words.length;
  if (position === 0) {
    generating.text = "";
    world.bus.changed("live");
  }
  const word = words[position] ?? "";
  generating.text = `${generating.text} ${word}`.trim();
  world.bus.publish("transcript.append", {
    task_id: taskId,
    entry_id: generating.id,
    text_delta: ` ${word}`,
  });
}

/** Runs the activity loop until the returned function is called. */
export function simulateActivity(world: MockWorld): () => void {
  const c = world.constants;
  let tick = 0;
  const timer = setInterval(() => {
    tick += 1;
    if (tick % c.sample_every_ticks === 0) {
      world.sampledAt = world.clock();
      world.samples += 1;
      world.bus.changed("today", "system", "security");
    }
    if (world.stopped) return;
    driftTokenRates(world);
    if (tick % c.transcript_every_ticks === 0) {
      growTranscript(world, Math.floor(tick / c.transcript_every_ticks));
    }
  }, c.tick_seconds * 1000);
  return () => clearInterval(timer);
}
