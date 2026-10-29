"""The tightening and loosening rule (spec 7.4; 7.16, rule 3), pinned case by case."""

import pytest

from control_center.backends.errors import RefusedError
from control_center.backends.mock.setting_rules import is_loosening, is_trust_loosening, validate
from control_center.contract.gate import Setting


def setting(**overrides: object) -> Setting:
    """Build a setting with test defaults, overridden by `overrides`."""
    fields: dict[str, object] = {
        "key": "k",
        "label": "Thing",
        "note": "",
        "category": "Test",
        "kind": "switch",
        "value": "off",
        "default": "off",
        "owner_page": "settings",
    }
    fields.update(overrides)
    return Setting.model_validate(fields)


@pytest.mark.parametrize(
    ("on_is_loosening", "current", "new", "loosens"),
    [
        (True, "off", "on", True),  # turning on a paid feature
        (True, "on", "off", False),
        (False, "on", "off", True),  # turning off a safeguard such as the heartbeat
        (False, "off", "on", False),
    ],
)
def test_switch_direction_follows_on_is_loosening(
    on_is_loosening: bool, current: str, new: str, loosens: bool
) -> None:
    """Spec 7.4: whether "on" loosens depends on the switch (a paid feature versus a safeguard)."""
    assert is_loosening(setting(on_is_loosening=on_is_loosening, value=current), new) is loosens


def test_level_is_ordered_tight_to_loose() -> None:
    """Spec 7.4: moving a level toward "full" loosens; toward "off" tightens."""
    level = setting(kind="level", value="summary", choices=["off", "summary", "full"])
    assert is_loosening(level, "full")
    assert not is_loosening(level, "off")


def test_raising_a_cap_loosens_and_lowering_does_not() -> None:
    """Spec 7.4: raising a spending cap loosens; lowering it tightens."""
    cap = setting(kind="money", value="10", ceiling=20)
    assert is_loosening(cap, "15")
    assert not is_loosening(cap, "5")


def test_a_free_choice_never_needs_a_step_up() -> None:
    """Spec 7.4: a choice with no safety direction never needs a step-up."""
    assert not is_loosening(setting(kind="choice", value="a", choices=["a", "b"]), "b")


@pytest.mark.parametrize(
    ("overrides", "value"),
    [
        ({"kind": "money", "value": "0", "ceiling": 20}, "21"),  # past the policy.yaml ceiling
        ({"kind": "money", "value": "0", "ceiling": 20}, "-1"),
        ({"kind": "money", "value": "0", "ceiling": 20}, "²"),  # a digit to isdigit(), not int()
        ({"kind": "switch"}, "maybe"),
        ({"kind": "choice", "value": "a", "choices": ["a", "b"]}, "c"),
    ],
)
def test_invalid_or_over_limit_values_are_refused(overrides: dict[str, object], value: str) -> None:
    """Spec 7.9: invalid values and values past a hard limit are refused."""
    with pytest.raises(RefusedError):
        validate(setting(**overrides), value)


def test_more_trust_is_loosening() -> None:
    """Spec 7.4: raising a contact's trust loosens; lowering it tightens."""
    assert is_trust_loosening("known", "allowlisted")
    assert not is_trust_loosening("allowlisted", "blocked")
