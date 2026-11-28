"""The mock engine's shell surfaces: the Guide panel, Docs, the trash, the offline pack and library.

Wayfinder's Guide panel answers, the Docs reader and its change requests, the 30-day trash, the
offline pack and the offline library.

The trash is shared by every area that deletes something (spec 7.16, rule 11). An area deletes by
calling `send_to_trash` with what it removed, and registers a restorer for its kind in
`RESTORERS` that puts that back. See docs/engineering/interaction-patterns.md.
"""

import secrets
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.fixtures import reference, shell, work
from control_center.backends.mock.world import MockWorld
from control_center.contract.common import StatusLabel
from control_center.contract.shell import (
    DocChangeRequested,
    DocPage,
    GuideAnswer,
    GuideQuestion,
    GuideSource,
    LibraryAnswer,
    LibraryOverview,
    LibrarySearchResults,
    OfflinePack,
    TrashItem,
    TrashKind,
    TrashOverview,
)
from control_center.contract.today import SearchResult
from control_center.contract.work import WorkItem

RESTORERS: dict[TrashKind, Callable[[MockWorld, Any], None]] = {}
"""How each kind of deleted thing goes back where it was. An area registers its own; a kind with
no restorer (the fixtures' items) only leaves the trash."""

HOME_RESOURCES: dict[str, str] = {
    "/finance": "finance",
    "/personal": "personal",
    "/contacts": "contacts",
    "/docs": "docs",
}
"""The resource each home page reads, so restoring refetches the page the item returns to."""


def send_to_trash(  # noqa: PLR0913 -- every field of a trash row, passed by keyword
    world: MockWorld,
    *,
    kind: TrashKind,
    title: str,
    meta: str,
    home: str,
    payload: Any,
) -> TrashItem:
    """Keep a deleted thing for 30 days so it can be restored.

    Args:
        world: The mock world.
        kind: What sort of thing it is.
        title: Its name, as the trash lists it.
        meta: The line under the name, such as its domain.
        home: The page it returns to when restored.
        payload: What the restorer for `kind` needs to put it back.

    Returns:
        The trash row.
    """
    now = world.clock()
    item = TrashItem(
        id=f"TR-{secrets.token_hex(2)}",
        kind=kind,
        title=title,
        meta=meta,
        home=home,
        deleted_at=now,
        purge_at=now + timedelta(days=shell.TRASH_DAYS),
    )
    world.trash = {item.id: item, **world.trash}
    world.trashed[item.id] = payload
    world.bus.changed("trash")
    return item


def _page_answer(page: str) -> tuple[str, list[GuideSource]]:
    """What Wayfinder says about `page` or the page it sits under, such as Docs for a document."""
    for path, said in shell.GUIDE_PAGES.items():
        if page == path or (path != "/" and page.startswith(f"{path}/")):
            return said
    return shell.GUIDE_FALLBACK, []


class ShellDesk:
    """The shell's half of `PipelineEngine`, mixed into `MockPipelineEngine`."""

    _world: MockWorld

    # Guide panel ----------------------------------------------------------------------------

    def guide_ask(self, question: GuideQuestion) -> GuideAnswer:
        """Wayfinder's answer about the page on screen (spec 14.8). Read-only.

        Args:
            question: The words, and the page and object they were asked about.

        Returns:
            The answer and the pages it came from.

        Raises:
            ConflictError: The question is empty.
        """
        words = question.question.strip().lower()
        if not words:
            raise ConflictError("Type a question first.")
        keyed = next((t for w, t in reference.WAYFINDER_ANSWERS.items() if w in words), None)
        answer, sources = _page_answer(question.page)
        if question.context:
            answer = f"About {question.context}: {answer}"
        return GuideAnswer(
            id=f"GA-{secrets.token_hex(3)}",
            question=question.question.strip(),
            page=question.page,
            answer=keyed or answer,
            sources=sources,
        )

    # Docs -----------------------------------------------------------------------------------

    def doc_page(self, doc_id: str) -> DocPage:
        """One document, rendered.

        Args:
            doc_id: The document's row id on the Docs page.

        Returns:
            Its title, review status and blocks.

        Raises:
            NotFoundError: No document has that id.
        """
        blocks = shell.DOC_BODIES.get(doc_id)
        row = next((r for g in reference.doc_groups() for r in g.rows if r.id == doc_id), None)
        if blocks is None or row is None:
            raise NotFoundError("That document doesn't exist.")
        return DocPage(id=row.id, title=row.title, meta=row.meta, status=row.status, blocks=blocks)

    def request_doc_change(self, doc_id: str, text: str) -> DocChangeRequested:
        """Turn a change request on a document into a work item (spec 7.2, Docs).

        Args:
            doc_id: The document.
            text: What the Owner wants changed.

        Returns:
            The new work item's id and what to tell the Owner.

        Raises:
            ConflictError: The request is empty.
        """  # noqa: DOC503 NotFoundError is raised by self.doc_page()
        doc = self.doc_page(doc_id)
        if not text.strip():
            raise ConflictError("Say what should change first.")
        item = WorkItem(
            id=f"WI-{secrets.token_hex(2)}",
            title=f"Update {doc.title}",
            risk="R0",
            status=StatusLabel(status="in_progress", label=work.phase_label(0, "D0 intake")),
            stages=work.stage_rail(0),
            progress=0.0,
            employee_name="Wayfinder",
            department="governance",
            employee_state="thinking",
            now=f"Wayfinder is routing your request: {text.strip()}",
            eta="Routed within a few minutes",
            cost_usd=0.0,
            waiting_on_owner=False,
        )
        self._world.work_items.append(item)
        self._world.bus.changed("work", "today")
        return DocChangeRequested(work_item_id=item.id, message=f"Requested. {item.id} is on Work.")

    # Trash ----------------------------------------------------------------------------------

    def trash(self) -> TrashOverview:
        """Items deleted in the last 30 days, newest first. Older ones are purged as they lapse."""
        now = self._world.clock()
        for item in [i for i in self._world.trash.values() if i.purge_at <= now]:
            self._forget(item.id)
        return TrashOverview(
            items=sorted(self._world.trash.values(), key=lambda i: i.deleted_at, reverse=True),
            retention_days=shell.TRASH_DAYS,
        )

    def _trash_item(self, item_id: str) -> TrashItem:
        self.trash()
        try:
            return self._world.trash[item_id]
        except KeyError:
            raise NotFoundError("That item is no longer in the trash.") from None

    def _forget(self, item_id: str) -> None:
        self._world.trash.pop(item_id, None)
        self._world.trashed.pop(item_id, None)

    def restore_from_trash(self, item_id: str) -> TrashItem:
        """Put a deleted item back on its home page.

        Args:
            item_id: The trash row.

        Returns:
            The row as it was, so the toast can name where it went.
        """  # noqa: DOC503 NotFoundError is raised by self._trash_item()
        item = self._trash_item(item_id)
        restorer = RESTORERS.get(item.kind)
        if restorer:
            restorer(self._world, self._world.trashed.get(item_id))
        self._forget(item_id)
        home = HOME_RESOURCES.get(item.home)
        self._world.bus.changed("trash", *([home] if home else []))
        return item

    def purge_from_trash(self, item_id: str) -> None:
        """Delete an item for good. It can't be undone, so the button says so (rule 11).

        Args:
            item_id: The trash row.
        """  # noqa: DOC503 NotFoundError is raised by self._trash_item()
        self._trash_item(item_id)
        self._forget(item_id)
        self._world.bus.changed("trash")

    # Offline pack and library ---------------------------------------------------------------

    def offline_pack(self) -> OfflinePack:
        """The offline pack, if it is on (spec 7.7). It is turned on in Settings, with a passkey.

        Returns:
            The pack's groups and when it was built.

        Raises:
            ConflictError: The offline pack is off.
        """
        if not self._world.is_on("offline_pack"):
            raise ConflictError("The offline pack is off. Turn it on first.")
        return OfflinePack(generated_at=self._world.sampled_at, groups=shell.offline_pack())

    def _require_library(self) -> None:
        if not self._world.is_on("offline_library"):
            raise ConflictError("The offline library is off. Turn it on first.")

    def library(self) -> LibraryOverview:
        """The Library page (spec 12.8).

        Returns:
            Quick cards, tiers, the last safety test and the off-grid state.
        """  # noqa: DOC503 ConflictError is raised by self._require_library()
        self._require_library()
        return LibraryOverview(
            categories=shell.LIBRARY_CATEGORIES,
            quick_cards=shell.quick_cards(),
            tiers=shell.library_tiers(),
            safety_test=StatusLabel(status="healthy", label="Passed 200 of 200 · Nov 20"),
            offgrid=False,
            battery=None,
            volumes=shell.ARK_VOLUMES,
        )

    def library_search(self, query: str) -> LibrarySearchResults:
        """Quick cards whose title, category or steps contain the words.

        Args:
            query: The words.

        Returns:
            Matching cards; none for empty words.
        """  # noqa: DOC503 ConflictError is raised by self._require_library()
        self._require_library()
        needle = query.strip().lower()
        hits = [
            SearchResult(id=c.id, title=c.title, meta=f"{c.category} · {c.source}", href="")
            for c in shell.quick_cards()
            if needle and needle in " ".join([c.title, c.category, *c.steps]).lower()
        ]
        return LibrarySearchResults(query=query, results=hits)

    def library_ask(self, question: str) -> LibraryAnswer:
        """The librarian's answer under Ark's rules (spec 12.8).

        A red-flag question opens its quick card at once; no passage means no answer.

        Args:
            question: The Owner's question.

        Returns:
            The answer with citations, the quick card, or a note that nothing covers it.

        Raises:
            ConflictError: The question is empty.
        """  # noqa: DOC503 ConflictError is also raised by self._require_library()
        self._require_library()
        words = question.strip().lower()
        if not words:
            raise ConflictError("Type a question first.")
        cards = {c.id: c for c in shell.quick_cards()}
        flag = next((card for w, card in shell.RED_FLAGS.items() if w in words), None)
        if flag:
            return LibraryAnswer(
                question=question.strip(),
                answer=None,
                quick_card=cards[flag],
                citations=[],
                note=shell.LIBRARY_CAVEAT,
            )
        found = next((a for w, a in shell.LIBRARY_ANSWERS.items() if w in words), None)
        return LibraryAnswer(
            question=question.strip(),
            answer=found[0] if found else None,
            quick_card=None,
            citations=found[1] if found else [],
            note=shell.LIBRARY_CAVEAT if found else shell.NO_PASSAGE,
        )
