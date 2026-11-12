"""Sessions, transcripts, work items, ideas and reviews for the mock engine."""

from datetime import datetime, timedelta

from control_center.contract.common import Department, EmployeeState, StatusLabel
from control_center.contract.work import (
    BlockedCode,
    Idea,
    Lane,
    LiveTask,
    ReviewRequest,
    Stage,
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
        ),
    ]


def ideas() -> list[Idea]:
    """Ideas on the board, in Pipeline A states (spec 16.2)."""
    return [
        Idea(id="ID-0014", title="Garden watering planner", state="Exploring", lead="Spark"),
        Idea(id="ID-0013", title="Shared family calendar digest", state="Validating", lead="Spark"),
        Idea(id="ID-0011", title="Utility bill anomaly alerts", state="Ready", lead="Spark"),
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
        )
    ]
