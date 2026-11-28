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


Priority = Literal["high", "normal", "low"]
"""A work item's or an idea's place in its pipeline's queue (spec 7.2, Work)."""


class WorkItem(ContractModel):
    """A work item's status card, rendered the same way everywhere (spec 7.10, "Status cards").

    `paused` is the Owner's pause (7.10): its sessions hold at their next step boundary and its
    status reads Paused. `rework_count` counts rework cycles so far (17.10). `product_id` names
    the product whose repository the item changes (17.19), and `thread_id` the thread it runs in.
    A `retirement` item is the one that ends a product's life (17.21).
    """

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
    priority: Priority = "normal"
    paused: bool = False
    rework_count: int = 0
    product_id: str | None = None
    thread_id: str | None = None
    kind: Literal["build", "retirement"] = "build"


class Idea(ContractModel):
    """An idea on the ideas board (spec 16.2).

    `state` is its Pipeline A state in words. `summary` is the Owner's own description, which
    the Owner can edit until the idea is withdrawn. A withdrawn idea stays on the board, marked,
    so it can be reopened (Undo). `thread_id` is the idea's thread with the Ideation Lead.
    """

    id: str
    title: str
    state: str
    lead: str
    summary: str = ""
    priority: Priority = "normal"
    paused: bool = False
    withdrawn: bool = False
    thread_id: str | None = None


class IdeaDraft(ContractModel):
    """A new idea, or an edit to one: its title and the Owner's description (spec 16.1)."""

    title: str
    summary: str = ""


class PausedChange(ContractModel):
    """Pause or resume an idea or a work item: an Owner command (spec 7.10, 15.8.10)."""

    paused: bool


class PriorityChange(ContractModel):
    """Move an idea or work item up or down its pipeline's queue."""

    priority: Priority


class PullRequest(ContractModel):
    """An open pull request on a product's GitHub mirror, one per work item (spec 17.19)."""

    number: int
    title: str
    url: str
    item_id: str | None


class Product(ContractModel):
    """A product the development pipeline built: its repository and its mirror (spec 17.19).

    `wip` counts its work items in D4 to D7 against `wip_limit` (17.10). Only a `released`
    product can be retired; asking opens its retirement work item (17.21).
    """

    id: str
    name: str
    state: Literal["building", "released", "retiring"]
    repo_path: str
    github_url: str | None
    pull_requests: list[PullRequest]
    wip: int
    wip_limit: int


class WipCount(ContractModel):
    """Work items in D4 to D7 across every product, against the global limit (spec 17.10)."""

    in_progress: int
    limit: int


class StageEvent(ContractModel):
    """One entry in a work item's stage history: a stage entered, a gate passed or a rework."""

    code: str
    text: str
    when: str


class GateCheck(ContractModel):
    """One gate on a work item's path, G1 to G8 (spec 17.3), and where it stands."""

    code: str
    name: str
    state: Literal["passed", "waiting", "todo"]
    note: str


class DiffLine(ContractModel):
    """One line of a diff: added, removed, or unchanged context."""

    kind: Literal["add", "remove", "context"]
    text: str


class DiffFile(ContractModel):
    """One changed file in a review request's diff (spec 7.2, the review diff viewer)."""

    path: str
    added: int
    removed: int
    lines: list[DiffLine]


class TranscriptLog(ContractModel):
    """One session's transcript on a work item, with who ran it."""

    task_id: str
    employee_name: str
    department: Department
    doing: str
    entries: list[TranscriptEntry]


class WorkItemDetail(ContractModel):
    """A work item's detail page: stage history, gates, diffs and transcripts (spec 7.2)."""

    item: WorkItem
    product: Product | None
    history: list[StageEvent]
    gates: list[GateCheck]
    review: "ReviewRequest | None"
    diff: list[DiffFile]
    transcripts: list[TranscriptLog]


class ReviewRequest(ContractModel):
    """A review request waiting for review (spec 17.7), with the readability result of 17.18."""

    id: str
    title: str
    added_lines: int
    removed_lines: int
    reviewer: str
    readability: str
    item_id: str | None = None


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
    second row for the same decision. `lead_id` is the lead's id in Chat. `branched_from` names
    the conversation a thread was branched from in Chat (spec 15.9.8). `temporary_until` is set on
    a temporary chat: when its transcript is deleted (15.9.6). `learning` is off when the Owner
    said "Don't learn from this chat".
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
    branched_from: str | None = None
    temporary_until: datetime | None = None
    learning: bool = True


class ThreadMove(ContractModel):
    """Move a misrouted thread to another lead: an Owner command, one tap with Undo (15.8.5)."""

    lead_id: str


class ThreadsOverview(ContractModel):
    """The Threads view: open threads in state order, then the recently resolved.

    `archived` holds resolved threads past their archive delay. The view hides them unless the
    Owner turns on the Archived filter (spec 15.8.9).
    """

    open: list[Thread]
    recently_resolved: list[Thread]
    archived: list[Thread]


class WorkBoard(ContractModel):
    """The Work page: threads first, then items being built, ideas, reviews and products."""

    threads: ThreadsOverview
    items: list[WorkItem]
    ideas: list[Idea]
    reviews: list[ReviewRequest]
    products: list[Product]
    wip: WipCount


EmployeeStatus = Literal[
    "active_now", "waiting_on_owner", "blocked", "paused", "idle", "not_yet_hired", "disabled"
]
"""An employee's status, rolled up by the engine from its open sessions (spec 15.8.9)."""


class Employee(ContractModel):
    """An employee card and profile in the Directory (spec 7.11, 14.7).

    `state` drives the avatar; `status` is the roll-up of the employee's sessions shown in words.
    `pipeline` is the pipeline the employee works in, for the Directory's filter and team view;
    `reports_to` is its lead's id, for the org view, and is None for a lead (spec 7.11).
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
    pipeline: str = ""
    reports_to: str | None = None


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


class RoleSuggestion(ContractModel):
    """The Owner's suggestion for a new role. It becomes a lifecycle proposal (spec 7.2)."""

    title: str
    reason: str = ""


class ProposalDecision(ContractModel):
    """The Owner's answer to a lifecycle proposal."""

    decision: Literal["approve", "decline"]


class EmployeeToggle(ContractModel):
    """Enable or disable an employee. Disabling tightens; enabling loosens (spec 7.9)."""

    enabled: bool
