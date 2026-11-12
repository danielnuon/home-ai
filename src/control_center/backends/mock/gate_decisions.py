"""The mock gate's critical decision records: acknowledge, veto and reopen (spec 11.9)."""

from datetime import datetime

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.gate_step_up import StepUpDesk
from control_center.contract.gate import CriticalDecision

DECISION_PAGES = ("decisions", "today", "platform")
"""The resources that show critical decisions; each refetches when a record changes."""


class DecisionLedger(StepUpDesk):
    """The critical-decision half of `ApprovalGate`. Decisions count down; none needs a step-up."""

    def list_decisions(self) -> list[CriticalDecision]:
        """Open decisions first, then the rest in fixture order."""
        return sorted(self._settled_decisions(), key=lambda d: not d.open)

    def _settled_decisions(self) -> list[CriticalDecision]:
        """Every decision, with any whose veto window has passed moved into effect."""
        now = self._world.clock()
        took_effect = [_take_effect_if_due(r, now) for r in self._world.decisions.values()]
        if any(took_effect):
            self._world.bus.changed(*DECISION_PAGES)
        return list(self._world.decisions.values())

    def _decision(self, decision_id: str) -> CriticalDecision:
        try:
            record = self._world.decisions[decision_id]
        except KeyError:
            raise NotFoundError("That decision record doesn't exist.") from None
        if _take_effect_if_due(record, self._world.clock()):
            self._world.bus.changed(*DECISION_PAGES)
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
        self._world.bus.changed(*DECISION_PAGES)
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
        self._world.bus.changed(*DECISION_PAGES)
        return record

    def reopen(self, decision_id: str) -> CriticalDecision:
        """Undo an acknowledgement or a veto while the veto window is open.

        Args:
            decision_id: The critical decision record.

        Returns:
            The record in its new state.

        Raises:
            ConflictError: The window has ended, or the decision was reversed or superseded,
                which reopening must not bring back.
        """
        record = self._decision(decision_id)
        if record.window_ends is None or record.window_ends <= self._world.clock():
            raise ConflictError("The veto window has ended.")
        if record.status not in ("vetoed", "pending_window"):
            raise ConflictError("This decision can't be reopened.")
        record.status = "pending_window"
        record.acknowledged = False
        record.veto_reason = None
        self._world.bus.changed(*DECISION_PAGES)
        return record


def _take_effect_if_due(record: CriticalDecision, now: datetime) -> bool:
    """Put an `after_window` decision into effect once its veto window has passed (spec 11.9).

    The answer is whether the decision changed, so the caller can tell open pages.
    """
    if record.status == "pending_window" and record.window_ends and record.window_ends <= now:
        record.status = "in_effect"
        return True
    return False
