"""Thread records for the mock engine: one in each state the Threads view can show."""

from control_center.backends.mock.threads import ThreadRecord
from control_center.contract.common import Department
from control_center.contract.work import ThreadKind

LEADS: dict[str, tuple[str, Department, str]] = {
    "foreman": ("Foreman", "governance", "Development"),
    "atlas": ("Atlas", "personal", "Personal"),
    "spark": ("Spark", "ideation", "Ideation"),
}
"""Each lead's name, department and pipeline, by its id in Chat."""


def _thread(
    thread_id: str, title: str, lead_id: str, since: str, **facts: str | None
) -> ThreadRecord:
    """A thread led by `lead_id`. Its kind and unit come from `facts["unit_id"]`, if given."""
    name, department, pipeline = LEADS[lead_id]
    unit_id = facts.pop("unit_id", None)
    kind: ThreadKind = (
        "work_item" if (unit_id or "").startswith("WI-") else "idea" if unit_id else "case"
    )
    return ThreadRecord(
        id=thread_id,
        title=title,
        kind=kind,
        unit_id=unit_id,
        lead_id=lead_id,
        lead_name=name,
        lead_department=department,
        pipeline=pipeline,
        principal="owner",
        since=since,
        **facts,
    )


def threads() -> list[ThreadRecord]:
    """Open threads, then two resolved ones. Sessions in `work.live_tasks` name these by id."""
    return [
        _thread("TH-0120", "Shared family calendar digest", "spark", "Monday", unit_id="ID-0013"),
        _thread(
            "TH-0129",
            "Receipt scanner: better totals",
            "foreman",
            "yesterday",
            unit_id="WI-0029",
            owner_decision="Foreman needs a yes on the design (gate G3).",
        ),
        _thread("TH-0209", "Reply to Dr. Patel's office", "atlas", "today", approval_id="AP-0107"),
        _thread("TH-0131", "Lease Reminders 1.2", "foreman", "Oct 27", unit_id="WI-0031"),
        _thread(
            "TH-0207",
            "Book the oil change",
            "atlas",
            "today",
            proposed_resolution=(
                "Booked for Saturday at 9:00 at Midtown Auto, and added to your calendar."
            ),
        ),
        _thread(
            "TH-0214",
            "Lease renewal for the rental",
            "atlas",
            "Tuesday",
            waiting_for="the tenant's reply, expected by Thursday",
        ),
        _thread("TH-0118", "Garden watering planner", "spark", "Tuesday", unit_id="ID-0014"),
        _thread(
            "TH-0201",
            "Renew the car registration",
            "atlas",
            "Oct 22",
            outcome="Renewed online. The sticker arrives by mail.",
        ),
        _thread(
            "TH-0127",
            "Lease Reminders 1.1",
            "foreman",
            "Oct 20",
            unit_id="WI-0027",
            outcome="Released, and its 7-day review is done.",
        ),
    ]
