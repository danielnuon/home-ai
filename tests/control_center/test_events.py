"""Event replay after a reconnect (spec 7.13)."""

import asyncio

from control_center.events import EventBus


def test_replay_returns_only_newer_events() -> None:
    bus = EventBus()
    bus.changed("approvals")
    second = bus.changed("today")

    replayed = bus.replay_after(1)

    assert [event.id for event in replayed] == [second.id]


def test_a_client_older_than_the_buffer_is_told_to_refetch_everything() -> None:
    bus = EventBus(buffer_size=2)
    for _ in range(5):
        bus.changed("live")

    replayed = bus.replay_after(1)

    assert len(replayed) == 1
    assert replayed[0].payload == {"resources": ["*"]}


def test_sse_frame_format() -> None:
    event = EventBus().changed("today")

    assert event.to_sse() == 'id: 1\nevent: changed\ndata: {"resources": ["today"]}\n\n'


async def test_subscribers_get_the_replay_then_live_events() -> None:
    bus = EventBus()
    bus.changed("missed")
    stream = bus.subscribe(last_seen=0)

    first = await anext(stream)
    bus.changed("live")
    second = await asyncio.wait_for(anext(stream), timeout=1)
    await stream.aclose()

    assert first.payload == {"resources": ["missed"]}
    assert second.payload == {"resources": ["live"]}
