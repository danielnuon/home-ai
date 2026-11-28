"""Sessions, transcripts, work items, ideas and reviews for the mock engine."""

from datetime import datetime, timedelta

from control_center.contract.common import Department, EmployeeState, StatusLabel
from control_center.contract.work import (
    BlockedCode,
    DiffFile,
    DiffLine,
    GateCheck,
    Idea,
    Lane,
    LiveTask,
    Product,
    PullRequest,
    ReviewRequest,
    Stage,
    StageEvent,
    TranscriptEntry,
    WaitingOn,
    WorkItem,
)

STAGE_CODES = [f"D{n}" for n in range(11)]
"""Development stages D0 to D10 (spec 17.3)."""

PHASE_OF_STAGE = {
    "D0": "Requirements",
    "D1": "Planning",
    "D2": "Design",
    "D3": "Build",
    "D4": "Build",
    "D5": "Test",
    "D6": "Test",
    "D7": "Test",
    "D8": "Release",
    "D9": "Release",
    "D10": "Operate and maintain",
}
"""The life-cycle phase each development stage belongs to (the table in spec 17.20)."""


def phase_label(stage: int, doing: str) -> str:
    """A work item's status words: its phase, then what is happening at its stage.

    Every work-item card names the phase with the stage (spec 17.20), so the label is built here
    rather than typed into each item.

    Args:
        stage: The item's current stage number, 0 to 10.
        doing: What is happening, like "D4 implement" or "Needs you at G3".

    Returns:
        The label, like "Build · D4 implement".
    """
    return f"{PHASE_OF_STAGE[STAGE_CODES[stage]]} · {doing}"


def stage_rail(current: int) -> list[Stage]:
    """A D0–D10 rail with every stage before `current` done."""
    return [
        Stage(
            code=code,
            state="done" if index < current else "current" if index == current else "todo",
        )
        for index, code in enumerate(STAGE_CODES)
    ]


def _session(  # noqa: PLR0913 -- a row of fixture data; keyword arguments read as a table
    task_id: str,
    employee: tuple[str, str, Department],
    doing: str,
    item: str,
    *,
    state: EmployeeState = "idle",
    lane: Lane = "personal",
    thread: tuple[str, str, str] | None = None,
    started: datetime | None = None,
    rate: float | None = None,
    queued: bool = False,
    waiting_on: WaitingOn | None = None,
    blocked_code: BlockedCode | None = None,
) -> LiveTask:
    """One session. `employee` is its id, name and department; `thread` its id, title and lead."""
    employee_id, employee_name, department = employee
    thread_id, thread_title, lead_name = thread or (None, None, None)
    return LiveTask(
        id=task_id,
        employee_id=employee_id,
        employee_name=employee_name,
        department=department,
        state=state,
        doing=doing,
        item=item,
        model="conversation model" if lane == "personal" else "coding model",
        lane=lane,
        started_at=started,
        tokens_per_second=rate,
        queued=queued,
        waiting_on=waiting_on,
        blocked_code=blocked_code,
        thread_id=thread_id,
        thread_title=thread_title,
        lead_name=lead_name,
    )


def live_tasks(now: datetime) -> list[LiveTask]:
    """Sessions in every state Live shows (spec 15.8.2), on the threads in `fixtures.threads`.

    The daily brief and inbox triage are scheduled work, so they belong to no thread (15.8.1).
    """
    reminders = ("TH-0131", "Lease Reminders 1.2", "Foreman")
    scanner = ("TH-0129", "Receipt scanner: better totals", "Foreman")
    digest = ("TH-0120", "Shared family calendar digest", "Spark")
    renewal = ("TH-0214", "Lease renewal for the rental", "Atlas")
    return [
        _session(
            "T-5521",
            ("ENG-1", "Bolt", "engineering"),
            "is writing the reminder schedule",
            "WI-0031 Lease Reminders",
            state="generating",
            lane="development",
            thread=reminders,
            started=now - timedelta(minutes=6, seconds=12),
            rate=41.0,
        ),
        _session(
            "T-5522",
            ("PO-1", "Atlas", "personal"),
            "is drafting tomorrow's brief",
            "Daily brief",
            state="generating",
            started=now - timedelta(minutes=1),
            rate=23.0,
        ),
        _session(
            "T-5519",
            ("GOV-1", "Foreman", "governance"),
            "is waiting for your yes on the design",
            "WI-0029 Receipt scanner",
            state="waiting",
            lane="development",
            thread=scanner,
            started=now - timedelta(hours=3),
            waiting_on="owner",
        ),
        _session(
            "T-5525",
            ("PO-9", "Keystone", "personal"),
            "is waiting for the tenant's reply",
            "Lease renewal",
            thread=renewal,
            started=now - timedelta(days=1),
            waiting_on="third_party",
        ),
        _session(
            "T-5517",
            ("IDEA-1", "Spark", "ideation"),
            "has reached this idea's budget cap",
            "ID-0013 Calendar digest",
            state="blocked",
            lane="development",
            thread=digest,
            started=now - timedelta(hours=5),
            blocked_code="budget",
        ),
        _session(
            "T-5523",
            ("QA-3", "Redline", "quality"),
            "is waiting for Bolt",
            "Review WI-0031",
            lane="development",
            thread=reminders,
            queued=True,
        ),
        _session(
            "T-5524",
            ("PO-3", "Sieve", "personal"),
            "will triage 6 new emails",
            "Inbox triage",
            queued=True,
        ),
    ]


def transcripts() -> dict[str, list[TranscriptEntry]]:
    """Transcripts so far, keyed by task id. Queued tasks have none yet."""
    return {
        "T-5521": [
            TranscriptEntry(id="E-1", kind="tool", text="repo.read src/reminders/"),
            TranscriptEntry(id="E-2", kind="tool", text="tests.run · 3 failing"),
            TranscriptEntry(
                id="E-3",
                kind="message",
                text=(
                    "The three failing tests expect reminders 30, 14 and 3 days before the lease "
                    "end. I'll add a schedule table and compute the dates from the lease's end "
                    "date, so a renewal moves every reminder."
                ),
            ),
            TranscriptEntry(id="E-4", kind="tool", text="fs.write src/reminders/schedule.py"),
            TranscriptEntry(id="E-5", kind="generating", text="", done=False),
        ],
        "T-5522": [
            TranscriptEntry(id="E-1", kind="tool", text="calendar.list · tomorrow"),
            TranscriptEntry(
                id="E-2", kind="generating", text="Good morning. Today you have", done=False
            ),
        ],
    }


TASK_STAGES = {"T-5521": 4}
"""Tasks that belong to a work item show its stage rail; the value is the current stage."""


def work_items() -> list[WorkItem]:
    """Two work items: one being built, one waiting on the Owner at G3."""
    return [
        WorkItem(
            id="WI-0031",
            title="Lease Reminders 1.2",
            risk="R2",
            status=StatusLabel(status="in_progress", label=phase_label(4, "D4 implement")),
            stages=stage_rail(4),
            progress=0.4,
            employee_name="Bolt",
            department="engineering",
            employee_state="generating",
            now="Bolt is writing the reminder schedule",
            eta="About 2–4 h left",
            cost_usd=0.0,
            waiting_on_owner=False,
            rework_count=1,
            product_id="PR-lease",
            thread_id="TH-0131",
        ),
        WorkItem(
            id="WI-0029",
            title="Receipt scanner: better totals",
            risk="R1",
            status=StatusLabel(status="attention", label=phase_label(2, "Needs you at G3")),
            stages=stage_rail(2),
            progress=0.2,
            employee_name="Foreman",
            department="governance",
            employee_state="waiting",
            now="Foreman needs a yes on the design",
            eta="Paused until you decide",
            cost_usd=0.0,
            waiting_on_owner=True,
            priority="high",
            product_id="PR-receipts",
            thread_id="TH-0129",
        ),
    ]


def ideas() -> list[Idea]:
    """Ideas on the board, in Pipeline A states (spec 16.2)."""
    return [
        Idea(
            id="ID-0014",
            title="Garden watering planner",
            state="Exploring",
            lead="Spark",
            summary="Water the beds from the forecast instead of a fixed timer.",
            thread_id="TH-0118",
        ),
        Idea(
            id="ID-0013",
            title="Shared family calendar digest",
            state="Validating",
            lead="Spark",
            summary="One weekly email to Mom and Dad with everyone's plans.",
            thread_id="TH-0120",
        ),
        Idea(
            id="ID-0011",
            title="Utility bill anomaly alerts",
            state="Ready",
            lead="Spark",
            summary="Tell me when a utility bill is far off its usual amount.",
            priority="low",
        ),
    ]


def reviews() -> list[ReviewRequest]:
    """One review request waiting, with its readability result (spec 17.18)."""
    return [
        ReviewRequest(
            id="RR-0044",
            title="Reminder schedule",
            added_lines=212,
            removed_lines=40,
            reviewer="Redline on the coding model · same-family review controls on",
            readability="Checks passed · cold read correct · 1 note for Bolt",
            item_id="WI-0031",
        )
    ]


WIP_STAGES = {"D4", "D5", "D6", "D7"}
"""The stages a work item counts toward its product's WIP limit in (spec 17.10)."""

WIP_PER_PRODUCT = 2
"""`pipelines.development.wip_per_product` (spec 17.10, 22.2)."""

WIP_GLOBAL = 3
"""`pipelines.development.wip_global`: across every product (22.2)."""

GITHUB_ORG = "https://github.com/home-platform"
"""The platform's private GitHub organization in the mocks (spec 17.19)."""


def _product(product_id: str, name: str, slug: str, *prs: PullRequest) -> Product:
    """A released product with its repository on the working drive and its mirror."""
    return Product(
        id=product_id,
        name=name,
        state="released",
        repo_path=f"/Volumes/Data/work/{slug}/",
        github_url=f"{GITHUB_ORG}/{slug}",
        pull_requests=list(prs),
        wip=0,
        wip_limit=WIP_PER_PRODUCT,
    )


def products() -> list[Product]:
    """Three released products: two with work open, and one the Owner might retire (17.21)."""
    return [
        _product(
            "PR-lease",
            "Lease Reminders",
            "lease-reminders",
            PullRequest(
                number=12,
                title="WI-0031 Lease Reminders 1.2",
                url=f"{GITHUB_ORG}/lease-reminders/pull/12",
                item_id="WI-0031",
            ),
        ),
        _product(
            "PR-receipts",
            "Receipt scanner",
            "receipt-scanner",
            PullRequest(
                number=7,
                title="WI-0029 Receipt scanner: better totals",
                url=f"{GITHUB_ORG}/receipt-scanner/pull/7",
                item_id="WI-0029",
            ),
        ),
        _product("PR-ledger", "Rent ledger", "rent-ledger"),
    ]


GATE_NAMES = {
    "G1": "Requirements",
    "G2": "Plan",
    "G3": "Design",
    "G4": "Tests first",
    "G5": "Code review",
    "G6": "Validation",
    "G7": "Release readiness",
    "G8": "7-day review",
}
"""The gates on a development work item's path (spec 17.3)."""


def gates(passed: int, waiting: str | None = None) -> list[GateCheck]:
    """Every gate, with the first `passed` passed and `waiting` (if any) waiting on its approver."""
    return [
        GateCheck(
            code=code,
            name=name,
            state="passed" if index < passed else "waiting" if code == waiting else "todo",
            note="Passed on evidence"
            if index < passed
            else "Waiting on you"
            if code == waiting
            else "",
        )
        for index, (code, name) in enumerate(GATE_NAMES.items())
    ]


def stage_history(item_id: str) -> list[StageEvent]:
    """What happened on each item so far, newest last. A new item has only its intake."""
    histories = {
        "WI-0031": [
            StageEvent(code="D0", text="Foreman took the request", when="Oct 27"),
            StageEvent(code="D1", text="Plan approved at G2", when="Oct 27"),
            StageEvent(code="D2", text="Design approved by you at G3", when="Oct 28"),
            StageEvent(code="D3", text="Probe wrote 14 failing tests; G4 passed", when="Oct 29"),
            StageEvent(code="D4", text="Redline sent one slice back for rework", when="Oct 30"),
            StageEvent(code="D4", text="Bolt is implementing the reminder schedule", when="today"),
        ],
        "WI-0029": [
            StageEvent(code="D0", text="Foreman took the request", when="Oct 25"),
            StageEvent(code="D1", text="Plan approved at G2", when="Oct 26"),
            StageEvent(code="D2", text="Design is waiting for your yes at G3", when="yesterday"),
        ],
    }
    return histories.get(
        item_id, [StageEvent(code="D0", text="Foreman opened the work item", when="today")]
    )


def item_gates(item_id: str) -> list[GateCheck]:
    """Where each item stands at its gates."""
    return {"WI-0031": gates(4), "WI-0029": gates(2, waiting="G3")}.get(
        item_id, gates(0, waiting="G1")
    )


def _lines(*rows: str) -> list[DiffLine]:
    """Diff lines from "+ added", "- removed" and "  context" rows."""
    kinds = {"+": "add", "-": "remove", " ": "context"}
    return [DiffLine(kind=kinds[row[0]], text=row[2:]) for row in rows]  # type: ignore[arg-type]


def diffs(item_id: str) -> list[DiffFile]:
    """The changes in an item's open review request; an item not yet in review has none."""
    if item_id != "WI-0031":
        return []
    return [
        DiffFile(
            path="src/reminders/schedule.py",
            added=8,
            removed=2,
            lines=_lines(
                "  from datetime import date, timedelta",
                "  ",
                "- REMINDER_DAYS = 30",
                "+ REMINDER_DAYS = (30, 14, 3)",
                '+ """Days before a lease ends that each reminder goes out."""',
                "  ",
                "- def reminder_date(lease_end: date) -> date:",
                "-     return lease_end - timedelta(days=REMINDER_DAYS)",
                "+ def reminder_dates(lease_end: date) -> list[date]:",
                '+     """Every reminder date, counted back from the end of the lease."""',
                "+     return [lease_end - timedelta(days=days) for days in REMINDER_DAYS]",
            ),
        ),
        DiffFile(
            path="tests/test_schedule.py",
            added=4,
            removed=0,
            lines=_lines(
                "  def test_reminders_follow_the_lease_end():",
                "+     dates = reminder_dates(date(2027, 3, 31))",
                "+     assert dates == [date(2027, 3, 1), date(2027, 3, 17), date(2027, 3, 28)]",
                "+ ",
                "+ # A renewal moves the end date, so every reminder moves with it.",
            ),
        ),
    ]
