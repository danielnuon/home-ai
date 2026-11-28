"""Personal operations: cases, domains, finance and the Owner's Setup steps."""

from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel
from control_center.contract.common import DataClass, Metric, Principal, StatusLabel
from control_center.contract.records import (
    Bill,
    Brief,
    CaseNote,
    CashFlowMonth,
    ChecklistItem,
    DomainRecord,
    Interview,
    Obligation,
    Rule,
    SecretField,
    SyncStatus,
    UnmappedAccount,
)


class Case(ContractModel):
    """A case or obligation (spec 20.3), such as "Car registration renewal"."""

    id: str
    title: str
    domain: str
    principal: Principal
    employee_name: str
    due: str
    status: StatusLabel
    state: Literal["open", "done", "snoozed"]
    notes: list[CaseNote] = Field(default_factory=list)


class CaseAction(ContractModel):
    """Mark a case done or snooze it. Both can be undone (spec 20.12)."""

    action: Literal["done", "snooze", "reopen"]


class Domain(ContractModel):
    """A personal domain and its data class (spec 20.1). `id` opens its records page."""

    id: str
    name: str
    open_cases: str
    data_class: DataClass


class AutomaticChange(ContractModel):
    """A recent change an employee made on its own, which the Owner can undo (spec 20.12)."""

    id: str
    text: str
    undone: bool


class PersonalOverview(ContractModel):
    """The Personal page (spec 7.2).

    Cases, obligations, domains, rules, briefs, sync status and the onboarding checklist.
    `assignees` fills the add and reassign forms.
    """

    cases: list[Case]
    obligations: list[Obligation]
    domains: list[Domain]
    rules: list[Rule]
    briefs: list[Brief]
    sync: list[SyncStatus]
    checklist: list[ChecklistItem]
    recent_changes: list[AutomaticChange]
    assignees: list[str]


class DomainDetail(ContractModel):
    """One domain's page: its records and filed documents, for every principal."""

    domain: Domain
    records: list[DomainRecord]


class BudgetLine(ContractModel):
    """One budget category: spent against budget, in whole dollars. `id` names its sources."""

    id: str
    name: str
    spent: int
    budget: int


class StatementImport(ContractModel):
    """Import status for one account (spec 7.2, Finance)."""

    id: str
    account: str
    meta: str
    status: StatusLabel


class FinanceOverview(ContractModel):
    """The Finance page for one principal. Every figure is computed in code, never by a model."""

    principal: Principal
    month: str
    days_elapsed: str
    budget: list[BudgetLine]
    net_worth: Metric
    cash_flow: list[CashFlowMonth]
    bills: list[Bill]
    imports: list[StatementImport]
    unmapped: list[UnmappedAccount]
    inbox: str
    """The inbox folder a statement export can be dropped into instead of uploading it."""


SetupState = Literal["ready", "waiting", "deferred", "done"]


class SetupCheck(ContractModel):
    """One sub-item of a Setup step, such as a single macOS permission."""

    name: str
    status: StatusLabel


class SetupStep(ContractModel):
    """An Owner input from the register, shown as a step card (spec 24.4, 24.5).

    `why`, `until` and `stub` answer the three questions every card must: why only the Owner can do
    it, what stays off until it is done, and what stands in for it now.
    """

    id: str
    title: str
    duration: str
    required: bool
    why: str
    until: str
    stub: str
    cta: str
    state: SetupState
    waiting_on: str | None = None
    proof: str | None = None
    checks: list[SetupCheck] = Field(default_factory=list)
    secrets: list[SecretField] = Field(default_factory=list)
    interview: Interview | None = None


class SetupAction(ContractModel):
    """Defer a step, bring it back, or mark it started."""

    action: Literal["start", "defer", "resume", "redo"]
