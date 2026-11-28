"""The shell's own surfaces: the Guide panel, Docs, the trash, the offline pack and the library.

These are the app-wide patterns of spec 7.2, 7.7, 7.14 to 7.16, 12.8 and 14.8 that every page
shares or that live outside any one page's area.
"""

from datetime import datetime
from typing import Literal

from control_center.contract.base import ContractModel
from control_center.contract.common import RowGroup, StatusLabel
from control_center.contract.today import SearchResult


class GuideQuestion(ContractModel):
    """A question for Wayfinder from the Guide panel, with the page it was asked on (spec 14.8).

    `page` is the path on screen; `context` names the object in view, such as a document's title,
    so Wayfinder answers about what the Owner is looking at.
    """

    question: str
    page: str
    context: str | None = None


class GuideSource(ContractModel):
    """Where an answer came from, as a page the Owner can open."""

    title: str
    href: str


class GuideAnswer(ContractModel):
    """Wayfinder's answer. It is read-only: it explains, and never changes anything itself."""

    id: str
    question: str
    page: str
    answer: str
    sources: list[GuideSource]


DocBlockKind = Literal["heading", "paragraph", "item", "code"]


class DocBlock(ContractModel):
    """One block of a rendered document: a heading, a paragraph, a list item or a code line."""

    kind: DocBlockKind
    text: str


class DocPage(ContractModel):
    """One document as the Docs reader shows it (spec 7.2, Docs)."""

    id: str
    title: str
    meta: str
    status: StatusLabel | None
    blocks: list[DocBlock]


class DocChangeRequest(ContractModel):
    """What the Owner wants changed in a document. It becomes a work item."""

    text: str


class DocChangeRequested(ContractModel):
    """The work item a change request created, and the words the toast shows."""

    work_item_id: str
    message: str


TrashKind = Literal["record", "document", "contact", "rule"]


class TrashItem(ContractModel):
    """Something deleted, kept for 30 days so it can be restored (spec 7.16, rule 11).

    `home` is the page it returns to when restored.
    """

    id: str
    kind: TrashKind
    title: str
    meta: str
    home: str
    deleted_at: datetime
    purge_at: datetime


class TrashOverview(ContractModel):
    """Recently deleted items, newest first, and how long each is kept."""

    items: list[TrashItem]
    retention_days: int


class OfflinePack(ContractModel):
    """The offline pack (spec 7.7): what the phone keeps for when the Mac can't be reached.

    Emergency sheets, the next 30 days of agenda, key contacts and bills due, as row groups.
    """

    generated_at: datetime
    groups: list[RowGroup]


LibraryCategory = Literal["Emergency", "Medical", "Water", "Food", "Shelter and warmth", "Repair"]


class QuickCard(ContractModel):
    """A reviewed quick card (spec 12.8): short steps, quoted from its source, never computed."""

    id: str
    title: str
    category: LibraryCategory
    steps: list[str]
    source: str


class LibraryTier(ContractModel):
    """One of Ark's three content tiers and whether it is installed."""

    name: str
    size: str
    installed: bool


class LibraryCitation(ContractModel):
    """A numbered source under a librarian answer. Open-edit sources are flagged unreviewed."""

    number: int
    title: str
    publisher: str
    reviewed: bool


class LibraryAnswer(ContractModel):
    """The librarian's answer, or the quick card a red-flag question opens at once (spec 12.8).

    No passage means no answer: `answer` is then None and `note` says so.
    """

    question: str
    answer: str | None
    quick_card: QuickCard | None
    citations: list[LibraryCitation]
    note: str | None


class LibraryQuestion(ContractModel):
    """A question for the librarian, or words to search the library for."""

    question: str


class LibraryOverview(ContractModel):
    """The Library page (spec 7.2, 12.8): quick cards, tiers, the safety test and off-grid state."""

    categories: list[LibraryCategory]
    quick_cards: list[QuickCard]
    tiers: list[LibraryTier]
    safety_test: StatusLabel
    offgrid: bool
    battery: str | None
    volumes: list[str]
    """External volumes connected now, to write an Ark drive to."""


class LibrarySearchResults(ContractModel):
    """Library pages and quick cards matching the words."""

    query: str
    results: list[SearchResult]


class ArkDriveRequest(ContractModel):
    """Write an Ark drive to the external volume the Owner chose (spec 12.8). Needs a step-up."""

    volume: str


class ArkDriveStarted(ContractModel):
    """What the toast says once the writer has started."""

    message: str
