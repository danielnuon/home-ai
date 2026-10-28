"""Read-mostly platform pages: System, Services, Models, Spend, Schedule, Security and the rest.

Most of these are lists of rows and metrics, so they reuse `Row`, `RowGroup` and `Metric` and add a
model only where a page has something of its own (an impact preview, a memory ring, a job switch).
"""

from typing import Literal

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


class MemoryZone(ContractModel):
    """One zone of the 48GB memory budget (spec 8.3), in gigabytes."""

    name: str
    used_gb: float
    budget_gb: float


class SystemOverview(ContractModel):
    """The System page."""

    summary: StatusLabel
    machine: str
    zones: list[MemoryZone]
    pressure: StatusLabel
    swap: str
    tiles: list[Metric]
    rows: list[Row]


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


class FamilyAssignment(ContractModel):
    """Which model serves a task family (spec 8.2)."""

    family: str
    model: str
    meta: str
    residency: StatusLabel


class ModelsOverview(ContractModel):
    """The Models page, including the independent-reviewer impact preview (spec 7.18 example)."""

    pool_mode: str
    resident: str
    swaps_today: str
    assignments: list[FamilyAssignment]
    independent_reviewer: bool
    reviewer_impact: list[ImpactLine]
    stats: list[Metric]


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


class ScheduleOverview(ContractModel):
    """The Schedule page."""

    now: str
    lock: StatusLabel
    quiet_hours: str
    jobs: list[Job]


class JobToggle(ContractModel):
    """Pause or resume a job."""

    paused: bool


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


class BackupsOverview(ContractModel):
    """The Backups page. Starter mode carries a standing warning until a second location exists."""

    mode: StatusLabel
    mode_note: str
    targets: list[Row]
    drill: RestoreDrill
    restore_points: list[str]
    retention: list[Row]


class Finding(ContractModel):
    """A maintenance finding (spec 18.7)."""

    id: str
    severity: Literal["high", "medium", "low"]
    title: str
    meta: str


class MaintenanceFix(ContractModel):
    """A fix merged by Pipeline C that the Owner can revert after seeing it (spec 7.2)."""

    id: str
    title: str
    meta: str
    reverted: bool


class MaintenanceOverview(ContractModel):
    """The Maintenance page."""

    running: bool
    summary: str
    stats: list[Metric]
    batch: list[MaintenanceFix]
    findings: list[Finding]


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
