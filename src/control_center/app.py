"""Builds the FastAPI application: routes, security, error translation, static files and health."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from control_center.backends.errors import (
    BackendError,
    ConflictError,
    NotFoundError,
    RefusedError,
    StepUpRequiredError,
)
from control_center.backends.mock.activity import simulate_activity
from control_center.config import Config
from control_center.routes import gate, personal, session, status, work
from control_center.security import (
    CsrfChecked,
    OwnerOnly,
    SecurityHeadersMiddleware,
    SessionStore,
)
from control_center.wiring import build_mock_backends

VERSION = "0.1.0"

ERROR_STATUS: dict[type[Exception], tuple[int, str]] = {
    NotFoundError: (404, "not_found"),
    StepUpRequiredError: (403, "step_up_required"),
    ConflictError: (409, "conflict"),
    RefusedError: (422, "refused"),
}
"""HTTP status and machine-readable code for each backend error. The front end keys its step-up
prompt on "step_up_required", so that code is part of the API contract."""


class HealthCheck(BaseModel):
    """One named check inside the health answer."""

    name: str
    status: str
    detail: str


class Health(BaseModel):
    """The health contract every platform service answers with (spec 6.2)."""

    status: str
    version: str
    started_at: datetime
    checks: list[HealthCheck]


def create_app(config: Config) -> FastAPI:
    """Assemble Brain for `config`, with mock backends and the activity simulator."""
    backends, world = build_mock_backends()
    started_at = datetime.now(UTC)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        activity = asyncio.create_task(simulate_activity(world))
        yield
        activity.cancel()
        with suppress(asyncio.CancelledError):
            await activity

    app = FastAPI(
        title="Brain",
        version=VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )
    app.state.config = config
    app.state.backends = backends
    app.state.sessions = SessionStore()
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_exception_handler(BackendError, _backend_error)

    api = APIRouter(prefix="/api", dependencies=[OwnerOnly, CsrfChecked])
    for module in (session, gate, work, personal, status):
        api.include_router(module.router)
    app.include_router(api)

    @app.get("/health", include_in_schema=False)
    def health() -> Health:
        return Health(
            status="ok",
            version=VERSION,
            started_at=started_at,
            checks=[HealthCheck(name="backends", status="ok", detail="mock")],
        )

    @app.get("/metrics", include_in_schema=False)
    def metrics() -> dict[str, int]:
        return {"events_published": backends.bus.last_id}

    _serve_front_end(app, config.web_dist)
    return app


async def _backend_error(_: Request, error: Exception) -> JSONResponse:
    """Turn a backend refusal into JSON the front end shows as is."""
    status_code, code = ERROR_STATUS.get(type(error), (400, "error"))
    reason = error.reason if isinstance(error, BackendError) else "Something went wrong."
    return JSONResponse(status_code=status_code, content={"error": code, "reason": reason})


def _serve_front_end(app: FastAPI, dist: Path) -> None:
    """Serve the built single-page app, sending every unknown path to `index.html`.

    Every view has its own URL (spec 7.15, "no dead ends"), so a reload on `/decisions` must
    return the app, not a 404. Missing `dist` is fine in development, where Vite serves the app.
    """
    index = dist / "index.html"
    if not index.exists():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def front_end(path: str) -> FileResponse:
        candidate = (dist / path).resolve()
        # Only files directly inside dist (icons, manifest, service worker) are served by name;
        # resolve() plus the parent check stops "../" from reaching anything outside it.
        if path and candidate.parent == dist.resolve() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
