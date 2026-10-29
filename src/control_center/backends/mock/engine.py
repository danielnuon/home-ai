"""Mock pipeline engine: tasks and interventions, work, directory, personal records and Setup."""

import secrets
from typing import Literal

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.fixtures import ops, personal, work
from control_center.backends.mock.world import MockWorld
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
from control_center.contract.work import (
    Directory,
    Intervention,
    LiveTask,
    TaskDetail,
    TranscriptEntry,
    WorkBoard,
)

CASE_STATE_AFTER: dict[str, Literal["open", "done", "snoozed"]] = {
    "done": "done",
    "snooze": "snoozed",
    "reopen": "open",
}
"""The state a case is in after each Owner action."""

INSTRUMENT_COUNT = 7
"""Deterministic instruments in the organization (spec 14.3)."""


class MockPipelineEngine:
    """In-memory stand-in for the pipeline engine (spec C3). Implements `PipelineEngine`."""

    def __init__(self, world: MockWorld) -> None:
        """Use `world` for state and its bus for events."""
        self._world = world

    # Live tasks ----------------------------------------------------------------------------

    def live_tasks(self) -> list[LiveTask]:
        """Running tasks first. While the kill switch is on, every task shows as paused."""
        tasks = sorted(self._world.tasks.values(), key=lambda t: t.queued)
        if self._world.stopped:
            return [
                task.model_copy(update={"paused": True, "tokens_per_second": None})
                for task in tasks
            ]
        return tasks

    def _task(self, task_id: str) -> LiveTask:
        try:
            return self._world.tasks[task_id]
        except KeyError:
            raise NotFoundError("That task has finished or never existed.") from None

    def task_detail(self, task_id: str) -> TaskDetail:
        """The task, its stage rail if it belongs to a work item, and its transcript."""
        task = self._task(task_id)
        stage = work.TASK_STAGES.get(task_id)
        return TaskDetail(
            task=task,
            stage_rail=work.stage_rail(stage) if stage is not None else [],
            transcript=self._world.transcripts.get(task_id, []),
        )

    def intervene(self, task_id: str, intervention: Intervention) -> TaskDetail:
        """Apply a note, pause, resume, redirect or stop (spec 7.10).

        A note never approves anything or widens a tool list; it is only added to the transcript
        as trusted Owner input that the employee reads before its next step.

        Args:
            task_id: The running or queued task.
            intervention: What to do, with the text for a note or redirect.

        Returns:
            The task's updated transcript.

        Raises:
            NotFoundError: No such task.
            ConflictError: A note or redirect without text.
        """  # noqa: DOC503 NotFoundError is raised by self._task()
        task = self._task(task_id)
        kind = intervention.kind
        if kind in ("note", "redirect") and not (intervention.text or "").strip():
            raise ConflictError("Write the note first.")
        if kind in ("note", "redirect"):
            self._append_owner_note(task_id, intervention.text or "")
        if kind == "pause":
            task.paused = True
        elif kind == "resume":
            task.paused = False
        elif kind == "redirect":
            task.doing = "is restarting with your note"
            task.paused = False
        elif kind == "stop":
            del self._world.tasks[task_id]
            self._world.bus.changed("live", "today", "platform")
            return TaskDetail(task=task, stage_rail=[], transcript=[])
        self._world.bus.changed("live", "today")
        return self.task_detail(task_id)

    def _append_owner_note(self, task_id: str, text: str) -> None:
        entry = TranscriptEntry(id=f"N-{secrets.token_hex(3)}", kind="owner_note", text=text)
        self._world.transcripts.setdefault(task_id, []).append(entry)
        self._world.bus.publish(
            "transcript.append", {"task_id": task_id, "entry": entry.model_dump()}
        )

    # Work and directory --------------------------------------------------------------------

    def work_board(self) -> WorkBoard:
        """Work items, ideas and reviews."""
        return WorkBoard(items=self._world.work_items, ideas=work.ideas(), reviews=work.reviews())

    def directory(self) -> Directory:
        """Employees, open proposals and the instrument count."""
        return Directory(
            employees=list(self._world.employees.values()),
            proposals=list(self._world.proposals.values()),
            instruments=INSTRUMENT_COUNT,
        )

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
        return DocsOverview(groups=ops.doc_groups())

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
            for section in ops.search_index()
        ]
        answer = next(
            (text for word, text in ops.WAYFINDER_ANSWERS.items() if needle and word in needle),
            None,
        )
        return SearchResults(
            query=query,
            answer=answer,
            sections=[section for section in sections if section.results] if needle else [],
        )
