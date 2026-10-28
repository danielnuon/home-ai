"""Live tasks and stepping in, the Work board and the Directory."""

from fastapi import APIRouter

from control_center.contract.work import (
    Directory,
    EmployeeToggle,
    Intervention,
    LiveTask,
    ProposalDecision,
    TaskDetail,
    WorkBoard,
)
from control_center.routes import BackendsDep, StepUp

router = APIRouter()


@router.get("/live")
def live_tasks(backends: BackendsDep) -> list[LiveTask]:
    """Running and queued tasks."""
    return backends.engine.live_tasks()


@router.get("/live/{task_id}")
def task_detail(task_id: str, backends: BackendsDep) -> TaskDetail:
    """One task's stage rail and transcript."""
    return backends.engine.task_detail(task_id)


@router.post("/live/{task_id}/interventions")
def intervene(task_id: str, body: Intervention, backends: BackendsDep) -> TaskDetail:
    """Note, pause, resume, redirect or stop a task: an Owner command to the engine."""
    return backends.engine.intervene(task_id, body)


@router.get("/work")
def work_board(backends: BackendsDep) -> WorkBoard:
    """Work items, ideas and reviews."""
    return backends.engine.work_board()


@router.get("/directory")
def directory(backends: BackendsDep) -> Directory:
    """Employees and lifecycle proposals."""
    return backends.engine.directory()


@router.put("/directory/{employee_id}/enabled", status_code=204)
def set_employee_enabled(
    employee_id: str, body: EmployeeToggle, backends: BackendsDep, step_up: StepUp = None
) -> None:
    """Enable or disable an employee. This is a setting, so it goes to the gate."""
    backends.gate.set_employee_enabled(employee_id, body.enabled, step_up)


@router.post("/proposals/{proposal_id}/decision", status_code=204)
def decide_proposal(proposal_id: str, body: ProposalDecision, backends: BackendsDep) -> None:
    """Approve or decline a lifecycle proposal."""
    backends.gate.decide_proposal(proposal_id, body)
