"""Event replay after a reconnect (spec 7.13)."""

import asyncio
import contextlib

from control_center.events import EventBus
from control_center.routes.session import _frames


def test_replay_returns_only_newer_events() -> None:
    """Spec 7.13: a reconnecting client gets only the events after the last id it saw."""
    bus = EventBus()
    bus.changed("approvals")
    second = bus.changed("today")

    replayed = bus.replay_after(1)

    assert [event.id for event in replayed] == [second.id]


def test_a_client_older_than_the_buffer_is_told_to_refetch_everything() -> None:
    """Spec 7.13: a client that missed more than the buffer holds refetches everything."""
    bus = EventBus(buffer_size=2)
    for _ in range(5):
        bus.changed("live")

    replayed = bus.replay_after(1)

    assert len(replayed) == 1
    assert replayed[0].payload == {"resources": ["*"]}


def test_sse_frame_format() -> None:
    """Spec 7.13: events go out as standard server-sent-event frames with an id for replay."""
    event = EventBus().changed("today")

    assert event.to_sse() == 'id: 1\nevent: changed\ndata: {"resources": ["today"]}\n\n'


async def test_subscribers_get_the_replay_then_live_events() -> None:
    """Spec 7.13: a new stream replays missed events, then carries live ones."""
    bus = EventBus()
    bus.changed("missed")
    stream = bus.subscribe(last_seen=0)

    first = await anext(stream)
    bus.changed("live")
    second = await asyncio.wait_for(anext(stream), timeout=1)
    await stream.aclose()

    assert first.payload == {"resources": ["missed"]}
    assert second.payload == {"resources": ["live"]}


async def test_a_closed_stream_releases_its_subscriber() -> None:
    """Spec 7.13: a client that disconnects stops receiving events and leaves nothing behind."""
    bus = EventBus()
    frames = _frames(bus, start=0)
    assert await anext(frames) == "retry: 2000\n\n"
    assert (await anext(frames)).startswith("id: 0\nevent: hello\n")
    reading = asyncio.ensure_future(anext(frames))
    await asyncio.sleep(0)

    reading.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await reading
    await frames.aclose()

    assert bus.subscriber_count == 0


async def test_a_client_ahead_of_a_restarted_bus_still_gets_live_events() -> None:
    """Spec 7.13: after a restart, a client whose last id is from before it refetches and resumes.

    The bus is in memory, so its ids begin again; a client that saw id 5000 must not wait for the
    new ids to pass 5000 before it hears anything.
    """
    bus = EventBus()
    bus.changed("today")
    stream = bus.subscribe(last_seen=5000)

    refetch = await anext(stream)
    bus.changed("approvals")
    live = await asyncio.wait_for(anext(stream), timeout=1)
    await stream.aclose()

    assert refetch.payload == {"resources": ["*"]}
    assert live.payload == {"resources": ["approvals"]}


async def test_the_stream_opens_with_where_the_client_stands_and_the_server_time() -> None:
    """Spec 7.13: the first frame gives a resume id even before any event, plus the clock."""
    bus = EventBus()
    bus.changed("today")
    bus.changed("live")
    frames = _frames(bus, start=bus.last_id)

    await anext(frames)
    hello = await anext(frames)
    await frames.aclose()

    assert hello.startswith('id: 2\nevent: hello\ndata: {"now": ')
