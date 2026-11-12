"""Mock pipeline engine: personal records, Setup, schedule, maintenance, docs and search.

The half that tracks work (sessions, threads, the Work board, the Directory) is `engine_work`.
"""

from typing import Literal

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.engine_work import WorkDesk
from control_center.backends.mock.fixtures import ops, personal, reference
from control_center.contract.common import Principal, StatusLabel
from control_center.contract.personal import (
    Case,
    CaseAction,
    FinanceOverview,
    PersonalOverview,
    SetupAction,
    SetupStep,
)
from control_center.contract.status import (
    DocsOverview,
    MaintenanceOverview,
    ScheduleOverview,
)
from control_center.contract.today import AgendaItem, SearchResults, SearchSection

CASE_STATE_AFTER: dict[str, Literal["open", "done", "snoozed"]] = {
    "done": "done",
    "snooze": "snoozed",
    "reopen": "open",
}
"""The state a case is in after each Owner action."""


class MockPipelineEngine(WorkDesk):
    """In-memory stand-in for the pipeline engine (spec C3). Implements `PipelineEngine`.

    Sessions, threads, the Work board and the Directory are in `WorkDesk`; personal records,
    Setup, the schedule, maintenance, docs and search are here.
    """

    # Personal ------------------------------------------------------------------------------

    def agenda(self) -> list[AgendaItem]:
        """Today's agenda."""
        return personal.agenda()

    def personal(self) -> PersonalOverview:
        """Open and snoozed cases, domains and recent automatic changes."""
        return PersonalOverview(
            cases=[case for case in self._world.cases.values() if case.state != "done"],
            domains=personal.domains(),
            recent_changes=list(self._world.changes.values()),
        )

    def case_action(self, case_id: str, action: CaseAction) -> Case:
        """Mark a case done, snooze it, or reopen it (the undo of either).

        Args:
            case_id: The case.
            action: What to do with it.

        Returns:
            The case in its new state.

        Raises:
            NotFoundError: No such case.
        """
        case = self._world.cases.get(case_id)
        if case is None:
            raise NotFoundError("That case no longer exists.")
        case.state = CASE_STATE_AFTER[action.action]
        self._world.bus.changed("personal", "today")
        return case

    def undo_change(self, change_id: str) -> PersonalOverview:
        """Undo an automatic change.

        Args:
            change_id: The automatic change.

        Returns:
            The Personal page data after the undo.

        Raises:
            NotFoundError: No such change.
        """
        change = self._world.changes.get(change_id)
        if change is None:
            raise NotFoundError("That change is too old to undo here; see History.")
        change.undone = True
        self._world.bus.changed("personal")
        return self.personal()

    def finance(self, principal: Principal) -> FinanceOverview:
        """Sample figures for one principal."""
        return personal.finance(principal)

    # Setup ---------------------------------------------------------------------------------

    def setup_steps(self) -> list[SetupStep]:
        """Every register item as a step card."""
        return list(self._world.setup.values())

    def setup_action(self, step_id: str, action: SetupAction) -> SetupStep:
        """Defer or resume a step, or record that the Owner started it.

        Starting a step in the mock does not complete it: a step is done only when its probe
        passes against the real account (spec 24.5), and the mock has no real accounts.

        Args:
            step_id: The setup step.
            action: What to do with it.

        Returns:
            The step in its new state.

        Raises:
            NotFoundError: No such step.
            ConflictError: The step is waiting on another one.
        """
        step = self._world.setup.get(step_id)
        if step is None:
            raise NotFoundError("That Setup step doesn't exist.")
        if step.state == "waiting":
            raise ConflictError(f"This step is waiting: {step.waiting_on}.")
        if action.action == "defer":
            step.state = "deferred"
        elif action.action in ("resume", "redo"):
            step.state = "ready"
            step.proof = None
        self._world.bus.changed("setup", "today", "platform")
        return step

    # Schedule and maintenance --------------------------------------------------------------

    def schedule(self) -> ScheduleOverview:
        """Jobs, the maintenance lock and quiet hours."""
        return ScheduleOverview(
            now="22:45",
            lock=StatusLabel(status="healthy", label="Free · next taken by Snapshots at 23:30"),
            quiet_hours=self._world.setting("quiet_hours"),
            jobs=list(self._world.jobs.values()),
        )

    def set_job_paused(self, job_id: str, paused: bool) -> ScheduleOverview:
        """Pause or resume a job.

        Args:
            job_id: The scheduled job.
            paused: True to pause, false to resume.

        Returns:
            The Schedule page data afterwards.

        Raises:
            NotFoundError: No such job.
        """
        job = self._world.jobs.get(job_id)
        if job is None:
            raise NotFoundError("That job doesn't exist.")
        job.paused = paused
        self._world.bus.changed("schedule")
        return self.schedule()

    def run_job(self, job_id: str) -> ScheduleOverview:
        """Run a job now. The mock records a successful run immediately.

        Args:
            job_id: The scheduled job.

        Returns:
            The Schedule page data afterwards.

        Raises:
            NotFoundError: No such job.
            ConflictError: The kill switch is on.
        """
        job = self._world.jobs.get(job_id)
        if job is None:
            raise NotFoundError("That job doesn't exist.")
        if self._world.stopped:
            raise ConflictError("Everything is stopped. Resume first.")
        job.last_run = StatusLabel(status="healthy", label="ok · just now")
        self._world.bus.changed("schedule", "backups")
        return self.schedule()

    def maintenance(self) -> MaintenanceOverview:
        """Pipeline C's state, last batch and findings."""
        running = self._world.maintenance_running
        return MaintenanceOverview(
            running=running,
            summary="Custodian · 2 repositories opted in · 0 reverts in 30 days",
            stats=ops.maintenance_stats(),
            batch=list(self._world.fixes.values()),
            findings=ops.findings(),
        )

    def set_maintenance_running(self, running: bool) -> MaintenanceOverview:
        """Pause or resume Pipeline C."""
        self._world.maintenance_running = running
        self._world.bus.changed("maintenance")
        return self.maintenance()

    def toggle_fix_reverted(self, fix_id: str) -> MaintenanceOverview:
        """Revert a fix, or undo the revert.

        Args:
            fix_id: The maintenance fix.

        Returns:
            The Maintenance page data afterwards.

        Raises:
            NotFoundError: No such fix.
        """
        fix = self._world.fixes.get(fix_id)
        if fix is None:
            raise NotFoundError("That fix isn't in the last batch.")
        fix.reverted = not fix.reverted
        self._world.bus.changed("maintenance")
        return self.maintenance()

    # Docs and search -----------------------------------------------------------------------

    def docs(self) -> DocsOverview:
        """Documentation by area."""
        return DocsOverview(groups=reference.doc_groups())

    def search(self, query: str) -> SearchResults:
        """Case-insensitive substring search over the fixture index."""
        needle = query.strip().lower()
        sections = [
            SearchSection(
                name=section.name,
                results=[
                    hit
                    for hit in section.results
                    if needle in hit.title.lower() or needle in hit.meta.lower()
                ],
            )
            for section in reference.search_index()
        ]
        answer = next(
            (
                text
                for word, text in reference.WAYFINDER_ANSWERS.items()
                if needle and word in needle
            ),
            None,
        )
        return SearchResults(
            query=query,
            answer=answer,
            sections=[section for section in sections if section.results] if needle else [],
        )
