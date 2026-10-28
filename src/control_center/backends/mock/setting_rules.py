"""How a settings change is classified and checked: the rule of spec 7.4 and 7.16 (rule 3).

Tightening (less exposure, less spend, less automation) takes one tap. Loosening needs a step-up.
A value past a hard limit is refused outright, whatever proof comes with it.

The real gate implements the same rules; they live here, separate from the mock's state, so the
tests can pin them down exactly and the real gate can be checked against the same cases.
"""

from control_center.backends.errors import RefusedError
from control_center.contract.common import Trust
from control_center.contract.gate import Setting

TRUST_ORDER: list[Trust] = ["blocked", "unknown", "known", "allowlisted"]
"""Contact trust from tightest to loosest. Moving right is loosening (spec 7.16, rule 10)."""


def validate(setting: Setting, value: str) -> None:
    """Refuse a value the setting cannot take, or one past its hard limit.

    Args:
        setting: The setting being changed.
        value: The new value.

    Raises:
        RefusedError: The value is not one of the setting's values, is not a whole number of
            dollars, or is above the ceiling in `policy.yaml`.
    """
    if setting.kind == "switch" and value not in ("on", "off"):
        raise RefusedError(f"{setting.label} is a switch: use on or off.")
    if setting.kind in ("level", "choice") and value not in setting.choices:
        raise RefusedError(f"{value} is not one of the choices for {setting.label}.")
    if setting.kind == "money":
        if not value.isdigit():
            raise RefusedError("A cap is a whole number of dollars.")
        if setting.ceiling is not None and int(value) > setting.ceiling:
            raise RefusedError(
                f"${value} is above the hard limit of ${setting.ceiling} a month, which only "
                "changes at the desk."
            )


def is_loosening(setting: Setting, value: str) -> bool:
    """Whether changing `setting` to `value` loosens it and therefore needs a step-up.

    Assumes `value` already passed `validate`.
    """
    current = setting.value
    if setting.kind == "switch":
        turning_on = current == "off" and value == "on"
        turning_off = current == "on" and value == "off"
        return turning_on if setting.on_is_loosening else turning_off
    if setting.kind == "level":
        return setting.choices.index(value) > setting.choices.index(current)
    if setting.kind == "money":
        return int(value) > int(current)
    # A free choice, such as the call voice, is equally safe at any value.
    return False


def is_trust_loosening(current: Trust, new: Trust) -> bool:
    """Whether a trust change gives a contact more trust than it had."""
    return TRUST_ORDER.index(new) > TRUST_ORDER.index(current)
