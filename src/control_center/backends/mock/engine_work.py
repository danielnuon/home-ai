"""The mock engine's work tracking: sessions, threads, the Work board and the Directory.

Thread and employee states are never stored. They are derived here from the open sessions and
the recorded facts each time they are read, as spec 15.8.3 requires of the real engine.
"""

import secrets

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.fixtures import people, work
from control_center.backends.mock.threads import STATE_ORDER, ThreadRecord, to_thread
from control_center.backends.mock.world import MockWorld
from control_center.contract.work import (
    Directory,
    Employee,
    EmployeeStatus,
    Intervention,
    LiveTask,
    TaskDetail,
    Thread,
    ThreadsOverview,
    TranscriptEntry,
    WorkBoard,
)

INSTRUMENT_COUNT = 7
"""Deterministic instruments in the organization (spec 14.3)."""

SESSION_PAGES = ("live", "today", "work", "directory")
"""The resources that show session states; each refetches when a session changes."""

THREAD_PAGES = (*SESSION_PAGES, "platform")
"""The resources that show thread states or count running sessions."""


class WorkDesk:
    """The work-tracking half of `PipelineEngine`. The base of `MockPipelineEngine`."""

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
            self._world.bus.changed(*SESSION_PAGES, "platform")
            return TaskDetail(task=task, stage_rail=[], transcript=[])
        self._world.bus.changed(*SESSION_PAGES)
        return self.task_detail(task_id)

    def _append_owner_note(self, task_id: str, text: str) -> None:
        entry = TranscriptEntry(id=f"N-{secrets.token_hex(3)}", kind="owner_note", text=text)
        self._world.transcripts.setdefault(task_id, []).append(entry)
        self._world.bus.publish(
            "transcript.append", {"task_id": task_id, "entry": entry.model_dump()}
        )

    # Work and directory --------------------------------------------------------------------

    def work_board(self) -> WorkBoard:
        """Threads, work items, ideas and reviews."""
        return WorkBoard(
            threads=self.threads(),
            items=self._world.work_items,
            ideas=work.ideas(),
            reviews=work.reviews(),
        )

    def directory(self) -> Directory:
        """Employees with their status rolled up from sessions, proposals and instruments."""
        sessions = self.live_tasks()
        employees = [
            employee.model_copy(update={"status": _employee_status(employee, sessions)})
            for employee in self._world.employees.values()
        ]
        return Directory(
            employees=employees,
            proposals=list(self._world.proposals.values()),
            instruments=INSTRUMENT_COUNT,
        )

    # Threads -------------------------------------------------------------------------------

    def threads(self) -> ThreadsOverview:
        """Open threads in state order (spec 15.8.3), then the resolved ones, newest first."""
        sessions = self.live_tasks()
        every = [self._shown(record, sessions) for record in self._world.threads.values()]
        open_threads = [thread for thread in every if thread.state != "resolved"]
        return ThreadsOverview(
            open=sorted(open_threads, key=lambda thread: STATE_ORDER.index(thread.state)),
            recently_resolved=[thread for thread in every if thread.state == "resolved"],
        )

    def _shown(self, record: ThreadRecord, sessions: list[LiveTask]) -> Thread:
        """The record with its state derived from its sessions and its approval card."""
        approval = self._world.approvals.get(record.approval_id or "")
        return to_thread(
            record,
            [session for session in sessions if session.thread_id == record.id],
            approval_pending=approval is not None and approval.state == "pending",
        )

    def _thread_record(self, thread_id: str) -> ThreadRecord:
        try:
            return self._world.threads[thread_id]
        except KeyError:
            raise NotFoundError("That thread doesn't exist.") from None

    def resolve_thread(self, thread_id: str) -> Thread:
        """Resolve a thread and end its sessions (spec 15.8.7).

        A thread that waits on an Owner decision is refused: closing it would hide that decision
        (spec 15.8.10).

        Args:
            thread_id: The thread.

        Returns:
            The thread, now resolved.

        Raises:
            NotFoundError: No such thread.
            ConflictError: It is already resolved, or it waits on a decision from the Owner.
        """  # noqa: DOC503 NotFoundError is raised by self._thread_record()
        record = self._thread_record(thread_id)
        shown = self._shown(record, self.live_tasks())
        if shown.state == "resolved":
            raise ConflictError("This thread is already resolved.")
        if shown.state == "needs_owner":
            raise ConflictError("This thread is waiting on your decision. Answer that first.")
        record.outcome = record.proposed_resolution or "Resolved by you."
        for task_id in [t.id for t in self._world.tasks.values() if t.thread_id == thread_id]:
            del self._world.tasks[task_id]
        self._world.bus.changed(*THREAD_PAGES)
        return self._shown(record, [])

    def reopen_thread(self, thread_id: str) -> Thread:
        """Reopen a resolved thread. It starts again from its closing summary, with no session.

        Args:
            thread_id: The thread.

        Returns:
            The thread, open again.

        Raises:
            NotFoundError: No such thread.
            ConflictError: It is not resolved.
        """  # noqa: DOC503 NotFoundError is raised by self._thread_record()
        record = self._thread_record(thread_id)
        if record.outcome is None:
            raise ConflictError("This thread is already open.")
        record.outcome = None
        record.proposed_resolution = None
        self._world.bus.changed(*THREAD_PAGES)
        return self._shown(record, self.live_tasks())


def _employee_status(employee: Employee, sessions: list[LiveTask]) -> EmployeeStatus:
    """An employee's status, rolled up from its open sessions (spec 15.8.9).

    The first that applies wins. An employee is active while any of its sessions runs (15.8.1),
    whatever its other sessions are doing.
    """
    if employee.id in people.NOT_YET_HIRED:
        return "not_yet_hired"
    if not employee.enabled:
        return "disabled"
    states = {s.session_state for s in sessions if s.employee_id == employee.id}
    if "running" in states:
        return "active_now"
    if "blocked" in states:
        return "blocked"
    if any(s.waiting_on == "owner" for s in sessions if s.employee_id == employee.id):
        return "waiting_on_owner"
    return "paused" if "paused" in states else "idle"
