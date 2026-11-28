"""The mock engine's operations controls.

Pool mode, health checks, pins, selection, logs, job times, restore drills, prune plans,
findings and the metric catalog.
"""

import re
import secrets

from control_center.backends.errors import ConflictError, NotFoundError, RefusedError
from control_center.backends.mock.fixtures import operations, platform
from control_center.backends.mock.world import MockWorld
from control_center.contract.common import Row, StatusLabel
from control_center.contract.status import (
    Finding,
    HealthCheck,
    MetricCatalog,
    PoolMode,
    PrunePlan,
    RestoreDrill,
    ScheduleOverview,
    ServiceLog,
)

PAGE_AREAS: dict[str, list[str]] = {
    "system": operations.SYSTEM_AREAS,
    "models": operations.MODELS_AREAS,
}
"""The catalog areas each page shows. Any other page, such as Settings, shows every area."""

TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
"""A start time, HH:MM on the 24-hour clock."""

STOPPED = "Everything is stopped. Resume first."


def heavy_work_paused(world: MockWorld) -> bool:
    """Whether critical memory pressure has paused background work (spec 7.17, "Degradation")."""
    return world.ops.pressure == "critical"


class OpsDesk:
    """The operations half of `PipelineEngine`, mixed into `MockPipelineEngine`."""

    _world: MockWorld

    def schedule(self) -> ScheduleOverview:
        """Jobs, the maintenance lock and quiet hours; implemented by the engine."""
        raise NotImplementedError

    # System ---------------------------------------------------------------------------------

    def set_pool_mode(self, mode: PoolMode) -> None:
        """Put the model pool in another mode (spec 8.3). An operating choice: one tap.

        Args:
            mode: The mode to switch to.

        Raises:
            ConflictError: It is already in that mode, the mode starts only with a selection
                run, or critical memory pressure holds the pool in mode L.
        """
        ops = self._world.ops
        if mode == ops.pool_mode:
            raise ConflictError(f"The pool is already in mode {mode}.")
        if mode not in operations.OWNER_MODES:
            raise ConflictError("Benchmark mode starts with a selection run, from Models.")
        if heavy_work_paused(self._world) and mode != "L":
            raise ConflictError("Memory pressure is critical, so the pool stays in mode L.")
        ops.pool_mode = mode
        self._world.bus.changed("system", "models", "today")

    def end_pool_mode(self) -> None:
        """End image or video mode and return the pool to mode L.

        Raises:
            ConflictError: The pool isn't in image or video mode.
        """
        if self._world.ops.pool_mode != "I":
            raise ConflictError("The pool isn't in image or video mode.")
        self._world.ops.pool_mode = "L"
        self._world.bus.changed("system", "models", "today")

    def run_health_check(self) -> None:
        """Check every service, the audit chain, the drives and the network now. Read-only."""
        rows = operations.HEALTH_CHECKS
        worst = "attention" if any(r.status and r.status.status != "healthy" for r in rows) else ""
        summary = (
            StatusLabel(status="attention", label="1 thing needs you")
            if worst
            else StatusLabel(status="healthy", label="All clear")
        )
        self._world.ops.health_check = HealthCheck(
            at=self._world.clock(), summary=summary, rows=rows
        )
        self._world.bus.changed("system")

    def pressure_drill(self) -> None:
        """Step memory pressure to its next level, as a resilience drill does (spec 7.17, 25).

        Warning stops transcript streaming and holds the Live deck; critical also pauses
        background work and returns the pool to mode L; the next step returns to normal.
        """
        ops = self._world.ops
        ops.pressure = operations.PRESSURE_DRILL[ops.pressure]
        if ops.pressure == "critical" and ops.pool_mode in ("S", "I"):
            ops.pool_mode = "L"
        self._world.bus.changed("platform", "system", "models", "live", "schedule", "today")

    # Models ---------------------------------------------------------------------------------

    def pin_family(self, family: str, pinned: bool) -> None:
        """Pin a family's model through re-selection, or unpin it.

        Args:
            family: The task family, such as CODE.
            pinned: True to pin, false to unpin.

        Raises:
            NotFoundError: No such family.
        """
        families = {a.family for a in platform.family_assignments(independent_reviewer=True)}
        if family not in families:
            raise NotFoundError("That model family doesn't exist.")
        pins = [f for f in self._world.ops.pins if f != family]
        self._world.ops.pins = [*pins, family] if pinned else pins
        self._world.bus.changed("models")

    def run_selection(self) -> None:
        """Queue a selector run for the next window (spec 8.6, "on demand").

        Raises:
            ConflictError: A run is already queued, or everything is stopped.
        """
        if self._world.stopped:
            raise ConflictError(STOPPED)
        if self._world.ops.selection_queued:
            raise ConflictError("A selection run is already queued.")
        self._world.ops.selection_queued = True
        self._world.bus.changed("models", "schedule")

    # Services -------------------------------------------------------------------------------

    def service_log(self, service_id: str) -> ServiceLog:
        """A service's full masked log, newest first.

        Args:
            service_id: The service.

        Returns:
            Its log as kept for 30 days.

        Raises:
            NotFoundError: No such service.
        """
        services = [s for g in platform.service_groups() for s in g.services]
        service = next((s for s in services if s.id == service_id), None)
        if service is None:
            raise NotFoundError("That service doesn't exist.")
        return ServiceLog(
            id=service.id,
            name=service.name,
            meta=service.meta,
            status=service.status,
            restartable=service.restartable,
            retained=operations.LOG_RETAINED,
            lines=operations.service_log(service.id),
        )

    # Schedule -------------------------------------------------------------------------------

    def set_job_time(self, job_id: str, time: str) -> ScheduleOverview:
        """Move a job to another start time, keeping its days (spec 7.2, Schedule).

        Args:
            job_id: The scheduled job.
            time: The new start, HH:MM.

        Returns:
            The Schedule page data afterwards.

        Raises:
            NotFoundError: No such job.
            ConflictError: The job runs every few minutes, or another heavy job already starts
                then and the two would want the maintenance lock at once.
            RefusedError: The time is not HH:MM.
        """
        job = self._world.jobs.get(job_id)
        if job is None:
            raise NotFoundError("That job doesn't exist.")
        if job.time is None:
            raise ConflictError(f"{job.name} runs every few minutes; it has no start time.")
        if not TIME.match(time):
            raise RefusedError("A start time is HH:MM, such as 23:30.")
        clash = next(
            (
                other
                for other in self._world.jobs.values()
                if other.id != job.id and job.heavy and other.heavy and other.time == time
            ),
            None,
        )
        if clash is not None:
            raise ConflictError(
                f"{clash.name} already starts at {time}. Heavy jobs take the maintenance lock "
                "one at a time."
            )
        job.when = job.when.replace(job.time, time)
        if job.next_run == job.time:
            job.next_run = time
        job.time = time
        self._world.bus.changed("schedule")
        return self.schedule()

    # Backups --------------------------------------------------------------------------------

    def run_restore_drill(self) -> None:
        """Restore a repository, a database and the audit log into a scratch folder and check them.

        The mock's drill passes at once. Nothing is written over live data, so it is one tap.

        Raises:
            ConflictError: Everything is stopped.
        """
        if self._world.stopped:
            raise ConflictError(STOPPED)
        ops = self._world.ops
        passed = StatusLabel(status="healthy", label="Passed")
        ops.drills = [
            Row(
                id=f"drill-{secrets.token_hex(2)}",
                title="Today",
                meta=operations.DRILL_DETAIL,
                status=passed,
            ),
            *ops.drills,
        ]
        ops.drill = RestoreDrill(status=passed, detail=f"Today · {operations.DRILL_DETAIL}")
        self._world.bus.changed("backups", "schedule")

    def make_prune_plan(self) -> None:
        """Work out what a prune would remove under the retention rules. Removes nothing."""
        self._world.ops.prune_plan = PrunePlan(
            id=f"PP-{secrets.token_hex(2)}",
            created_at=self._world.clock(),
            removes=operations.prune_removes(),
            frees=operations.PRUNE_FREES,
            keeps=operations.PRUNE_KEEPS,
        )
        self._world.bus.changed("backups")

    def discard_prune_plan(self) -> None:
        """Put the plan away without pruning.

        Raises:
            ConflictError: There is no plan.
        """
        if self._world.ops.prune_plan is None:
            raise ConflictError("There's no prune plan to discard.")
        self._world.ops.prune_plan = None
        self._world.bus.changed("backups")

    # Maintenance ----------------------------------------------------------------------------

    def _finding(self, finding_id: str) -> Finding:
        finding = self._world.ops.findings.get(finding_id)
        if finding is None:
            raise NotFoundError("That finding isn't in the register.")
        return finding

    def wont_fix(self, finding_id: str, reason: str) -> Finding:
        """Close a finding as won't-fix. It stays in the register with the reason.

        Args:
            finding_id: The finding.
            reason: Why, in the Owner's words.

        Returns:
            The finding afterwards.

        Raises:
            ConflictError: No reason was given, or it is already closed.
        """
        finding = self._finding(finding_id)
        if not reason.strip():
            raise ConflictError("Say why it won't be fixed; the reason stays on the finding.")
        if finding.state == "wont_fix":
            raise ConflictError("That finding is already marked won't-fix.")
        finding.state, finding.reason = "wont_fix", reason.strip()
        self._world.bus.changed("maintenance")
        return finding

    def reopen_finding(self, finding_id: str) -> Finding:
        """Reopen a won't-fix finding; the Undo of marking it.

        Args:
            finding_id: The finding.

        Returns:
            The finding afterwards.

        Raises:
            ConflictError: It is already open.
        """
        finding = self._finding(finding_id)
        if finding.state == "open":
            raise ConflictError("That finding is already open.")
        finding.state, finding.reason = "open", None
        self._world.bus.changed("maintenance")
        return finding

    # Metric catalog -------------------------------------------------------------------------

    def metrics(self, page: str) -> MetricCatalog:
        """The metric catalog with 7- and 30-day trends, for one page (spec 7.18).

        Args:
            page: system, models, or anything else for every area.

        Returns:
            The page's areas, in catalog order.
        """
        areas = PAGE_AREAS.get(page)
        groups = operations.metric_catalog()
        return MetricCatalog(groups=[g for g in groups if areas is None or g.area in areas])
