"""Composes the Today page from every backend, so the phone makes one request (spec 7.17)."""

from datetime import datetime

from control_center.config import OWNER_TIME_ZONE
from control_center.contract.gate import CriticalDecision
from control_center.contract.today import SetupProgress, TeamMember, TodayOverview
from control_center.contract.work import LiveTask
from control_center.wiring import Backends

NEEDS_YOU_SHOWN = 2
"""Approval cards shown in full on Today; the rest are a count with a link (design: Today)."""

TEAM_SHOWN = 4


def build_today(backends: Backends, now: datetime) -> TodayOverview:
    """Gather Today's sections from the gate, the engine and the status aggregator."""
    approvals = [a for a in backends.gate.list_approvals() if a.state == "pending"]
    tasks = backends.engine.live_tasks()
    steps = backends.engine.setup_steps()
    required = [step for step in steps if step.required]
    required_done = sum(1 for step in required if step.state == "done")
    local = now.astimezone(OWNER_TIME_ZONE)
    return TodayOverview(
        date=local.strftime("%A, %B %-d"),
        greeting=_greeting(local.hour),
        open_decision=_first_open(backends.gate.list_decisions()),
        needs_you=approvals[:NEEDS_YOU_SHOWN],
        needs_you_count=len(approvals),
        agenda=backends.engine.agenda(),
        team=_team(tasks),
        tasks=tasks,
        tiles=backends.status.subsystem_tiles(),
        metrics=backends.status.health_metrics(),
        setup=None
        if required_done == len(required)
        else SetupProgress(required_done=required_done, required_total=len(required)),
        spend_label=f"${backends.status.spend().total_usd:.2f} this month",
    )


def _greeting(hour: int) -> str:
    if hour < 12:
        return "Good morning"
    if hour < 18:
        return "Good afternoon"
    return "Good evening"


def _first_open(decisions: list[CriticalDecision]) -> CriticalDecision | None:
    return next((d for d in decisions if d.open), None)


def _team(tasks: list[LiveTask]) -> list[TeamMember]:
    """One member per task's employee, working ones first, as on "Team, right now"."""
    return [
        TeamMember(
            id=task.employee_id,
            name=task.employee_name,
            department=task.department,
            state=task.state,
            doing=task.doing,
            tokens_per_second=task.tokens_per_second,
        )
        for task in tasks[:TEAM_SHOWN]
    ]
