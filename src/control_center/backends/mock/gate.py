"""Mock approval gate: approvals, critical decisions, settings, kill switch and step-up.

Keeps the gate's rules that change what Brain shows: which actions need a passkey, that nothing is
approved by timeout, that a decision is held for a few seconds so it can be undone, and that a
setting never passes its hard limit. It does not hash or sign anything, and it accepts the mock
virtual authenticator's assertions instead of WebAuthn ones.
"""

import secrets
from datetime import datetime, timedelta

from control_center.backends.errors import ConflictError, NotFoundError, StepUpRequiredError
from control_center.backends.mock import setting_rules
from control_center.backends.mock.fixtures import gate as gate_fixtures
from control_center.backends.mock.fixtures import platform as platform_fixtures
from control_center.backends.mock.world import MockWorld
from control_center.config import OWNER_TIME_ZONE
from control_center.contract.common import StatusLabel
from control_center.contract.gate import (
    Approval,
    ApprovalDecision,
    CriticalDecision,
    PlatformState,
    Setting,
    SettingChange,
    SettingsIndex,
    StepUpProof,
)
from control_center.contract.personal import Contact, ContactsOverview, TrustChange
from control_center.contract.work import ProposalDecision

UNDO_WINDOW = timedelta(seconds=8)
"""How long the gate holds an approved action so the Owner can undo it (spec 7.15, "Undo 8 s")."""

STEP_UP_LIFETIME = timedelta(minutes=2)
"""How long a step-up proof stays usable. Each proof is single-use as well."""

MOCK_ASSERTION_PREFIX = "virtual:"
"""The mock virtual authenticator answers a challenge with this prefix plus the challenge."""


class MockApprovalGate:
    """In-memory stand-in for the approval gate (spec C8). Implements `ApprovalGate`."""

    def __init__(self, world: MockWorld) -> None:
        """Use `world` for state and its bus for events."""
        self._world = world

    # Step-up -------------------------------------------------------------------------------

    def create_step_up_challenge(self) -> str:
        """Return a fresh random challenge for the authenticator to sign."""
        challenge = secrets.token_urlsafe(16)
        self._world.step_up_challenges.add(challenge)
        return challenge

    def verify_step_up(self, challenge: str, assertion: str) -> StepUpProof:
        """Check the mock assertion for a challenge this gate issued, and issue a proof.

        Args:
            challenge: The challenge from `create_step_up_challenge`.
            assertion: The authenticator's answer to it.

        Returns:
            A single-use proof that expires in two minutes.

        Raises:
            StepUpRequiredError: The challenge is unknown or used, or the assertion is wrong.
        """
        if challenge not in self._world.step_up_challenges:
            raise StepUpRequiredError("That passkey request expired. Try again.")
        self._world.step_up_challenges.discard(challenge)
        if assertion != MOCK_ASSERTION_PREFIX + challenge:
            raise StepUpRequiredError("The passkey didn't match. Try again.")
        proof = secrets.token_urlsafe(24)
        expires_at = self._world.clock() + STEP_UP_LIFETIME
        self._world.step_up_proofs[proof] = expires_at
        return StepUpProof(proof=proof, expires_at=expires_at)

    def _require_step_up(self, step_up: str | None, why: str) -> None:
        """Consume a valid proof, or raise `StepUpRequiredError` with `why` for the Owner."""
        expires_at = self._world.step_up_proofs.pop(step_up, None) if step_up else None
        if expires_at is None or expires_at < self._world.clock():
            raise StepUpRequiredError(why)

    # Approvals -----------------------------------------------------------------------------

    def list_approvals(self) -> list[Approval]:
        """Every card, pending first. A card past its expiry becomes expired; nothing is sent."""
        now = self._world.clock()
        for approval in self._world.approvals.values():
            _expire_if_lapsed(approval, now)
        return sorted(self._world.approvals.values(), key=lambda a: a.state != "pending")

    def _approval(self, approval_id: str) -> Approval:
        try:
            return self._world.approvals[approval_id]
        except KeyError:
            raise NotFoundError("That approval no longer exists.") from None

    def decide(self, approval_id: str, decision: ApprovalDecision, step_up: str | None) -> Approval:
        """Approve or deny a pending card. Restricted data and class C need a step-up to approve.

        Args:
            approval_id: The approval card.
            decision: The Owner's answer.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Returns:
            The card in its new state.

        Raises:
            NotFoundError: No such approval.
            ConflictError: It was already decided or has expired.
            StepUpRequiredError: Approving needs a step-up and `step_up` isn't a valid proof.
        """  # noqa: DOC503 NotFoundError and StepUpRequiredError come from the _approval and _require_step_up helpers
        approval = self._approval(approval_id)
        _expire_if_lapsed(approval, self._world.clock())
        if approval.state == "expired":
            raise ConflictError("This card expired. Nothing was sent.")
        if approval.state != "pending":
            raise ConflictError("This card was already decided.")
        if decision.decision == "approve":
            if approval.needs_step_up:
                self._require_step_up(step_up, _step_up_reason(approval))
            approval.state = "approved"
            approval.decided_note = f"Approved · {approval.employee_name} is sending"
            approval.undo_until = self._world.clock() + UNDO_WINDOW
        else:
            approval.state = "denied"
            approval.decided_note = f"Denied · {approval.employee_name} notified"
            approval.undo_until = self._world.clock() + UNDO_WINDOW
        self._world.bus.changed("approvals", "today", "platform", "chat")
        return approval

    def undo_decision(self, approval_id: str) -> Approval:
        """Return a decided card to pending while the gate still holds its action.

        Args:
            approval_id: The approval card.

        Returns:
            The card in its new state.

        Raises:
            NotFoundError: No such approval.
            ConflictError: The undo window has passed and the action has run.
        """  # noqa: DOC503 NotFoundError is raised by self._approval()
        approval = self._approval(approval_id)
        if approval.undo_until is None or approval.undo_until < self._world.clock():
            raise ConflictError("Too late to undo: the action already ran.")
        approval.state = "pending"
        approval.decided_note = None
        approval.undo_until = None
        self._world.bus.changed("approvals", "today", "platform", "chat")
        return approval

    # Critical decisions --------------------------------------------------------------------

    def list_decisions(self) -> list[CriticalDecision]:
        """Open decisions first, then the rest in fixture order."""
        return sorted(self._settled_decisions(), key=lambda d: not d.open)

    def _settled_decisions(self) -> list[CriticalDecision]:
        """Every decision, with any whose veto window has passed moved into effect."""
        now = self._world.clock()
        for record in self._world.decisions.values():
            _take_effect_if_due(record, now)
        return list(self._world.decisions.values())

    def _decision(self, decision_id: str) -> CriticalDecision:
        try:
            record = self._world.decisions[decision_id]
        except KeyError:
            raise NotFoundError("That decision record doesn't exist.") from None
        _take_effect_if_due(record, self._world.clock())
        return record

    def acknowledge(self, decision_id: str) -> CriticalDecision:
        """Acknowledge an open decision.

        Args:
            decision_id: The critical decision record.

        Returns:
            The record in its new state.

        Raises:
            ConflictError: The decision is not open.
        """
        record = self._decision(decision_id)
        if not record.open:
            raise ConflictError("This decision is no longer open.")
        record.acknowledged = True
        self._world.bus.changed("decisions", "today", "platform")
        return record

    def veto(self, decision_id: str, reason: str | None) -> CriticalDecision:
        """Cancel a waiting decision, or revert one already in effect.

        Args:
            decision_id: The critical decision record.
            reason: Why, for the employee; optional.

        Returns:
            The record in its new state.

        Raises:
            ConflictError: The decision was already vetoed or superseded.
        """
        record = self._decision(decision_id)
        if not record.vetoable:
            raise ConflictError("This decision can't be vetoed any more.")
        record.status = "vetoed" if record.status == "pending_window" else "reversed"
        record.acknowledged = False
        record.veto_reason = reason
        self._world.bus.changed("decisions", "today", "platform")
        return record

    def reopen(self, decision_id: str) -> CriticalDecision:
        """Undo an acknowledgement or a veto while the veto window is open.

        Args:
            decision_id: The critical decision record.

        Returns:
            The record in its new state.

        Raises:
            ConflictError: The window has ended.
        """
        record = self._decision(decision_id)
        if record.window_ends is None or record.window_ends <= self._world.clock():
            raise ConflictError("The veto window has ended.")
        record.status = "pending_window"
        record.acknowledged = False
        record.veto_reason = None
        self._world.bus.changed("decisions", "today", "platform")
        return record

    # Settings ------------------------------------------------------------------------------

    def settings(self) -> SettingsIndex:
        """Every setting, and the hard limits."""
        return SettingsIndex(
            settings=list(self._world.settings.values()),
            hard_limits=gate_fixtures.hard_limits(),
        )

    def _setting(self, key: str) -> Setting:
        try:
            return self._world.settings[key]
        except KeyError:
            raise NotFoundError(f"There is no setting called {key}.") from None

    def change_setting(self, key: str, value: str, step_up: str | None) -> Setting:
        """Apply a change after checking its limit and, if it loosens, its step-up.

        Args:
            key: The setting.
            value: The new value.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Returns:
            The setting with its new value.

        Raises:
            NotFoundError: No such setting.
            RefusedError: The value is invalid or past a hard limit.
            StepUpRequiredError: The change loosens a safeguard and `step_up` isn't a valid proof.
        """  # noqa: DOC502 raised by self._setting(), setting_rules.validate() and self._require_step_up()
        setting = self._setting(key)
        setting_rules.validate(setting, value)
        if value == setting.value:
            return setting
        if setting_rules.is_loosening(setting, value):
            self._require_step_up(step_up, f"Changing {setting.label} loosens a safeguard.")
        setting.history.insert(
            0, SettingChange(at=self._world.clock(), old=setting.value, new=value, via="brain")
        )
        setting.value = value
        self._world.bus.changed("settings", setting.owner_page, "today", "platform")
        return setting

    def revert_setting(self, key: str, step_up: str | None) -> Setting:
        """Change a setting back to the value before its latest change.

        Args:
            key: The setting.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Returns:
            The setting with its new value.

        Raises:
            ConflictError: The setting has never changed.
        """
        setting = self._setting(key)
        if not setting.history:
            raise ConflictError(f"{setting.label} has no earlier value.")
        return self.change_setting(key, setting.history[0].old, step_up)

    # Kill switch and platform state --------------------------------------------------------

    def platform_state(self) -> PlatformState:
        """Global banners and the navigation badges."""
        world = self._world
        pending = sum(1 for a in self.list_approvals() if a.state == "pending")
        open_decisions = sum(1 for d in self._settled_decisions() if d.open)
        running = sum(1 for t in world.tasks.values() if not t.queued)
        if world.stopped:
            overall = StatusLabel(status="problem", label="Stopped")
        elif world.is_on("away_mode"):
            overall = StatusLabel(status="attention", label="Away mode")
        else:
            overall = StatusLabel(status="healthy", label="All clear")
        badges = {
            "approvals": _count(pending),
            "decisions": _count(open_decisions),
            "live": StatusLabel(status="neutral", label=str(running)),
            "backups": StatusLabel(status="attention", label="▲"),
            "setup": StatusLabel(status="attention", label=_setup_badge(world)),
        }
        return PlatformState(
            stopped=world.stopped,
            away=world.is_on("away_mode"),
            quiet_hours=_in_quiet_hours(world.setting("quiet_hours"), world.clock()),
            degraded=[],
            overall=overall,
            badges={page: badge for page, badge in badges.items() if badge.label not in ("", "0")},
        )

    def stop_all(self) -> PlatformState:
        """Stop everything at once. Tightening, so never gated."""
        self._world.stopped = True
        self._world.bus.changed("*")
        return self.platform_state()

    def resume_all(self, step_up: str | None) -> PlatformState:
        """Resume after a stop, behind a step-up."""
        self._require_step_up(step_up, "Resuming after a stop needs your passkey.")
        self._world.stopped = False
        self._world.bus.changed("*")
        return self.platform_state()

    # Contacts, employees, proposals and controls -------------------------------------------

    def contacts(self) -> ContactsOverview:
        """Household principals and contacts."""
        return ContactsOverview(
            household=gate_fixtures.household(), contacts=list(self._world.contacts.values())
        )

    def set_trust(self, contact_id: str, change: TrustChange, step_up: str | None) -> Contact:
        """Change a contact's trust; more trust needs a step-up.

        Args:
            contact_id: The contact.
            change: The new trust level.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Returns:
            The contact with its new trust.

        Raises:
            NotFoundError: No such contact.
        """
        contact = self._world.contacts.get(contact_id)
        if contact is None:
            raise NotFoundError("That contact no longer exists.")
        if setting_rules.is_trust_loosening(contact.trust, change.trust):
            self._require_step_up(step_up, f"Trusting {contact.name} more needs your passkey.")
        contact.trust = change.trust
        self._world.bus.changed("contacts", "security")
        return contact

    def set_employee_enabled(self, employee_id: str, enabled: bool, step_up: str | None) -> None:
        """Enable or disable an employee.

        Args:
            employee_id: The employee.
            enabled: Whether the employee may work.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Raises:
            NotFoundError: No such employee.
        """
        employee = self._world.employees.get(employee_id)
        if employee is None:
            raise NotFoundError("That employee doesn't exist.")
        if enabled and not employee.enabled:
            self._require_step_up(step_up, f"Enabling {employee.name} needs your passkey.")
        employee.enabled = enabled
        self._world.bus.changed("directory")

    def decide_proposal(self, proposal_id: str, decision: ProposalDecision) -> None:
        """Record the Owner's answer to a lifecycle proposal.

        Args:
            proposal_id: The lifecycle proposal.
            decision: The Owner's answer.

        Raises:
            NotFoundError: No such proposal.
            ConflictError: Already decided.
        """
        proposal = self._world.proposals.get(proposal_id)
        if proposal is None:
            raise NotFoundError("That proposal no longer exists.")
        if proposal.state != "open":
            raise ConflictError("This proposal was already decided.")
        proposal.state = "approved" if decision.decision == "approve" else "declined"
        self._world.bus.changed("directory")

    def restart_service(self, service_id: str, step_up: str | None) -> None:
        """Gate a restart behind a step-up. The mock's services are always healthy afterwards.

        Args:
            service_id: The service to restart.
            step_up: A proof from `verify_step_up`, needed only when the change loosens something.

        Raises:
            NotFoundError: No such service.
        """
        known = {s.id for group in platform_fixtures.service_groups() for s in group.services}
        if service_id not in known:
            raise NotFoundError("That service doesn't exist.")
        self._require_step_up(step_up, "Restarting a service needs your passkey.")
        self._world.bus.changed("services")

    def request_restore(self, what: str, point: str, step_up: str | None) -> str:
        """Gate a restore behind a step-up and say where the copy will appear."""
        self._require_step_up(step_up, "Restoring needs your passkey.")
        return f"Restoring {what} from {point} into Restores on the working drive."


def _expire_if_lapsed(approval: Approval, now: datetime) -> None:
    """Expire a pending card whose time is up. Nothing is ever approved by timeout (spec 11)."""
    if approval.state == "pending" and approval.expires_at and approval.expires_at < now:
        approval.state = "expired"
        approval.decided_note = "Expired · nothing was sent"


def _take_effect_if_due(record: CriticalDecision, now: datetime) -> None:
    """Put an `after_window` decision into effect once its veto window has passed (spec 11.9)."""
    if record.status == "pending_window" and record.window_ends and record.window_ends <= now:
        record.status = "in_effect"


def _count(number: int) -> StatusLabel:
    return StatusLabel(status="attention", label=str(number) if number else "")


def _setup_badge(world: MockWorld) -> str:
    required = [step for step in world.setup.values() if step.required]
    done = sum(1 for step in required if step.state == "done")
    return "" if done == len(required) else f"{done}/{len(required)}"


def _step_up_reason(approval: Approval) -> str:
    if approval.data_class == "restricted":
        return f"{approval.domain} is a restricted domain. Your passkey confirms it's you."
    return "This approval needs your passkey."


def _in_quiet_hours(window: str, now: datetime) -> bool:
    """Whether `now` falls inside a window written like "22:00–06:00" in the Owner's time zone."""
    start_text, end_text = window.split("–")
    local = now.astimezone(OWNER_TIME_ZONE).strftime("%H:%M")
    if start_text <= end_text:
        return start_text <= local < end_text
    return local >= start_text or local < end_text
