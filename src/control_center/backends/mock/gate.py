"""Mock approval gate: approvals, settings and the kill switch, plus the parts it is built from.

Keeps the gate's rules that change what Brain shows: which actions need a passkey, that nothing is
approved by timeout, that a decision is held for a few seconds so it can be undone, and that a
setting never passes its hard limit. Critical decisions (`gate_decisions`), the controls over
people and machinery (`gate_controls`) and the step-up (`gate_step_up`) are in their own modules.
"""

from datetime import datetime, timedelta

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock import setting_rules
from control_center.backends.mock.fixtures import operations
from control_center.backends.mock.fixtures import settings as settings_fixtures
from control_center.backends.mock.gate_accounts import AccountsControls
from control_center.backends.mock.gate_controls import GateControls
from control_center.backends.mock.gate_decisions import DecisionLedger
from control_center.backends.mock.gate_ops import OpsControls
from control_center.backends.mock.gate_people import PeopleDesk
from control_center.backends.mock.gate_shell import ShellControls
from control_center.backends.mock.world import MockWorld
from control_center.config import OWNER_TIME_ZONE
from control_center.contract.common import StatusLabel
from control_center.contract.gate import (
    Approval,
    ApprovalDecision,
    BatchToggle,
    DraftEdit,
    PlatformState,
    Setting,
    SettingChange,
    SettingsIndex,
)

UNDO_WINDOW = timedelta(seconds=8)
"""How long the gate holds an approved action so the Owner can undo it (spec 7.15, "Undo 8 s")."""

APP_FEATURES = ("offline_pack", "offline_library")
"""Optional features that change the app itself: a page in the navigation, or a phone cache."""

APPROVAL_PAGES = ("approvals", "today", "platform", "chat", "work")
"""The resources that show approval cards, or a thread waiting on one."""


class MockApprovalGate(
    DecisionLedger, GateControls, PeopleDesk, ShellControls, OpsControls, AccountsControls
):
    """In-memory stand-in for the approval gate (spec C8). Implements `ApprovalGate`.

    Approvals, settings and the kill switch are here. Critical decisions are in `DecisionLedger`,
    contacts and principals in `PeopleDesk`, the controls over employees and machinery in
    `GateControls`, alerts and the Ark drive in `ShellControls`, Connections, Voice, Security and
    export in `AccountsControls`, and the step-up in `StepUpDesk`.
    """

    # Approvals -----------------------------------------------------------------------------

    def list_approvals(self) -> list[Approval]:
        """Every card, pending first. A card past its expiry becomes expired; nothing is sent."""
        now = self._world.clock()
        lapsed = [_expire_if_lapsed(a, now) for a in self._world.approvals.values()]
        if any(lapsed):
            self._world.bus.changed(*APPROVAL_PAGES)
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
        if _expire_if_lapsed(approval, self._world.clock()):
            # The card changed under the Owner's finger: tell every open page before refusing.
            self._world.bus.changed(*APPROVAL_PAGES)
        if approval.state == "expired":
            raise ConflictError("This card expired. Nothing was sent.")
        if approval.state != "pending":
            raise ConflictError("This card was already decided.")
        if decision.decision == "approve":
            if approval.needs_step_up:
                self._require_step_up(step_up, _step_up_reason(approval))
            approval.state = "approved"
            approval.decided_note = (
                f"Approved · {approval.employee_name} is sending{_batch_part(approval)}"
            )
            approval.undo_until = self._world.clock() + UNDO_WINDOW
        else:
            approval.state = "denied"
            approval.decided_note = f"Denied · {approval.employee_name} notified"
            approval.undo_until = self._world.clock() + UNDO_WINDOW
        self._world.bus.changed(*APPROVAL_PAGES)
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
        self._world.bus.changed(*APPROVAL_PAGES)
        return approval

    def _pending(self, approval_id: str) -> Approval:
        """A card that can still be changed, refusing one that was decided or lapsed."""
        approval = self._approval(approval_id)
        if _expire_if_lapsed(approval, self._world.clock()):
            self._world.bus.changed(*APPROVAL_PAGES)
        if approval.state != "pending":
            raise ConflictError("This card was already decided.")
        return approval

    def edit_draft(self, approval_id: str, edit: DraftEdit) -> Approval:
        """Replace a pending card's draft with the Owner's wording (spec 7.2, Approvals).

        Args:
            approval_id: The approval card.
            edit: The new wording.

        Returns:
            The card with its new draft.

        Raises:
            ConflictError: The card has no draft, or the new one is empty.
        """
        approval = self._pending(approval_id)
        if approval.draft is None:
            raise ConflictError("This card has no draft to edit.")
        if not edit.draft.strip():
            raise ConflictError("Write the message first, or deny the card.")
        approval.draft = edit.draft.strip()
        self._world.bus.changed(*APPROVAL_PAGES)
        return approval

    def toggle_batch_message(
        self, approval_id: str, message_id: str, toggle: BatchToggle
    ) -> Approval:
        """Tick or untick one message of a batch card; approving sends only the ticked ones.

        Args:
            approval_id: The approval card.
            message_id: The message in its batch.
            toggle: Whether to send it.

        Returns:
            The card with its batch as it is now.

        Raises:
            NotFoundError: No such message on the card.
            ConflictError: Unticking it would leave nothing to send.
        """
        approval = self._pending(approval_id)
        message = next((m for m in approval.batch or [] if m.id == message_id), None)
        if message is None:
            raise NotFoundError("That message isn't on this card.")
        others = [m for m in approval.batch or [] if m.id != message_id and m.included]
        if not toggle.included and not others:
            raise ConflictError("Keep at least one message, or deny the card.")
        message.included = toggle.included
        self._world.bus.changed(*APPROVAL_PAGES)
        return approval

    def allow_recipient(self, approval_id: str, step_up: str | None) -> Approval:
        """Allowlist a card's recipient from the card itself (spec 7.16, rule 4). Needs a step-up.

        Every pending card to that contact becomes a one-tap T2 card; restricted data still asks
        for the passkey when approved.

        Args:
            approval_id: The approval card.
            step_up: A proof from `verify_step_up`.

        Returns:
            The card with its recipient allowlisted.

        Raises:
            ConflictError: The recipient isn't a saved contact, or is already allowlisted.
        """
        approval = self._pending(approval_id)
        contact = self._world.contacts.get(approval.contact_id or "")
        if contact is None:
            raise ConflictError("This recipient isn't a saved contact. Add them on Contacts first.")
        if contact.trust == "allowlisted":
            raise ConflictError(f"{contact.name} is already allowlisted.")
        self._require_step_up(step_up, f"Always allowing {contact.name} needs your passkey.")
        contact.trust = "allowlisted"
        for card in self._world.approvals.values():
            if card.contact_id == contact.id and card.state == "pending":
                card.recipient_trust = "allowlisted"
                if card.tier is not None:
                    card.tier = "T2"
        self._world.bus.changed(*APPROVAL_PAGES, "contacts", "security")
        return approval

    # Settings ------------------------------------------------------------------------------

    def settings(self) -> SettingsIndex:
        """Every setting, and the hard limits."""
        return SettingsIndex(
            settings=list(self._world.settings.values()),
            hard_limits=settings_fixtures.hard_limits(),
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
        open_decisions = sum(1 for d in self.list_decisions() if d.open)
        running = sum(1 for t in world.tasks.values() if t.session_state == "running")
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
            degraded=_degraded(world),
            pressure=world.ops.pressure,
            overall=overall,
            badges={page: badge for page, badge in badges.items() if badge.label not in ("", "0")},
            features_on=[key for key in APP_FEATURES if world.is_on(key)],
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


def _degraded(world: MockWorld) -> list[str]:
    """The banner for each degraded mode in force: memory pressure (spec 7.17, 7.16 rule 6)."""
    banner = operations.PRESSURE_WORDS[world.ops.pressure][1]
    return [banner] if banner else []


def _expire_if_lapsed(approval: Approval, now: datetime) -> bool:
    """Expire a pending card whose time is up. Nothing is ever approved by timeout (spec 11).

    A card lapses at its expiry instant, not after it, the same as a decision's veto window.
    The answer is whether the card changed, so the caller can tell open pages.
    """
    if approval.state == "pending" and approval.expires_at and approval.expires_at <= now:
        approval.state = "expired"
        approval.decided_note = "Expired · nothing was sent"
        return True
    return False


def _batch_part(approval: Approval) -> str:
    """Say how many of a batch go out, when one was left out; nothing otherwise."""
    if not approval.batch:
        return ""
    sent = sum(m.included for m in approval.batch)
    return "" if sent == len(approval.batch) else f" {sent} of {len(approval.batch)}"


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
