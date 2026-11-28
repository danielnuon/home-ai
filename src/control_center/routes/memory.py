"""The Memory view: the Owner's saved notes (spec 15.9.7)."""

from fastapi import APIRouter

from control_center.contract.memory import MemoryEdit, MemoryNew, MemoryOverview, MemoryPause
from control_center.routes import BackendsDep

router = APIRouter(tags=["memory"])


@router.get("/memory")
def memory(backends: BackendsDep) -> MemoryOverview:
    """Every saved note, whether memory is paused, and the forgets that can be undone."""
    return backends.memory.overview()


@router.post("/memory")
def memory_add(body: MemoryNew, backends: BackendsDep) -> MemoryOverview:
    """Add a note, most often "don't bring this up"."""
    return backends.memory.add(body.text, body.kind)


@router.put("/memory/paused")
def memory_paused(body: MemoryPause, backends: BackendsDep) -> MemoryOverview:
    """Pause or resume memory."""
    return backends.memory.set_paused(body.paused)


@router.put("/memory/{item_id}")
def memory_edit(item_id: str, body: MemoryEdit, backends: BackendsDep) -> MemoryOverview:
    """Change a note's text, or pin or unpin it."""
    return backends.memory.edit(item_id, body.text, body.pinned)


@router.post("/memory/{item_id}/forget")
def memory_forget(item_id: str, backends: BackendsDep) -> MemoryOverview:
    """Forget a note. It can be brought back for ten minutes."""
    return backends.memory.forget(item_id)


@router.post("/memory/{item_id}/restore")
def memory_restore(item_id: str, backends: BackendsDep) -> MemoryOverview:
    """Bring back a note forgotten in the last ten minutes."""
    return backends.memory.restore(item_id)


@router.post("/memory/{item_id}/confirm")
def memory_confirm(item_id: str, backends: BackendsDep) -> MemoryOverview:
    """Confirm a proposed note."""
    return backends.memory.confirm(item_id)


@router.post("/memory/{item_id}/dismiss")
def memory_dismiss(item_id: str, backends: BackendsDep) -> MemoryOverview:
    """Turn down a proposed note."""
    return backends.memory.dismiss(item_id)
