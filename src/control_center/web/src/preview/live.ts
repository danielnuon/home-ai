/**
 * @file The preview's simulated activity: drifting token rates, Bolt's growing transcript line and
 * the periodic health sample. A port of `backends/mock/activity.py`.
 */
import type { MockWorld } from "./world";

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
    // Under memory pressure Brain stops streaming transcripts (spec 7.17, "Degradation").
    if (tick % c.transcript_every_ticks === 0 && world.ops.pressure === "normal") {
      growTranscript(world, Math.floor(tick / c.transcript_every_ticks));
    }
  }, c.tick_seconds * 1000);
  return () => clearInterval(timer);
}
