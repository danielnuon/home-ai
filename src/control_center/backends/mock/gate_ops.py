"""The mock gate's operations control: running a prune plan.

A prune deletes backup snapshots for good, so it needs a step-up and runs only the plan the Owner
has seen (spec 7.16, rules 5 and 11; 13.7).
"""

from control_center.backends.errors import ConflictError
from control_center.backends.mock.gate_step_up import StepUpDesk
from control_center.contract.status import PruneDone


class OpsControls(StepUpDesk):
    """The prune part of `ApprovalGate`."""

    def run_prune(self, plan_id: str, step_up: str | None) -> PruneDone:
        """Remove what the prune plan lists.

        Args:
            plan_id: The plan the Owner saw; a newer or discarded plan is refused.
            step_up: A proof from `verify_step_up`; always needed.

        Returns:
            What the toast says.

        Raises:
            ConflictError: There is no plan, or it is not the one shown, or everything is stopped.
        """  # noqa: DOC503 StepUpRequiredError is raised by self._require_step_up()
        ops = self._world.ops
        if ops.prune_plan is None or ops.prune_plan.id != plan_id:
            raise ConflictError("That prune plan has changed. Look at the new plan first.")
        if self._world.stopped:
            raise ConflictError("Everything is stopped. Resume first.")
        self._require_step_up(
            step_up, "Pruning removes backup snapshots for good; it needs your passkey."
        )
        frees = ops.prune_plan.frees
        ops.prune_plan = None
        ops.last_prune = f"Last prune just now · freed {frees}"
        self._world.bus.changed("backups")
        return PruneDone(message=f"Pruned. {frees} freed; everything retention keeps is untouched.")
