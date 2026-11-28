"""The in-memory state every mock reads and writes.

In production each service owns its own store (spec 23): the gate owns `gate.db`, the engine owns
`tasks.db` and the personal databases. The mocks share one object instead, because the point of
the mocks is to show cross-service effects in Brain (stopping everything pauses the Live page,
turning on a paid feature changes Spend and Settings) without building the services.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from control_center.backends.mock.fixtures import (
    chat,
    gate,
    memory,
    ops,
    people,
    personal,
    settings,
    shell,
    work,
)
from control_center.backends.mock.fixtures import threads as thread_fixtures
from control_center.backends.mock.threads import ThreadRecord
from control_center.contract.gate import Approval, CriticalDecision, Setting
from control_center.contract.memory import MemoryItem
from control_center.contract.personal import AutomaticChange, Case, Contact, SetupStep
from control_center.contract.shell import TrashItem
from control_center.contract.status import Job, MaintenanceFix
from control_center.contract.today import Alert, ChatMessage
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
    threads: dict[str, ThreadRecord]
    work_items: list[WorkItem]
    employees: dict[str, Employee]
    proposals: dict[str, LifecycleProposal]
    cases: dict[str, Case]
    changes: dict[str, AutomaticChange]
    setup: dict[str, SetupStep]
    jobs: dict[str, Job]
    fixes: dict[str, MaintenanceFix]
    chats: dict[str, list[ChatMessage]]
    """Chat messages by conversation thread id: every branch, as a tree (`chat_tree.py`)."""
    chat_heads: dict[str, str]
    """The newest message of the branch on show in each conversation; the next turn follows it."""
    memories: dict[str, MemoryItem]
    """The Owner's saved notes (15.9.2), by id."""
    alerts: dict[str, Alert]
    trash: dict[str, TrashItem]
    sampled_at: datetime
    """When the simulated status aggregator last collected health and metrics."""
    stopped: bool = False
    maintenance_running: bool = True
    samples: int = 0
    """How many health samples the simulated aggregator has taken; the figures move with it."""
    step_up_challenges: set[str] = field(default_factory=set)
    step_up_proofs: dict[str, datetime] = field(default_factory=dict)
    memory_paused: bool = False
    memory_forgotten: dict[str, tuple[MemoryItem, datetime]] = field(default_factory=dict)
    """Items forgotten in the last ten minutes, with when their undo runs out (15.9.7)."""
    trashed: dict[str, Any] = field(default_factory=dict)
    """What each trash item held when it was deleted, by trash id, for its restorer to put back
    (`engine_shell.send_to_trash`). The fixtures' items hold nothing."""

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
        settings={setting.key: setting for setting in settings.settings(now)},
        contacts=by_id(gate.contacts()),
        tasks=by_id(work.live_tasks(now)),
        transcripts=work.transcripts(),
        threads=by_id(thread_fixtures.threads()),
        work_items=work.work_items(),
        employees=by_id(people.employees()),
        proposals=by_id(people.proposals()),
        cases=by_id(personal.cases()),
        changes=by_id(personal.recent_changes()),
        setup=by_id(personal.setup_steps()),
        jobs=by_id(ops.jobs()),
        fixes=by_id(ops.maintenance_batch()),
        chats={chat.ATLAS_THREAD: chat.atlas_history(now)},
        chat_heads={chat.ATLAS_THREAD: "M-2"},
        memories=by_id(memory.items(now)),
        alerts=by_id(shell.alerts(now)),
        trash=by_id(shell.trash(now)),
        sampled_at=now,
    )
