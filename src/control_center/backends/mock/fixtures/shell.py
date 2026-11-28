"""Fixtures for the shell's surfaces.

Document bodies, Wayfinder's page answers, alerts, the trash, the offline pack and the library.
"""

from datetime import datetime, timedelta

from control_center.contract.common import Row, RowGroup, StatusLabel
from control_center.contract.shell import (
    DocBlock,
    GuideSource,
    LibraryCategory,
    LibraryCitation,
    LibraryTier,
    QuickCard,
    TrashItem,
    TrashKind,
)
from control_center.contract.today import Alert

TRASH_DAYS = 30
"""How long a deleted item is kept before it is purged (spec 7.16, rule 11)."""

ARK_VOLUMES = ["ARK-1", "ARK-2"]
"""External volumes the mock offers to write an Ark drive to."""

SNOOZE = timedelta(hours=4)
"""How long a snoozed alert stays out of the way."""


def _blocks(*lines: str) -> list[DocBlock]:
    """Blocks from short lines: `# ` is a heading, `- ` a list item, `$ ` a code line."""
    blocks = []
    for line in lines:
        if line.startswith("# "):
            blocks.append(DocBlock(kind="heading", text=line[2:]))
        elif line.startswith("- "):
            blocks.append(DocBlock(kind="item", text=line[2:]))
        elif line.startswith("$ "):
            blocks.append(DocBlock(kind="code", text=line[2:]))
        else:
            blocks.append(DocBlock(kind="paragraph", text=line))
    return blocks


DOC_BODIES: dict[str, list[DocBlock]] = {
    "infra": _blocks(
        "How this Mac is set up, how to check it, and how to get it back when something breaks.",
        "# Checks",
        "- The watchdog reads every service's health every 30 seconds and shows it on System.",
        "- The heartbeat pings Healthchecks.io every 5 minutes; a missed ping emails you.",
        "- The restore drill runs on the first Sunday of each month and must pass.",
        "# Recovery",
        "After a power cut the Mac waits at the FileVault unlock screen. Unlock it, then wait "
        "for the working drive to mount before Brain shows all clear.",
        "$ sudo launchctl kickstart -k system/ai.platform.watchdog",
        "# Remote login",
        "Brain is reachable only over Tailscale. The Mac's own key never expires; your phone's "
        "key is renewed while the internet is up.",
    ),
    "run-0004": _blocks(
        "What to do when the working drive does not mount after a restart.",
        "# Steps",
        "- Check the cable and that the drive's light is on.",
        "- Open Disk Utility and unlock the drive with the key from the keychain.",
        "- If it still won't mount, Brain keeps running on the internal SSD and says so.",
    ),
    "adr-0007": _blocks(
        "We run local models through MLX because it is the fastest free runtime on Apple silicon.",
        "# Consequences",
        "- Models are converted once and checksummed in quarantine.",
        "- A model that has no MLX build waits until one exists.",
    ),
    "prd-0003": _blocks(
        "Lease Reminders tells each tenant, by text, a set number of days before rent and lease "
        "dates, with the wording you approved.",
        "# Version 1.2",
        "- Reminders follow quiet hours.",
        "- A reminder to a new tenant waits for your approval the first time.",
    ),
    "des-0009": _blocks(
        "Reminders are scheduled by the pipeline engine, not by cron, so pausing work pauses them.",
        "# Conformance",
        "The conformance record shows each requirement of PRD-0003 with the test that covers it.",
    ),
    "rs-readme": _blocks(
        "Receipt Scanner reads photos of receipts and files the totals under Finance.",
        "# Out of date",
        "The Saturday audit found that this README still names the old inbox folder.",
    ),
    "run-restore": _blocks(
        "How to bring back one record from the backups without touching the rest.",
        "# Steps",
        "- Open Backups and choose Restore.",
        "- Pick the record and the point in time.",
        "- The record appears in a side folder; nothing is overwritten.",
    ),
}
"""The body of every document on the Docs page, by row id. Release packets open on Approvals."""


GUIDE_PAGES: dict[str, tuple[str, list[GuideSource]]] = {
    "/": (
        "Today shows whether everything is all right and what needs you. Tiles are colored by "
        "status, and anything waiting on you is under Needs you.",
        [GuideSource(title="Brain architecture", href="/docs/infra")],
    ),
    "/spend": (
        "Everything is free by default. A paid feature only costs money once you turn it on, and "
        "spending stops at its monthly cap.",
        [GuideSource(title="Spend", href="/spend")],
    ),
    "/backups": (
        "You are on the starter backup: the two drives back each other up. It does not survive "
        "theft or fire until a backup drive is connected.",
        [GuideSource(title="Runbook: restore a record", href="/docs/run-restore")],
    ),
    "/approvals": (
        "An approval waits for you and never approves on timeout. If it lapses, nothing is sent.",
        [GuideSource(title="Approvals", href="/approvals")],
    ),
    "/docs": (
        "Docs are the platform's own documentation. Open one to read it, ask me about it, or "
        "request a change, which becomes a work item.",
        [GuideSource(title="INFRASTRUCTURE.md", href="/docs/infra")],
    ),
}
"""What Wayfinder says about a page when the question names nothing more specific."""

GUIDE_FALLBACK = (
    "I can explain anything on this page. In the running platform I answer from the local index "
    "of the specification, INFRASTRUCTURE.md, the Directory and live status."
)


def alerts(now: datetime) -> list[Alert]:
    """Two open alerts: the starter backup's warning and a stale README."""
    return [
        Alert(
            id="AL-0042",
            title="Backups are in one place",
            detail="Starter backup · the two drives back each other up. Add a backup drive.",
            status=StatusLabel(status="attention", label="Needs attention"),
            href="/backups",
            raised_at=now - timedelta(hours=3),
            state="open",
        ),
        Alert(
            id="AL-0043",
            title="Receipt Scanner README is out of date",
            detail="The Saturday audit found drift. Custodian can fix it.",
            status=StatusLabel(status="attention", label="Stale"),
            href="/docs/rs-readme",
            raised_at=now - timedelta(hours=20),
            state="open",
        ),
    ]


def _trashed(  # noqa: PLR0913, PLR0917 -- a row of fixture data; keyword arguments read as a table
    item_id: str, kind: TrashKind, title: str, meta: str, home: str, deleted_at: datetime
) -> TrashItem:
    return TrashItem(
        id=item_id,
        kind=kind,
        title=title,
        meta=meta,
        home=home,
        deleted_at=deleted_at,
        purge_at=deleted_at + timedelta(days=TRASH_DAYS),
    )


def trash(now: datetime) -> list[TrashItem]:
    """Three items deleted over the last fortnight, newest first, and one past its 30 days."""
    return [
        _trashed(
            "TR-0007",
            "rule",
            "File Costco receipts under Groceries",
            "Finance rule · Tally",
            "/finance",
            now - timedelta(days=2),
        ),
        _trashed(
            "TR-0006",
            "document",
            "Unit A lease 2024.pdf",
            "Rental · superseded by the 2026 lease",
            "/personal",
            now - timedelta(days=5),
        ),
        _trashed(
            "TR-0005",
            "contact",
            "Quick Fix Plumbing",
            "Known contact · Rental",
            "/contacts",
            now - timedelta(days=12),
        ),
        _trashed(
            "TR-0001",
            "record",
            "Old car insurance card",
            "Home and auto",
            "/personal",
            now - timedelta(days=31),
        ),
    ]


def offline_pack() -> list[RowGroup]:
    """What the phone keeps for when the Mac can't be reached (spec 7.7)."""

    def row(row_id: str, title: str, meta: str) -> Row:
        return Row(id=row_id, title=title, meta=meta)

    return [
        RowGroup(
            name="Emergency sheets",
            rows=[
                row("ES-mom", "Mom", "Allergic to penicillin · metformin 500 mg · Dr. Patel"),
                row("ES-dad", "Dad", "Warfarin 5 mg · pacemaker · Medicare Advantage"),
                row("ES-owner", "You", "No known allergies · Kaiser · O negative"),
            ],
        ),
        RowGroup(
            name="Next 30 days",
            rows=[
                row("AG-1", "Unit B lease renewal", "Rental · Nov 30"),
                row("AG-2", "Medicare plan review", "Health · Dad · Dec 7"),
                row("AG-3", "Home insurance renews", "Household · Dec 14"),
            ],
        ),
        RowGroup(
            name="Key contacts",
            rows=[
                row("KC-1", "Dr. Patel's office", "(555) 010-2231"),
                row("KC-2", "Insurer member services", "(555) 010-8890"),
            ],
        ),
        RowGroup(
            name="Bills due",
            rows=[
                row("BD-1", "Electricity", "$142 · Dec 3 · autopay"),
                row("BD-2", "Unit B mortgage", "$1,860 · Dec 1"),
            ],
        ),
    ]


LIBRARY_CATEGORIES: list[LibraryCategory] = [
    "Emergency",
    "Medical",
    "Water",
    "Food",
    "Shelter and warmth",
    "Repair",
]


def quick_cards() -> list[QuickCard]:
    """Reviewed quick cards, quoted from their sources (spec 12.8)."""
    return [
        QuickCard(
            id="QC-urgent",
            title="Get help now",
            category="Emergency",
            steps=[
                "Call emergency services. If there is no signal, send someone for help.",
                "Stay with the person and keep them still and warm.",
                "Note the time and what happened, for the responders.",
            ],
            source="American Red Cross First Aid manual",
        ),
        QuickCard(
            id="QC-bleeding",
            title="Severe bleeding",
            category="Emergency",
            steps=[
                "Call emergency services if you can.",
                "Press firmly on the wound with a clean cloth and keep pressing.",
                "If blood soaks through, add more cloth on top. Do not lift the first one.",
            ],
            source="American Red Cross First Aid manual",
        ),
        QuickCard(
            id="QC-water",
            title="Make water safe to drink",
            category="Water",
            steps=[
                "Bring clear water to a rolling boil for 1 minute.",
                "Above 6,500 feet, boil for 3 minutes.",
                "Let it cool. Store it in clean, covered containers.",
            ],
            source="CDC, Making Water Safe in an Emergency",
        ),
        QuickCard(
            id="QC-warmth",
            title="Keep warm without power",
            category="Shelter and warmth",
            steps=[
                "Close off unused rooms and gather in one.",
                "Never run a generator, grill or camp stove indoors.",
                "Wear layers and a hat; keep blankets off the floor.",
            ],
            source="Ready.gov, Winter Weather",
        ),
        QuickCard(
            id="QC-food",
            title="Is food in the fridge still safe?",
            category="Food",
            steps=[
                "A closed fridge keeps food cold for about 4 hours.",
                "Throw out meat, dairy and leftovers kept above 40 °F for over 2 hours.",
            ],
            source="USDA, Keeping Food Safe During an Emergency",
        ),
    ]


def library_tiers() -> list[LibraryTier]:
    """Ark's three tiers; Survive is installed (spec 12.8)."""
    return [
        LibraryTier(name="Survive", size="About 4 GB", installed=True),
        LibraryTier(name="Sustain", size="About 60 GB", installed=False),
        LibraryTier(name="Rebuild", size="About 90 GB", installed=False),
    ]


RED_FLAGS: dict[str, str] = {
    "bleed": "QC-bleeding",
    "chest pain": "QC-urgent",
    "breathing": "QC-urgent",
    "unresponsive": "QC-urgent",
    "poison": "QC-urgent",
    "burn": "QC-urgent",
}
"""Red-flag words and the reviewed card each opens at once, with no model call (spec 12.8)."""

LIBRARY_ANSWERS: dict[str, tuple[str, list[LibraryCitation]]] = {
    "water": (
        "Boil clear water at a rolling boil for 1 minute, or 3 minutes above 6,500 feet [1]. "
        "Cloudy water should settle and be filtered first [2].",
        [
            LibraryCitation(
                number=1,
                title="Making Water Safe in an Emergency",
                publisher="CDC",
                reviewed=True,
            ),
            LibraryCitation(
                number=2,
                title="Water purification",
                publisher="Wikipedia",
                reviewed=False,
            ),
        ],
    ),
}
"""Librarian answers by a word the question must contain. Figures are quoted, never computed."""

LIBRARY_CAVEAT = "Medical and safety answers are general information. Call for help when you can."

NO_PASSAGE = "No passage in the library covers this, so there is no answer. Try other words."
