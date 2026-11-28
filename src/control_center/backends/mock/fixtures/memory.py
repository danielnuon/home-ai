"""The Owner's saved notes on the mock's day (spec 15.9.2).

Internal ones only: until Phase 10 a restricted note is not saved anywhere (15.9.9), so none of
these is about health, money, the rental or family members.
"""

from datetime import datetime, timedelta

from control_center.contract.memory import MemoryItem

PINNED_MAX = 10
"""How many items may be pinned (`chat_memory.pinned_max`, 15.9.3)."""


def items(now: datetime) -> list[MemoryItem]:
    """Saved notes across the scopes, with one waiting to be confirmed and one superseded."""
    day = timedelta(days=1)
    return [
        MemoryItem(
            id="MEM-1",
            text="Call me Danny.",
            scope="owner",
            scope_label="Everyone",
            how="said",
            pinned=True,
            saved_at=now - 40 * day,
            last_used=now - timedelta(hours=1),
            use_count=58,
        ),
        MemoryItem(
            id="MEM-2",
            text="I prefer morning appointments.",
            scope="owner",
            scope_label="Everyone",
            how="learned",
            source_thread_id="TH-0207",
            source_thread_title="Book the oil change",
            source_lead_id="atlas",
            saved_at=now - timedelta(hours=5),
            last_used=now - timedelta(hours=5),
            use_count=1,
        ),
        MemoryItem(
            id="MEM-3",
            text="The car is serviced at Midtown Auto.",
            scope="domain",
            scope_label="Home and auto",
            how="learned",
            source_thread_id="TH-0207",
            source_thread_title="Book the oil change",
            source_lead_id="atlas",
            saved_at=now - timedelta(hours=5),
            use_count=0,
        ),
        MemoryItem(
            id="MEM-4",
            text="Keep the weekly maintenance report short.",
            scope="lead",
            scope_label="Custodian only",
            lead_id="custodian",
            how="said",
            saved_at=now - 12 * day,
            last_used=now - 3 * day,
            use_count=2,
        ),
        MemoryItem(
            id="MEM-5",
            text="The lease reminders tool must work offline.",
            scope="product",
            scope_label="Lease Reminders",
            lead_id="foreman",
            how="said",
            source_thread_id="TH-0127",
            source_thread_title="Lease Reminders 1.1",
            source_lead_id="foreman",
            saved_at=now - 9 * day,
            last_used=now - 2 * day,
            use_count=4,
        ),
        MemoryItem(
            id="MEM-6",
            text="Don't bring up the old gym membership.",
            kind="avoid",
            scope="owner",
            scope_label="Everyone",
            how="said",
            saved_at=now - 20 * day,
            use_count=0,
        ),
        MemoryItem(
            id="MEM-7",
            text="I prefer an aisle seat on flights.",
            scope="owner",
            scope_label="Everyone",
            status="proposed",
            how="learned",
            source="from an email from the airline",
            saved_at=now - 2 * day,
        ),
        MemoryItem(
            id="MEM-8",
            text="I prefer evening calls.",
            scope="owner",
            scope_label="Everyone",
            status="superseded",
            how="said",
            saved_at=now - 30 * day,
            last_used=now - 6 * day,
            use_count=7,
            superseded_by="MEM-9",
        ),
        MemoryItem(
            id="MEM-9",
            text="I prefer calls before noon.",
            scope="owner",
            scope_label="Everyone",
            how="said",
            saved_at=now - 6 * day,
            last_used=now - day,
            use_count=3,
        ),
    ]
