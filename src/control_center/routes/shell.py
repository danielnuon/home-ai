"""The shell's routes: the Guide panel, Docs, alerts, the trash, offline pack and library."""

from typing import Annotated

from fastapi import APIRouter, Query

from control_center.contract.shell import (
    ArkDriveRequest,
    ArkDriveStarted,
    DocChangeRequest,
    DocChangeRequested,
    DocPage,
    GuideAnswer,
    GuideQuestion,
    LibraryAnswer,
    LibraryOverview,
    LibraryQuestion,
    LibrarySearchResults,
    OfflinePack,
    TrashItem,
    TrashOverview,
)
from control_center.contract.today import Alert, AlertAction
from control_center.routes import BackendsDep, StepUp

router = APIRouter()


@router.post("/guide/ask")
def guide_ask(body: GuideQuestion, backends: BackendsDep) -> GuideAnswer:
    """Ask Wayfinder about the page on screen."""
    return backends.engine.guide_ask(body)


@router.get("/docs/{doc_id}")
def doc_page(doc_id: str, backends: BackendsDep) -> DocPage:
    """One document, rendered."""
    return backends.engine.doc_page(doc_id)


@router.post("/docs/{doc_id}/change-requests")
def request_doc_change(
    doc_id: str, body: DocChangeRequest, backends: BackendsDep
) -> DocChangeRequested:
    """Request a change to a document; it becomes a work item."""
    return backends.engine.request_doc_change(doc_id, body.text)


@router.post("/alerts/{alert_id}/action")
def alert_action(alert_id: str, body: AlertAction, backends: BackendsDep) -> Alert:
    """Acknowledge, snooze or reopen an alert."""
    return backends.gate.alert_action(alert_id, body)


@router.get("/trash")
def trash(backends: BackendsDep) -> TrashOverview:
    """Everything deleted in the last 30 days."""
    return backends.engine.trash()


@router.post("/trash/{item_id}/restore")
def restore(item_id: str, backends: BackendsDep) -> TrashItem:
    """Put a deleted item back."""
    return backends.engine.restore_from_trash(item_id)


@router.post("/trash/{item_id}/purge", status_code=204)
def purge(item_id: str, backends: BackendsDep) -> None:
    """Delete an item for good."""
    backends.engine.purge_from_trash(item_id)


@router.get("/offline-pack")
def offline_pack(backends: BackendsDep) -> OfflinePack:
    """The offline pack, while it is on."""
    return backends.engine.offline_pack()


@router.get("/library")
def library(backends: BackendsDep) -> LibraryOverview:
    """The offline library's page."""
    return backends.engine.library()


@router.get("/library/search")
def library_search(
    backends: BackendsDep, q: Annotated[str, Query(max_length=200)] = ""
) -> LibrarySearchResults:
    """Search the library."""
    return backends.engine.library_search(q)


@router.post("/library/ask")
def library_ask(body: LibraryQuestion, backends: BackendsDep) -> LibraryAnswer:
    """Ask the librarian."""
    return backends.engine.library_ask(body.question)


@router.post("/library/ark-drive")
def ark_drive(
    body: ArkDriveRequest, backends: BackendsDep, step_up: StepUp = None
) -> ArkDriveStarted:
    """Write an Ark drive to an external volume. Needs a step-up."""
    return backends.gate.write_ark_drive(body.volume, step_up)
