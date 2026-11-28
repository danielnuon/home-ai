"""Read-mostly platform pages: System, Services, Models, Spend, Schedule, Security and the rest.

Most of these are lists of rows and metrics, so they reuse `Row`, `RowGroup` and `Metric` and add a
model only where a page has something of its own (an impact preview, a memory ring, a job switch).
"""

from datetime import datetime
from typing import Literal

from pydantic import Field

from control_center.contract.base import ContractModel
from control_center.contract.common import Metric, Row, RowGroup, StatusLabel

Source = Literal["measured", "simulated", "estimate"]
"""Where a predicted figure comes from (spec 7.18). Every number Brain shows says which."""


class ImpactLine(ContractModel):
    """One metric on an impact card, written as *now → predicted*."""

    name: str
    change: str
    source: Source
    status: StatusLabel | None = None


class Trend(ContractModel):
    """A metric from the catalog of spec 7.18 with its 7- and 30-day trends, oldest first."""

    name: str
    value: str
    week: list[float]
    month: list[float]
    week_change: str
    month_change: str
    source: Source
    status: StatusLabel | None = None


class TrendGroup(ContractModel):
    """One area of the metric catalog, such as Memory or Tokens."""

    area: str
    source: str
    trends: list[Trend]


class MetricCatalog(ContractModel):
    """The metric catalog (spec 7.18), shown on System, Models and Settings."""

    groups: list[TrendGroup]


class MemoryZone(ContractModel):
    """One zone of the 64GB memory budget (spec 8.3), in gigabytes."""

    name: str
    used_gb: float
    budget_gb: float


PressureLevel = Literal["normal", "warning", "critical"]
"""macOS memory pressure as the watchdog reads it (spec 7.17, 8.4)."""

PoolMode = Literal["L", "S", "I", "B", "F"]
"""The arbiter's pool modes (spec 8.3): resident, specialist, image, benchmark, fallback only."""


class Lane(ContractModel):
    """One of the container VM's two lanes, which never lend memory to each other (spec 8.11.2)."""

    name: str
    used_gb: float
    reserved_gb: float
    meta: str


class CpuClass(ContractModel):
    """One host priority class and its share of CPU time now (spec 8.11.3)."""

    name: str
    members: str
    share: str
    setting: str


class Thermal(ContractModel):
    """The thermal ladder (spec 8.11.4): the state, the step taken and serious minutes today."""

    state: StatusLabel
    step: str
    serious_minutes: int
    note: str


class DriveUse(ContractModel):
    """A drive's used space against the watchdog's thresholds and the development floor (8.11.5).

    `thresholds` are the used percentages at which the watchdog acts; `next_action` says what
    happens at the next one.
    """

    id: str
    name: str
    used_pct: float
    free_gb: float
    size_gb: float
    floor_gb: float | None
    thresholds: list[int]
    next_action: str
    status: StatusLabel


class ModelTimeShare(ContractModel):
    """Development's share of pool generation time over 24 hours against its floor (8.11.7)."""

    share_pct: int
    floor_pct: int
    status: StatusLabel
    note: str


class PoolModeOption(ContractModel):
    """A mode the Owner can put the pool in, with what switching to it would do (spec 7.18)."""

    mode: PoolMode
    label: str
    note: str
    impact: list[ImpactLine]


class PoolState(ContractModel):
    """The model pool's mode and what is loaded. `can_end` is true in image or video mode."""

    mode: PoolMode
    label: str
    loaded: list[str]
    can_end: bool
    options: list[PoolModeOption]


class HealthCheck(ContractModel):
    """The result of the Owner's last on-demand health check."""

    at: datetime
    summary: StatusLabel
    rows: list[Row]


class SystemOverview(ContractModel):
    """The System page."""

    summary: StatusLabel
    machine: str
    zones: list[MemoryZone]
    pressure: StatusLabel
    pressure_level: PressureLevel
    swap: str
    tiles: list[Metric]
    rows: list[Row]
    pool: PoolState
    lanes: list[Lane]
    cpu: list[CpuClass]
    thermal: Thermal
    drives: list[DriveUse]
    model_time: ModelTimeShare
    health_check: HealthCheck | None


class PoolModeChange(ContractModel):
    """Put the pool in another mode."""

    mode: PoolMode


class ServiceRow(ContractModel):
    """One service, with masked recent log lines (spec 10.10: no content, no secrets)."""

    id: str
    name: str
    meta: str
    status: StatusLabel
    log_lines: list[str]
    restartable: bool


class ServiceGroup(ContractModel):
    """Services grouped by where they run (spec 5.4)."""

    name: str
    services: list[ServiceRow]


class ServicesOverview(ContractModel):
    """The Services page."""

    summary: str
    groups: list[ServiceGroup]


class LogLine(ContractModel):
    """One masked log line (spec 10.10)."""

    at: str
    level: Literal["info", "warn", "error"]
    text: str


class ServiceLog(ContractModel):
    """A service's full log as kept for 30 days (spec 13.7), newest first, already masked."""

    id: str
    name: str
    meta: str
    status: StatusLabel
    restartable: bool
    retained: str
    lines: list[LogLine]


class FamilyAssignment(ContractModel):
    """Which model serves a task family (spec 8.2)."""

    family: str
    model: str
    meta: str
    residency: StatusLabel
    pinned: bool = False
    """A pinned family keeps its model through re-selection until unpinned (spec 7.2, Models)."""


class SourcedFigure(ContractModel):
    """A figure and where it comes from; every number Brain shows says which (spec 7.18)."""

    name: str
    value: str
    source: Source


class TokensPanel(ContractModel):
    """Token management at a glance (spec 8.8.7): how fast the one GPU turns tokens into work.

    `speeds` holds decode, aggregate and prefill speed, cache hit rate, reasoning share and
    capacity use. `cap_impact` is the preview shown before a token cap is changed (7.18).
    """

    speeds: list[SourcedFigure]
    tokens_per_outcome: list[SourcedFigure]
    gpu_seconds: list[SourcedFigure]
    cap_impact: list[ImpactLine]


class RoutingRow(ContractModel):
    """One family's calls by difficulty tier and its first-pass gate rate against the control."""

    family: str
    tiers: list[int]
    """Share of calls at T0, T1, T2 and T3, in percent."""
    gate_rate: str
    control: str


class RoutingPanel(ContractModel):
    """The Routing panel (spec 8.10): where requests ran, whether it helped, and refusals."""

    rows: list[RoutingRow]
    cloud_spend: str
    refusals: list[SourcedFigure]


class CandidateGate(ContractModel):
    """One selection gate a candidate model passed or failed (spec 8.6)."""

    name: str
    passed: bool


class Candidate(ContractModel):
    """A benchmark card for a candidate model in a family (spec 8.6)."""

    id: str
    family: str
    model: str
    figures: list[SourcedFigure]
    gates: list[CandidateGate]
    verdict: StatusLabel


class SelectionRun(ContractModel):
    """The selector: when it last ran, and whether a run is queued (spec 8.6)."""

    status: StatusLabel
    last_run: str
    queued: bool


class ModelsOverview(ContractModel):
    """The Models page, including the independent-reviewer impact preview (spec 7.18 example).

    `plan_decisions` are the critical decision records that hold a pending model plan, which the
    page shows with their veto (spec 8.6, 11.9).
    """

    pool_mode: str
    resident: str
    swaps_today: str
    assignments: list[FamilyAssignment]
    independent_reviewer: bool
    reviewer_impact: list[ImpactLine]
    stats: list[Metric]
    tokens: TokensPanel
    queue: list[SourcedFigure]
    split: list[SourcedFigure]
    routing: RoutingPanel
    candidates: list[Candidate]
    selection: SelectionRun
    plan_decisions: list[str]
    pin_impact: list[ImpactLine]


class FamilyPin(ContractModel):
    """Pin or unpin a family's model."""

    pinned: bool


class PaidFeature(ContractModel):
    """An optional paid feature (spec 3.6). Every one is off with a $0 cap by default.

    `setting_key` turns it on and `cap_setting_key` holds its monthly cap, so Spend and Settings
    change the same values (spec 7.16, rule 2: one panel per object type).
    """

    id: str
    name: str
    meta: str
    setting_key: str
    cap_setting_key: str
    on: bool
    cap_usd: int
    ceiling_usd: int
    impact: list[ImpactLine]


class SpendOverview(ContractModel):
    """The Spend page."""

    month: str
    total_usd: float
    summary: StatusLabel
    features: list[PaidFeature]
    ledger: list[Row]


class Job(ContractModel):
    """A scheduled job (spec 12.5)."""

    id: str
    name: str
    when: str
    next_run: str
    last_run: StatusLabel
    heavy: bool
    paused: bool
    time: str | None = None
    """The start time, HH:MM, when the Owner can move it; None for a job that runs every few
    minutes."""


class ScheduleOverview(ContractModel):
    """The Schedule page."""

    now: str
    lock: StatusLabel
    quiet_hours: str
    jobs: list[Job]


class JobToggle(ContractModel):
    """Pause or resume a job."""

    paused: bool


class JobTime(ContractModel):
    """Move a job to another start time, HH:MM."""

    time: str


class SecurityOverview(ContractModel):
    """The Security page. The audit lines are already masked by the audit logger's query socket."""

    stopped: bool
    tiles: list[Metric]
    flags: list[Row]
    sign_in: list[Row]
    audit: list[str]
    chain: str


class RestoreDrill(ContractModel):
    """The most recent restore drill (spec 13.5)."""

    status: StatusLabel
    detail: str


class PrunePlan(ContractModel):
    """What a prune would remove under the retention rules, before anything is removed."""

    id: str
    created_at: datetime
    removes: list[Row]
    frees: str
    keeps: str


class BackupsOverview(ContractModel):
    """The Backups page. Starter mode carries a standing warning until a second location exists.

    `offsite` is the paid offsite storage feature, the same panel as on Spend (spec 7.2).
    """

    mode: StatusLabel
    mode_note: str
    targets: list[Row]
    drill: RestoreDrill
    drills: list[Row]
    restore_points: list[str]
    retention: list[Row]
    prune_plan: PrunePlan | None
    last_prune: str
    offsite: PaidFeature


class PruneRequest(ContractModel):
    """Run the prune plan the Owner has seen."""

    plan_id: str


class PruneDone(ContractModel):
    """What the toast says after a prune."""

    message: str


class Finding(ContractModel):
    """A maintenance finding (spec 18.7). Won't-fix keeps it in the register with the reason."""

    id: str
    severity: Literal["high", "medium", "low"]
    title: str
    meta: str
    product: str = ""
    detail: str = ""
    evidence: list[str] = Field(default_factory=list)
    state: Literal["open", "wont_fix"] = "open"
    reason: str | None = None


class MaintenanceFix(ContractModel):
    """A fix merged by Pipeline C that the Owner can revert after seeing its diff (spec 7.2)."""

    id: str
    title: str
    meta: str
    reverted: bool
    diff: list[str] = Field(default_factory=list)


class MaintainedProduct(ContractModel):
    """A released product's maintenance level, `scan` or `fix` (spec 17.20, 22.8).

    The level is the setting `setting_key`; raising it to `fix` loosens and needs a step-up.
    """

    repo: str
    name: str
    setting_key: str
    level: str
    meta: str


class MaintenanceOverview(ContractModel):
    """The Maintenance page."""

    running: bool
    summary: str
    stats: list[Metric]
    products: list[MaintainedProduct]
    batch: list[MaintenanceFix]
    findings: list[Finding]
    trends: list[Trend]


class WontFix(ContractModel):
    """Close a finding as won't-fix, with the reason that stays on it."""

    reason: str


class MaintenanceToggle(ContractModel):
    """Pause (false) or resume (true) Pipeline C."""

    running: bool


class ConnectionsOverview(ContractModel):
    """The Connections page."""

    groups: list[RowGroup]


class VoiceProfile(ContractModel):
    """A voice for approval calls (spec 11.5.1)."""

    id: str
    name: str
    kind: Literal["default", "stock", "consented_clone", "celebrity_clone"]
    meta: str
    selected: bool
    locked: bool


class VoiceOverview(ContractModel):
    """The Voice page."""

    calls_enabled: bool
    celebrity_clones: bool
    profiles: list[VoiceProfile]
    script: str


class DocsOverview(ContractModel):
    """The Docs page: documentation grouped by area, with review status as the row status."""

    groups: list[RowGroup]
