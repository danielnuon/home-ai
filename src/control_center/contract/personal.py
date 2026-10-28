"""Personal operations: cases, domains, finance, contacts and the Owner's Setup steps."""

from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel
from control_center.contract.common import DataClass, Metric, Principal, StatusLabel, Trust


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


class CaseAction(ContractModel):
    """Mark a case done or snooze it. Both can be undone (spec 20.12)."""

    action: Literal["done", "snooze", "reopen"]


class Domain(ContractModel):
    """A personal domain and its data class (spec 20.1)."""

    name: str
    open_cases: str
    data_class: DataClass


class AutomaticChange(ContractModel):
    """A recent change an employee made on its own, which the Owner can undo (spec 20.12)."""

    id: str
    text: str
    undone: bool


class PersonalOverview(ContractModel):
    """The Personal page."""

    cases: list[Case]
    domains: list[Domain]
    recent_changes: list[AutomaticChange]


class BudgetLine(ContractModel):
    """One budget category: spent against budget, in whole dollars."""

    name: str
    spent: int
    budget: int


class StatementImport(ContractModel):
    """Import status for one account (spec 7.2, Finance)."""

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
    imports: list[StatementImport]


class HouseholdMember(ContractModel):
    """A household principal, shown at the top of Contacts."""

    id: Principal
    name: str
    meta: str


class Contact(ContractModel):
    """An outside contact and its trust level (spec 7.2, Contacts)."""

    id: str
    name: str
    meta: str
    trust: Trust


class ContactsOverview(ContractModel):
    """The Contacts page."""

    household: list[HouseholdMember]
    contacts: list[Contact]


class TrustChange(ContractModel):
    """A new trust level. Allowlisting loosens and needs a step-up; removing tightens."""

    trust: Trust


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


class SetupAction(ContractModel):
    """Defer a step, bring it back, or mark it started."""

    action: Literal["start", "defer", "resume", "redo"]
