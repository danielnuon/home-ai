"""Personal records, finance sources and Setup's in-step forms (spec 7.2, 20.3, 20.9, 20.12, 24.5).

The Personal page's obligations, rules, brief archive, sync status and onboarding checklist; a
domain's records and documents; the source rows behind every Finance figure; statement uploads
and account mapping; and the secret form and profile interview inside a Setup step card. The
page overviews that carry these are in `personal.py`.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel
from control_center.contract.common import Principal, StatusLabel

# Cases ----------------------------------------------------------------------------------------


class CaseNote(ContractModel):
    """A note the Owner added to a case."""

    id: str
    text: str
    at: datetime


class CaseCreate(ContractModel):
    """A new case from the Owner (spec 20.3). `due` is a date; the case shows it as "Dec 3"."""

    title: str
    domain: str
    principal: Principal
    due: date
    employee_name: str


class CaseReassign(ContractModel):
    """Hand a case to someone else: the Owner ("You") or an employee."""

    employee_name: str


class CaseNoteCreate(ContractModel):
    """A note to add to a case."""

    text: str


# Obligations ----------------------------------------------------------------------------------

ObligationKind = Literal["date", "usage"]
Repeat = Literal["once", "monthly", "yearly"]


class Obligation(ContractModel):
    """A recurring rule that creates a case when due (spec 20.3).

    A date obligation has `next_due` and `days`, the whole days until it; a usage one ("every 5,000
    miles") has neither and says where it stands in `rule`.
    """

    id: str
    title: str
    domain: str
    principal: Principal
    kind: ObligationKind
    rule: str
    lead_days: int
    next_due: datetime | None
    days: int | None


class ObligationCreate(ContractModel):
    """A new date obligation from the Owner.

    Usage obligations come from odometer and meter entries, so the Owner adds those in Chat.
    """

    title: str
    domain: str
    principal: Principal
    due: date
    repeat: Repeat
    lead_days: int = Field(default=14, ge=0, le=180)


# Domains, records and documents ---------------------------------------------------------------

RecordKind = Literal["record", "document"]


class DomainRecord(ContractModel):
    """One register entry or filed document in a domain (spec 20.3, "Registers")."""

    id: str
    domain_id: str
    principal: Principal
    kind: RecordKind
    title: str
    meta: str


class RecordCreate(ContractModel):
    """A new register entry."""

    principal: Principal
    title: str
    meta: str = ""


class RecordEdit(ContractModel):
    """A changed register entry or document name."""

    title: str
    meta: str


class DocumentUpload(ContractModel):
    """A file the Owner filed into a domain. The mock keeps its name and size, never its bytes."""

    principal: Principal
    filename: str
    size_bytes: int = Field(ge=0)


# Rules ----------------------------------------------------------------------------------------

RuleKind = Literal["routing", "category"]


class Rule(ContractModel):
    """A deterministic rule made from an Owner correction (spec 20.12)."""

    id: str
    kind: RuleKind
    when: str
    then: str
    source: str


class RuleEdit(ContractModel):
    """A changed rule."""

    when: str
    then: str


# Briefs, sync and onboarding ------------------------------------------------------------------


class Brief(ContractModel):
    """A past daily brief or weekly review (spec 20.13), shown in full on Personal."""

    id: str
    kind: Literal["daily", "weekly"]
    title: str
    summary: str
    items: list[str]


class SyncStatus(ContractModel):
    """When a connector last synced into the personal databases."""

    id: str
    name: str
    meta: str
    status: StatusLabel


class ChecklistItem(ContractModel):
    """One step of the personal onboarding checklist (spec 24.5, "asset and document lists")."""

    id: str
    title: str
    detail: str
    done: bool


class ChecklistChange(ContractModel):
    """Tick a checklist step, or untick it."""

    done: bool


# Finance --------------------------------------------------------------------------------------


class SourceRow(ContractModel):
    """One row a figure is computed from: a transaction, a balance or a statement total."""

    id: str
    day: str
    text: str
    account: str
    amount: int
    category: str | None
    """The transaction's category, which the Owner can fix; None for balances and totals."""


class FigureSources(ContractModel):
    """The rows behind one Finance figure and how it is computed from them (spec 7.2)."""

    figure_id: str
    title: str
    formula: str
    total: int
    rows: list[SourceRow]
    categories: list[str]


class CategoryFix(ContractModel):
    """The category a transaction should have."""

    category: str


class CategoryFixed(ContractModel):
    """A category fix and the rule it added (spec 20.12)."""

    rule: Rule
    message: str


class CashFlowMonth(ContractModel):
    """Money in and out for one month, in whole dollars, with the figure that holds its rows."""

    id: str
    month: str
    money_in: int
    money_out: int


class Bill(ContractModel):
    """An upcoming bill. Brain reminds; it never pays (spec 22.2)."""

    id: str
    name: str
    due: str
    amount: int
    account: str
    status: StatusLabel


class UnmappedAccount(ContractModel):
    """An account a connector or import found that belongs to no principal yet (spec 20.4)."""

    id: str
    name: str
    meta: str


class AccountMapping(ContractModel):
    """The principal an account belongs to."""

    principal: Principal


class StatementUpload(ContractModel):
    """A statement export the Owner uploaded for one account (CSV, OFX or QFX)."""

    filename: str
    size_bytes: int = Field(ge=0)


class FinanceRequest(ContractModel):
    """Ask for an import check or the monthly close (spec 20.9)."""

    kind: Literal["import_check", "monthly_close"]


class WorkRequested(ContractModel):
    """The work item a request created, and the words the toast shows."""

    work_item_id: str
    message: str


# Setup ----------------------------------------------------------------------------------------


class SecretField(ContractModel):
    """One secret a Setup step needs. Its value is never sent back, only whether it is saved."""

    id: str
    label: str
    hint: str
    saved: bool


class SecretEntry(ContractModel):
    """A secret typed into Brain's secret form (spec 24.5). Never into Discord or chat."""

    value: str


class InterviewTurn(ContractModel):
    """One line of the profile interview."""

    speaker: Literal["atlas", "owner"]
    text: str


class Interview(ContractModel):
    """Atlas's profile interview inside its Setup step (spec 24.5, "Conversation where it fits").

    `facts` is what Atlas proposes to save once every question is answered; the step is done
    only when the Owner confirms them.
    """

    turns: list[InterviewTurn]
    asked: int
    total: int
    facts: list[str]


class InterviewAnswer(ContractModel):
    """The Owner's answer to Atlas's current question."""

    text: str
