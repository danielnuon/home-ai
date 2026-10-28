"""Mock status aggregator: the read-only platform pages, shaped by the current settings."""

from control_center.backends.mock.fixtures import ops, platform
from control_center.backends.mock.world import MockWorld
from control_center.contract.common import Row, RowGroup, StatusLabel
from control_center.contract.status import (
    BackupsOverview,
    ConnectionsOverview,
    ModelsOverview,
    PaidFeature,
    RestoreDrill,
    SecurityOverview,
    ServicesOverview,
    SpendOverview,
    SystemOverview,
    VoiceOverview,
)

CALL_SCRIPT = (
    '"Approval requested: class C. Code on your screen. Enter the code, then press pound." '
    "Four fixed lines per voice. No names, amounts or codes are ever spoken."
)
"""What an approval call says (spec 11.5.1). The same fixed lines for every voice."""


class MockStatusAggregator:
    """Stand-in for Brain's status aggregator (spec 7.3). Implements `StatusAggregator`."""

    def __init__(self, world: MockWorld) -> None:
        """Read settings and the kill switch from `world`."""
        self._world = world

    def system(self) -> SystemOverview:
        """Machine, memory zones and hardware signals."""
        return SystemOverview(
            summary=StatusLabel(status="healthy", label="All clear"),
            machine="Mac mini M5 Pro · 48 GB · up 12 d 4 h · 0 unexpected reboots",
            zones=platform.MEMORY_ZONES,
            pressure=StatusLabel(status="healthy", label="Normal"),
            swap="0.3 GB · alert at 2 GB",
            tiles=platform.system_tiles(),
            rows=platform.system_rows(),
        )

    def services(self) -> ServicesOverview:
        """Every service with its health."""
        groups = platform.service_groups()
        running = sum(1 for g in groups for s in g.services if s.status.status == "healthy")
        return ServicesOverview(
            summary=f"{running} running · health checked every minute",
            groups=groups,
        )

    def models(self) -> ModelsOverview:
        """Assignments and the independent-reviewer preview, following the setting."""
        independent = self._world.is_on("models.review.independent")
        return ModelsOverview(
            pool_mode="Mode L",
            resident="Conversation model + embeddings",
            swaps_today="3 · plan ≤ 6",
            assignments=platform.family_assignments(independent),
            independent_reviewer=independent,
            reviewer_impact=platform.reviewer_impact(),
            stats=platform.model_stats(),
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
            tiles=ops.security_tiles(),
            flags=ops.security_flags(),
            sign_in=ops.sign_in_rows(),
            audit=ops.AUDIT_LINES,
            chain="Chain verified 00:00 · 0 breaks",
        )

    def backups(self) -> BackupsOverview:
        """Starter mode, targets, the last drill and retention."""
        return BackupsOverview(
            mode=StatusLabel(status="attention", label="Starter backup · one location"),
            mode_note=(
                "Your two drives back each other up. That covers a failed drive and mistakes, "
                "not theft, fire or a power surge that takes both."
            ),
            targets=ops.backup_targets(),
            drill=RestoreDrill(
                status=StatusLabel(status="healthy", label="Passed"),
                detail=(
                    "Oct 4 · one repository, tasks.db and the audit log restored to a scratch "
                    "folder · hash chain verified · 4 min"
                ),
            ),
            restore_points=["Today 20:00", "Yesterday 00:00", "Oct 20 (weekly)"],
            retention=ops.retention(),
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
