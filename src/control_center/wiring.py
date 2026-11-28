"""Which implementation of each backend Brain uses. The only place that names the mocks."""

from control_center.backends.mock.chat import MockLeadChat
from control_center.backends.mock.engine import MockPipelineEngine
from control_center.backends.mock.gate import MockApprovalGate
from control_center.backends.mock.memory import MockMemory
from control_center.backends.mock.status import MockStatusAggregator
from control_center.backends.mock.world import MockWorld, build_world
from control_center.backends.protocols import Backends
from control_center.events import EventBus


def build_mock_backends() -> tuple[Backends, MockWorld]:
    """Build the mocks over one fresh world. The world is returned for the activity loop."""
    bus = EventBus()
    world = build_world(bus)
    backends = Backends(
        gate=MockApprovalGate(world),
        engine=MockPipelineEngine(world),
        status=MockStatusAggregator(world),
        chat=MockLeadChat(world),
        memory=MockMemory(world),
        bus=bus,
    )
    return backends, world
