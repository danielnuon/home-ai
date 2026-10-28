"""Errors a backend raises, which Brain's routes turn into HTTP answers the front end understands.

Every refusal carries a reason in plain words, because the front end shows it to the Owner
("every error says what to do next", spec 7.16, rule 9).
"""


class BackendError(Exception):
    """Base class. `reason` is shown to the Owner as is."""

    def __init__(self, reason: str) -> None:
        """Store the reason the action was refused."""
        super().__init__(reason)
        self.reason = reason


class NotFoundError(BackendError):
    """The object does not exist, or no longer does."""


class StepUpRequiredError(BackendError):
    """A loosening or restricted action came without a valid passkey proof (spec 7.4).

    The front end asks for the passkey and retries once.
    """


class ConflictError(BackendError):
    """The object is not in a state that allows the action, such as deciding an approval twice."""


class RefusedError(BackendError):
    """The action is beyond a hard limit in `policy.yaml` or otherwise never allowed."""
