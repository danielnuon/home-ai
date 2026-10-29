"""System, Services, Models and Spend fixtures for the mock status aggregator."""

from control_center.contract.common import Metric, Row, Status, StatusLabel
from control_center.contract.status import (
    FamilyAssignment,
    ImpactLine,
    MemoryZone,
    ServiceGroup,
    ServiceRow,
)

HEALTHY = StatusLabel(status="healthy", label="Healthy")
RUNNING = StatusLabel(status="healthy", label="Running")
ON_DEMAND = StatusLabel(status="neutral", label="On demand")
OFF = StatusLabel(status="neutral", label="Off")

MEMORY_ZONES = [
    MemoryZone(name="macOS and your session", used_gb=7.1, budget_gb=8),
    MemoryZone(name="Containers (Colima)", used_gb=4.2, budget_gb=6),
    MemoryZone(name="Platform services", used_gb=2.1, budget_gb=3),
    MemoryZone(name="Model pool", used_gb=22.0, budget_gb=27),
    MemoryZone(name="Headroom, never used", used_gb=0, budget_gb=4),
]
"""The 8 / 6 / 3 / 27 / 4 GB budget of spec 8.3, with sample usage."""


def system_tiles() -> list[Metric]:
    """Hardware signals on the System page."""
    ok: Status = "healthy"
    return [
        Metric(
            name="GPU busy",
            value="31%",
            status=StatusLabel(status=ok, label="24 h average"),
            spark=[12, 9, 13, 6, 10, 8, 11],
        ),
        Metric(
            name="Thermal",
            value="Nominal",
            status=StatusLabel(status=ok, label="0 throttled min"),
            spark=[12, 12, 11, 12, 12, 11, 12],
        ),
        Metric(
            name="Power",
            value="38 W",
            status=StatusLabel(status="neutral", label="≈ 27 kWh / month"),
            spark=[10, 11, 8, 12, 9, 10, 9],
        ),
        Metric(
            name="Decode vs fresh",
            value="98%",
            status=StatusLabel(status=ok, label="No slowdown"),
            spark=[6, 6, 7, 6, 6, 7, 6],
        ),
        Metric(
            name="Internal SSD",
            value="212 GB free",
            status=StatusLabel(status=ok, label="SMART ok"),
            spark=[8, 8, 9, 9, 9, 10, 10],
        ),
        Metric(
            name="Working drive",
            value="3.1 TB free",
            status=StatusLabel(status=ok, label="SMART ok · TRIM on"),
            spark=[8, 8, 8, 9, 9, 9, 9],
        ),
    ]


def system_rows() -> list[Row]:
    """Network, heartbeat and stability rows on the System page."""
    return [
        Row(
            id="tailscale",
            title="Tailscale",
            status=StatusLabel(status="healthy", label="Connected · 2 devices"),
        ),
        Row(
            id="heartbeat",
            title="Heartbeat monitor",
            status=StatusLabel(status="healthy", label="Last ping 1 min ago"),
        ),
        Row(
            id="backups",
            title="Backups",
            href="/backups",
            status=StatusLabel(status="attention", label="Starter mode · one location"),
        ),
        Row(
            id="panics",
            title="GPU-related panics, 30 days",
            status=StatusLabel(status="neutral", label="0"),
        ),
        Row(
            id="mlx-errors",
            title="MLX errors per 1,000 requests",
            status=StatusLabel(status="neutral", label="0.2"),
        ),
    ]


def service_groups() -> list[ServiceGroup]:
    """Every service, grouped by where it runs (spec 5.4)."""
    logs = [
        "00:41:07 health ok · 3 ms",
        "00:40:07 health ok · 2 ms",
        "23:58:12 reload after SIGHUP · models.lock v14",
    ]

    def service(service_id: str, name: str, meta: str, status: StatusLabel = RUNNING) -> ServiceRow:
        return ServiceRow(
            id=service_id,
            name=name,
            meta=meta,
            status=status,
            log_lines=logs,
            restartable=status is RUNNING,
        )

    return [
        ServiceGroup(
            name="Core, before login",
            services=[
                service("tailscaled", "Tailscale", "root · up 6 d 4 h · 0 restarts"),
                service("secrets-broker", "Secrets broker", "root · v1.4.2 · 0 restarts"),
                service("audit-logger", "Audit logger", "root · chain verified 00:00"),
                service("watchdog", "Watchdog", "root · heartbeat 1 min ago"),
                service("config-applier", "Config applier", "root · last bundle 23:58"),
            ],
        ),
        ServiceGroup(
            name="Platform services",
            services=[
                service("approval-gate", "Approval gate", "aigate · v1.4.2 · 0 restarts"),
                service("tool-server", "Tool server", "aitools · policy check p95 4 ms"),
                service("pipeline-engine", "Pipeline engine", "aitools · 2 running · 2 queued"),
                service("model-router", "Model router", "aiegress · 1 restart today"),
                service("egress-proxy", "Egress proxy", "aiegress · 0 denied today"),
                service("connector-service", "Connector service", "aiconnect · synced 2 min ago"),
                service("openclaw", "OpenClaw gateway", "aiagent · pinned 2026.10.2"),
                service("chat-relay", "Chat relay", "aiagent · 2 methods allowed"),
                service("brain", "Brain", "aiportal · 142 MB"),
            ],
        ),
        ServiceGroup(
            name="In your session",
            services=[
                service("mlx-worker", "MLX worker", "owner · mode L · 22 / 27 GB"),
                service("colima", "Colima VM", "owner · 6 GB · 2 containers"),
                service("docker-proxy", "Docker API proxy", "owner · 0 refused today"),
                service("mac-bridge", "Mac bridge", "owner · 4 of 5 permissions"),
                service("image-worker", "Image worker", "starts in image mode", ON_DEMAND),
                service("messages-reader", "Messages reader", "apple.messages.read is off", OFF),
            ],
        ),
    ]


def family_assignments(independent_reviewer: bool) -> list[FamilyAssignment]:
    """An example assignment plan (spec 8.2). No model is a default; these are candidates."""
    resident = StatusLabel(status="healthy", label="Resident")
    batch = StatusLabel(status="in_progress", label="Batch")
    review = (
        FamilyAssignment(
            family="REVIEW",
            model="Gemma 4 26B-A4B · 4-bit",
            meta="different family · 14 GB",
            residency=batch,
        )
        if independent_reviewer
        else FamilyAssignment(
            family="REVIEW", model="Same as CODE", meta="same-family controls on", residency=batch
        )
    )
    return [
        FamilyAssignment(
            family="CONVERSE",
            model="Qwen3.6-35B-A3B · 4-bit",
            meta="82 tok/s · 21 GB · score 0.81",
            residency=resident,
        ),
        FamilyAssignment(
            family="REASON",
            model="Same as CONVERSE",
            meta="within 5% of best · no swap",
            residency=resident,
        ),
        FamilyAssignment(
            family="EXTRACT",
            model="Same as CONVERSE",
            meta="injection suite 100%",
            residency=resident,
        ),
        FamilyAssignment(
            family="CODE",
            model="GLM-4.7-Flash · 4-bit",
            meta="held-out tests 0.64 · 17 GB",
            residency=batch,
        ),
        review,
        FamilyAssignment(
            family="VISION",
            model="Qwen3-VL-30B-A3B · 4-bit",
            meta="scan batches only",
            residency=batch,
        ),
    ]


def reviewer_impact() -> list[ImpactLine]:
    """The impact card for `models.review.independent`, as in the spec 7.18 example."""
    worse = StatusLabel(status="attention", label="Worse")
    return [
        ImpactLine(
            name="Model swaps per day", change="+4 (3 → 7)", source="simulated", status=worse
        ),
        ImpactLine(name="Load time per swap", change="10–30 s", source="estimate"),
        ImpactLine(
            name="Review wait, R1 item", change="0 → up to 4 h", source="simulated", status=worse
        ),
        ImpactLine(
            name="Chat on fallback model", change="+12 min/day", source="simulated", status=worse
        ),
        ImpactLine(
            name="Peak pool memory",
            change="No change",
            source="measured",
            status=StatusLabel(status="healthy", label="Same"),
        ),
        ImpactLine(name="Bug catch rate", change="Unknown until Phase 13", source="estimate"),
    ]


def health_metrics() -> list[Metric]:
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


def model_stats() -> list[Metric]:
    """Seven-day figures on the Models page."""
    return [
        Metric(name="Chat first token p95", value="1.4 s", spark=[12, 10, 13, 9, 11, 8, 9]),
        Metric(name="Swaps per day", value="3.1", spark=[10, 12, 8, 11, 10, 12, 10]),
        Metric(name="Review wait p50", value="6 min", spark=[14, 12, 13, 10, 9, 10, 8]),
        Metric(name="Average power", value="38 W", spark=[9, 11, 10, 12, 9, 10, 11]),
    ]


def cloud_impact(cap_usd: int) -> list[ImpactLine]:
    """The impact card for turning on a cloud model at a given cap."""
    return [
        ImpactLine(
            name="Families that would use it", change="Decided by a selector run", source="estimate"
        ),
        ImpactLine(name="Spend per month", change=f"$0 → up to ${cap_usd}", source="simulated"),
        ImpactLine(
            name="Requests sent to cloud", change="0 → internal and public only", source="simulated"
        ),
        ImpactLine(name="Chat first token", change="Network-dependent", source="estimate"),
        ImpactLine(
            name="Local model swaps", change="Fewer, if REASON moves to cloud", source="simulated"
        ),
    ]


PAID_FEATURES = [
    (
        "anthropic",
        "Claude (Anthropic)",
        "Cloud model",
        "cloud.providers.anthropic",
        "budget.anthropic",
    ),
    ("openai", "GPT-6 Sol (OpenAI)", "Cloud model", "cloud.providers.openai", "budget.openai"),
    ("video", "Cloud video", "Per second of video", "video.cloud", "budget.video"),
    ("voice", "Phone-call approvals", "Twilio", "voice.enabled", "budget.voice"),
    ("offsite", "Paid offsite backup", "S3-compatible", "offsite.paid_storage", "budget.offsite"),
]
"""Optional paid features: id, name, kind, the setting that turns it on, the setting for its cap."""
