"""Live sessions and stepping in, threads, the Work board and the Directory."""

from fastapi import APIRouter

from control_center.contract.work import (
    Directory,
    EmployeeToggle,
    Idea,
    IdeaDraft,
    Intervention,
    LifecycleProposal,
    LiveTask,
    PausedChange,
    PriorityChange,
    ProposalDecision,
    RoleSuggestion,
    TaskDetail,
    Thread,
    ThreadMove,
    WorkBoard,
    WorkItem,
    WorkItemDetail,
)
from control_center.routes import BackendsDep, StepUp

router = APIRouter()


@router.get("/live")
def live_tasks(backends: BackendsDep) -> list[LiveTask]:
    """Every open session with its state."""
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
    """Threads, work items, ideas and reviews."""
    return backends.engine.work_board()


@router.post("/threads/{thread_id}/resolve")
def resolve_thread(thread_id: str, backends: BackendsDep) -> Thread:
    """Resolve a thread: an Owner command, one tap, undone by reopening (spec 15.8.10)."""
    return backends.engine.resolve_thread(thread_id)


@router.post("/threads/{thread_id}/reopen")
def reopen_thread(thread_id: str, backends: BackendsDep) -> Thread:
    """Reopen a resolved thread."""
    return backends.engine.reopen_thread(thread_id)


@router.post("/threads/{thread_id}/move")
def move_thread(thread_id: str, body: ThreadMove, backends: BackendsDep) -> Thread:
    """Move a misrouted thread to another lead: an Owner command, undone by moving it back."""
    return backends.engine.move_thread(thread_id, body.lead_id)


@router.post("/ideas")
def submit_idea(body: IdeaDraft, backends: BackendsDep) -> Idea:
    """Capture a new idea for the Ideation Lead."""
    return backends.engine.submit_idea(body)


@router.put("/ideas/{idea_id}")
def edit_idea(idea_id: str, body: IdeaDraft, backends: BackendsDep) -> Idea:
    """Change an idea's title or description."""
    return backends.engine.edit_idea(idea_id, body)


@router.post("/ideas/{idea_id}/withdraw")
def withdraw_idea(idea_id: str, backends: BackendsDep) -> Idea:
    """Withdraw an idea, undone by reopening it."""
    return backends.engine.withdraw_idea(idea_id)


@router.post("/ideas/{idea_id}/reopen")
def reopen_idea(idea_id: str, backends: BackendsDep) -> Idea:
    """Reopen a withdrawn idea."""
    return backends.engine.reopen_idea(idea_id)


@router.put("/ideas/{idea_id}/paused")
def set_idea_paused(idea_id: str, body: PausedChange, backends: BackendsDep) -> Idea:
    """Pause or resume an idea: an Owner command."""
    return backends.engine.set_idea_paused(idea_id, body.paused)


@router.put("/ideas/{idea_id}/priority")
def set_idea_priority(idea_id: str, body: PriorityChange, backends: BackendsDep) -> Idea:
    """Change an idea's priority."""
    return backends.engine.set_idea_priority(idea_id, body.priority)


@router.get("/work-items/{item_id}")
def item_detail(item_id: str, backends: BackendsDep) -> WorkItemDetail:
    """One work item's page."""
    return backends.engine.item_detail(item_id)


@router.put("/work-items/{item_id}/paused")
def set_item_paused(item_id: str, body: PausedChange, backends: BackendsDep) -> WorkItem:
    """Pause or resume a work item: an Owner command."""
    return backends.engine.set_item_paused(item_id, body.paused)


@router.put("/work-items/{item_id}/priority")
def set_item_priority(item_id: str, body: PriorityChange, backends: BackendsDep) -> WorkItem:
    """Change a work item's priority."""
    return backends.engine.set_item_priority(item_id, body.priority)


@router.post("/products/{product_id}/retire")
def retire_product(product_id: str, backends: BackendsDep) -> WorkItem:
    """Ask Foreman to retire a product: opens its retirement work item and approval card."""
    return backends.engine.retire_product(product_id)


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


@router.post("/directory/role-suggestions")
def suggest_role(body: RoleSuggestion, backends: BackendsDep) -> LifecycleProposal:
    """Suggest a new role; it becomes a lifecycle proposal."""
    return backends.engine.suggest_role(body)


@router.post("/proposals/{proposal_id}/decision", status_code=204)
def decide_proposal(proposal_id: str, body: ProposalDecision, backends: BackendsDep) -> None:
    """Approve or decline a lifecycle proposal."""
    backends.gate.decide_proposal(proposal_id, body)
