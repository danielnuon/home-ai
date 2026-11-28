"""Approvals, decisions, settings and gated controls, all forwarded to the gate."""

from fastapi import APIRouter
from pydantic import BaseModel

from control_center.contract.gate import (
    Approval,
    ApprovalDecision,
    BatchToggle,
    CriticalDecision,
    DraftEdit,
    Setting,
    SettingsIndex,
    SettingUpdate,
    VetoRequest,
)
from control_center.routes import BackendsDep, StepUp

router = APIRouter()


class RestoreRequest(BaseModel):
    """What to restore and from when. It always lands in a side folder (spec 7.2, Backups)."""

    what: str
    point: str


class RestoreAccepted(BaseModel):
    """Where the restored copy will appear."""

    message: str


@router.get("/approvals")
def list_approvals(backends: BackendsDep) -> list[Approval]:
    """Every approval card, pending first."""
    return backends.gate.list_approvals()


@router.post("/approvals/{approval_id}/decision")
def decide(
    approval_id: str, body: ApprovalDecision, backends: BackendsDep, step_up: StepUp = None
) -> Approval:
    """Approve or deny one card."""
    return backends.gate.decide(approval_id, body, step_up)


@router.post("/approvals/{approval_id}/undo")
def undo_decision(approval_id: str, backends: BackendsDep) -> Approval:
    """Take back a decision while the gate is holding its action."""
    return backends.gate.undo_decision(approval_id)


@router.put("/approvals/{approval_id}/draft")
def edit_draft(approval_id: str, body: DraftEdit, backends: BackendsDep) -> Approval:
    """Replace a pending card's draft with the Owner's wording."""
    return backends.gate.edit_draft(approval_id, body)


@router.put("/approvals/{approval_id}/batch/{message_id}")
def toggle_batch_message(
    approval_id: str, message_id: str, body: BatchToggle, backends: BackendsDep
) -> Approval:
    """Tick or untick one message of a batch card."""
    return backends.gate.toggle_batch_message(approval_id, message_id, body)


@router.post("/approvals/{approval_id}/allow-recipient")
def allow_recipient(approval_id: str, backends: BackendsDep, step_up: StepUp = None) -> Approval:
    """Allowlist the card's recipient from the card ("Always allow this contact")."""
    return backends.gate.allow_recipient(approval_id, step_up)


@router.get("/decisions")
def list_decisions(backends: BackendsDep) -> list[CriticalDecision]:
    """Every critical decision record, open ones first."""
    return backends.gate.list_decisions()


@router.post("/decisions/{decision_id}/acknowledge")
def acknowledge(decision_id: str, backends: BackendsDep) -> CriticalDecision:
    """Acknowledge an open decision."""
    return backends.gate.acknowledge(decision_id)


@router.post("/decisions/{decision_id}/veto")
def veto(decision_id: str, body: VetoRequest, backends: BackendsDep) -> CriticalDecision:
    """Veto a decision, with an optional reason for the team."""
    return backends.gate.veto(decision_id, body.reason)


@router.post("/decisions/{decision_id}/reopen")
def reopen(decision_id: str, backends: BackendsDep) -> CriticalDecision:
    """Undo an acknowledgement or veto while the window is open."""
    return backends.gate.reopen(decision_id)


@router.get("/settings")
def settings(backends: BackendsDep) -> SettingsIndex:
    """Every setting and the hard limits."""
    return backends.gate.settings()


@router.put("/settings/{key}")
def change_setting(
    key: str, body: SettingUpdate, backends: BackendsDep, step_up: StepUp = None
) -> Setting:
    """Change one setting; the gate decides whether it needs a step-up."""
    return backends.gate.change_setting(key, body.value, step_up)


@router.post("/settings/{key}/revert")
def revert_setting(key: str, backends: BackendsDep, step_up: StepUp = None) -> Setting:
    """Return a setting to its previous value."""
    return backends.gate.revert_setting(key, step_up)


@router.post("/services/{service_id}/restart", status_code=204)
def restart_service(service_id: str, backends: BackendsDep, step_up: StepUp = None) -> None:
    """Restart a service through a signed control record."""
    backends.gate.restart_service(service_id, step_up)


@router.post("/backups/restore")
def restore(body: RestoreRequest, backends: BackendsDep, step_up: StepUp = None) -> RestoreAccepted:
    """Restore into a side folder, never over the original."""
    return RestoreAccepted(message=backends.gate.request_restore(body.what, body.point, step_up))
