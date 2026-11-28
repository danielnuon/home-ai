"""System, Models, Services, Backups and Maintenance fixtures for the operations controls.

The figures the System page shows about the host's resource controls (spec 8.11), the pool modes
the Owner can choose (8.3), the Routing panel and candidate cards on Models (8.6, 8.10), full
service logs (13.7), prune plans and restore drills (13.5, 13.7), maintained products (17.20) and
the metric catalog with its 7- and 30-day trends (7.18).
"""

from control_center.contract.common import Row, StatusLabel
from control_center.contract.status import (
    Candidate,
    CandidateGate,
    CpuClass,
    DriveUse,
    ImpactLine,
    Lane,
    LogLine,
    ModelTimeShare,
    PoolMode,
    PressureLevel,
    RoutingPanel,
    RoutingRow,
    SourcedFigure,
    Thermal,
    Trend,
    TrendGroup,
)


def _ok(label: str) -> StatusLabel:
    return StatusLabel(status="healthy", label=label)


def _attention(label: str) -> StatusLabel:
    return StatusLabel(status="attention", label=label)


def _neutral(label: str) -> StatusLabel:
    return StatusLabel(status="neutral", label=label)


# System -------------------------------------------------------------------------------------

POOL_MODES: dict[PoolMode, tuple[str, str, list[str]]] = {
    "L": (
        "Mode L · resident",
        "Normal operation: the conversation model and embeddings stay loaded",
        ["Qwen3.6-35B-A3B (CONVERSE, REASON, EXTRACT)", "EMBED", "KV cache"],
    ),
    "S": (
        "Mode S · specialist",
        "A batch window for CODE or REVIEW; Owner chat runs on the loaded model or fallback",
        ["GLM-4.7-Flash (CODE)", "EMBED", "Qwen3.6-35B-A3B (fits beside it)"],
    ),
    "I": (
        "Mode I · image",
        "While image jobs run; chat moves to the fallback model",
        ["Image engine", "Fallback model", "EMBED"],
    ),
    "B": (
        "Mode B · benchmark",
        "One candidate model, exclusive, during a selection run",
        ["Candidate under test"],
    ),
    "F": (
        "Mode F · fallback only",
        "When the working drive is missing, or for recovery",
        ["Fallback model", "EMBED"],
    ),
}
"""Each pool mode's label, when it is used, and what it loads (spec 8.3)."""

OWNER_MODES: list[PoolMode] = ["L", "S", "I", "F"]
"""The modes the Owner can choose. Benchmark mode starts only with a selection run."""

MODE_IMPACT: dict[PoolMode, list[ImpactLine]] = {
    "L": [
        ImpactLine(name="Owner chat, first token", change="≈ 1.2 s → ≈ 1.2 s", source="measured"),
        ImpactLine(name="Model swaps today", change="3 → 4 · plan ≤ 6", source="measured"),
    ],
    "S": [
        ImpactLine(name="Owner chat, first token", change="1.2 s → 1.4–2.0 s", source="simulated"),
        ImpactLine(name="Model swaps today", change="3 → 4 · plan ≤ 6", source="measured"),
        ImpactLine(name="CODE batch throughput", change="idle → 2 streams", source="simulated"),
    ],
    "I": [
        ImpactLine(
            name="Owner chat, first token",
            change="1.2 s → 2–3 s on fallback",
            source="estimate",
            status=_attention("Slower replies"),
        ),
        ImpactLine(name="Model swaps today", change="3 → 5 · plan ≤ 6", source="measured"),
    ],
    "F": [
        ImpactLine(
            name="Answer quality",
            change="CONVERSE 0.81 → fallback 0.62",
            source="measured",
            status=_attention("Lower"),
        ),
        ImpactLine(name="Pool memory", change="22 GB → 9 GB", source="measured"),
    ],
    "B": [],
}
"""What switching the pool to each mode would do now, as an impact card (spec 7.18)."""

LANES = [
    Lane(
        name="development",
        used_gb=3.9,
        reserved_gb=6,
        meta="Pipelines A–D, staging, your containers · weight 300 of 400",
    ),
    Lane(
        name="operations",
        used_gb=0.6,
        reserved_gb=1.5,
        meta="OCR, speech-to-text, voice rendering · weight 100 · at most 2 vCPUs",
    ),
]
"""The container VM's two lanes, which never lend to each other (spec 8.11.2)."""

CPU_CLASSES = [
    CpuClass(
        name="Interactive",
        members="MLX worker, model router, pipeline engine, gate, Brain, Assistant bot",
        share="34%",
        setting="ProcessType: Interactive",
    ),
    CpuClass(
        name="Standard",
        members="Colima VM, tool server, connector service, watchdog",
        share="21%",
        setting="default",
    ),
    CpuClass(
        name="Background",
        members="Backups, audit-chain check, pruning, model downloads, Ark builds",
        share="3%",
        setting="ProcessType: Background · LowPriorityIO",
    ),
]
"""Host priority classes and their CPU share now (spec 8.11.3)."""

THERMAL = Thermal(
    state=_ok("Nominal"),
    step="No step taken",
    serious_minutes=0,
    note="At serious, background work pauses first; development and your chat keep running",
)
"""The thermal ladder (spec 8.11.4)."""

DISK_THRESHOLDS = [75, 85, 90, 95]
"""Used percentages at which the watchdog acts (spec 8.11.5)."""

DRIVES = [
    DriveUse(
        id="internal",
        name="Internal SSD",
        used_pct=59,
        free_gb=212,
        size_gb=512,
        floor_gb=None,
        thresholds=DISK_THRESHOLDS,
        next_action="At 75%: pruning runs at once",
        status=_ok("SMART ok"),
    ),
    DriveUse(
        id="working",
        name="Working drive",
        used_pct=22,
        free_gb=3100,
        size_gb=4000,
        floor_gb=200,
        thresholds=DISK_THRESHOLDS,
        next_action="At 75%: pruning runs at once · 200 GB always kept for development",
        status=_ok("SMART ok"),
    ),
]
"""Each drive against its thresholds and the development floor (spec 8.11.5)."""

MODEL_TIME = ModelTimeShare(
    share_pct=58,
    floor_pct=50,
    status=_ok("Above the floor"),
    note="Pool generation time for Pipelines B and C over the last 24 hours",
)
"""Development's share of model time against its floor (spec 8.11.7)."""

HEALTH_CHECKS = [
    Row(id="services", title="Services", meta="19 of 19 answered", status=_ok("Healthy")),
    Row(id="audit", title="Audit chain", meta="Verified to the last entry", status=_ok("0 breaks")),
    Row(id="drives", title="Drives", meta="SMART ok on both", status=_ok("Healthy")),
    Row(id="tailscale", title="Tailscale", meta="2 devices reachable", status=_ok("Connected")),
    Row(
        id="backups",
        title="Backups",
        meta="Last copy 20:00 · one location",
        status=_attention("Starter mode"),
    ),
]
"""What an on-demand health check reports (spec 7.2, System)."""

PRESSURE_WORDS: dict[PressureLevel, tuple[StatusLabel, str | None]] = {
    "normal": (_ok("Normal"), None),
    "warning": (
        _attention("Warning"),
        "Memory pressure is high. Transcripts show the latest step and the Live deck holds still.",
    ),
    "critical": (
        StatusLabel(status="problem", label="Critical"),
        "Memory pressure is critical. Background work is paused; only your requests and "
        "approvals run.",
    ),
}
"""The pressure label and the banner each level raises (spec 7.17, "Degradation")."""

PRESSURE_DRILL: dict[PressureLevel, PressureLevel] = {
    "normal": "warning",
    "warning": "critical",
    "critical": "normal",
}
"""A pressure drill steps through the levels and back, so each banner can be checked."""

# Services -----------------------------------------------------------------------------------

LOG_RETAINED = "Kept for 30 days · masked, no content or secrets"


def service_log(service_id: str) -> list[LogLine]:
    """The service's masked log, newest first: health checks and the events between them."""
    events = {
        "model-router": LogLine(
            at="21:12:40", level="warn", text="restart after 3 failed health checks · 0 lost calls"
        ),
        "watchdog": LogLine(at="20:00:02", level="info", text="backup window opened · lock taken"),
        "brain": LogLine(at="19:45:10", level="info", text="SSE clients 3 · coalesced 4/s"),
    }
    lines = [
        LogLine(at=f"00:{41 - minute:02d}:07", level="info", text="health ok · 3 ms")
        for minute in range(12)
    ]
    lines.insert(3, LogLine(at="00:37:30", level="info", text="config reload · models.lock v14"))
    if service_id in events:
        lines.append(events[service_id])
    lines.append(LogLine(at="23:58:12", level="info", text="reload after SIGHUP · models.lock v14"))
    return lines


# Models -------------------------------------------------------------------------------------


def queue_depth() -> list[SourcedFigure]:
    """Queued model calls by priority (spec 8.5, queue order)."""
    return [
        SourcedFigure(name="Owner chat", value="0", source="measured"),
        SourcedFigure(name="Gate reviews", value="1", source="measured"),
        SourcedFigure(name="Scheduled work", value="3", source="measured"),
        SourcedFigure(name="Batch", value="7", source="measured"),
    ]


def local_cloud_split() -> list[SourcedFigure]:
    """Where calls ran this month."""
    return [
        SourcedFigure(name="Local calls", value="100% · 18,402", source="measured"),
        SourcedFigure(name="Cloud calls", value="0 · no provider on", source="measured"),
    ]


def routing_panel() -> RoutingPanel:
    """The Routing panel (spec 8.10). With no cloud provider, T3 is never served."""
    return RoutingPanel(
        rows=[
            RoutingRow(family="CONVERSE", tiers=[88, 11, 1, 0], gate_rate="—", control="—"),
            RoutingRow(family="REASON", tiers=[61, 30, 9, 0], gate_rate="84%", control="79%"),
            RoutingRow(family="CODE", tiers=[52, 33, 15, 0], gate_rate="71%", control="64%"),
            RoutingRow(family="REVIEW", tiers=[70, 24, 6, 0], gate_rate="90%", control="88%"),
        ],
        cloud_spend="$0.00 from difficulty this month",
        refusals=[
            SourcedFigure(name="T3 refused: no provider on", value="12", source="measured"),
            SourcedFigure(
                name="T3 refused: restricted data (9.3 rule 1)", value="3", source="measured"
            ),
        ],
    )


def candidates() -> list[Candidate]:
    """Benchmark cards from the last selector run (spec 8.6)."""

    def gates(*failed: str) -> list[CandidateGate]:
        names = ["Fits the pool", "Decode speed", "Tool calls", "Long context", "License"]
        return [CandidateGate(name=name, passed=name not in failed) for name in names]

    return [
        Candidate(
            id="cand-glm-48",
            family="CODE",
            model="GLM-4.8-Flash · 4-bit",
            figures=[
                SourcedFigure(name="Held-out tests", value="0.70 (now 0.64)", source="measured"),
                SourcedFigure(name="Decode", value="58 tok/s", source="measured"),
                SourcedFigure(name="Memory", value="17 GB", source="measured"),
            ],
            gates=gates(),
            verdict=_ok("Proposed · CDR-0012"),
        ),
        Candidate(
            id="cand-qwen-coder",
            family="CODE",
            model="Qwen3-Coder-30B-A3B · 8-bit",
            figures=[
                SourcedFigure(name="Held-out tests", value="0.71", source="measured"),
                SourcedFigure(name="Decode", value="44 tok/s", source="measured"),
                SourcedFigure(name="Memory", value="32 GB", source="measured"),
            ],
            gates=gates("Fits the pool"),
            verdict=_neutral("Rejected · too large beside EMBED"),
        ),
        Candidate(
            id="cand-gemma-review",
            family="REVIEW",
            model="Gemma 4 26B-A4B · 4-bit",
            figures=[
                SourcedFigure(name="Seeded-defect catch", value="0.83", source="measured"),
                SourcedFigure(name="Decode", value="61 tok/s", source="measured"),
                SourcedFigure(name="Memory", value="14 GB", source="measured"),
            ],
            gates=gates(),
            verdict=_neutral("Ready if the independent reviewer is on"),
        ),
    ]


PLAN_DECISIONS = ["CDR-0012"]
"""Critical decision records that carry a pending model plan, shown with their veto on Models."""

PIN_IMPACT = [
    ImpactLine(
        name="Re-selection for this family",
        change="monthly → paused while pinned",
        source="measured",
    ),
    ImpactLine(
        name="Gap to the best candidate",
        change="0 → grows as new models arrive",
        source="estimate",
        status=_attention("Measured at the next selector run"),
    ),
]
"""What pinning a family does (spec 7.18)."""

SELECTION_NEXT = "Queued for the next selector window, Mon 02:15"
SELECTION_IDLE = "Last run Oct 27 · 2 pairs evaluated · next monthly run Nov 24"

# Backups ------------------------------------------------------------------------------------


def drill_history() -> list[Row]:
    """Earlier restore drills, newest first (spec 13.5)."""
    return [
        Row(
            id="drill-oct",
            title="Oct 4",
            meta="Repository, tasks.db and the audit log · hash chain verified · 4 min",
            status=_ok("Passed"),
        ),
        Row(
            id="drill-sep",
            title="Sep 6",
            meta="Repository, tasks.db and the audit log · hash chain verified · 5 min",
            status=_ok("Passed"),
        ),
    ]


DRILL_DETAIL = (
    "one repository, tasks.db and the audit log restored to a scratch folder · hash chain "
    "verified · 4 min"
)


def prune_removes() -> list[Row]:
    """What a prune would remove now under the retention rules (spec 13.7)."""
    return [
        Row(
            id="snap-daily",
            title="9 daily snapshots older than 30 days",
            meta="Working drive → internal SSD",
            status=_neutral("2.4 GB"),
        ),
        Row(
            id="snap-hourly",
            title="31 four-hourly snapshots older than 7 days",
            meta="Working drive → internal SSD",
            status=_neutral("0.8 GB"),
        ),
    ]


PRUNE_FREES = "3.2 GB"
PRUNE_KEEPS = "Everything inside 7 days + 30 daily, and the audit log in full"
LAST_PRUNE = "Last prune Sun 04:00 · freed 1.1 GB"

# Maintenance --------------------------------------------------------------------------------

PRODUCTS = [
    ("lease-reminders", "Lease reminders", "Released Sep 12 · 3 open findings"),
    ("receipt-scanner", "Receipt scanner", "Released Oct 3 · 2 open findings"),
]
"""Released products under maintenance: repository, name and the line under it (spec 17.20)."""


def maintenance_trends() -> list[Trend]:
    """Pipeline C over 7 and 30 days."""
    return [
        Trend(
            name="Findings opened",
            value="6 this week",
            week=[1, 0, 2, 1, 0, 1, 1],
            month=[3, 4, 6, 5, 4, 6],
            week_change="−2 vs last week",
            month_change="+3 vs last month",
            source="measured",
        ),
        Trend(
            name="Fixes merged",
            value="3 this week",
            week=[0, 0, 0, 0, 0, 3, 0],
            month=[2, 3, 3, 3],
            week_change="same as last week",
            month_change="11 in 30 days",
            source="measured",
        ),
        Trend(
            name="Reverts",
            value="0",
            week=[0, 0, 0, 0, 0, 0, 0],
            month=[0, 0, 0, 0],
            week_change="none",
            month_change="none in 30 days",
            source="measured",
            status=_ok("0 regressions"),
        ),
    ]


# Metric catalog (spec 7.18) -----------------------------------------------------------------


def _trend(name: str, value: str, week: list[float], changes: tuple[str, str]) -> Trend:
    month = [round(sum(week) / len(week) * (0.9 + 0.04 * step), 2) for step in range(5)] + [
        week[-1]
    ]
    return Trend(
        name=name,
        value=value,
        week=week,
        month=month,
        week_change=changes[0],
        month_change=changes[1],
        source="measured",
    )


def metric_catalog() -> list[TrendGroup]:
    """The metric catalog by area, with 7- and 30-day trends (spec 7.18)."""
    return [
        TrendGroup(
            area="Responsiveness",
            source="Router and arbiter events",
            trends=[
                _trend(
                    "Chat first token, p95",
                    "1.6 s",
                    [1.4, 1.7, 1.5, 1.6, 1.9, 1.5, 1.6],
                    ("−0.1 s", "−0.3 s"),
                ),
                _trend("Answered by fallback", "2%", [1, 3, 2, 2, 4, 2, 2], ("same", "−1 pt")),
            ],
        ),
        TrendGroup(
            area="Throughput",
            source="Task log",
            trends=[
                _trend("Review wait", "18 min", [22, 19, 25, 17, 16, 20, 18], ("−3 min", "−9 min")),
                _trend(
                    "Scheduled-work queue wait", "4 min", [5, 4, 6, 3, 4, 5, 4], ("same", "−1 min")
                ),
            ],
        ),
        TrendGroup(
            area="Models",
            source="Arbiter events",
            trends=[
                _trend(
                    "Model swaps per day", "3 · plan ≤ 6", [4, 3, 5, 3, 2, 4, 3], ("−1", "same")
                ),
                _trend(
                    "Load time per swap", "19 s", [21, 20, 19, 19, 18, 20, 19], ("−1 s", "−2 s")
                ),
            ],
        ),
        TrendGroup(
            area="Memory",
            source="Watchdog",
            trends=[
                _trend("Pool peak", "31 GB", [29, 33, 30, 31, 34, 30, 31], ("same", "+2 GB")),
                _trend("Pressure minutes at warning", "0", [0, 2, 0, 0, 5, 0, 0], ("−7", "−12")),
                _trend("Swap", "0.3 GB", [0.2, 0.4, 0.3, 0.3, 0.6, 0.3, 0.3], ("same", "−0.1 GB")),
            ],
        ),
        TrendGroup(
            area="Stability",
            source="Watchdog, unified log",
            trends=[
                _trend("Unexpected reboots", "0", [0, 0, 0, 0, 0, 0, 0], ("none", "none")),
                _trend(
                    "MLX errors per 1,000",
                    "0.2",
                    [0.3, 0.2, 0.2, 0.1, 0.3, 0.2, 0.2],
                    ("same", "−0.1"),
                ),
            ],
        ),
        TrendGroup(
            area="Assurance",
            source="Gauge evaluations",
            trends=[
                _trend(
                    "Seeded-defect catch rate",
                    "0.81",
                    [0.8, 0.8, 0.82, 0.81, 0.8, 0.81, 0.81],
                    ("same", "+0.02"),
                ),
                _trend(
                    "First-pass gate rate, CODE",
                    "71%",
                    [66, 68, 70, 69, 72, 70, 71],
                    ("+2 pts", "+7 pts"),
                ),
            ],
        ),
        TrendGroup(
            area="Tokens",
            source="Router calls ledger",
            trends=[
                _trend(
                    "Aggregate tokens per second", "74", [70, 72, 75, 73, 76, 74, 74], ("+2", "+6")
                ),
                _trend("Cache hit rate", "63%", [58, 60, 61, 62, 63, 62, 63], ("+1 pt", "+8 pts")),
            ],
        ),
        TrendGroup(
            area="Hardware",
            source="powermetrics",
            trends=[
                _trend("GPU busy", "31%", [28, 35, 30, 29, 33, 32, 31], ("same", "+4 pts")),
                _trend("Thermal serious minutes", "0", [0, 0, 0, 0, 0, 0, 0], ("none", "none")),
            ],
        ),
        TrendGroup(
            area="Energy",
            source="powermetrics",
            trends=[
                _trend("Average power", "38 W", [36, 39, 38, 37, 40, 38, 38], ("same", "+1 W")),
            ],
        ),
    ]


SYSTEM_AREAS = ["Memory", "Stability", "Hardware", "Energy", "Responsiveness"]
MODELS_AREAS = ["Models", "Tokens", "Assurance", "Throughput"]
"""Which catalog areas System and Models show; Settings shows them all (spec 7.18)."""
