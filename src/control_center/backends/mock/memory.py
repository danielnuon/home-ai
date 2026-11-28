"""Mock conversation memory (spec 15.9.2, 15.9.3, 15.9.7): the Memory view and what chat saves.

Items live in the world. The Memory view edits, pins, forgets and confirms them; chat saves what
the Owner asks it to remember, learns stated preferences, and cites the items a reply used.
"""

import secrets
from datetime import timedelta

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock import memory_rules as rules
from control_center.backends.mock.fixtures.memory import PINNED_MAX
from control_center.backends.mock.threads import ThreadRecord
from control_center.backends.mock.world import MockWorld
from control_center.contract.memory import (
    ForgottenItem,
    MemoryHow,
    MemoryItem,
    MemoryKind,
    MemoryNote,
    MemoryOverview,
    MemoryRef,
)

FORGET_UNDO = timedelta(minutes=10)
"""How long a forget can be undone before it is final on the Mac (15.9.7)."""

ITEMS_PER_TURN = 8
"""The most items one reply reads (`chat_memory.items_per_turn`)."""

MEMORY_PAGES = ("memory", "chat")
"""The resources that show memory items."""


class MockMemory:
    """In-memory stand-in for the engine's memory endpoints. Implements `ChatMemory`."""

    def __init__(self, world: MockWorld) -> None:
        """Keep items in `world` and publish changes on its bus."""
        self._world = world

    # The Memory view ---------------------------------------------------------------------------

    def overview(self) -> MemoryOverview:
        """Every item, newest first, whether memory is paused, and the forgets still undoable."""
        now = self._world.clock()
        forgotten = self._world.memory_forgotten
        for item_id in [key for key, (_, until) in forgotten.items() if until <= now]:
            del forgotten[item_id]
        return MemoryOverview(
            items=sorted(self._world.memories.values(), key=lambda m: m.saved_at, reverse=True),
            paused=self._world.memory_paused,
            pinned_max=PINNED_MAX,
            forgotten=[
                ForgottenItem(id=item.id, text=item.text, undo_until=until)
                for item, until in forgotten.values()
            ],
        )

    def _item(self, item_id: str) -> MemoryItem:
        try:
            return self._world.memories[item_id]
        except KeyError:
            raise NotFoundError("That note isn't in memory.") from None

    def _changed(self) -> MemoryOverview:
        self._world.bus.changed(*MEMORY_PAGES)
        return self.overview()

    def add(self, text: str, kind: MemoryKind = "avoid") -> MemoryOverview:
        """Add a note in the view: most often "don't bring this up".

        Args:
            text: The note.
            kind: `avoid` for a topic not to raise, `note` for anything else.

        Returns:
            The Memory view, with the note added.

        Raises:
            ConflictError: The note may not be saved; the message says why.
        """
        text = rules.tidy(text)
        reason = rules.refusal(text)
        if reason is not None:
            raise ConflictError(reason)
        self._save(text, how="said", kind=kind)
        return self._changed()

    def edit(self, item_id: str, text: str | None, pinned: bool | None) -> MemoryOverview:
        """Change an item's text, or pin or unpin it.

        Args:
            item_id: The item.
            text: Its new text, or None to keep it.
            pinned: Whether it is pinned, or None to leave it.

        Returns:
            The Memory view, with the item changed.

        Raises:
            NotFoundError: No such item.
            ConflictError: It is not active, the text may not be saved, or too many are pinned.
        """  # noqa: DOC503 NotFoundError is raised by self._item()
        item = self._item(item_id)
        if item.status != "active":
            raise ConflictError("Only a note in use can be changed. Confirm it first.")
        if text is not None:
            text = rules.tidy(text)
            reason = rules.refusal(text)
            if reason is not None:
                raise ConflictError(reason)
            item.text = text
        if pinned and not item.pinned:
            count = sum(1 for m in self._world.memories.values() if m.pinned)
            if count >= PINNED_MAX:
                raise ConflictError(f"At most {PINNED_MAX} notes can be pinned. Unpin one first.")
        if pinned is not None:
            item.pinned = pinned
        return self._changed()

    def forget(self, item_id: str) -> MemoryOverview:
        """Forget an item. It can be brought back for ten minutes; then it is gone.

        Args:
            item_id: The item.

        Returns:
            The Memory view, with the item listed as forgotten until its undo runs out.

        Raises:
            NotFoundError: No such item.
        """  # noqa: DOC502 raised by self._item()
        item = self._item(item_id)
        del self._world.memories[item_id]
        self._world.memory_forgotten[item_id] = (item, self._world.clock() + FORGET_UNDO)
        return self._changed()

    def restore(self, item_id: str) -> MemoryOverview:
        """Undo a forget while its ten minutes last.

        Args:
            item_id: The forgotten item.

        Returns:
            The Memory view, with the item back.

        Raises:
            ConflictError: It was not forgotten, or its undo has run out.
        """
        self.overview()
        found = self._world.memory_forgotten.pop(item_id, None)
        if found is None:
            raise ConflictError("That note can't be brought back any more.")
        self._world.memories[item_id] = found[0]
        return self._changed()

    def confirm(self, item_id: str) -> MemoryOverview:
        """Confirm a proposed item: it is saved and used from now on.

        Args:
            item_id: A proposed item.

        Returns:
            The Memory view, with the item active.

        Raises:
            NotFoundError: No such item.
            ConflictError: It is not waiting to be confirmed.
        """  # noqa: DOC502 raised by self._proposed()
        item = self._proposed(item_id)
        item.status = "active"
        item.how = "confirmed"
        return self._changed()

    def dismiss(self, item_id: str) -> MemoryOverview:
        """Turn down a proposed item: nothing is saved.

        Args:
            item_id: A proposed item.

        Returns:
            The Memory view, without the item.

        Raises:
            NotFoundError: No such item.
            ConflictError: It is not waiting to be confirmed.
        """  # noqa: DOC502 raised by self._proposed()
        self._proposed(item_id)
        del self._world.memories[item_id]
        return self._changed()

    def _proposed(self, item_id: str) -> MemoryItem:
        item = self._item(item_id)
        if item.status != "proposed":
            raise ConflictError("That note isn't waiting for you.")
        return item

    def set_paused(self, paused: bool) -> MemoryOverview:
        """Pause or resume memory. While paused, items are kept but none is read or learned.

        Args:
            paused: Whether memory is paused.

        Returns:
            The Memory view.
        """
        self._world.memory_paused = paused
        return self._changed()

    # What chat does with memory ----------------------------------------------------------------

    def _save(
        self,
        text: str,
        how: MemoryHow,
        kind: MemoryKind = "note",
        thread: ThreadRecord | None = None,
    ) -> MemoryNote:
        """Save `text` in the Owner's scope, superseding a note it contradicts."""
        active = [m for m in self._world.memories.values() if m.status == "active"]
        known = next((m for m in active if rules.same(m.text, text)), None)
        if known is not None:
            return MemoryNote(outcome="saved", item_id=known.id, text=known.text)
        item = MemoryItem(
            id=f"MEM-{secrets.token_hex(3)}",
            text=text,
            kind=kind,
            scope="owner",
            scope_label="Everyone",
            how=how,
            source_thread_id=thread.id if thread else None,
            source_thread_title=thread.title if thread else None,
            source_lead_id=thread.lead_id if thread else None,
            saved_at=self._world.clock(),
        )
        self._world.memories[item.id] = item
        old = next((m for m in active if rules.contradicts(text, m.text)), None)
        if old is not None:
            old.status = "superseded"
            old.superseded_by = item.id
        self._world.bus.changed("memory")
        if old is not None:
            return MemoryNote(outcome="updated", item_id=item.id, text=text)
        if how == "learned":
            return MemoryNote(outcome="learned", item_id=item.id, text=text)
        return MemoryNote(outcome="saved", item_id=item.id, text=text)

    def remember(self, text: str, thread: ThreadRecord) -> MemoryNote:
        """Save what the Owner asked to remember in `thread`, or say why it was not saved."""
        if thread.temporary_until is not None:
            return MemoryNote(
                outcome="not_saved", text="Not saved: a temporary chat keeps no memory."
            )
        text = rules.tidy(text)
        reason = rules.refusal(text)
        if reason is not None:
            return MemoryNote(outcome="not_saved", text=reason)
        return self._save(text, how="said", thread=thread)

    def learn(self, text: str, thread: ThreadRecord) -> list[MemoryNote]:
        """What the lead learns from the Owner's message, unless learning is off for it."""
        if self._world.memory_paused or not thread.learning or thread.temporary_until:
            return []
        known = [m.text for m in self._world.memories.values() if m.status == "active"]
        new = [i for i in rules.learnable(text) if not any(rules.same(i, k) for k in known)]
        return [self._save(item, how="learned", thread=thread) for item in new]

    def recall(self, text: str, lead_id: str, thread: ThreadRecord) -> list[MemoryRef]:
        """The items a reply to `text` reads: pinned ones, then the relevant, up to eight."""
        if self._world.memory_paused or thread.temporary_until is not None:
            return []
        readable = [
            m
            for m in self._world.memories.values()
            if m.status == "active" and m.lead_id in (None, lead_id)
        ]
        chosen = [m for m in readable if m.pinned]
        chosen += [m for m in readable if not m.pinned and rules.relevant(m.text, text)]
        now = self._world.clock()
        for item in chosen[:ITEMS_PER_TURN]:
            item.last_used = now
            item.use_count += 1
        if chosen:
            self._world.bus.changed("memory")
        return [MemoryRef(id=m.id, text=m.text) for m in chosen[:ITEMS_PER_TURN]]
