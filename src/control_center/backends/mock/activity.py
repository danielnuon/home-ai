"""Simulated agent activity, so the mock platform looks and streams like a working one.

Every 30 seconds the status aggregator "samples", so tiles stay fresh. Every tick, each generating
task's token rate drifts a little and is published as a `task.progress` event; every few ticks,
Bolt's open transcript line grows by a few words. This is what lets the activity field, the
counters and the transcript view be built and checked before any model runs (spec 7.13: "feel the
team work").
"""

import asyncio
import random

from control_center.backends.mock.world import MockWorld

TICK_SECONDS = 0.5
"""Two progress updates a second: under the 4-per-second coalescing limit of spec 7.17."""

TRANSCRIPT_EVERY_TICKS = 3
"""Append transcript text every 1.5 seconds."""

SAMPLE_EVERY_TICKS = 60
"""Collect health and metrics every 30 seconds, well inside the 3-minute stale limit (spec 7.3)."""

RATE_BOUNDS = (12.0, 60.0)
"""Plausible tokens per second for the local models on this hardware (spec 8.1)."""

STREAMED_CODE = (
    "def reminder_dates(lease_end: date) -> list[date]: return [lease_end - "
    "timedelta(days=offset) for offset in REMINDER_OFFSETS_DAYS]"
)
"""The line Bolt "writes", word by word, looped forever."""


async def simulate_activity(world: MockWorld, rng: random.Random | None = None) -> None:
    """Run until cancelled, publishing progress and transcript events into `world.bus`."""
    rng = rng or random.Random()
    tick = 0
    while True:
        await asyncio.sleep(TICK_SECONDS)
        tick += 1
        if tick % SAMPLE_EVERY_TICKS == 0:
            _sample(world)
        if world.stopped:
            continue
        _drift_token_rates(world, rng)
        if tick % TRANSCRIPT_EVERY_TICKS == 0:
            _grow_transcript(world, tick // TRANSCRIPT_EVERY_TICKS)


def _sample(world: MockWorld) -> None:
    """Take a fresh health sample, as the aggregator does even while the platform is stopped."""
    world.sampled_at = world.clock()
    world.bus.changed("today", "system", "security")


def _drift_token_rates(world: MockWorld, rng: random.Random) -> None:
    low, high = RATE_BOUNDS
    for task in world.tasks.values():
        if task.paused or task.tokens_per_second is None:
            continue
        drifted = task.tokens_per_second + rng.uniform(-3.0, 3.0)
        task.tokens_per_second = round(min(high, max(low, drifted)), 1)
        world.bus.publish(
            "task.progress",
            {"task_id": task.id, "tokens_per_second": task.tokens_per_second, "state": task.state},
        )


def _grow_transcript(world: MockWorld, step: int) -> None:
    task_id = "T-5521"
    task = world.tasks.get(task_id)
    entries = world.transcripts.get(task_id, [])
    generating = next((e for e in reversed(entries) if e.kind == "generating"), None)
    if task is None or task.paused or generating is None:
        return
    words = STREAMED_CODE.split(" ")
    position = step % len(words)
    if position == 0:
        # Start the loop again from an empty line rather than growing the transcript forever.
        generating.text = ""
        world.bus.changed("live")
    word = words[position]
    generating.text = f"{generating.text} {word}".strip()
    world.bus.publish(
        "transcript.append",
        {"task_id": task_id, "entry_id": generating.id, "text_delta": f" {word}"},
    )
