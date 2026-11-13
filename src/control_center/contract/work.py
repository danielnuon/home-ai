"""Objects the pipeline engine owns: running tasks, transcripts, work items and the directory."""

from datetime import datetime
from typing import Literal

from pydantic import computed_field

from control_center.contract.base import ContractModel
from control_center.contract.common import Department, EmployeeState, Principal, StatusLabel

Lane = Literal["personal", "development", "maintenance"]
"""Lanes of the activity field on Today and Live (spec 7.13)."""


SessionState = Literal["queued", "running", "waiting", "paused", "blocked"]
"""The states of an open session that Live shows (spec 15.8.2).

`idle`, `hibernated` and `ended` sessions hold no model slot and wait for nothing, so they are
not on Live.
"""

WaitingOn = Literal["owner", "gate", "agent", "resource", "third_party", "time"]
"""The named, expected event a waiting session cannot continue without (spec 15.8.2)."""

BlockedCode = Literal[
    "rework_limit",
    "budget",
    "rounds",
    "stalled",
    "dependency",
    "policy_denied",
    "resource_lost",
    "failed",
]
"""Why a session cannot continue until someone decides (spec 15.8.4)."""


class LiveTask(ContractModel):
    """One session on the Live page: a lead's or a sub-agent's (spec 7.10, 15.8.2).

    `tokens_per_second` is None while the employee is not generating. It changes several times a
    second, so it also arrives on its own through `task.progress` events.

    `thread_id` and `thread_title` name the thread the session works on. They are None for
    scheduled work such as the daily brief, which belongs to its job's run, not to a thread
    (15.8.1). `lead_name` is the thread's lead; a session whose employee is someone else is a
    sub-agent's and is shown nested under that lead (15.8.9).
    """

    id: str
    employee_id: str
    employee_name: str
    department: Department
    state: EmployeeState
    doing: str
    item: str
    model: str
    lane: Lane
    started_at: datetime | None
    tokens_per_second: float | None
    queued: bool
    paused: bool = False
    waiting_on: WaitingOn | None = None
    blocked_code: BlockedCode | None = None
    thread_id: str | None = None
    thread_title: str | None = None
    lead_name: str | None = None

    # mypy does not yet accept a decorator stacked on @property; Pydantic documents this pattern.
    @computed_field  # type: ignore[prop-decorator]
    @property
    def session_state(self) -> SessionState:
        """The session's state, from the recorded facts. The first that applies wins.

        Paused comes first because the Owner's pause and the kill switch hold a session whatever
        else is true of it; blocked comes before waiting because it needs someone.
        """
        if self.paused:
            return "paused"
        if self.blocked_code is not None:
            return "blocked"
        if self.waiting_on is not None:
            return "waiting"
        return "queued" if self.queued else "running"


TranscriptKind = Literal["message", "tool", "owner_note", "generating"]


class TranscriptEntry(ContractModel):
    """One line of a live transcript. Tool calls are chips that tick when done (spec 7.13)."""

    id: str
    kind: TranscriptKind
    text: str
    done: bool = True


class TaskDetail(ContractModel):
    """A task with its stage rail and transcript, for the Live page's detail view."""

    task: LiveTask
    stage_rail: list["Stage"]
    transcript: list[TranscriptEntry]


InterventionKind = Literal["note", "pause", "resume", "redirect", "stop"]


class Intervention(ContractModel):
    """The Owner stepping into running work (spec 7.10). A note steers; it never approves."""

    kind: InterventionKind
    text: str | None = None


class Stage(ContractModel):
    """One stop on a stage rail: D0–D10 for work items (spec 17.3)."""

    code: str
    state: Literal["done", "current", "todo"]


class WorkItem(ContractModel):
    """A work item's status card, rendered the same way everywhere (spec 7.10, "Status cards")."""

    id: str
    title: str
    risk: Literal["R0", "R1", "R2"]
    status: StatusLabel
    stages: list[Stage]
    progress: float
    employee_name: str
    department: Department
    employee_state: EmployeeState
    now: str
    eta: str
    cost_usd: float
    waiting_on_owner: bool


class Idea(ContractModel):
    """An idea on the ideas board (spec 16.2)."""

    id: str
    title: str
    state: str
    lead: str


class ReviewRequest(ContractModel):
    """A review request waiting for review (spec 17.7), with the readability result of 17.18."""

    id: str
    title: str
    added_lines: int
    removed_lines: int
    reviewer: str
    readability: str


ThreadKind = Literal[
    "conversation", "case", "idea", "work_item", "support", "incident", "maintenance_batch"
]
"""What a thread is about (spec 15.8.1)."""

ThreadState = Literal[
    "blocked", "needs_owner", "paused", "working", "review_ready", "waiting", "idle", "resolved"
]
"""A thread's derived state, in the order the Threads view groups them (spec 15.8.3).

`archived` is the ninth state in the spec. Archived threads are hidden from boards and found by
search, so no view receives one and the contract leaves it out until a view does.
"""


class Thread(ContractModel):
    """One piece of Owner-visible work, from first message to resolution (spec 15.8.1).

    `state` is derived by the engine from the thread's sessions, its pending decisions and its
    unit; nothing sets it directly. `detail` is the line the state is shown with: who is doing
    what, what it waits on, or why it is blocked and who can unblock it. `approval_id` is set when
    the Owner decision it waits for is an approval card, which Brain then shows instead of a
    second row for the same decision. `lead_id` is the lead's id in Chat.
    """

    id: str
    title: str
    kind: ThreadKind
    unit_id: str | None
    lead_id: str
    lead_name: str
    lead_department: Department
    pipeline: str
    principal: Principal
    state: ThreadState
    detail: str
    since: str
    closing_summary: str | None = None
    approval_id: str | None = None


class ThreadsOverview(ContractModel):
    """The Threads view: open threads in state order, then the recently resolved."""

    open: list[Thread]
    recently_resolved: list[Thread]


class WorkBoard(ContractModel):
    """The Work page: threads first, then items being built, ideas, and reviews waiting."""

    threads: ThreadsOverview
    items: list[WorkItem]
    ideas: list[Idea]
    reviews: list[ReviewRequest]


EmployeeStatus = Literal[
    "active_now", "waiting_on_owner", "blocked", "paused", "idle", "not_yet_hired", "disabled"
]
"""An employee's status, rolled up by the engine from its open sessions (spec 15.8.9)."""


class Employee(ContractModel):
    """An employee card and profile in the Directory (spec 7.11, 14.7).

    `state` drives the avatar; `status` is the roll-up of the employee's sessions shown in words.
    """

    id: str
    name: str
    title: str
    department: Department
    group: str
    state: EmployeeState
    now: str
    tagline: str
    mission: str
    tools: list[str]
    model: str
    hired: str
    tasks_done: int
    enabled: bool
    status: EmployeeStatus = "idle"


class LifecycleProposal(ContractModel):
    """A proposal from Cadence to hire, retire, merge or re-prompt an employee (spec 14.7)."""

    id: str
    text: str
    source: str
    state: Literal["open", "approved", "declined"]


class Directory(ContractModel):
    """Everything on the Directory page."""

    employees: list[Employee]
    proposals: list[LifecycleProposal]
    instruments: int


class ProposalDecision(ContractModel):
    """The Owner's answer to a lifecycle proposal."""

    decision: Literal["approve", "decline"]


class EmployeeToggle(ContractModel):
    """Enable or disable an employee. Disabling tightens; enabling loosens (spec 7.9)."""

    enabled: bool
