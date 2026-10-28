"""The Today page, chat and search: views composed from several backends."""

from datetime import datetime
from typing import Literal

from control_center.contract.base import ContractModel
from control_center.contract.common import Department, EmployeeState, Metric, StatusLabel
from control_center.contract.gate import Approval, CriticalDecision
from control_center.contract.work import LiveTask


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
    """A subsystem tile on Today (spec 7.2): a value, a status, and the page it opens."""

    name: str
    value: str
    status: StatusLabel
    href: str


class SetupProgress(ContractModel):
    """The Setup tile, shown until every required step is done (spec 24.5)."""

    required_done: int
    required_total: int


class TodayOverview(ContractModel):
    """Everything on Today, in one request (spec 7.17: one data request per page)."""

    date: str
    greeting: str
    open_decision: CriticalDecision | None
    needs_you: list[Approval]
    needs_you_count: int
    agenda: list[AgendaItem]
    team: list[TeamMember]
    tasks: list[LiveTask]
    tiles: list[Tile]
    metrics: list[Metric]
    setup: SetupProgress | None
    spend_label: str


class ChatLead(ContractModel):
    """A lead the Owner can chat with (spec 7.8): Atlas, Spark, Foreman, Custodian, Wayfinder."""

    id: str
    name: str
    title: str
    department: Department


class ChatMessage(ContractModel):
    """One message in web chat. `approval_id` puts an inline approval card under the message."""

    id: str
    lead_id: str
    author: Literal["owner", "lead"]
    text: str
    at: datetime
    note: str | None = None
    approval_id: str | None = None
    streaming: bool = False


class ChatThread(ContractModel):
    """A lead's chat history."""

    lead: ChatLead
    leads: list[ChatLead]
    messages: list[ChatMessage]


class ChatSend(ContractModel):
    """A message from the Owner."""

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
