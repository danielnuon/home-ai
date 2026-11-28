"""Mock status aggregator: the read-only platform pages, shaped by the current settings."""

from datetime import datetime

from control_center.backends.mock.fixtures import operations, ops, platform
from control_center.backends.mock.world import MockWorld
from control_center.contract.common import Metric, Row, RowGroup, StatusLabel
from control_center.contract.status import (
    BackupsOverview,
    ConnectionsOverview,
    MemoryZone,
    ModelsOverview,
    PaidFeature,
    PoolModeOption,
    PoolState,
    SecurityOverview,
    SelectionRun,
    ServiceGroup,
    ServicesOverview,
    SpendOverview,
    SystemOverview,
    VoiceOverview,
)
from control_center.contract.today import Tile

CALL_SCRIPT = (
    '"Approval requested: class C. Code on your screen. Enter the code, then press pound." '
    "Four fixed lines per voice. No names, amounts or codes are ever spoken."
)
"""What an approval call says (spec 11.5.1). The same fixed lines for every voice."""

DESK_MODE_GB = 4
"""How much of the pool Desk mode gives to the Owner's session (spec 8.11.2)."""

OFFSITE_FEATURE = "offsite"
"""The paid feature Backups shows in the same panel as Spend."""

BACKUP_MODE = StatusLabel(status="attention", label="Starter backup · one location")
"""The backup mode, shown on Backups and on Today's tile."""


class MockStatusAggregator:
    """Stand-in for Brain's status aggregator (spec 7.3). Implements `StatusAggregator`."""

    def __init__(self, world: MockWorld) -> None:
        """Read settings and the kill switch from `world`."""
        self._world = world

    def sampled_at(self) -> datetime:
        """When the simulated aggregator last sampled; `simulate_activity` moves it on."""
        return self._world.sampled_at

    def _sampled(self, tiles: list[Metric]) -> list[Metric]:
        """Stamp fixture tiles with the latest sample time."""
        return [tile.model_copy(update={"sampled_at": self._world.sampled_at}) for tile in tiles]

    def subsystem_tiles(self, spend: SpendOverview) -> list[Tile]:
        """Today's tiles, from the same figures the pages show, without building the pages.

        Args:
            spend: The Spend page's data, which the caller already has.

        Returns:
            One tile per subsystem, stamped with the latest sample time.
        """
        pool = next(z for z in self._zones() if z.name == "Model pool")
        healthy = StatusLabel(status="healthy", label="Healthy")
        tiles = [
            ("Services", f"{_running(platform.service_groups())} running", healthy, "/services"),
            (
                "Model pool",
                f"{pool.used_gb:g} / {pool.budget_gb:g} GB",
                StatusLabel(status="healthy", label=self._mode_name()),
                "/models",
            ),
            ("Backups", "20:00 today", BACKUP_MODE, "/backups"),
            ("Spend", f"${spend.total_usd:.2f}", spend.summary, "/spend"),
            (
                "Connections",
                "3 of 4",
                StatusLabel(status="attention", label="Contacts waiting"),
                "/connections",
            ),
            ("Heartbeat", "1 min ago", StatusLabel(status="healthy", label="Reporting"), "/system"),
        ]
        return [
            Tile(name=name, value=value, status=status, href=href, sampled_at=self.sampled_at())
            for name, value, status, href in tiles
        ]

    def health_metrics(self) -> list[Metric]:
        """Today's live figures, stamped like every other sample."""
        return self._sampled(platform.health_metrics(self._world.samples))

    def _mode_name(self) -> str:
        """The pool mode as Today's tile and Models name it, such as "Mode L"."""
        return f"Mode {self._world.ops.pool_mode}"

    def _zones(self) -> list[MemoryZone]:
        """The memory budget; Desk mode moves 4 GB from the pool to your session (8.11.2)."""
        if not self._world.is_on("resources.desk_mode"):
            return platform.MEMORY_ZONES
        moved = {"macOS and your session": DESK_MODE_GB, "Model pool": -DESK_MODE_GB}
        return [
            zone.model_copy(update={"budget_gb": zone.budget_gb + moved.get(zone.name, 0)})
            for zone in platform.MEMORY_ZONES
        ]

    def _pool(self) -> PoolState:
        mode = self._world.ops.pool_mode
        label, _, loaded = operations.POOL_MODES[mode]
        options = [
            PoolModeOption(
                mode=option,
                label=operations.POOL_MODES[option][0],
                note=operations.POOL_MODES[option][1],
                impact=operations.MODE_IMPACT[option],
            )
            for option in operations.OWNER_MODES
        ]
        return PoolState(
            mode=mode, label=label, loaded=loaded, can_end=mode == "I", options=options
        )

    def system(self) -> SystemOverview:
        """Machine, memory zones, the host's resource controls and hardware signals."""
        level = self._world.ops.pressure
        pressure, _ = operations.PRESSURE_WORDS[level]
        summary = (
            StatusLabel(status="healthy", label="All clear")
            if level == "normal"
            else StatusLabel(status=pressure.status, label=f"Memory pressure {level}")
        )
        return SystemOverview(
            summary=summary,
            machine="Mac mini M5 Pro · 64 GB · up 12 d 4 h · 0 unexpected reboots",
            zones=self._zones(),
            pressure=pressure,
            pressure_level=level,
            swap="0.3 GB · alert at 2 GB",
            tiles=self._sampled(platform.system_tiles()),
            rows=platform.system_rows(),
            pool=self._pool(),
            lanes=operations.LANES,
            cpu=operations.CPU_CLASSES,
            thermal=operations.THERMAL,
            drives=operations.DRIVES,
            model_time=operations.MODEL_TIME,
            health_check=self._world.ops.health_check,
        )

    def services(self) -> ServicesOverview:
        """Every service with its health."""
        groups = platform.service_groups()
        return ServicesOverview(
            summary=f"{_running(groups)} running · health checked every minute",
            groups=groups,
        )

    def models(self) -> ModelsOverview:
        """Assignments and the independent-reviewer preview, following the setting."""
        independent = self._world.is_on("models.review.independent")
        pins = self._world.ops.pins
        queued = self._world.ops.selection_queued
        return ModelsOverview(
            pool_mode=self._mode_name(),
            resident="Conversation model + embeddings",
            swaps_today="3 · plan ≤ 6",
            assignments=[
                a.model_copy(update={"pinned": a.family in pins})
                for a in platform.family_assignments(independent)
            ],
            independent_reviewer=independent,
            reviewer_impact=platform.reviewer_impact(),
            stats=platform.model_stats(),
            tokens=platform.tokens_panel(),
            queue=operations.queue_depth(),
            split=operations.local_cloud_split(),
            routing=operations.routing_panel(),
            candidates=operations.candidates(),
            selection=SelectionRun(
                status=StatusLabel(status="in_progress", label=operations.SELECTION_NEXT)
                if queued
                else StatusLabel(status="healthy", label="Idle"),
                last_run=operations.SELECTION_IDLE,
                queued=queued,
            ),
            plan_decisions=operations.PLAN_DECISIONS,
            pin_impact=operations.PIN_IMPACT,
        )

    def spend(self) -> SpendOverview:
        """Paid features with their switches and caps, read from the settings store."""
        features = [
            self._paid_feature(feature_id, name, kind, switch_key, cap_key)
            for feature_id, name, kind, switch_key, cap_key in platform.PAID_FEATURES
        ]
        any_on = any(feature.on for feature in features)
        summary = (
            StatusLabel(status="in_progress", label="Paid features on · spending stops at caps")
            if any_on
            else StatusLabel(status="healthy", label="Everything runs locally. Paid features off.")
        )
        return SpendOverview(
            month="October", total_usd=0.0, summary=summary, features=features, ledger=[]
        )

    def _paid_feature(
        self, feature_id: str, name: str, kind: str, switch_key: str, cap_key: str
    ) -> PaidFeature:
        cap = self._world.settings[cap_key]
        cap_usd = int(cap.value)
        return PaidFeature(
            id=feature_id,
            name=name,
            meta=f"{kind} · cap ${cap_usd}",
            setting_key=switch_key,
            cap_setting_key=cap_key,
            on=self._world.is_on(switch_key),
            cap_usd=cap_usd,
            ceiling_usd=cap.ceiling or 0,
            impact=platform.cloud_impact(cap.ceiling or 0),
        )

    def security(self) -> SecurityOverview:
        """Kill switch, flags, sign-in and masked audit lines."""
        return SecurityOverview(
            stopped=self._world.stopped,
            tiles=self._sampled(ops.security_tiles()),
            flags=ops.security_flags(),
            sign_in=ops.sign_in_rows(),
            audit=ops.AUDIT_LINES,
            chain="Chain verified 00:00 · 0 breaks",
        )

    def backups(self) -> BackupsOverview:
        """Starter mode, targets, drills, retention, a prune plan and paid offsite storage."""
        ops_state = self._world.ops
        offsite = next(f for f in platform.PAID_FEATURES if f[0] == OFFSITE_FEATURE)
        return BackupsOverview(
            mode=BACKUP_MODE,
            mode_note=(
                "Your two drives back each other up. That covers a failed drive and mistakes, "
                "not theft, fire or a power surge that takes both."
            ),
            targets=ops.backup_targets(),
            drill=ops_state.drill,
            drills=ops_state.drills,
            restore_points=["Today 20:00", "Yesterday 00:00", "Oct 20 (weekly)"],
            retention=ops.retention(),
            prune_plan=ops_state.prune_plan,
            last_prune=ops_state.last_prune,
            offsite=self._paid_feature(*offsite),
        )

    def connections(self) -> ConnectionsOverview:
        """Connections, with paid providers following their settings."""
        groups = ops.connection_groups()
        providers = [
            Row(
                id=feature_id,
                title=name,
                meta="Key stored" if self._world.is_on(switch_key) else "No key entered",
                href="/spend",
                status=StatusLabel(status="healthy", label="On")
                if self._world.is_on(switch_key)
                else StatusLabel(status="neutral", label="Off"),
            )
            for feature_id, name, _, switch_key, _ in platform.PAID_FEATURES
        ]
        groups.append(RowGroup(name="Optional paid providers", note="$0 until on", rows=providers))
        return ConnectionsOverview(groups=groups)

    def voice(self) -> VoiceOverview:
        """Voice profiles following `voice.profile` and the celebrity-clone setting."""
        celebrity = self._world.is_on("voice.profiles.celebrity_clones")
        return VoiceOverview(
            calls_enabled=self._world.is_on("voice.enabled"),
            celebrity_clones=celebrity,
            profiles=ops.voice_profiles(self._world.setting("voice.profile"), celebrity),
            script=CALL_SCRIPT,
        )


def _running(groups: list[ServiceGroup]) -> int:
    """How many services are healthy."""
    return sum(
        1 for group in groups for service in group.services if service.status.status == "healthy"
    )
