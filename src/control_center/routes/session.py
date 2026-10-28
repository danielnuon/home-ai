"""Session, passkey step-up, global platform state, the kill switch and the event stream."""

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Cookie, Header, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from control_center.contract.gate import PlatformState, StepUpProof
from control_center.events import EventBus
from control_center.routes import BackendsDep, StepUp
from control_center.security import SESSION_COOKIE, SessionStore

router = APIRouter()

KEEPALIVE_SECONDS = 15
"""A comment line this often keeps proxies from closing an idle event stream."""


class SessionInfo(BaseModel):
    """The CSRF token the front end sends with every state-changing request."""

    csrf_token: str


class StepUpChallenge(BaseModel):
    """A challenge for the passkey to sign."""

    challenge: str


class StepUpAssertion(BaseModel):
    """The authenticator's answer to a challenge."""

    challenge: str
    assertion: str


@router.get("/session")
def open_session(
    request: Request,
    response: Response,
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> SessionInfo:
    """Start or continue a session and return its CSRF token."""
    store: SessionStore = request.app.state.sessions
    session_id, csrf = store.open(session)
    secure = request.url.scheme == "https"
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="strict", secure=secure)
    return SessionInfo(csrf_token=csrf)


@router.post("/step-up/challenge")
def step_up_challenge(backends: BackendsDep) -> StepUpChallenge:
    """Ask the gate for a passkey challenge."""
    return StepUpChallenge(challenge=backends.gate.create_step_up_challenge())


@router.post("/step-up/verify")
def step_up_verify(body: StepUpAssertion, backends: BackendsDep) -> StepUpProof:
    """Hand the assertion to the gate, which verifies it and returns a single-use proof."""
    return backends.gate.verify_step_up(body.challenge, body.assertion)


@router.get("/platform")
def platform_state(backends: BackendsDep) -> PlatformState:
    """Global banners and navigation badges."""
    return backends.gate.platform_state()


@router.post("/platform/stop")
def stop_all(backends: BackendsDep) -> PlatformState:
    """Kill switch. One tap, never gated: stopping is always the safe direction."""
    return backends.gate.stop_all()


@router.post("/platform/resume")
def resume_all(backends: BackendsDep, step_up: StepUp = None) -> PlatformState:
    """Resume after a stop; the gate asks for a step-up."""
    return backends.gate.resume_all(step_up)


@router.get("/events")
async def events(
    backends: BackendsDep,
    after: Annotated[int | None, Query()] = None,
    last_event_id: Annotated[int | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    """Server-sent events, replayed from `Last-Event-ID` or `?after=` (spec 7.13).

    The browser sends `Last-Event-ID` on its own reconnects; the front end passes `after` when it
    reopens the stream itself, for example when the app returns from the background.
    """
    start = last_event_id if last_event_id is not None else after
    return StreamingResponse(
        _frames(backends.bus, backends.bus.last_id if start is None else start),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


async def _frames(bus: EventBus, start: int) -> AsyncIterator[str]:
    """Yield SSE frames, with a keepalive comment whenever the bus is quiet."""
    yield "retry: 2000\n\n"
    stream = bus.subscribe(start)
    pending = asyncio.ensure_future(stream.__anext__())
    try:
        while True:
            done, _ = await asyncio.wait({pending}, timeout=KEEPALIVE_SECONDS)
            if not done:
                yield ": keepalive\n\n"
                continue
            yield pending.result().to_sse()
            pending = asyncio.ensure_future(stream.__anext__())
    finally:
        pending.cancel()
        await stream.aclose()
