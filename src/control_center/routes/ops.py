"""The operations controls on System, Models, Services, Schedule, Backups and Maintenance.

Pool mode, health checks, pins, selection, logs, job times, drills, prune plans, findings and
the metric catalog (spec 7.2, 7.18).
"""

from fastapi import APIRouter

from control_center.contract.status import (
    BackupsOverview,
    FamilyPin,
    Finding,
    JobTime,
    MetricCatalog,
    ModelsOverview,
    PoolModeChange,
    PruneDone,
    PruneRequest,
    ScheduleOverview,
    ServiceLog,
    SystemOverview,
    WontFix,
)
from control_center.routes import BackendsDep, StepUp

router = APIRouter()


@router.put("/system/pool-mode")
def set_pool_mode(body: PoolModeChange, backends: BackendsDep) -> SystemOverview:
    """Put the model pool in another mode."""
    backends.engine.set_pool_mode(body.mode)
    return backends.status.system()


@router.post("/system/pool-mode/end")
def end_pool_mode(backends: BackendsDep) -> SystemOverview:
    """End image or video mode."""
    backends.engine.end_pool_mode()
    return backends.status.system()


@router.post("/system/health-check")
def run_health_check(backends: BackendsDep) -> SystemOverview:
    """Run a health check now."""
    backends.engine.run_health_check()
    return backends.status.system()


@router.post("/system/pressure-drill")
def pressure_drill(backends: BackendsDep) -> SystemOverview:
    """Step memory pressure to its next level, as a drill."""
    backends.engine.pressure_drill()
    return backends.status.system()


@router.put("/models/families/{family}/pin")
def pin_family(family: str, body: FamilyPin, backends: BackendsDep) -> ModelsOverview:
    """Pin or unpin a family's model."""
    backends.engine.pin_family(family, body.pinned)
    return backends.status.models()


@router.post("/models/selection")
def run_selection(backends: BackendsDep) -> ModelsOverview:
    """Queue a selection run."""
    backends.engine.run_selection()
    return backends.status.models()


@router.get("/services/{service_id}/logs")
def service_log(service_id: str, backends: BackendsDep) -> ServiceLog:
    """A service's full masked log."""
    return backends.engine.service_log(service_id)


@router.put("/schedule/{job_id}/time")
def set_job_time(job_id: str, body: JobTime, backends: BackendsDep) -> ScheduleOverview:
    """Move a job to another start time."""
    return backends.engine.set_job_time(job_id, body.time)


@router.post("/backups/drill")
def run_restore_drill(backends: BackendsDep) -> BackupsOverview:
    """Run a restore drill now."""
    backends.engine.run_restore_drill()
    return backends.status.backups()


@router.post("/backups/prune-plan")
def make_prune_plan(backends: BackendsDep) -> BackupsOverview:
    """Work out a prune plan."""
    backends.engine.make_prune_plan()
    return backends.status.backups()


@router.post("/backups/prune-plan/discard")
def discard_prune_plan(backends: BackendsDep) -> BackupsOverview:
    """Put the prune plan away."""
    backends.engine.discard_prune_plan()
    return backends.status.backups()


@router.post("/backups/prune")
def run_prune(body: PruneRequest, backends: BackendsDep, step_up: StepUp = None) -> PruneDone:
    """Run the prune plan, behind a step-up."""
    return backends.gate.run_prune(body.plan_id, step_up)


@router.post("/maintenance/findings/{finding_id}/wont-fix")
def wont_fix(finding_id: str, body: WontFix, backends: BackendsDep) -> Finding:
    """Mark a finding won't-fix with a reason."""
    return backends.engine.wont_fix(finding_id, body.reason)


@router.post("/maintenance/findings/{finding_id}/reopen")
def reopen_finding(finding_id: str, backends: BackendsDep) -> Finding:
    """Reopen a won't-fix finding."""
    return backends.engine.reopen_finding(finding_id)


@router.get("/metrics")
def metrics(backends: BackendsDep, page: str = "settings") -> MetricCatalog:
    """The metric catalog with 7- and 30-day trends."""
    return backends.engine.metrics(page)
