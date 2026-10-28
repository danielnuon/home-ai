"""Running tasks, transcripts, work items, ideas, reviews and employees for the mock engine."""

from datetime import datetime, timedelta

from control_center.contract.common import Department, EmployeeState, StatusLabel
from control_center.contract.work import (
    Employee,
    Idea,
    LifecycleProposal,
    LiveTask,
    ReviewRequest,
    Stage,
    TranscriptEntry,
    WorkItem,
)

STAGE_CODES = [f"D{n}" for n in range(11)]
"""Development stages D0 to D10 (spec 17.3)."""


def stage_rail(current: int) -> list[Stage]:
    """A D0–D10 rail with every stage before `current` done."""
    return [
        Stage(
            code=code,
            state="done" if index < current else "current" if index == current else "todo",
        )
        for index, code in enumerate(STAGE_CODES)
    ]


def live_tasks(now: datetime) -> list[LiveTask]:
    """The Live page of the design: two running, one just finished, one queued."""
    return [
        LiveTask(
            id="T-5521",
            employee_id="ENG-1",
            employee_name="Bolt",
            department="engineering",
            state="generating",
            doing="is writing the reminder schedule",
            item="WI-0031 Lease Reminders",
            model="coding model",
            lane="development",
            started_at=now - timedelta(minutes=6, seconds=12),
            tokens_per_second=41.0,
            queued=False,
        ),
        LiveTask(
            id="T-5522",
            employee_id="PO-1",
            employee_name="Atlas",
            department="personal",
            state="generating",
            doing="is drafting tomorrow's brief",
            item="Daily brief",
            model="conversation model",
            lane="personal",
            started_at=now - timedelta(minutes=1),
            tokens_per_second=23.0,
            queued=False,
        ),
        LiveTask(
            id="T-5523",
            employee_id="QA-3",
            employee_name="Redline",
            department="quality",
            state="waiting",
            doing="is waiting for Bolt",
            item="Review WI-0031",
            model="coding model",
            lane="development",
            started_at=None,
            tokens_per_second=None,
            queued=True,
        ),
        LiveTask(
            id="T-5524",
            employee_id="PO-3",
            employee_name="Sieve",
            department="personal",
            state="idle",
            doing="will triage 6 new emails",
            item="Inbox triage",
            model="conversation model",
            lane="personal",
            started_at=None,
            tokens_per_second=None,
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
            status=StatusLabel(status="in_progress", label="D4 implement"),
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
            status=StatusLabel(status="attention", label="Needs you at G3"),
            stages=stage_rail(3),
            progress=0.3,
            employee_name="Foreman",
            department="governance",
            employee_state="waiting",
            now="Foreman needs a yes on the test plan",
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


def _employee(  # noqa: PLR0913 -- a row of fixture data; keyword arguments read as a table
    employee_id: str,
    name: str,
    title: str,
    department: Department,
    group: str,
    *,
    state: EmployeeState = "idle",
    now: str = "Idle",
    tagline: str = "",
    tools: tuple[str, ...] = (),
    hired: str = "Phase 9",
    tasks_done: int = 0,
) -> Employee:
    return Employee(
        id=employee_id,
        name=name,
        title=title,
        department=department,
        group=group,
        state=state,
        now=now,
        tagline=tagline,
        mission=tagline,
        tools=list(tools),
        model="conversation model" if department == "personal" else "coding model",
        hired=hired,
        tasks_done=tasks_done,
        enabled=True,
    )


def employees() -> list[Employee]:
    """The employees shown in the design's Directory, grouped as there."""
    leads, personal, engineering = "Leads", "Personal", "Engineering and quality"
    return [
        _employee(
            "PO-1",
            "Atlas",
            "Chief of Staff",
            "personal",
            leads,
            state="generating",
            now="Writing the brief",
            tagline="Keeps the household running on time.",
            tools=("calendar.list", "mail.draft", "records.write"),
            tasks_done=214,
        ),
        _employee(
            "GOV-1",
            "Foreman",
            "Development Lead",
            "governance",
            leads,
            state="waiting",
            now="Waiting on you",
            tagline="Turns ideas into shipped, documented software.",
            tools=("pipeline.start", "pipeline.request_gate"),
            hired="Phase 11",
            tasks_done=61,
        ),
        _employee(
            "IDEA-1",
            "Spark",
            "Ideation Lead",
            "ideation",
            leads,
            tagline="Finds the flaw before the code exists.",
            hired="Phase 12",
            tasks_done=18,
        ),
        _employee(
            "MNT-1",
            "Custodian",
            "Maintenance Lead",
            "engineering",
            leads,
            now="Next run 01:00",
            tagline="Keeps released products healthy.",
            hired="Phase 14",
            tasks_done=40,
        ),
        _employee(
            "PO-2",
            "Chrono",
            "Scheduler",
            "personal",
            personal,
            tagline="Finds the time, books it, reminds you.",
            tools=("calendar.freebusy", "calendar.upsert_own"),
            tasks_done=96,
        ),
        _employee(
            "PO-9",
            "Keystone",
            "Property Manager",
            "personal",
            personal,
            state="thinking",
            now="Lease renewal case",
            tagline="Runs the rental like a small business.",
            hired="Phase 10",
            tasks_done=37,
        ),
        _employee(
            "PO-8",
            "Ledger",
            "Budget Analyst",
            "personal",
            personal,
            tagline="Every figure computed in code.",
            hired="Phase 10",
            tasks_done=22,
        ),
        _employee(
            "PO-10",
            "Pulse",
            "Health and Benefits",
            "personal",
            personal,
            tagline="Appointments, plans and paperwork.",
            hired="Phase 10",
            tasks_done=19,
        ),
        _employee(
            "ENG-1",
            "Bolt",
            "Software Engineer",
            "engineering",
            engineering,
            state="generating",
            now="Writing code",
            tagline="Red, green, refactor.",
            tools=("fs.write", "exec.run", "git.commit"),
            hired="Phase 11",
            tasks_done=128,
        ),
        _employee(
            "QA-1",
            "Probe",
            "Test Author",
            "quality",
            engineering,
            now="14 tests done",
            tagline="Writes the tests before the code.",
            hired="Phase 11",
            tasks_done=74,
        ),
        _employee(
            "QA-3",
            "Redline",
            "Code Reviewer",
            "quality",
            engineering,
            state="waiting",
            now="Queued for review",
            tagline="Reads every change like a newcomer.",
            hired="Phase 11",
            tasks_done=59,
        ),
        _employee(
            "QA-5",
            "Gremlin",
            "Adversarial Tester",
            "quality",
            engineering,
            now="Arrives in Phase 13",
            tagline="Breaks things on purpose.",
            hired="Phase 13",
        ),
    ]


def proposals() -> list[LifecycleProposal]:
    """Cadence's open proposal from the design."""
    return [
        LifecycleProposal(
            id="LP-0003",
            text=(
                "Disable Logistix: 2 tasks in 30 days, low impact. Spark would cover operations "
                "questions."
            ),
            source="Cadence · monthly review",
            state="open",
        )
    ]
