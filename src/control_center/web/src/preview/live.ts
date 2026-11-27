/**
 * @file The preview's lead chat and simulated activity: the streamed chat reply, drifting token
 * rates, Bolt's growing transcript line and the periodic health sample. A port of
 * `backends/mock/chat.py` and `activity.py`.
 */
import type { ChatLead, ChatMessage, ChatThread } from "../api/types";
import { notFound } from "./errors";
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

/** A lead's history. */
export function chatThread(world: MockWorld, id: string): ChatThread {
  return {
    lead: withStatus(world, lead(world, id)),
    leads: world.fixtures.chat_leads.map((item) => withStatus(world, item)),
    messages: (world.chats[id] ??= []),
  };
}

function streamReply(world: MockWorld, leadId: string, reply: string): void {
  const message: ChatMessage = {
    id: `M-${world.ids(4)}`,
    lead_id: leadId,
    author: "lead",
    text: "",
    at: world.clock().toISOString(),
    note: "Mock chat · nothing sent anywhere",
    approval_id: null,
    streaming: true,
  };
  (world.chats[leadId] ??= []).push(message);
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

/** Stores the Owner's message and starts streaming the reply. */
export function chatSend(world: MockWorld, id: string, text: string): ChatThread {
  const item = lead(world, id);
  (world.chats[id] ??= []).push({
    id: `M-${world.ids(4)}`,
    lead_id: id,
    author: "owner",
    text,
    at: world.clock().toISOString(),
    note: null,
    approval_id: null,
    streaming: false,
  });
  const thread = structuredClone(chatThread(world, id));
  setTimeout(() =>
    streamReply(world, id, world.fixtures.mock_reply.replaceAll("{name}", item.name)),
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
