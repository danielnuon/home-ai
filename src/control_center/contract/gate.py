"""Objects the approval gate owns: approvals, critical decisions, settings and the kill switch."""

from datetime import datetime
from typing import Literal

from pydantic import Field, computed_field

from control_center.contract.base import ContractModel
from control_center.contract.common import DataClass, Department, StatusLabel, Trust

ApprovalState = Literal["pending", "approved", "denied", "expired"]


class ReleaseSummary(ContractModel):
    """The diff and check summary shown on a release approval card."""

    added_lines: int
    removed_lines: int
    files: int
    checks_passed: int
    checks_total: int
    rollback: str


class Approval(ContractModel):
    """One approval card, rendered by the gate (spec 11.3).

    `needs_step_up` is decided by the gate from the domain's data class and the approval class
    (spec 7.4); Brain only displays it. `undo_until` is set for a few seconds after a decision,
    during which the gate holds the action so the Owner can take it back (spec 7.15, principle 6).
    """

    id: str
    title: str
    employee_name: str
    department: Department
    domain: str
    data_class: DataClass
    approval_class: Literal["P", "R", "C"]
    tier: Literal["T2", "T3"] | None = None
    principal: str
    recipient: str | None = None
    recipient_trust: Trust | None = None
    summary: str
    draft: str | None = None
    release: ReleaseSummary | None = None
    expires_at: datetime | None = None
    needs_step_up: bool
    state: ApprovalState
    decided_note: str | None = None
    undo_until: datetime | None = None


class ApprovalDecision(ContractModel):
    """The Owner's answer to an approval card. A denial reason goes to the drafting employee."""

    decision: Literal["approve", "deny"]
    reason: str | None = None


class RejectedOption(ContractModel):
    """One rejected alternative, written as cause → effect → outcome (spec 11.9)."""

    option: str
    effect: str
    outcome: str


DecisionStatus = Literal["pending_window", "in_effect", "vetoed", "reversed", "superseded"]


class CriticalDecision(ContractModel):
    """A critical decision record (CDR, spec 11.9): a choice the AI made that the Owner can veto.

    An `after_window` decision takes effect when `window_ends` passes; an `immediate` one is already
    in effect and a veto reverts it. These count down; approvals never do (spec 7.16, rule 8).

    `open` and `vetoable` are computed here, once, so the gate, Today and the front end cannot
    disagree about which decisions still need the Owner.
    """

    id: str
    title: str
    summary: str
    rationale: str
    rejected: list[RejectedOption]
    risks: str
    evidence: str
    effect: Literal["immediate", "after_window"]
    window_ends: datetime | None
    status: DecisionStatus
    acknowledged: bool
    veto_preview: str
    veto_reason: str | None = None
    decided_on: str

    # mypy does not yet accept a decorator stacked on @property; Pydantic documents this pattern.
    @computed_field  # type: ignore[prop-decorator]
    @property
    def open(self) -> bool:
        """Whether it is still highlighted: vetoable and not yet acknowledged (spec 11.9)."""
        return self.vetoable and not self.acknowledged

    @computed_field  # type: ignore[prop-decorator]
    @property
    def vetoable(self) -> bool:
        """Whether a veto still does something: cancels a waiting one or reverts one in effect."""
        return self.status in ("pending_window", "in_effect")


class VetoRequest(ContractModel):
    """An optional reason that goes to the team with a veto."""

    reason: str | None = None


SettingKind = Literal["switch", "level", "choice", "money"]
"""How the gate tells tightening from loosening for a setting (spec 7.4, 7.16 rule 3).

- switch: on or off; `on_is_loosening` says which way "on" goes.
- level: `choices` ordered from tightest to loosest, such as Discord detail.
- choice: any value is as safe as any other, such as the call voice; never needs a step-up.
- money: a monthly cap in whole dollars; raising it loosens, and `ceiling` is the hard limit.
"""


class SettingChange(ContractModel):
    """One entry in a setting's history."""

    at: datetime
    old: str
    new: str
    via: Literal["brain", "discord", "desk"]


class Setting(ContractModel):
    """An operating choice in the gate's settings store (spec 7.9). See `SettingKind`."""

    key: str
    label: str
    note: str
    category: str
    kind: SettingKind
    value: str
    default: str
    choices: list[str] = Field(default_factory=list)
    on_is_loosening: bool = True
    ceiling: int | None = None
    owner_page: str
    cost_note: str = ""
    history: list[SettingChange] = Field(default_factory=list)


class SettingUpdate(ContractModel):
    """A requested new value for one setting. Values are strings for every kind."""

    value: str


class HardLimit(ContractModel):
    """A ceiling from `policy.yaml`. Shown read-only: it changes only at the desk (spec 7.9)."""

    name: str
    value: str


class SettingsIndex(ContractModel):
    """Everything on the Settings page: every setting and the read-only hard limits."""

    settings: list[Setting]
    hard_limits: list[HardLimit]


class PlatformState(ContractModel):
    """Global states shown on every page (spec 7.16, rule 6) plus the navigation badges.

    `badges` maps a page route (for example "approvals") to a short count or symbol.
    """

    stopped: bool
    away: bool
    quiet_hours: bool
    degraded: list[str]
    overall: StatusLabel
    badges: dict[str, StatusLabel]


class StepUpProof(ContractModel):
    """Proof of a fresh passkey step-up, passed back with a gated action.

    In production this wraps a WebAuthn assertion that the gate verifies itself (spec 7.4). The
    mock gate issues and checks opaque tokens instead, standing in for the virtual WebAuthn
    authenticator of spec 24.5.
    """

    proof: str
    expires_at: datetime
