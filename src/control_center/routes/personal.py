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
from control_center.contract.today import (
    ChatEdit,
    ChatLearning,
    ChatSend,
    ChatThread,
    SearchResults,
    TodayOverview,
)
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
def chat_thread(lead_id: str, backends: BackendsDep, thread: str | None = None) -> ChatThread:
    """Chat with a lead: its threads, and the messages of `thread` (none for a new chat)."""
    return backends.chat.thread(lead_id, thread)


@router.post("/chat/{lead_id}")
async def chat_send(lead_id: str, body: ChatSend, backends: BackendsDep) -> ChatThread:
    """Send a message. Async because the mock chat streams its reply on the event loop."""
    return backends.chat.send(lead_id, body.text, body.thread_id, body.temporary)


@router.post("/chat/{lead_id}/{thread_id}/keep")
def chat_keep(lead_id: str, thread_id: str, backends: BackendsDep) -> ChatThread:
    """Keep a temporary chat: it becomes a normal thread (spec 15.9.6)."""
    return backends.chat.keep(lead_id, thread_id)


@router.put("/chat/{lead_id}/{thread_id}/learning")
def chat_learning(
    lead_id: str, thread_id: str, body: ChatLearning, backends: BackendsDep
) -> ChatThread:
    """Turn "Don't learn from this chat" off or on (spec 15.9.6)."""
    return backends.chat.set_learning(lead_id, thread_id, body.learning)


@router.post("/chat/{lead_id}/{thread_id}/stop")
async def chat_stop(lead_id: str, thread_id: str, backends: BackendsDep) -> ChatThread:
    """Stop the reply being written (spec 15.9.8)."""
    return backends.chat.stop(lead_id, thread_id)


@router.post("/chat/{lead_id}/{thread_id}/messages/{message_id}/edit")
async def chat_edit(
    lead_id: str, thread_id: str, message_id: str, body: ChatEdit, backends: BackendsDep
) -> ChatThread:
    """Re-run the turn from an edited message, as a new branch."""
    return backends.chat.edit(lead_id, thread_id, message_id, body.text)


@router.post("/chat/{lead_id}/{thread_id}/messages/{message_id}/regenerate")
async def chat_regenerate(
    lead_id: str, thread_id: str, message_id: str, backends: BackendsDep
) -> ChatThread:
    """Write a reply again, as a new branch."""
    return backends.chat.regenerate(lead_id, thread_id, message_id)


@router.post("/chat/{lead_id}/{thread_id}/messages/{message_id}/switch")
def chat_switch(lead_id: str, thread_id: str, message_id: str, backends: BackendsDep) -> ChatThread:
    """Show the branch that runs through a message."""
    return backends.chat.switch(lead_id, thread_id, message_id)


@router.post("/chat/{lead_id}/{thread_id}/messages/{message_id}/branch")
def chat_branch(lead_id: str, thread_id: str, message_id: str, backends: BackendsDep) -> ChatThread:
    """Start a new conversation thread from the branch on show, up to a message."""
    return backends.chat.branch(lead_id, thread_id, message_id)
