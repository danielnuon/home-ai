"""Conversation memory (spec 15.9.2, 15.9.3, 15.9.7): the Owner's saved notes and their use."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel
from control_center.contract.common import Principal

MemoryScope = Literal["owner", "domain", "space", "product", "idea", "lead"]
"""Who reads an item (15.9.2): every lead, a domain, a space, a product or idea, or one lead."""

MemoryStatus = Literal["active", "proposed", "superseded"]
"""`proposed` waits for the Owner to confirm it; `superseded` was replaced by a newer item."""

MemoryHow = Literal["said", "learned", "imported", "confirmed"]
"""How it was saved: the Owner said so, a lead learned it, it was imported, or confirmed."""

MemoryKind = Literal["note", "avoid"]
"""A note to keep, or "don't bring this up": a topic the lead does not raise unless asked."""


class MemoryItem(ContractModel):
    """One short fact, preference or "don't bring this up" note, with where it came from.

    `scope_label` names the scope in words ("Everyone", "Home and auto", "Custodian only").
    `source_thread_id` is the thread it was said in, led by `source_lead_id`; `source` describes
    a proposed item's source when it is not the Owner's own words ("from an email from Delta").
    `superseded_by` links a superseded item to the one that replaced it.
    """

    id: str
    text: str
    kind: MemoryKind = "note"
    scope: MemoryScope
    scope_label: str
    lead_id: str | None = None
    principal: Principal = "owner"
    status: MemoryStatus = "active"
    how: MemoryHow
    pinned: bool = False
    source_thread_id: str | None = None
    source_thread_title: str | None = None
    source_lead_id: str | None = None
    source: str | None = None
    saved_at: datetime
    last_used: datetime | None = None
    use_count: int = 0
    superseded_by: str | None = None


class ForgottenItem(ContractModel):
    """An item the Owner just forgot, which they can bring back until `undo_until` (15.9.7)."""

    id: str
    text: str
    undo_until: datetime


class MemoryOverview(ContractModel):
    """The Memory view: every item, whether memory is paused, and what can still be undone.

    `pinned_max` is how many items may be pinned (`chat_memory.pinned_max`).
    """

    items: list[MemoryItem]
    paused: bool = False
    pinned_max: int
    forgotten: list[ForgottenItem] = Field(default_factory=list)


class MemoryRef(ContractModel):
    """An item as a reply cites it under "Used memory"."""

    id: str
    text: str


class MemoryNote(ContractModel):
    """What a turn did to memory, shown under the lead's reply (15.9.3).

    `saved`, `updated` and `learned` name the item; `not_saved` gives the reason in `text`.
    """

    outcome: Literal["saved", "updated", "learned", "not_saved"]
    item_id: str | None = None
    text: str


class MemoryNew(ContractModel):
    """A note the Owner adds in the Memory view; most often "don't bring this up"."""

    text: str
    kind: MemoryKind = "avoid"


class MemoryEdit(ContractModel):
    """A change to an item: new text, pinned or unpinned. A field left out is unchanged."""

    text: str | None = None
    pinned: bool | None = None


class MemoryPause(ContractModel):
    """Pause memory: items are kept, but none is read or learned until it resumes."""

    paused: bool
