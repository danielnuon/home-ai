/**
 * @file The preview's timed behaviour, which the recorded parity session leaves out: the streamed
 * chat reply and the event stream the app reads.
 */
import { Bus, busEventSource, type BusEvent } from "./bus";
import { chatSend } from "./live";
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

    expect(thread.messages.at(-1)).toMatchObject({ author: "owner", text: "Hello" });
    const streamed = events.filter((e) => e.kind === "chat.message").map((e) => e.payload);
    const reply = world.fixtures.mock_reply.replaceAll("{name}", "Atlas");
    expect(streamed).toHaveLength(reply.split(" ").length + 1);
    expect(streamed.at(-2)).toMatchObject({ text: reply, streaming: true });
    expect(streamed.at(-1)).toMatchObject({ text: reply, streaming: false });
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
