"""The live event stream that keeps every open Brain session current (spec 7.13).

Backends publish an event for every state change. Brain fans them out to each open session over
one server-sent-event stream. A client that reconnects passes the last id it saw and gets every
newer event replayed from a fixed-size buffer, so a phone that slept for a minute catches up
instead of reloading.

Four event kinds carry data, chosen so the client store stays small:

- ``changed``: names the resources whose data changed; the client refetches those.
- ``task.progress``: a running task's state and token rate, several times a second, patched in
  place because refetching that often would break the 10 KB/s stream budget (spec 7.13).
- ``transcript.append``: either a new transcript entry (``entry``) or more text for an open one
  (``entry_id`` and ``text_delta``).
- ``chat.message``: the whole of a chat message as it streams; the client replaces it by id.

A fifth, ``hello``, is never published: the stream sends it first to tell the client where it
stands (its id) and the server's clock (``now``), so a client that has seen no event yet can
still resume, and stale tiles are judged on the server's time rather than the device's.
"""

import asyncio
import json
from collections import deque
from collections.abc import AsyncGenerator
from dataclasses import dataclass

from pydantic import JsonValue

REPLAY_BUFFER_SIZE = 1000
"""Events kept for replay. At the mock's rate (a few per second) this covers several minutes."""


@dataclass(frozen=True)
class Event:
    """One published event. `id` increases by one per event and is never reused."""

    id: int
    kind: str
    payload: dict[str, JsonValue]

    def to_sse(self) -> str:
        """Format the event as one server-sent-event frame."""
        return f"id: {self.id}\nevent: {self.kind}\ndata: {json.dumps(self.payload)}\n\n"


class EventBus:
    """In-process publish and subscribe with replay.

    Not thread-safe: publish from the event loop that serves the stream. Production replaces the
    publishers (gate, pipeline engine, watchdog) but keeps this fan-out inside Brain.
    """

    def __init__(self, buffer_size: int = REPLAY_BUFFER_SIZE) -> None:
        """Create an empty bus that keeps the last `buffer_size` events for replay."""
        self._buffer: deque[Event] = deque(maxlen=buffer_size)
        self._next_id = 1
        self._subscribers: set[asyncio.Queue[Event]] = set()

    @property
    def last_id(self) -> int:
        """The id of the newest event, or 0 when nothing has been published."""
        return self._next_id - 1

    @property
    def subscriber_count(self) -> int:
        """How many streams are open; each holds a queue until its client goes away."""
        return len(self._subscribers)

    def publish(self, kind: str, payload: dict[str, JsonValue]) -> Event:
        """Record an event and hand it to every subscriber.

        Args:
            kind: The event kind, one of those in the module docstring.
            payload: JSON-serializable data. Never content from a restricted domain beyond what
                the page itself would show, and never a secret.

        Returns:
            The published event, with its id.
        """
        event = Event(id=self._next_id, kind=kind, payload=payload)
        self._next_id += 1
        self._buffer.append(event)
        for queue in self._subscribers:
            queue.put_nowait(event)
        return event

    def changed(self, *resources: str) -> Event:
        """Publish a ``changed`` event telling clients to refetch the named resources."""
        return self.publish("changed", {"resources": list(resources)})

    def replay_after(self, last_seen: int) -> list[Event]:
        """Return buffered events newer than `last_seen`, oldest first.

        If `last_seen` is older than the buffer, the client has missed events that are gone; it
        gets a ``changed`` event for every resource instead (``resources: ["*"]``) so it refetches
        everything rather than showing a silently stale page. The same happens when `last_seen`
        is newer than any event here, which means Brain restarted and its ids began again.
        """
        if self._has_gap(last_seen):
            return [Event(id=self.last_id, kind="changed", payload={"resources": ["*"]})]
        return [event for event in self._buffer if event.id > last_seen]

    def resume_point(self, last_seen: int) -> int:
        """The id a client that last saw `last_seen` continues from once its replay is sent."""
        return self.last_id if self._has_gap(last_seen) else last_seen

    def _has_gap(self, last_seen: int) -> bool:
        """Whether events between `last_seen` and now can no longer be replayed one by one."""
        evicted = bool(self._buffer) and last_seen < self._buffer[0].id - 1
        return evicted or last_seen > self.last_id

    async def subscribe(self, last_seen: int) -> AsyncGenerator[Event]:
        """Yield replayed events, then live ones, until the caller stops iterating."""
        queue: asyncio.Queue[Event] = asyncio.Queue()
        # Register before replaying so an event published during the replay is not lost.
        self._subscribers.add(queue)
        try:
            replayed = self.replay_after(last_seen)
            newest = self.resume_point(last_seen)
            for event in replayed:
                newest = max(newest, event.id)
                yield event
            while True:
                event = await queue.get()
                if event.id > newest:
                    yield event
        finally:
            self._subscribers.discard(queue)
