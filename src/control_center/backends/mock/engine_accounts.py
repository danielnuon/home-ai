"""The mock engine's what-if answers: impact previews and predicted versus actual (spec 7.18).

The real simulator replays 14 days of the task log against the proposed settings. The mock reads
the same impact cards the pages already show, so a setting's card is identical wherever it
appears. A card shows before a change that adds cost, load or exposure (turning a feature on,
raising a cap) and before any change to a model limit, which moves speed either way. Turning
something off or lowering a cap is tightening, which takes effect at once (7.16, rule 3), so it has
no card to read first.
"""

from control_center.backends.errors import NotFoundError
from control_center.backends.mock import setting_rules
from control_center.backends.mock.fixtures import accounts, platform
from control_center.backends.mock.world import MockWorld
from control_center.contract.accounts import PredictionOutcome, SettingImpact, SettingOutcomes
from control_center.contract.gate import Setting
from control_center.contract.status import ImpactLine

TOKEN_PREFIX = "models.tokens."


def impact_lines(world: MockWorld, setting: Setting, value: str) -> list[ImpactLine]:
    """The impact card for changing `setting` to `value`; empty when the change moves nothing.

    Args:
        world: The mock world, for the paid features' caps.
        setting: The setting.
        value: The proposed value, already valid.

    Returns:
        The card's lines.
    """
    if value == setting.value:
        return []
    if setting.key.startswith(TOKEN_PREFIX):
        return platform.tokens_panel().cap_impact
    if setting.kind == "money":
        if int(value) <= int(setting.value):
            return []
        return [
            ImpactLine(
                name="Most this can spend a month",
                change=f"${setting.value} → ${value}",
                source="measured",
            ),
            ImpactLine(
                name="Spend forecast this month",
                change=f"$0 → up to ${value}",
                source="simulated",
            ),
        ]
    return _choice_lines(world, setting, value)


def _choice_lines(world: MockWorld, setting: Setting, value: str) -> list[ImpactLine]:
    """The card for a switch or choice: turning something on, or raising maintenance to fix."""
    if value == "on" and (setting.kind == "switch" or setting.choices == ["off", "on"]):
        return _switch_on_lines(world, setting.key)
    if setting.key.startswith("maintenance.") and value == "fix":
        return accounts.EXTRA_IMPACTS[accounts.MAINTENANCE_FIX]
    return []


def _switch_on_lines(world: MockWorld, key: str) -> list[ImpactLine]:
    """The card for turning a switch on: the reviewer, a paid feature, or one of the others."""
    if key == "models.review.independent":
        return platform.reviewer_impact()
    for _, _, _, switch_key, cap_key in platform.PAID_FEATURES:
        if switch_key == key:
            return platform.cloud_impact(world.settings[cap_key].ceiling or 0)
    return accounts.EXTRA_IMPACTS.get(key, [])


class ImpactDesk:
    """The what-if half of `PipelineEngine`, mixed into `MockPipelineEngine`."""

    _world: MockWorld

    def _setting(self, key: str) -> Setting:
        found = self._world.settings.get(key)
        if found is None:
            raise NotFoundError(f"There is no setting called {key}.")
        return found

    def setting_impact(self, key: str, value: str) -> SettingImpact:
        """What changing a setting would do, before it is applied (spec 7.18). Read-only.

        Args:
            key: The setting.
            value: The proposed value.

        Returns:
            The card's lines, empty when nothing moves.
        """  # noqa: DOC503 NotFoundError comes from self._setting(); RefusedError from validate()
        setting = self._setting(key)
        setting_rules.validate(setting, value)
        return SettingImpact(key=key, value=value, lines=impact_lines(self._world, setting, value))

    def setting_outcomes(self, key: str) -> SettingOutcomes:
        """Predicted versus actual for the latest change of a setting with a recorded prediction.

        Args:
            key: The setting.

        Returns:
            The outcomes, newest first; empty when nothing was predicted.
        """  # noqa: DOC503 NotFoundError comes from self._setting()
        setting = self._setting(key)
        lines = accounts.OUTCOMES.get(key)
        if not lines or not setting.history:
            return SettingOutcomes(key=key, outcomes=[])
        change = setting.history[0]
        due = change.at + accounts.OUTCOME_AFTER
        ready = due <= self._world.clock()
        shown = lines if ready else [line.model_copy(update={"actual": None}) for line in lines]
        note = (
            "Measured over the 7 days after the change"
            if ready
            else "Checked 7 days after the change"
        )
        return SettingOutcomes(
            key=key,
            outcomes=[
                PredictionOutcome(
                    at=change.at,
                    change=f"{change.old} → {change.new}",
                    ready=ready,
                    note=note,
                    lines=shown,
                )
            ],
        )
