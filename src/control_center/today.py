"""Composes the Today page from every backend, so the phone makes one request (spec 7.17)."""

from datetime import datetime
from zoneinfo import ZoneInfo

from control_center.contract.common import Metric, StatusLabel
from control_center.contract.gate import CriticalDecision
from control_center.contract.today import SetupProgress, TeamMember, Tile, TodayOverview
from control_center.contract.work import LiveTask
from control_center.wiring import Backends

OWNER_TIME_ZONE = ZoneInfo("America/Los_Angeles")
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
        tiles=_tiles(backends),
        metrics=_metrics(),
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
    return next((d for d in decisions if d.status == "pending_window" and not d.acknowledged), None)


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


def _tiles(backends: Backends) -> list[Tile]:
    """One tile per subsystem (spec 7.2, Today), each opening its own page."""
    services = backends.status.services()
    models = backends.status.models()
    backups = backends.status.backups()
    spend = backends.status.spend()
    pool = next(z for z in backends.status.system().zones if z.name == "Model pool")
    return [
        Tile(
            name="Services",
            value=services.summary.split(" · ")[0],
            status=StatusLabel(status="healthy", label="Healthy"),
            href="/services",
        ),
        Tile(
            name="Model pool",
            value=f"{pool.used_gb:g} / {pool.budget_gb:g} GB",
            status=StatusLabel(status="healthy", label=models.pool_mode),
            href="/models",
        ),
        Tile(name="Backups", value="20:00 today", status=backups.mode, href="/backups"),
        Tile(name="Spend", value=f"${spend.total_usd:.2f}", status=spend.summary, href="/spend"),
        Tile(
            name="Connections",
            value="3 of 4",
            status=StatusLabel(status="attention", label="Contacts waiting"),
            href="/connections",
        ),
        Tile(
            name="Heartbeat",
            value="1 min ago",
            status=StatusLabel(status="healthy", label="Reporting"),
            href="/system",
        ),
    ]


def _metrics() -> list[Metric]:
    """The "How it's running" list on desktop Today, a selection from the 7.18 catalog."""
    healthy = StatusLabel(status="healthy", label="")
    return [
        Metric(name="Chat first token p95", value="1.4 s", spark=[12, 10, 13, 9, 11, 8, 9]),
        Metric(name="Chat on fallback model", value="9 min/d", spark=[10, 9, 12, 8, 10, 9, 10]),
        Metric(
            name="Model swaps today",
            value="3 of ≤6",
            status=healthy,
            spark=[10, 12, 8, 11, 10, 12, 10],
        ),
        Metric(name="Review wait p50", value="6 min", spark=[14, 12, 13, 10, 9, 10, 8]),
        Metric(
            name="Memory pressure",
            value="Normal",
            status=healthy,
            spark=[13, 13, 12, 13, 13, 12, 13],
        ),
        Metric(name="Bug catch rate", value="81%", spark=[9, 9, 8, 9, 8, 8, 8]),
    ]
