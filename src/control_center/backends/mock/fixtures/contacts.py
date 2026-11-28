"""The household, outside contacts, the accounts that map to principals, and contact history."""

from datetime import datetime, timedelta

from control_center.contract.people import (
    Contact,
    ContactChannel,
    ContactEvent,
    HouseholdMember,
    LinkableAccount,
)

PRINCIPAL_UNDO_DAYS = 7
"""Days a removed principal can be restored before their data is archived or deleted for good."""

ACCOUNTS = [
    LinkableAccount(id="A-01", label="Personal Gmail", kind="account"),
    LinkableAccount(id="A-02", label="Work Outlook", kind="account"),
    LinkableAccount(id="A-03", label="Chase checking", kind="account"),
    LinkableAccount(id="A-04", label="Mom's Gmail", kind="account"),
    LinkableAccount(id="A-05", label="Mom's Medicare portal", kind="account"),
    LinkableAccount(id="A-06", label="Dad's Gmail", kind="account"),
    LinkableAccount(id="A-07", label="Dad's insurer portal", kind="account"),
    LinkableAccount(id="K-01", label="Your calendar", kind="calendar"),
    LinkableAccount(id="K-02", label="Family calendar", kind="calendar"),
    LinkableAccount(id="K-03", label="Mom's calendar", kind="calendar"),
    LinkableAccount(id="K-04", label="Dad's calendar", kind="calendar"),
]
"""Connected accounts and calendars (Connections owns them; Contacts maps them to people)."""

RULES = [
    ("RL-03", "File A-1 Plumbing invoices under Home", ["C-03"]),
    ("RL-07", "Send tenant maintenance requests to Keystone", ["C-02"]),
    ("RL-09", "Put Dr. Patel's messages in the morning brief", ["C-01"]),
]
"""Personal rules that name a contact: id, title and the contacts they mention."""


def household_meta(member: HouseholdMember) -> str:
    """The line under a principal's name: who they are and what is mapped to them."""
    who = "Owner" if member.role == "owner" else "Principal"
    accounts = len(member.accounts)
    calendars = len(member.calendars)
    return (
        f"{who} · {accounts} account{'' if accounts == 1 else 's'}"
        f" · {calendars} calendar{'' if calendars == 1 else 's'}"
    )


def contact_meta(contact: Contact, names: dict[str, str]) -> str:
    """The line under a contact's name: its area, the principal it is for, and its channels.

    Args:
        contact: The contact.
        names: Household names by principal id.

    Returns:
        Such as "Health · Dad · email, phone".
    """
    kinds = list(dict.fromkeys(c.kind for c in contact.channels))
    parts = [contact.area]
    if contact.principal and contact.principal != "owner" and contact.principal in names:
        parts.append(names[contact.principal])
    if kinds:
        parts.append(", ".join(kinds))
    return " · ".join(p for p in parts if p)


def household() -> list[HouseholdMember]:
    """The three principals from the design, with their accounts and calendars."""
    members = [
        HouseholdMember(
            id="owner",
            name="You",
            meta="",
            role="owner",
            accounts=["A-01", "A-02", "A-03"],
            calendars=["K-01", "K-02"],
        ),
        HouseholdMember(
            id="mom", name="Mom", meta="", accounts=["A-04", "A-05"], calendars=["K-03"]
        ),
        HouseholdMember(
            id="dad", name="Dad", meta="", accounts=["A-06", "A-07"], calendars=["K-04"]
        ),
    ]
    for member in members:
        member.meta = household_meta(member)
    return members


def _contact(  # noqa: PLR0913 -- a row of fixture data; keyword arguments read as a table
    contact_id: str,
    name: str,
    area: str,
    trust: str,
    channels: list[tuple[str, str]],
    *,
    principal: str | None = "owner",
    accounts: tuple[str, ...] = (),
) -> Contact:
    return Contact.model_validate(
        {
            "id": contact_id,
            "name": name,
            "meta": "",
            "trust": trust,
            "area": area,
            "principal": principal,
            "channels": [
                ContactChannel.model_validate({"kind": k, "value": v}) for k, v in channels
            ],
            "linked_accounts": list(accounts),
        }
    )


def contacts() -> list[Contact]:
    """Outside contacts from the design, one of each trust level."""
    rows = [
        _contact(
            "C-01",
            "Dr. Patel's office",
            "Health",
            "allowlisted",
            [("email", "front.desk@[clinic domain]"), ("phone", "(555) 010-2231")],
            accounts=("Personal Gmail",),
        ),
        _contact(
            "C-02",
            "Unit B tenant",
            "Rental",
            "known",
            [("email", "unit.b@[tenant domain]"), ("text", "(555) 010-4410")],
            accounts=("Personal Gmail",),
        ),
        _contact(
            "C-03",
            "A-1 Plumbing",
            "Home",
            "allowlisted",
            [("phone", "(555) 010-7781"), ("email", "office@[plumber domain]")],
            accounts=("Personal Gmail", "Chase checking"),
        ),
        _contact(
            "C-04",
            "Tax preparer",
            "Taxes",
            "allowlisted",
            [("email", "returns@[tax firm domain]")],
            accounts=("Personal Gmail",),
        ),
        _contact(
            "C-05",
            "Insurer member services",
            "Health",
            "known",
            [("email", "members@[insurer domain]"), ("phone", "(555) 010-9000")],
            principal="dad",
            accounts=("Dad's Gmail", "Dad's insurer portal"),
        ),
        _contact("C-06", "Promo sender", "Mail", "blocked", [("email", "deals@[promo domain]")]),
    ]
    names = {m.id: m.name for m in household()}
    for row in rows:
        row.meta = contact_meta(row, names)
    return rows


def history(now: datetime) -> dict[str, list[ContactEvent]]:
    """Recent messages and approvals with each contact, newest first."""

    def event(days: float, kind: str, title: str, detail: str) -> ContactEvent:
        return ContactEvent.model_validate(
            {
                "at": now - timedelta(days=days),
                "kind": kind,
                "title": title,
                "detail": detail,
            }
        )

    return {
        "C-01": [
            event(0.2, "message", "Appointment reminder", "Tuesday at 10:30 · filed under Health"),
            event(12, "approval", "Sent: insurance card photo", "Approved by you · Chrono"),
        ],
        "C-02": [
            event(1, "message", "Kitchen faucet drips", "Keystone opened a maintenance case"),
            event(27, "approval", "Sent: September rent receipt", "Approved by you · Keystone"),
        ],
        "C-03": [event(9, "message", "Invoice #2291", "Filed under Home · paid Nov 19")],
        "C-04": [event(30, "message", "Engagement letter for 2026", "Filed under Taxes")],
        "C-05": [event(3, "message", "Explanation of benefits", "Filed under Health for Dad")],
        "C-06": [event(0.5, "message", "14 messages filed", "Blocked: filed without triage")],
    }
