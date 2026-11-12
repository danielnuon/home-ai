"""Employees and lifecycle proposals for the mock engine's Directory."""

from control_center.contract.common import Department, EmployeeState
from control_center.contract.work import Employee, LifecycleProposal

NOT_YET_HIRED = {"QA-5"}
"""Employees whose build phase has not arrived; the Directory shows them as not yet hired."""


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
            state="blocked",
            now="Blocked: an idea reached its budget",
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
            now="Waiting for the tenant's reply",
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
