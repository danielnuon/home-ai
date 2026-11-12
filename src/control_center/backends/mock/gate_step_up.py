"""The mock gate's passkey step-up, shared by every part of the gate that gates an action.

It accepts the mock virtual authenticator's assertions instead of WebAuthn ones, and it does not
hash or sign anything.
"""

import secrets
from datetime import timedelta

from control_center.backends.errors import StepUpRequiredError
from control_center.backends.mock.world import MockWorld
from control_center.contract.gate import StepUpProof

STEP_UP_LIFETIME = timedelta(minutes=2)
"""How long a step-up proof stays usable. Each proof is single-use as well."""

MOCK_ASSERTION_PREFIX = "virtual:"
"""The mock virtual authenticator answers a challenge with this prefix plus the challenge."""


class StepUpDesk:
    """Issues and consumes step-up proofs. The base of every part of the mock gate."""

    def __init__(self, world: MockWorld) -> None:
        """Use `world` for state and its bus for events."""
        self._world = world

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
