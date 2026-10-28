"""Today, personal records, finance, Setup, search and chat."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from control_center.contract.common import Principal
from control_center.contract.personal import (
    Case,
    CaseAction,
    FinanceOverview,
    PersonalOverview,
    SetupAction,
    SetupStep,
)
from control_center.contract.today import ChatSend, ChatThread, SearchResults, TodayOverview
from control_center.routes import BackendsDep
from control_center.today import build_today

router = APIRouter()


@router.get("/today")
def today(backends: BackendsDep) -> TodayOverview:
    """Everything on Today in one response."""
    return build_today(backends, datetime.now(UTC))


@router.get("/personal")
def personal(backends: BackendsDep) -> PersonalOverview:
    """Cases, domains and recent automatic changes."""
    return backends.engine.personal()


@router.post("/cases/{case_id}/action")
def case_action(case_id: str, body: CaseAction, backends: BackendsDep) -> Case:
    """Mark a case done, snooze it or reopen it."""
    return backends.engine.case_action(case_id, body)


@router.post("/changes/{change_id}/undo")
def undo_change(change_id: str, backends: BackendsDep) -> PersonalOverview:
    """Undo an automatic change."""
    return backends.engine.undo_change(change_id)


@router.get("/finance/{principal}")
def finance(principal: Principal, backends: BackendsDep) -> FinanceOverview:
    """Finance for one principal."""
    return backends.engine.finance(principal)


@router.get("/setup")
def setup_steps(backends: BackendsDep) -> list[SetupStep]:
    """Every Setup step."""
    return backends.engine.setup_steps()


@router.post("/setup/{step_id}")
def setup_action(step_id: str, body: SetupAction, backends: BackendsDep) -> SetupStep:
    """Start, defer, resume or redo a step."""
    return backends.engine.setup_action(step_id, body)


@router.get("/search")
def search(backends: BackendsDep, q: Annotated[str, Query(max_length=200)] = "") -> SearchResults:
    """Search everything the Owner can see."""
    return backends.engine.search(q)


@router.get("/chat/{lead_id}")
def chat_thread(lead_id: str, backends: BackendsDep) -> ChatThread:
    """A lead's chat history."""
    return backends.chat.thread(lead_id)


@router.post("/chat/{lead_id}")
async def chat_send(lead_id: str, body: ChatSend, backends: BackendsDep) -> ChatThread:
    """Send a message. Async because the mock relay streams its reply on the event loop."""
    return backends.chat.send(lead_id, body.text)
