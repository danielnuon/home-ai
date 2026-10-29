"""Who may use Brain and how its pages are protected (spec 7.1 principle 6, 6.2, 25.1).

Three layers, each enforced on every request:

1. Owner identity: `tailscale serve` adds the caller's tailnet login as `Tailscale-User-Login`.
   Brain answers only the Owner's login. Brain listens on 127.0.0.1, so only `tailscale serve` and
   local processes can reach it at all; the per-user firewalling of 5.3 keeps other local users
   out [CHECK on the Mac that no other local account can reach 127.0.0.1:8406].
2. CSRF: every state-changing request carries the session's CSRF token in `X-CSRF-Token`.
3. Content Security Policy: scripts, styles, fonts and connections only from Brain itself, no
   inline scripts, no framing. Hostile text such as email summaries can be displayed but never run.

Passkey step-up is not here: the gate verifies it (spec 7.4), and Brain only carries the proof.
"""

import secrets
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from control_center.config import Config

SESSION_COOKIE = "brain_session"
CSRF_HEADER = "X-CSRF-Token"
IDENTITY_HEADER = "Tailscale-User-Login"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
    ]
)
"""The strict policy of spec 7.6. `img-src data:` admits the SVG avatars drawn in the page."""


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds the Content Security Policy and related headers to every response."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Pass the request on, then set the headers on whatever comes back."""
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=()"
        return response


class SessionStore:
    """Sessions and their CSRF tokens, in memory.

    The spec keeps sessions in `metrics.db`-adjacent storage (23.6) so they survive a restart; in
    memory is enough while every backend is a mock, and a restart only means one extra request.
    """

    def __init__(self) -> None:
        """Start with no sessions."""
        self._csrf_by_session: dict[str, str] = {}

    def open(self, session_id: str | None) -> tuple[str, str]:
        """Return the session id and CSRF token, creating a new session when needed."""
        if session_id and session_id in self._csrf_by_session:
            return session_id, self._csrf_by_session[session_id]
        session_id = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(32)
        self._csrf_by_session[session_id] = csrf
        return session_id, csrf

    def check_csrf(self, session_id: str | None, token: str | None) -> bool:
        """Whether `token` is the CSRF token of a live session."""
        expected = self._csrf_by_session.get(session_id or "")
        if expected is None or token is None:
            return False
        return secrets.compare_digest(expected.encode(), token.encode())


def require_owner(
    request: Request,
    login: Annotated[str | None, Header(alias=IDENTITY_HEADER)] = None,
) -> None:
    """Refuse anyone but the Owner.

    Args:
        request: The incoming request, for the app's configuration.
        login: The caller's tailnet login, set by `tailscale serve`.

    Raises:
        HTTPException: 403 when the login header is missing or belongs to someone else.
    """
    config: Config = request.app.state.config
    if config.dev_identity:
        return
    # Bytes, not str: compare_digest raises on non-ASCII str, which would answer 500, not 403.
    if (
        not login
        or not config.owner_login
        or not secrets.compare_digest(login.encode(), config.owner_login.encode())
    ):
        raise HTTPException(status_code=403, detail="Brain is only for the Owner's devices.")


class SessionExpiredError(Exception):
    """The request's CSRF token belongs to no live session, usually because Brain restarted.

    `app.py` answers it with 403 and the code "session_expired", which the front end treats as a
    cue to open a new session and retry once.
    """

    reason = "Your session expired. Reload Brain."


def require_csrf(
    request: Request,
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    token: Annotated[str | None, Header(alias=CSRF_HEADER)] = None,
) -> None:
    """Refuse a state-changing request without the session's CSRF token.

    Args:
        request: The incoming request, for its method and the session store.
        session: The session id from the `brain_session` cookie.
        token: The CSRF token from the `X-CSRF-Token` header.

    Raises:
        SessionExpiredError: The token is missing or wrong.
    """
    if request.method in SAFE_METHODS:
        return
    store: SessionStore = request.app.state.sessions
    if not store.check_csrf(session, token):
        raise SessionExpiredError


OwnerOnly = Depends(require_owner)
CsrfChecked = Depends(require_csrf)
