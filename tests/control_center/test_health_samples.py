"""The mock health figures move with each sample (decision 129), the same way the preview's do."""

from control_center.backends.mock.fixtures import platform
from control_center.contract.common import Metric


def _first_token(samples: int) -> Metric:
    return next(m for m in platform.health_metrics(samples) if m.name == "Chat first token p95")


def test_before_any_sample_the_figures_are_the_fixture() -> None:
    """With no sample taken, the tile shows the fixture as written."""
    assert _first_token(0).value == "1.4 s"
    assert _first_token(0).spark == [12, 10, 13, 9, 11, 8, 9]


def test_each_sample_reads_the_next_value_and_rolls_the_sparkline_on() -> None:
    """Each sample shows the next reading and drops the oldest sparkline point."""
    assert _first_token(1).value == "1.3 s"
    assert _first_token(1).spark == [10, 13, 9, 11, 8, 9, 10]
    assert _first_token(9).value == "1.2 s"
    assert _first_token(9).spark == [9, 11, 13, 10, 10, 12, 9]
