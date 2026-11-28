"""The mock gate's shell controls: Today's alerts and writing an Ark drive.

Acknowledging or snoozing an alert is tightening-neutral and takes one tap, with Undo. Writing an
Ark drive copies household data to a removable volume, so it always needs a step-up (spec 12.8).
"""

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.fixtures import shell
from control_center.backends.mock.gate_step_up import StepUpDesk
from control_center.contract.shell import ArkDriveStarted
from control_center.contract.today import Alert, AlertAction

ALERT_PAGES = ("today",)
"""The resources that show alerts."""


class ShellControls(StepUpDesk):
    """The alerts and Ark drive part of `ApprovalGate`."""

    def alerts(self) -> list[Alert]:
        """Open alerts, oldest first. A snoozed one comes back when its snooze ends."""
        now = self._world.clock()
        for alert in self._world.alerts.values():
            if alert.state == "snoozed" and alert.snoozed_until and alert.snoozed_until <= now:
                alert.state, alert.snoozed_until = "open", None
        return [a for a in self._world.alerts.values() if a.state == "open"]

    def alert_action(self, alert_id: str, action: AlertAction) -> Alert:
        """Acknowledge or snooze an alert, or reopen it (the Undo of either).

        Args:
            alert_id: The alert.
            action: What to do with it.

        Returns:
            The alert in its new state.

        Raises:
            NotFoundError: No such alert.
        """
        alert = self._world.alerts.get(alert_id)
        if alert is None:
            raise NotFoundError("That alert no longer exists.")
        if action.action == "snooze":
            alert.state, alert.snoozed_until = "snoozed", self._world.clock() + shell.SNOOZE
        else:
            alert.state = "acknowledged" if action.action == "acknowledge" else "open"
            alert.snoozed_until = None
        self._world.bus.changed(*ALERT_PAGES)
        return alert

    def write_ark_drive(self, volume: str, step_up: str | None) -> ArkDriveStarted:
        """Write the installed tiers, index and quick cards to an external volume (spec 12.8).

        Args:
            volume: The external volume the Owner chose.
            step_up: A proof from `verify_step_up`; always needed.

        Returns:
            What the toast says.

        Raises:
            ConflictError: The library is off.
            NotFoundError: No such volume is connected.
        """  # noqa: DOC503 StepUpRequiredError is raised by self._require_step_up()
        if not self._world.is_on("offline_library"):
            raise ConflictError("The offline library is off. Turn it on first.")
        if volume not in shell.ARK_VOLUMES:
            raise NotFoundError("That drive isn't connected.")
        self._require_step_up(step_up, "Writing an Ark drive needs your passkey.")
        installed = [t.name for t in shell.library_tiers() if t.installed]
        tiers = ", ".join(installed)
        return ArkDriveStarted(
            message=f"Writing {tiers} to {volume}. You'll get a notice when it's done."
        )
