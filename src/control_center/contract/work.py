"""Objects the pipeline engine owns: running tasks, transcripts, work items and the directory."""

from datetime import datetime
from typing import Literal

from control_center.contract.base import ContractModel
from control_center.contract.common import Department, EmployeeState, StatusLabel

Lane = Literal["personal", "development", "maintenance"]
"""Lanes of the activity field on Today and Live (spec 7.13)."""


class LiveTask(ContractModel):
    """A running or queued task on the Live page (spec 7.10).

    `tokens_per_second` is None while the employee is not generating. It changes several times a
    second, so it also arrives on its own through `task.progress` events.
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


class WorkBoard(ContractModel):
    """The Work page: items being built, ideas, and reviews waiting."""

    items: list[WorkItem]
    ideas: list[Idea]
    reviews: list[ReviewRequest]


class Employee(ContractModel):
    """An employee card and profile in the Directory (spec 7.11, 14.7)."""

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
