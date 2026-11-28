"""Thread records for the mock engine: one in each state the Threads view can show."""

from control_center.backends.mock.threads import ThreadRecord
from control_center.contract.common import Department
from control_center.contract.work import ThreadKind

LEADS: dict[str, tuple[str, Department, str]] = {
    "foreman": ("Foreman", "governance", "Development"),
    "atlas": ("Atlas", "personal", "Personal"),
    "spark": ("Spark", "ideation", "Ideation"),
    "custodian": ("Custodian", "engineering", "Maintenance"),
    "wayfinder": ("Wayfinder", "governance", "Guide"),
}
"""Each lead's name, department and pipeline, by its id in Chat."""


def _thread(
    thread_id: str, title: str, lead_id: str, since: str, **facts: str | None
) -> ThreadRecord:
    """A thread led by `lead_id`. Its kind and unit come from `facts["unit_id"]`, if given.

    `facts["conversation"]` marks a conversation thread: chat that is not yet a case or a unit.
    `facts["archived"]` marks a resolved thread past its archive delay (spec 15.8.7).
    """
    name, department, pipeline = LEADS[lead_id]
    unit_id = facts.pop("unit_id", None)
    kind: ThreadKind = (
        "conversation"
        if facts.pop("conversation", None)
        else "work_item"
        if (unit_id or "").startswith("WI-")
        else "idea"
        if unit_id
        else "case"
    )
    record = ThreadRecord(
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
    )
    record.archived = facts.pop("archived", None) is not None
    for fact, value in facts.items():
        setattr(record, fact, value)
    return record


def threads() -> list[ThreadRecord]:
    """Open threads, two resolved and two archived. Sessions in `work.live_tasks` name these."""
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
        _thread(
            "TH-0216",
            "Passport renewal and Dad's pharmacy",
            "atlas",
            "today",
            conversation="yes",
            approval_id="AP-0110",
        ),
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
        _thread(
            "TH-0096",
            "Water heater warranty claim",
            "atlas",
            "Sep 30",
            outcome="The claim was approved and the part was replaced.",
            archived="yes",
        ),
        _thread(
            "TH-0088",
            "Rent ledger 1.0",
            "foreman",
            "Sep 12",
            unit_id="WI-0019",
            outcome="Released, and its 7-day review is done.",
            archived="yes",
        ),
    ]
