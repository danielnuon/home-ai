"""The Today page, chat and search: views composed from several backends."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel
from control_center.contract.common import Department, EmployeeState, Metric, StatusLabel
from control_center.contract.gate import Approval, CriticalDecision
from control_center.contract.work import LiveTask, Thread


class AgendaItem(ContractModel):
    """One entry in today's agenda."""

    id: str
    time: str
    title: str
    meta: str


class TeamMember(ContractModel):
    """An employee on the "Team, right now" strip."""

    id: str
    name: str
    department: Department
    state: EmployeeState
    doing: str
    tokens_per_second: float | None


class Tile(ContractModel):
    """A subsystem tile on Today (spec 7.2): a value, a status, and the page it opens.

    `sampled_at` is when the status aggregator measured it; after 3 minutes the tile is stale.
    """

    name: str
    value: str
    status: StatusLabel
    href: str
    sampled_at: datetime


class SetupProgress(ContractModel):
    """The Setup tile, shown until every required step is done (spec 24.5)."""

    required_done: int
    required_total: int


AlertState = Literal["open", "acknowledged", "snoozed"]


class Alert(ContractModel):
    """An open alert on Today (spec 7.2): swipe right to acknowledge, left to snooze (7.14)."""

    id: str
    title: str
    detail: str
    status: StatusLabel
    href: str
    raised_at: datetime
    state: AlertState
    snoozed_until: datetime | None = None


class AlertAction(ContractModel):
    """Acknowledge or snooze an alert, or reopen it (the undo of either)."""

    action: Literal["acknowledge", "snooze", "reopen"]


class TodayOverview(ContractModel):
    """Everything on Today, in one request (spec 7.17: one data request per page).

    `needs_you_threads` are the threads waiting on an Owner decision that is not one of the
    approval cards in `needs_you`; `needs_you_count` counts both. Threads ready for review are
    counted apart and stay out of Needs you, because nothing waits on them (spec 15.8.9).
    """

    date: str
    greeting: str
    open_decision: CriticalDecision | None
    needs_you: list[Approval]
    needs_you_threads: list[Thread]
    needs_you_count: int
    blocked_threads: int
    review_ready_threads: int
    agenda: list[AgendaItem]
    team: list[TeamMember]
    tasks: list[LiveTask]
    tiles: list[Tile]
    metrics: list[Metric]
    setup: SetupProgress | None
    spend_label: str
    alerts: list[Alert]
    """Open alerts (spec 7.2): acknowledge or snooze each, with Undo."""


class ChatLead(ContractModel):
    """A lead the Owner can chat with (spec 7.8): Atlas, Spark, Foreman, Custodian, Wayfinder.

    `state` and `now` drive the contact circle at the top of Chat: the avatar's ring and the words
    under it (spec 7.2, Chat).
    """

    id: str
    name: str
    title: str
    department: Department
    state: EmployeeState = "idle"
    now: str = ""


class ChatMessage(ContractModel):
    """One message in web chat. `approval_id` puts an inline approval card under the message.

    `thread_id` is the conversation thread the message belongs to (spec 15.8.1). Messages form a
    tree (15.9.8): `parent_id` is the message this one follows, and an edit or a regenerated
    reply is a sibling that starts a new branch. `sibling_ids` lists every branch at this point,
    oldest first, when there is more than one, and `branch` is this one's place among them, from
    1. `stopped` marks a reply the Owner stopped before it finished.
    """

    id: str
    lead_id: str
    thread_id: str | None = None
    parent_id: str | None = None
    author: Literal["owner", "lead"]
    text: str
    at: datetime
    note: str | None = None
    approval_id: str | None = None
    streaming: bool = False
    stopped: bool = False
    branch: int = 1
    sibling_ids: list[str] = Field(default_factory=list)


class ChatThread(ContractModel):
    """Chat with one lead (spec 7.16, Chat; 15.8.9).

    `threads` is the lead's list: its open threads in state order, then the recently resolved.
    `thread` is the one open in the conversation, or None for a new chat that has no thread yet;
    `messages` are that thread's.
    """

    lead: ChatLead
    leads: list[ChatLead]
    threads: list[Thread] = Field(default_factory=list)
    thread: Thread | None = None
    messages: list[ChatMessage]


class ChatSend(ContractModel):
    """A message from the Owner. Without `thread_id` it starts a new conversation thread."""

    text: str
    thread_id: str | None = None


class ChatEdit(ContractModel):
    """A sent message, edited. The turn re-runs from it as a new branch (spec 15.9.8)."""

    text: str


class SearchResult(ContractModel):
    """One search hit, with the page that is its home (spec 7.16, rule 1)."""

    id: str
    title: str
    meta: str
    href: str


class SearchSection(ContractModel):
    """Search hits of one kind: cases, documents, contacts, employees or audit events."""

    name: str
    results: list[SearchResult]


class SearchResults(ContractModel):
    """Search results and, when the query is a question, Wayfinder's short answer."""

    query: str
    answer: str | None
    sections: list[SearchSection]
