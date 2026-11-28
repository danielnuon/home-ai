"""The mutable state behind the operations controls on System, Models, Backups and Maintenance.

It lives in one object on the world (`MockWorld.ops`) so the areas that run side by side add one
field to the shared world rather than many.
"""

from dataclasses import dataclass, field

from control_center.backends.mock.fixtures import operations, ops
from control_center.contract.common import Row, StatusLabel
from control_center.contract.status import (
    Finding,
    HealthCheck,
    PoolMode,
    PressureLevel,
    PrunePlan,
    RestoreDrill,
)


def _findings() -> dict[str, Finding]:
    return {finding.id: finding for finding in ops.findings()}


def _drill() -> RestoreDrill:
    return RestoreDrill(
        status=StatusLabel(status="healthy", label="Passed"),
        detail=f"Oct 4 · {operations.DRILL_DETAIL}",
    )


@dataclass
class OpsState:
    """Pool mode, memory pressure, pins, the selector, drills, prunes and findings."""

    pool_mode: PoolMode = "L"
    pressure: PressureLevel = "normal"
    pins: list[str] = field(default_factory=list)
    selection_queued: bool = False
    health_check: HealthCheck | None = None
    drill: RestoreDrill = field(default_factory=_drill)
    drills: list[Row] = field(default_factory=operations.drill_history)
    prune_plan: PrunePlan | None = None
    last_prune: str = operations.LAST_PRUNE
    findings: dict[str, Finding] = field(default_factory=_findings)
