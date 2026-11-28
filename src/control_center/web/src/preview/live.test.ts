/**
 * @file The preview's timed behaviour, which the recorded parity session leaves out: the streamed
 * chat reply and the event stream the app reads.
 */
import { Bus, busEventSource, type BusEvent } from "./bus";
import { chatEdit, chatKeep, chatRegenerate, chatSend, chatStop, chatSwitch } from "./chat";
import { threads } from "./work";
import { healthMetrics } from "./status";
import { buildWorld } from "./world";

const NOW = new Date("2026-10-25T16:00:00Z");

describe("the preview's chat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("answers with the Owner's message, then streams the reply word by word", () => {
    const bus = new Bus();
    const world = buildWorld(bus, () => NOW);
    const events: BusEvent[] = [];
    bus.subscribe((event) => events.push(event));

    const thread = chatSend(world, "atlas", "Hello");
    vi.runAllTimers();

    expect(thread.messages.at(-2)).toMatchObject({ author: "owner", text: "Hello" });
    expect(thread.messages.at(-1)).toMatchObject({ author: "lead", text: "", streaming: true });
    const streamed = events.filter((e) => e.kind === "chat.message").map((e) => e.payload);
    const reply = world.fixtures.mock_reply.replaceAll("{name}", "Atlas");
    expect(streamed).toHaveLength(reply.split(" ").length + 1);
    expect(streamed.at(-2)).toMatchObject({ text: reply, streaming: true });
    expect(streamed.at(-1)).toMatchObject({ text: reply, streaming: false });
  });

  it("stops a reply where it is, keeping what it wrote", () => {
    const world = buildWorld(new Bus(), () => NOW);
    chatSend(world, "atlas", "Hello", "TH-0216");
    vi.advanceTimersByTime(world.constants.word_delay_seconds * 1000 * 3);

    const stopped = chatStop(world, { lead: "atlas", thread: "TH-0216" });

    expect(stopped.messages.at(-1)).toMatchObject({ stopped: true, streaming: false });
    expect(stopped.messages.at(-1)?.text.split(" ")).toHaveLength(3);
  });

  it("lists a temporary chat only in Chat, deletes it after a day, unless it is kept", () => {
    let now = NOW;
    const world = buildWorld(new Bus(), () => now);
    const listed = () => threads(world).open.map((t) => t.id);

    const gone = chatSend(world, "atlas", "Just between us", null, true).thread?.id ?? "";
    const kept = chatSend(world, "atlas", "Keep this one", null, true).thread?.id ?? "";
    expect(listed()).not.toContain(gone);
    expect(chatKeep(world, { lead: "atlas", thread: kept }).thread).toMatchObject({
      temporary_until: null,
      learning: false,
    });

    now = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(threads(world, true).open.map((t) => t.id)).not.toContain(gone);
    expect(world.chats[gone]).toBeUndefined();
    expect(listed()).toContain(kept);
  });

  it("keeps an edit and a regenerated reply as branches to switch between", () => {
    const world = buildWorld(new Bus(), () => NOW);
    const ids = { lead: "atlas", thread: "TH-0216" };

    const edited = chatEdit(world, ids, "M-1", "Just the passport");
    expect(edited.messages[0]).toMatchObject({ text: "Just the passport", branch: 2 });
    expect(edited.messages[0]?.sibling_ids[0]).toBe("M-1");

    const back = chatSwitch(world, ids, "M-1");
    expect(back.messages.map((m) => m.id)).toEqual(["M-1", "M-2"]);

    const again = chatRegenerate(world, ids, "M-2");
    expect(again.messages.at(-1)).toMatchObject({ parent_id: "M-1", branch: 2 });
  });

  it("starts a conversation thread for a new chat, titled from the first words", () => {
    const world = buildWorld(new Bus(), () => NOW);

    const sent = chatSend(world, "atlas", "Plan the week of the eighth for me please");

    expect(sent.thread).toMatchObject({
      kind: "conversation",
      title: "Plan the week of the eighth…",
    });
    expect(sent.threads.map((t) => t.id)).toContain(sent.thread?.id);
    expect(sent.messages.every((m) => m.thread_id === sent.thread?.id)).toBe(true);
  });
});

describe("the preview's event stream", () => {
  it("sends hello first, then live events with their ids", async () => {
    const bus = new Bus();
    const Source = busEventSource(bus, () => NOW);
    const source = new Source("/api/v1/events");
    const seen: [string, string][] = [];
    for (const kind of ["hello", "changed"]) {
      source.addEventListener(kind, (event) => seen.push([kind, event.lastEventId]));
    }
    await Promise.resolve();
    bus.changed("today");
    source.close();
    bus.changed("today");

    expect(seen).toEqual([
      ["hello", "0"],
      ["changed", "1"],
    ]);
  });
});

describe("the preview's health samples", () => {
  /** "Chat first token p95" after `samples` samples, as `tests/control_center/test_health_samples.py`. */
  const firstToken = (samples: number) => {
    const world = buildWorld(new Bus(), () => NOW);
    world.samples = samples;
    return healthMetrics(world).find((metric) => metric.name === "Chat first token p95");
  };

  it("reads the next value and rolls the sparkline on, as the server does", () => {
    expect(firstToken(0)).toMatchObject({ value: "1.4 s", spark: [12, 10, 13, 9, 11, 8, 9] });
    expect(firstToken(1)).toMatchObject({ value: "1.3 s", spark: [10, 13, 9, 11, 8, 9, 10] });
    expect(firstToken(9)).toMatchObject({ value: "1.2 s", spark: [9, 11, 13, 10, 10, 12, 9] });
  });
});
