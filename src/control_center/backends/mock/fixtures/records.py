"""Obligations, records, rules, briefs, finance rows and Setup forms for the mock engine.

Every Finance figure is computed from the rows here (`engine_records`), never typed in, so a
category fix moves money between budget lines the way the real ledger would.
"""

from datetime import datetime, timedelta

from control_center.contract.common import Principal, StatusLabel
from control_center.contract.personal import StatementImport
from control_center.contract.records import (
    Bill,
    Brief,
    ChecklistItem,
    DomainRecord,
    Interview,
    InterviewTurn,
    Obligation,
    Rule,
    SecretField,
    SourceRow,
    SyncStatus,
    UnmappedAccount,
)

PRINCIPALS: tuple[Principal, ...] = ("owner", "mom", "dad")

PRINCIPAL_NAMES: dict[Principal, str] = {"owner": "You", "mom": "Mom", "dad": "Dad"}

SCALE: dict[Principal, float] = {"owner": 1.0, "mom": 0.6, "dad": 0.6}
"""The parents' figures are the Owner's, smaller, so each principal reads differently."""

ASSIGNEES = ["You", "Atlas", "Hearth", "Ledger", "Pulse", "Keystone", "Taxonomy", "Tally"]
"""Who a case can be handed to: the Owner, or a personal-operations employee."""

DOMAIN_IDS: dict[str, str] = {
    "Calendar and admin": "calendar",
    "Home and auto": "home-auto",
    "Health and benefits": "health",
    "Finance": "finance",
    "Investing": "investing",
    "Taxes": "taxes",
    "Rental": "rental",
    "Career and business": "career",
}
"""Each domain's id, which its records page is addressed by."""

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

REPEAT_WORDS = {"once": "Once", "monthly": "Every month", "yearly": "Every year"}

STATEMENT_TYPES = (".csv", ".ofx", ".qfx")
"""The statement exports Brain reads (spec 7.2, Finance)."""

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
"""The largest file the mock accepts; a real import streams to the inbox folder instead."""

SECRET_MIN_LENGTH = 8
"""Shorter than this is a partial paste, never a whole token or app password."""


def obligations(now: datetime) -> list[Obligation]:
    """Date obligations over the next 90 days, and one by usage, across the three principals."""
    rows: list[tuple[str, str, str, Principal, str, int, int]] = [
        ("OB-1", "Smoke detector batteries", "Home and auto", "owner", "Every 6 months", 14, 12),
        ("OB-2", "Mom's prescription refill", "Health and benefits", "mom", "Every month", 5, 9),
        ("OB-3", "Car insurance renewal", "Home and auto", "owner", "Every 6 months", 21, 37),
        ("OB-4", "Dad's Medicare enrollment", "Health and benefits", "dad", "Every year", 21, 40),
        ("OB-5", "Property tax, second installment", "Rental", "owner", "Every year", 30, 68),
        (
            "OB-6",
            "Passport renewal",
            "Calendar and admin",
            "owner",
            "From the expiry date",
            120,
            75,
        ),
    ]
    dated = [
        Obligation(
            id=id_,
            title=title,
            domain=domain,
            principal=principal,
            kind="date",
            rule=rule,
            lead_days=lead,
            next_due=now + timedelta(days=days),
            days=days,
        )
        for id_, title, domain, principal, rule, lead, days in rows
    ]
    oil = Obligation(
        id="OB-7",
        title="Oil change",
        domain="Home and auto",
        principal="owner",
        kind="usage",
        rule="Every 5,000 miles · 4,200 since the last one",
        lead_days=0,
        next_due=None,
        days=None,
    )
    return [*dated, oil]


def domain_records() -> list[DomainRecord]:
    """Register entries and filed documents, a few per domain; Investing starts empty."""
    rows: list[tuple[str, str, Principal, str, str, str]] = [
        ("RC-01", "home-auto", "owner", "record", "2019 Outback", "VIN ··4471 · 61,200 miles"),
        ("RC-02", "home-auto", "owner", "record", "Water heater", "Installed 2018 · warranty 2028"),
        ("RC-03", "home-auto", "owner", "document", "Auto policy.pdf", "Filed Oct 2 · 412 KB"),
        ("RC-04", "health", "mom", "record", "Dr. Patel, primary care", "Seen every 6 months"),
        ("RC-05", "health", "mom", "record", "Medication list", "4 medicines · updated Oct 20"),
        ("RC-06", "health", "dad", "document", "Medicare card.jpg", "Filed Sep 14 · 1.1 MB"),
        ("RC-07", "taxes", "owner", "document", "2025 Form 1040.pdf", "Filed Apr 10 · 2.3 MB"),
        ("RC-08", "taxes", "owner", "record", "Q4 estimated payment", "$2,400 · due Jan 15"),
        ("RC-09", "rental", "owner", "record", "Unit B lease", "Ends Nov 30 · $2,350 a month"),
        ("RC-10", "rental", "owner", "document", "Unit B lease 2025.pdf", "Filed Dec 1 · 640 KB"),
        ("RC-11", "finance", "owner", "record", "Checking ··1042", "Statements monthly"),
        ("RC-12", "calendar", "owner", "document", "Passport scan.pdf", "Expires Feb 2027"),
        ("RC-13", "career", "owner", "record", "Resume", "Updated Sep 30"),
    ]
    return [
        DomainRecord(id=id_, domain_id=d, principal=p, kind=k, title=t, meta=m)  # type: ignore[arg-type]
        for id_, d, p, k, t, m in rows
    ]


def rules() -> list[Rule]:
    """Routing and category rules made from earlier corrections (spec 20.12)."""
    return [
        Rule(
            id="RU-1",
            kind="routing",
            when='Mail from "Kaiser Permanente"',
            then="Health and benefits · Mom",
            source="Your correction · Oct 12",
        ),
        Rule(
            id="RU-2",
            kind="category",
            when='Payee is "Clipper card"',
            then="Transport",
            source="Your correction · Oct 14",
        ),
        Rule(
            id="RU-3",
            kind="routing",
            when="Files dropped in Inbox/dad",
            then="Principal Dad",
            source="Set up in Setup · Oct 24",
        ),
        Rule(
            id="RU-4",
            kind="category",
            when='Payee contains "PG&E"',
            then="Utilities",
            source="Confirmed in the weekly review · Oct 20",
        ),
    ]


def briefs() -> list[Brief]:
    """The last daily briefs and weekly review, newest first (spec 20.13)."""
    return [
        Brief(
            id="BR-3",
            kind="daily",
            title="Daily brief · today 06:15",
            summary="3 events, 1 case due today, 2 approvals waiting.",
            items=[
                "09:30 Call with the property insurer; Keystone prepared notes",
                "Car registration renewal is due today",
                "2 approvals waiting, one for Mom",
                "Mom's prescription refill in 9 days",
            ],
        ),
        Brief(
            id="BR-2",
            kind="weekly",
            title="Weekly review · Sunday 18:00",
            summary="Budget on track, 1 renewal coming, 2 new rules to confirm.",
            items=[
                "Transport is $30 over budget; groceries $110 under",
                "Unit B lease renewal due Nov 30",
                'Confirm 2 new rules: "Clipper card" → Transport, Kaiser mail → Mom',
                "Nothing stale for more than 3 days",
            ],
        ),
        Brief(
            id="BR-1",
            kind="daily",
            title="Daily brief · yesterday 06:15",
            summary="2 events, nothing due, 1 approval waiting.",
            items=[
                "13:00 Dentist cleaning; leave by 12:35",
                "Credit card statement is overdue for import",
                "1 approval waiting",
            ],
        ),
    ]


def sync_status() -> list[SyncStatus]:
    """When each personal connector last synced."""
    synced = StatusLabel(status="healthy", label="Synced")
    return [
        SyncStatus(id="SY-1", name="Calendar", meta="3 calendars · 4 min ago", status=synced),
        SyncStatus(id="SY-2", name="Mail", meta="2 mailboxes · 2 min ago", status=synced),
        SyncStatus(id="SY-3", name="Reminders", meta="4 min ago", status=synced),
        SyncStatus(
            id="SY-4",
            name="Statement inbox folder",
            meta="Last file Oct 3",
            status=StatusLabel(status="healthy", label="Watching"),
        ),
        SyncStatus(
            id="SY-5",
            name="Contacts",
            meta="Needs the Contacts permission in Setup",
            status=StatusLabel(status="attention", label="Waiting"),
        ),
    ]


def checklist() -> list[ChecklistItem]:
    """The personal onboarding checklist: the lists only the Owner can give (spec 24.5)."""
    rows = [
        ("CK-1", "List your vehicles", "Home and auto · make, model and odometer", True),
        ("CK-2", "Add Mom's and Dad's doctors", "Health and benefits · one line each", False),
        ("CK-3", "Drop last year's tax return in the inbox", "Taxes · Inbox/taxes", False),
        ("CK-4", "List your insurance policies", "Home and auto, Health · or drop the PDFs", False),
        ("CK-5", "Add the rental leases", "Rental · Keystone reads the dates", True),
    ]
    return [ChecklistItem(id=i, title=t, detail=d, done=done) for i, t, d, done in rows]


# Finance --------------------------------------------------------------------------------------

CATEGORIES = ["Housing", "Groceries", "Transport", "Utilities", "Subscriptions", "Household"]
"""Spending categories, in budget order. Income is its own category and has no budget line."""

INCOME = "Income"

BUDGETS = {
    "Housing": 2100,
    "Groceries": 650,
    "Transport": 280,
    "Utilities": 240,
    "Subscriptions": 90,
    "Household": 120,
}

CHECKING, CARD, BROKERAGE = "Checking ··1042", "Credit card ··7731", "Brokerage ··5520"

_TRANSACTIONS: list[tuple[str, str, str, int, str]] = [
    ("Oct 1", "Salary", CHECKING, 3200, INCOME),
    ("Oct 1", "Mortgage · Unit A", CHECKING, 2100, "Housing"),
    ("Oct 2", "Safeway", CARD, 182, "Groceries"),
    ("Oct 3", "Shell", CARD, 64, "Transport"),
    ("Oct 4", "Netflix", CARD, 23, "Subscriptions"),
    ("Oct 4", "Spotify", CARD, 12, "Subscriptions"),
    ("Oct 5", "PG&E", CHECKING, 112, "Utilities"),
    ("Oct 6", "Trader Joe's", CARD, 96, "Groceries"),
    ("Oct 7", "iCloud", CARD, 10, "Subscriptions"),
    ("Oct 8", "City water", CHECKING, 46, "Utilities"),
    ("Oct 9", "Costco", CARD, 150, "Groceries"),
    ("Oct 10", "Newspaper", CARD, 25, "Subscriptions"),
    ("Oct 11", "Chevron", CARD, 58, "Transport"),
    ("Oct 12", "Amazon", CARD, 64, "Groceries"),
    ("Oct 13", "Gym", CARD, 16, "Subscriptions"),
    ("Oct 14", "Clipper card", CHECKING, 40, "Transport"),
    ("Oct 15", "Salary", CHECKING, 3200, INCOME),
    ("Oct 15", "Internet", CHECKING, 32, "Utilities"),
    ("Oct 17", "Car wash", CARD, 18, "Transport"),
    ("Oct 19", "Farmers market", CHECKING, 48, "Groceries"),
    ("Oct 22", "DMV registration", CHECKING, 130, "Transport"),
]
"""The Owner's October so far. Amazon is filed under Groceries, the category fix to try."""

_BALANCES = [
    (CHECKING, 18_400),
    (BROKERAGE, 284_200),
    ("Retirement ··2210", 96_000),
    (CARD, -2_800),
    ("Car, estimated", 17_000),
]

CASH_FLOW_HISTORY = [("aug", "Aug", 6_400, 3_150), ("sep", "Sep", 6_400, 3_390)]
"""Earlier months' totals from their statements; October is computed from its transactions."""

NET_WORTH_SPARK = [388, 391, 395, 393, 398, 401, 400, 404, 407, 405, 410, 412.8]


def scaled(principal: Principal, amount: float) -> int:
    """A figure for `principal`: the Owner's, scaled down for a parent."""
    return round(amount * SCALE[principal])


def transactions(principal: Principal) -> list[SourceRow]:
    """This month's transactions for one principal."""
    return [
        SourceRow(
            id=f"TX-{principal}-{n:02d}",
            day=day,
            text=text,
            account=account,
            amount=scaled(principal, amount),
            category=category,
        )
        for n, (day, text, account, amount, category) in enumerate(_TRANSACTIONS, start=1)
    ]


def balances(principal: Principal) -> list[SourceRow]:
    """Account balances, the source rows of net worth."""
    return [
        SourceRow(
            id=f"BAL-{principal}-{n}",
            day="Oct 25",
            text=name,
            account=name,
            amount=scaled(principal, amount),
            category=None,
        )
        for n, (name, amount) in enumerate(_BALANCES, start=1)
    ]


def history_rows(principal: Principal, key: str) -> list[SourceRow]:
    """An earlier month's statement totals, the source rows of its cash-flow bar."""
    month, money_in, money_out = next((m, i, o) for k, m, i, o in CASH_FLOW_HISTORY if k == key)
    return [
        SourceRow(
            id=f"ST-{principal}-{key}-in",
            day=month,
            text="Money in, from statements",
            account=CHECKING,
            amount=scaled(principal, money_in),
            category=None,
        ),
        SourceRow(
            id=f"ST-{principal}-{key}-out",
            day=month,
            text="Money out, from statements",
            account=f"{CHECKING}, {CARD}",
            amount=-scaled(principal, money_out),
            category=None,
        ),
    ]


def bills(principal: Principal) -> list[Bill]:
    """Upcoming bills. Brain reminds; it never pays."""
    rows = [
        ("PG&E", "Nov 12", 118, CHECKING, StatusLabel(status="healthy", label="Autopay")),
        (CARD, "Nov 18", 1_240, CHECKING, StatusLabel(status="neutral", label="Scheduled")),
        ("Car insurance", "Dec 2", 640, CARD, StatusLabel(status="in_progress", label="Reminder")),
        ("Property tax", "Dec 10", 3_860, CHECKING, StatusLabel(status="attention", label="Due")),
    ]
    return [
        Bill(
            id=f"BL-{principal}-{n}",
            name=name,
            due=due,
            amount=scaled(principal, amount),
            account=account,
            status=status,
        )
        for n, (name, due, amount, account, status) in enumerate(rows, start=1)
    ]


def imports() -> dict[Principal, list[StatementImport]]:
    """Import status per account, for each principal. The credit card's statement is overdue."""
    current = StatusLabel(status="healthy", label="Current")
    return {
        principal: [
            StatementImport(
                id="IM-checking",
                account=CHECKING,
                meta="Last statement Oct 1 · next Nov 1",
                status=current,
            ),
            StatementImport(
                id="IM-card",
                account=CARD,
                meta="Last statement Sep 18 · expected Oct 18",
                status=StatusLabel(status="attention", label="Overdue"),
            ),
            StatementImport(
                id="IM-brokerage", account=BROKERAGE, meta="Last export Oct 3", status=current
            ),
        ]
        for principal in PRINCIPALS
    }


def unmapped_accounts() -> list[UnmappedAccount]:
    """Accounts found in imports or mail that belong to no principal yet."""
    return [
        UnmappedAccount(id="UA-1", name="Savings ··3318", meta="In a dropped statement · Nov 2"),
        UnmappedAccount(id="UA-2", name="HSA ··0907", meta="Found by the mail connector · Oct 30"),
    ]


INBOX_FOLDERS: dict[Principal, str] = {
    "owner": "Inbox/finance",
    "mom": "Inbox/mom/finance",
    "dad": "Inbox/dad/finance",
}
"""Where a statement export can be dropped instead of uploaded; the subfolder sets the principal
(spec 20.4)."""

REQUEST_WORDS = {
    "import_check": ("Import check for {who}", "Tally", "Tally is checking every import"),
    "monthly_close": ("Monthly close for {who}", "Ledger", "Ledger is closing the month"),
}
"""A finance request's work item: its title, who does it and what Live says."""


# Setup ----------------------------------------------------------------------------------------

SECRETS: dict[str, list[SecretField]] = {
    "OI-13": [
        SecretField(
            id="assistant-token",
            label="Assistant bot token",
            hint="Discord developer portal → your Assistant app → Bot → Reset Token",
            saved=False,
        ),
        SecretField(
            id="ops-token",
            label="Ops bot token",
            hint="The same, for the Ops app",
            saved=False,
        ),
    ],
    "OI-16": [
        SecretField(
            id="mail-app-password",
            label="Mail app password",
            hint="An app password from your mail provider, never your sign-in password",
            saved=False,
        )
    ],
}
"""The secrets each step's secret form asks for. Values never come back; only `saved` does."""

SECRET_PROOFS = {
    "OI-13": "Both tokens saved to the Keychain · /whoami answered from the local Discord mock",
    "OI-16": "App password saved to the Keychain · first sync ran against the test mail server",
}
"""The proof a step records once its last secret is saved (spec 24.5, "Each step proves itself")."""

INTERVIEW_QUESTIONS = [
    ("Your day", "When do you usually start your day, and when should I go quiet at night?"),
    ("Booking for Mom and Dad", "Who should I check with before booking anything for Mom or Dad?"),
    ("Reminders", "How far ahead do you like reminders: a day, a week, or both?"),
    ("Always ask first", "Is there anything I should never do without asking, even if it's small?"),
]
"""Atlas's profile interview: what each answer is saved as, and the question."""

INTERVIEW_DONE = (
    "Thanks. Here's what I'll save to your profile. Confirm it, or start over to change an answer."
)


def interview() -> Interview:
    """The profile interview before the first answer."""
    return Interview(
        turns=[InterviewTurn(speaker="atlas", text=INTERVIEW_QUESTIONS[0][1])],
        asked=0,
        total=len(INTERVIEW_QUESTIONS),
        facts=[],
    )
