"""The in-memory state every mock reads and writes.

In production each service owns its own store (spec 23): the gate owns `gate.db`, the engine owns
`tasks.db` and the personal databases. The mocks share one object instead, because the point of
the mocks is to show cross-service effects in Brain (stopping everything pauses the Live page,
turning on a paid feature changes Spend and Settings) without building the services.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from control_center.backends.mock.fixtures import chat, gate, ops, personal, work
from control_center.contract.gate import Approval, CriticalDecision, Setting
from control_center.contract.personal import AutomaticChange, Case, Contact, SetupStep
from control_center.contract.status import Job, MaintenanceFix
from control_center.contract.today import ChatMessage
from control_center.contract.work import (
    Employee,
    LifecycleProposal,
    LiveTask,
    TranscriptEntry,
    WorkItem,
)
from control_center.events import EventBus

Clock = Callable[[], datetime]


def system_clock() -> datetime:
    """The current time in UTC."""
    return datetime.now(UTC)


@dataclass
class MockWorld:
    """Every piece of mutable mock state, keyed by id where the UI addresses objects by id."""

    bus: EventBus
    clock: Clock
    approvals: dict[str, Approval]
    decisions: dict[str, CriticalDecision]
    settings: dict[str, Setting]
    contacts: dict[str, Contact]
    tasks: dict[str, LiveTask]
    transcripts: dict[str, list[TranscriptEntry]]
    work_items: list[WorkItem]
    employees: dict[str, Employee]
    proposals: dict[str, LifecycleProposal]
    cases: dict[str, Case]
    changes: dict[str, AutomaticChange]
    setup: dict[str, SetupStep]
    jobs: dict[str, Job]
    fixes: dict[str, MaintenanceFix]
    chats: dict[str, list[ChatMessage]]
    sampled_at: datetime
    """When the simulated status aggregator last collected health and metrics."""
    stopped: bool = False
    maintenance_running: bool = True
    step_up_challenges: set[str] = field(default_factory=set)
    step_up_proofs: dict[str, datetime] = field(default_factory=dict)

    def setting(self, key: str) -> str:
        """The current value of a setting. Raises KeyError for an unknown key."""
        return self.settings[key].value

    def is_on(self, key: str) -> bool:
        """Whether a switch setting is on."""
        return self.setting(key) == "on"


class HasId(Protocol):
    """Anything with a string `id`; every fixture object the UI addresses by id."""

    @property
    def id(self) -> str:
        """The object's stable id."""
        ...


def by_id[T: HasId](items: list[T]) -> dict[str, T]:
    """Index fixture objects by their `id`, keeping fixture order."""
    return {item.id: item for item in items}


def build_world(bus: EventBus, clock: Clock = system_clock) -> MockWorld:
    """Build a fresh world from the fixtures, with times relative to `clock()`."""
    now = clock()
    return MockWorld(
        bus=bus,
        clock=clock,
        approvals=by_id(gate.approvals(now)),
        decisions=by_id(gate.decisions(now)),
        settings={setting.key: setting for setting in gate.settings(now)},
        contacts=by_id(gate.contacts()),
        tasks=by_id(work.live_tasks(now)),
        transcripts=work.transcripts(),
        work_items=work.work_items(),
        employees=by_id(work.employees()),
        proposals=by_id(work.proposals()),
        cases=by_id(personal.cases()),
        changes=by_id(personal.recent_changes()),
        setup=by_id(personal.setup_steps()),
        jobs=by_id(ops.jobs()),
        fixes=by_id(ops.maintenance_batch()),
        chats={"atlas": chat.atlas_history(now)},
        sampled_at=now,
    )
