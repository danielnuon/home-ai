"""The platform pages: System, Services, Models, Spend, Schedule, Security and the rest."""

from fastapi import APIRouter

from control_center.contract.status import (
    BackupsOverview,
    ConnectionsOverview,
    DocsOverview,
    JobToggle,
    MaintenanceOverview,
    MaintenanceToggle,
    ModelsOverview,
    ScheduleOverview,
    SecurityOverview,
    ServicesOverview,
    SpendOverview,
    SystemOverview,
    VoiceOverview,
)
from control_center.routes import BackendsDep

router = APIRouter()


@router.get("/system")
def system(backends: BackendsDep) -> SystemOverview:
    """Machine and memory."""
    return backends.status.system()


@router.get("/services")
def services(backends: BackendsDep) -> ServicesOverview:
    """Every service."""
    return backends.status.services()


@router.get("/models")
def models(backends: BackendsDep) -> ModelsOverview:
    """Model assignments and the reviewer preview."""
    return backends.status.models()


@router.get("/spend")
def spend(backends: BackendsDep) -> SpendOverview:
    """The ledger and the paid features."""
    return backends.status.spend()


@router.get("/schedule")
def schedule(backends: BackendsDep) -> ScheduleOverview:
    """Jobs and quiet hours."""
    return backends.engine.schedule()


@router.put("/schedule/{job_id}/paused")
def set_job_paused(job_id: str, body: JobToggle, backends: BackendsDep) -> ScheduleOverview:
    """Pause or resume a job."""
    return backends.engine.set_job_paused(job_id, body.paused)


@router.post("/schedule/{job_id}/run")
def run_job(job_id: str, backends: BackendsDep) -> ScheduleOverview:
    """Run a job now."""
    return backends.engine.run_job(job_id)


@router.get("/security")
def security(backends: BackendsDep) -> SecurityOverview:
    """Kill switch, flags and the audit log."""
    return backends.status.security()


@router.get("/backups")
def backups(backends: BackendsDep) -> BackupsOverview:
    """Backup mode, targets and drills."""
    return backends.status.backups()


@router.get("/maintenance")
def maintenance(backends: BackendsDep) -> MaintenanceOverview:
    """Pipeline C."""
    return backends.engine.maintenance()


@router.put("/maintenance/running")
def set_maintenance_running(body: MaintenanceToggle, backends: BackendsDep) -> MaintenanceOverview:
    """Pause or resume Pipeline C."""
    return backends.engine.set_maintenance_running(body.running)


@router.post("/maintenance/fixes/{fix_id}/revert")
def toggle_fix_reverted(fix_id: str, backends: BackendsDep) -> MaintenanceOverview:
    """Revert a fix, or undo the revert."""
    return backends.engine.toggle_fix_reverted(fix_id)


@router.get("/connections")
def connections(backends: BackendsDep) -> ConnectionsOverview:
    """Accounts and providers."""
    return backends.status.connections()


@router.get("/voice")
def voice(backends: BackendsDep) -> VoiceOverview:
    """Voice profiles."""
    return backends.status.voice()


@router.get("/docs")
def docs(backends: BackendsDep) -> DocsOverview:
    """Documentation by area."""
    return backends.engine.docs()
