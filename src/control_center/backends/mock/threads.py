"""Thread records and the rule that derives a thread's state (spec 15.8.3).

No agent sets a thread's state. The engine derives it from recorded facts: the thread's open
sessions, the Owner decisions it waits for, and what its lead has recorded about it. The rule is
here, apart from the mock's state, so the tests can pin it down and the real engine can be held
to the same cases.
"""

from dataclasses import dataclass

from control_center.contract.common import Department, Principal
from control_center.contract.work import BlockedCode, LiveTask, Thread, ThreadKind, ThreadState

STATE_ORDER: list[ThreadState] = [
    "blocked",
    "needs_owner",
    "paused",
    "working",
    "review_ready",
    "waiting",
    "idle",
    "resolved",
]
"""Thread states in the order the Threads view lists them: what needs someone comes first."""

BLOCKED_WORDS: dict[BlockedCode, str] = {
    "rework_limit": "Three rework cycles at one gate. The governance reviewer decides next.",
    "budget": "Its budget cap is reached. The lead can narrow the scope, or you can raise the cap.",
    "rounds": "Three analysis rounds without a check-in. It needs a word from you.",
    "stalled": "It stalled twice in a row. The lead is re-planning.",
    "dependency": "A thread it depends on failed. The lead decides what to do.",
    "policy_denied": "A tool it needs was denied. The lead is re-planning within the rules.",
    "resource_lost": "A degraded mode lasted too long. The watchdog is clearing it.",
    "failed": "Its session failed twice. The lead decides what to do.",
}
"""Each blocked reason with who can unblock it, in the Owner's words (spec 15.8.4)."""

WAITING_WORDS = {
    "gate": "a gate",
    "agent": "another employee",
    "resource": "a free model slot",
    "third_party": "a reply from outside",
    "time": "its scheduled time",
}
"""What a session waits on, for a thread whose lead recorded nothing more exact."""


@dataclass
class ThreadRecord:
    """What is recorded about one thread. Its state is derived from this and its sessions.

    `owner_decision` is a question or gate waiting on the Owner, in words. `approval_id` names an
    approval card the thread waits on instead. `proposed_resolution` is the closing summary the
    lead wrote when it proposed resolving; `outcome` is set once the thread is resolved.
    `waiting_for` says what a waiting thread expects, when the lead recorded it.
    """

    id: str
    title: str
    kind: ThreadKind
    unit_id: str | None
    lead_id: str
    lead_name: str
    lead_department: Department
    pipeline: str
    principal: Principal
    since: str
    owner_decision: str | None = None
    approval_id: str | None = None
    proposed_resolution: str | None = None
    waiting_for: str | None = None
    outcome: str | None = None


def derive(
    record: ThreadRecord, sessions: list[LiveTask], approval_pending: bool
) -> tuple[ThreadState, str]:
    """A thread's state and the line it is shown with. The first rule that applies wins.

    Args:
        record: What is recorded about the thread.
        sessions: The thread's open sessions.
        approval_pending: Whether the approval card named by `record.approval_id` still waits.

    Returns:
        The state, and who is doing what, what it waits on, or why it is blocked.
    """
    if record.outcome is not None:
        return "resolved", record.outcome
    return next(
        found
        for found in (
            _blocked(sessions),
            _needs_owner(record, sessions, approval_pending),
            _paused(sessions),
            _working(sessions),
            _review_ready(record),
            _waiting(record, sessions),
            ("idle", f"Idle since {record.since}"),
        )
        if found is not None
    )


Derived = tuple[ThreadState, str] | None
"""What one rule answers: the state and its line, or None when the rule does not apply."""


def _blocked(sessions: list[LiveTask]) -> Derived:
    code = next((s.blocked_code for s in sessions if s.blocked_code is not None), None)
    return None if code is None else ("blocked", BLOCKED_WORDS[code])


def _needs_owner(record: ThreadRecord, sessions: list[LiveTask], approval_pending: bool) -> Derived:
    if record.owner_decision is not None:
        return "needs_owner", record.owner_decision
    if approval_pending:
        return "needs_owner", "An approval is waiting for you."
    asking = next((s for s in sessions if s.waiting_on == "owner"), None)
    return None if asking is None else ("needs_owner", f"{asking.employee_name} {asking.doing}")


def _paused(sessions: list[LiveTask]) -> Derived:
    if sessions and all(session.paused for session in sessions):
        return "paused", "Paused. Nothing runs until it is resumed."
    return None


def _working(sessions: list[LiveTask]) -> Derived:
    active = [s for s in sessions if s.session_state in ("running", "queued")]
    if not active:
        return None
    first = active[0]
    others = f" · {len(active) - 1} more" if len(active) > 1 else ""
    return "working", f"{first.employee_name} {first.doing}{others}"


def _review_ready(record: ThreadRecord) -> Derived:
    if record.proposed_resolution is None:
        return None
    return "review_ready", record.proposed_resolution


def _waiting(record: ThreadRecord, sessions: list[LiveTask]) -> Derived:
    waiting = next((s.waiting_on for s in sessions if s.waiting_on is not None), None)
    if record.waiting_for is not None:
        return "waiting", f"Waiting on {record.waiting_for}"
    if waiting is not None and waiting != "owner":
        return "waiting", f"Waiting on {WAITING_WORDS[waiting]}"
    return None


def to_thread(record: ThreadRecord, sessions: list[LiveTask], approval_pending: bool) -> Thread:
    """The thread as Brain shows it: the record plus its derived state."""
    state, detail = derive(record, sessions, approval_pending)
    return Thread(
        id=record.id,
        title=record.title,
        kind=record.kind,
        unit_id=record.unit_id,
        lead_id=record.lead_id,
        lead_name=record.lead_name,
        lead_department=record.lead_department,
        pipeline=record.pipeline,
        principal=record.principal,
        state=state,
        detail=detail,
        since=record.since,
        closing_summary=record.proposed_resolution if state == "review_ready" else None,
        approval_id=record.approval_id if approval_pending else None,
    )
