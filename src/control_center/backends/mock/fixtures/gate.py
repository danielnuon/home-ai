"""Approvals, critical decisions and contacts for the mock gate. Settings are in `settings`."""

from datetime import UTC, datetime, timedelta

from control_center.contract.gate import (
    Approval,
    CriticalDecision,
    RejectedOption,
    ReleaseSummary,
)
from control_center.contract.personal import Contact, HouseholdMember


def approvals(now: datetime) -> list[Approval]:
    """The cards from the design: one-tap, restricted, a release, and the one in Chat."""
    return [
        Approval(
            id="AP-0107",
            title="Reply to Dr. Patel's office",
            employee_name="Chrono",
            department="personal",
            domain="Calendar and admin",
            data_class="internal",
            approval_class="P",
            tier="T2",
            principal="Owner",
            recipient="front.desk@[clinic domain]",
            recipient_trust="allowlisted",
            summary="Confirm Tuesday at 10:30 · from your Gmail",
            draft="Hi, confirming Tuesday at 10:30. Thank you!",
            expires_at=now + timedelta(hours=6),
            needs_step_up=False,
            state="pending",
        ),
        Approval(
            id="AP-0108",
            title="Send October rent receipt",
            employee_name="Keystone",
            department="personal",
            domain="Rental",
            data_class="restricted",
            approval_class="P",
            tier="T3",
            principal="Owner",
            recipient="Unit B tenant",
            recipient_trust="known",
            summary="New recipient · attachment: receipt-2026-10.pdf",
            draft="Hi, attached is your receipt for October rent, received on the 1st. Thanks!",
            expires_at=now + timedelta(hours=20),
            needs_step_up=True,
            state="pending",
        ),
        Approval(
            id="AP-0109",
            title="Release Lease Reminders 1.2",
            employee_name="Liftoff",
            department="engineering",
            domain="Development",
            data_class="internal",
            approval_class="R",
            principal="Owner",
            summary="R2 · gate G7",
            release=ReleaseSummary(
                added_lines=412,
                removed_lines=96,
                files=9,
                checks_passed=14,
                checks_total=14,
                rollback="One step to 1.1.4",
            ),
            expires_at=now + timedelta(days=6),
            needs_step_up=False,
            state="pending",
        ),
        Approval(
            id="AP-0110",
            title="Email the insurer from Dad's account",
            employee_name="Pulse",
            department="personal",
            domain="Health",
            data_class="restricted",
            approval_class="P",
            tier="T3",
            principal="Dad",
            recipient="Insurer member services",
            recipient_trust="known",
            summary="New recipient · asks to confirm in-network status for one pharmacy",
            draft=(
                "Hello, could you confirm whether the pharmacy on Elm Street is in network "
                "for my plan? Thank you."
            ),
            expires_at=now + timedelta(hours=24),
            needs_step_up=True,
            state="pending",
        ),
    ]


def decisions(now: datetime) -> list[CriticalDecision]:
    """One open CDR with 18 hours left, and the four earlier ones listed on the Decisions page."""
    open_record = CriticalDecision(
        id="CDR-0012",
        title="Switch the coding model to a newer release",
        summary=(
            "Passed 9% more held-out tasks at the same memory. Rejected: keeping the current "
            "model, which is slower on long files."
        ),
        rationale=(
            "Passed 9% more held-out Python and TypeScript tasks than the current model, at the "
            "same 4-bit size and 18 tok/s faster on files over 2,000 lines."
        ),
        rejected=[
            RejectedOption(
                option="Keep the current model",
                effect="slower on long files",
                outcome="more time per work item",
            ),
            RejectedOption(
                option="Use the larger 8-bit build",
                effect="does not fit the 27GB pool beside EMBED",
                outcome="rejected",
            ),
        ],
        risks=(
            "New release has 3 weeks of community use. The old model stays downloaded; "
            "reverting is one step."
        ),
        evidence="Benchmark cards for both models",
        effect="after_window",
        window_ends=now + timedelta(hours=18, minutes=4),
        status="pending_window",
        acknowledged=False,
        veto_preview=(
            "The switch is cancelled. Bolt keeps the current coding model, and the selector "
            "won't propose this model again for 30 days."
        ),
        decided_on="Oct 27",
    )
    return [open_record, *_earlier_decisions()]


def _earlier_decisions() -> list[CriticalDecision]:
    def past(cdr_id: str, title: str, when: str, *, vetoed: bool = False) -> CriticalDecision:
        return CriticalDecision(
            id=cdr_id,
            title=title,
            summary="",
            rationale="",
            rejected=[],
            risks="",
            evidence="",
            effect="immediate",
            window_ends=None,
            status="vetoed" if vetoed else "in_effect",
            acknowledged=not vetoed,
            veto_preview="",
            decided_on=when,
        )

    return [
        past("CDR-0011", "Reviews run on the coding model (option off)", "Oct 26"),
        past("CDR-0010", "Restricted domains show summaries in Discord", "Oct 26"),
        past("CDR-0009", "Nightly maintenance moved to 02:30", "Oct 24", vetoed=True),
        past("CDR-0001", "AI reviews the security-critical code", "Oct 24"),
    ]


def household() -> list[HouseholdMember]:
    """The three principals from the design."""
    return [
        HouseholdMember(id="owner", name="You", meta="Owner · 3 accounts"),
        HouseholdMember(id="mom", name="Mom", meta="Principal · 2 accounts"),
        HouseholdMember(id="dad", name="Dad", meta="Principal · 2 accounts"),
    ]


def contacts() -> list[Contact]:
    """Outside contacts from the design, one of each trust level."""
    return [
        Contact(id="C-01", name="Dr. Patel's office", meta="Health · email", trust="allowlisted"),
        Contact(id="C-02", name="Unit B tenant", meta="Rental · email, text", trust="known"),
        Contact(id="C-03", name="A-1 Plumbing", meta="Home · vendor", trust="allowlisted"),
        Contact(id="C-04", name="Tax preparer", meta="Taxes · email", trust="allowlisted"),
        Contact(
            id="C-05", name="Insurer member services", meta="Health · Dad · new", trust="known"
        ),
        Contact(id="C-06", name="Promo sender", meta="14 messages filed", trust="blocked"),
    ]


def fixture_now() -> datetime:
    """The clock the fixtures are built against. A function so tests can see the same instant."""
    return datetime.now(UTC)
