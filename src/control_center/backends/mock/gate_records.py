"""The mock gate's Setup secret form (spec 24.5): a secret is saved only with a step-up.

Typing a provider token or app password connects an account, which loosens what the platform can
reach, so it takes a passkey (spec 7.16, rule 3). The value goes to the Keychain and never comes
back: the step only records that the field is saved. The mock keeps no value at all.
"""

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.fixtures import records
from control_center.backends.mock.gate_step_up import StepUpDesk
from control_center.contract.personal import SetupStep


class SetupSecrets(StepUpDesk):
    """The secret form part of `ApprovalGate`."""

    def save_setup_secret(
        self, step_id: str, field_id: str, value: str, step_up: str | None
    ) -> SetupStep:
        """Save one secret a Setup step needs. Once its last secret is saved, the step is done.

        Args:
            step_id: The Setup step.
            field_id: Which of its secrets.
            value: The secret. It is never stored by the mock or sent back.
            step_up: A proof from `verify_step_up`; always needed.

        Returns:
            The step, with the field marked saved.

        Raises:
            NotFoundError: No such step or field.
            ConflictError: The step is waiting, or the value is too short to be whole.
        """  # noqa: DOC503 StepUpRequiredError is raised by self._require_step_up()
        step = self._world.setup.get(step_id)
        field = next((f for f in step.secrets if f.id == field_id), None) if step else None
        if step is None or field is None:
            raise NotFoundError("That secret isn't part of this step.")
        if step.state == "waiting":
            raise ConflictError(f"This step is waiting: {step.waiting_on}.")
        if len(value.strip()) < records.SECRET_MIN_LENGTH:
            raise ConflictError("That looks too short. Paste the whole value.")
        self._require_step_up(
            step_up, "Saving a secret connects an account, so it needs your passkey."
        )
        field.saved = True
        if all(f.saved for f in step.secrets):
            step.state = "done"
            step.proof = records.SECRET_PROOFS[step_id]
        self._world.bus.changed("setup", "today", "platform")
        return step
