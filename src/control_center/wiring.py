"""Which implementation of each backend Brain uses. The only place that names the mocks."""

from dataclasses import dataclass

from control_center.backends.mock.chat import MockChatRelay
from control_center.backends.mock.engine import MockPipelineEngine
from control_center.backends.mock.gate import MockApprovalGate
from control_center.backends.mock.status import MockStatusAggregator
from control_center.backends.mock.world import MockWorld, build_world
from control_center.backends.protocols import (
    ApprovalGate,
    ChatRelay,
    PipelineEngine,
    StatusAggregator,
)
from control_center.events import EventBus


@dataclass(frozen=True)
class Backends:
    """The services every route can reach, plus the event bus they publish to."""

    gate: ApprovalGate
    engine: PipelineEngine
    status: StatusAggregator
    chat: ChatRelay
    bus: EventBus


def build_mock_backends() -> tuple[Backends, MockWorld]:
    """Build the four mocks over one fresh world. The world is returned for the activity loop."""
    bus = EventBus()
    world = build_world(bus)
    backends = Backends(
        gate=MockApprovalGate(world),
        engine=MockPipelineEngine(world),
        status=MockStatusAggregator(world),
        chat=MockChatRelay(world),
        bus=bus,
    )
    return backends, world
