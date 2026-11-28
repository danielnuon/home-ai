"""The mock engine's Work boards: ideas, work items, products, item pages, moves and roles.

Every change here is an Owner command to the pipeline engine (spec 15.8.10, 23.1): one tap, with
Undo where it can be taken back, and no step-up, because none of them adds exposure, spend or
automation. Retiring a product is the exception that needs a yes: asking opens the retirement work
item and its approval card, and nothing stops until the Owner approves (17.21).
"""

import secrets

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.engine_work import THREAD_PAGES, WorkDesk
from control_center.backends.mock.fixtures import work
from control_center.backends.mock.fixtures.threads import LEADS
from control_center.backends.mock.threads import ThreadRecord
from control_center.contract.common import StatusLabel
from control_center.contract.gate import Approval
from control_center.contract.work import (
    Idea,
    IdeaDraft,
    LeadRef,
    LifecycleProposal,
    Priority,
    Product,
    RoleSuggestion,
    Thread,
    TranscriptLog,
    WipCount,
    WorkBoard,
    WorkItem,
    WorkItemDetail,
)

PRIORITY_ORDER: list[Priority] = ["high", "normal", "low"]
"""How the boards list items and ideas: the highest priority first, then in fixture order."""

IDEA_LEAD = "spark"
"""Every new idea goes to the Ideation Lead (spec 16.1)."""

RETIREMENT_SUMMARY = (
    "Stops the service, frees its container slot and archives its repository and GitHub mirror. "
    "A final snapshot and restore-to-service steps keep it reversible."
)
"""What the retirement approval card says will happen (spec 17.21)."""

ROLE_SOURCE = "Your suggestion · Cadence reviews it at the next monthly review"
"""Where a suggested role's proposal came from (spec 14.7)."""

BOARD_PAGES = ("work", "today")
"""The resources that show ideas and work items."""


def _current_stage(item: WorkItem) -> str:
    """The code of the item's current stage, or "D0" before it starts."""
    return next((stage.code for stage in item.stages if stage.state == "current"), "D0")


def _shown_item(item: WorkItem) -> WorkItem:
    """The item as the boards show it: a paused item says so in its status (spec 7.10)."""
    if not item.paused:
        return item
    phase = item.status.label.split(" · ")[0]
    return item.model_copy(
        update={
            "status": StatusLabel(status="neutral", label=f"{phase} · Paused"),
            "now": "Paused by you. Nothing runs until you resume it.",
        }
    )


def _by_priority[T: (WorkItem, Idea)](items: list[T]) -> list[T]:
    return sorted(items, key=lambda item: PRIORITY_ORDER.index(item.priority))


class BoardDesk(WorkDesk):
    """Ideas, work items, products, the item page and thread moves. The base of the mock engine."""

    def work_board(self) -> WorkBoard:
        """Threads, work items, ideas, reviews and products, with work in progress counted."""
        items = [_shown_item(item) for item in self._world.work_items]
        return WorkBoard(
            threads=self.threads(),
            items=_by_priority(items),
            ideas=_by_priority(list(self._world.ideas.values())),
            reviews=work.reviews(),
            products=[self._shown_product(p) for p in self._world.products.values()],
            wip=WipCount(
                in_progress=sum(_current_stage(i) in work.WIP_STAGES for i in items),
                limit=work.WIP_GLOBAL,
            ),
            leads=[
                LeadRef(id=lead_id, name=name, department=department, pipeline=pipeline)
                for lead_id, (name, department, pipeline) in LEADS.items()
            ],
        )

    def _shown_product(self, product: Product) -> Product:
        """The product with its work in progress counted from its items (spec 17.10)."""
        wip = sum(
            item.product_id == product.id and _current_stage(item) in work.WIP_STAGES
            for item in self._world.work_items
        )
        return product.model_copy(update={"wip": wip})

    # Ideas ---------------------------------------------------------------------------------

    def _idea(self, idea_id: str) -> Idea:
        try:
            return self._world.ideas[idea_id]
        except KeyError:
            raise NotFoundError("That idea doesn't exist.") from None

    def submit_idea(self, draft: IdeaDraft) -> Idea:
        """Capture a new idea and open its thread with the Ideation Lead (spec 16.1, 16.2).

        Args:
            draft: The idea's title and the Owner's description.

        Returns:
            The idea, captured.

        Raises:
            ConflictError: It has no title.
        """
        title = draft.title.strip()
        if not title:
            raise ConflictError("Give the idea a title first.")
        token = secrets.token_hex(2)
        idea = Idea(
            id=f"ID-{token}",
            title=title,
            state="Captured",
            lead=LEADS[IDEA_LEAD][0],
            summary=draft.summary.strip(),
            thread_id=f"TH-{token}",
        )
        name, department, pipeline = LEADS[IDEA_LEAD]
        self._world.threads[f"TH-{token}"] = ThreadRecord(
            id=f"TH-{token}",
            title=title,
            kind="idea",
            unit_id=idea.id,
            lead_id=IDEA_LEAD,
            lead_name=name,
            lead_department=department,
            pipeline=pipeline,
            principal="owner",
            since="today",
        )
        self._world.ideas = {idea.id: idea, **self._world.ideas}
        self._world.bus.changed(*THREAD_PAGES)
        return idea

    def edit_idea(self, idea_id: str, draft: IdeaDraft) -> Idea:
        """Change an idea's title or description. Its thread takes the new title.

        Args:
            idea_id: The idea.
            draft: The new title and description.

        Returns:
            The idea, changed.

        Raises:
            NotFoundError: No such idea.
            ConflictError: It has no title, or it was withdrawn.
        """  # noqa: DOC503 NotFoundError is raised by self._idea()
        idea = self._open_idea(idea_id)
        title = draft.title.strip()
        if not title:
            raise ConflictError("Give the idea a title first.")
        idea.title = title
        idea.summary = draft.summary.strip()
        if idea.thread_id in self._world.threads:
            self._world.threads[idea.thread_id].title = title
        self._world.bus.changed(*THREAD_PAGES)
        return idea

    def _open_idea(self, idea_id: str) -> Idea:
        idea = self._idea(idea_id)
        if idea.withdrawn:
            raise ConflictError("This idea was withdrawn. Reopen it first.")
        return idea

    def withdraw_idea(self, idea_id: str) -> Idea:
        """Withdraw an idea: its thread resolves as withdrawn and its sessions end (15.8.3).

        Args:
            idea_id: The idea.

        Returns:
            The idea, withdrawn. Reopening it is the Undo.

        Raises:
            NotFoundError: No such idea.
            ConflictError: It is already withdrawn.
        """  # noqa: DOC502 NotFoundError and ConflictError are raised by self._open_idea()
        idea = self._open_idea(idea_id)
        idea.withdrawn = True
        record = self._world.threads.get(idea.thread_id or "")
        if record is not None:
            record.outcome = "Withdrawn by you."
            self._end_sessions(record.id)
        self._world.bus.changed(*THREAD_PAGES)
        return idea

    def reopen_idea(self, idea_id: str) -> Idea:
        """Reopen a withdrawn idea. Its thread opens again with no session.

        Args:
            idea_id: The idea.

        Returns:
            The idea, open again.

        Raises:
            NotFoundError: No such idea.
            ConflictError: It was not withdrawn.
        """  # noqa: DOC503 NotFoundError is raised by self._idea()
        idea = self._idea(idea_id)
        if not idea.withdrawn:
            raise ConflictError("This idea is already open.")
        idea.withdrawn = False
        record = self._world.threads.get(idea.thread_id or "")
        if record is not None:
            record.outcome = None
        self._world.bus.changed(*THREAD_PAGES)
        return idea

    def set_idea_paused(self, idea_id: str, paused: bool) -> Idea:
        """Pause or resume an idea's analysis (spec 7.10). Its sessions hold or carry on.

        Args:
            idea_id: The idea.
            paused: True to pause, False to resume.

        Returns:
            The idea.

        Raises:
            NotFoundError: No such idea.
            ConflictError: It was withdrawn.
        """  # noqa: DOC502 NotFoundError and ConflictError are raised by self._open_idea()
        idea = self._open_idea(idea_id)
        idea.paused = paused
        self._hold_thread(idea.thread_id, paused)
        return idea

    def set_idea_priority(self, idea_id: str, priority: Priority) -> Idea:
        """Move an idea up or down the ideas board.

        Args:
            idea_id: The idea.
            priority: Its new priority.

        Returns:
            The idea.

        Raises:
            NotFoundError: No such idea.
            ConflictError: It was withdrawn.
        """  # noqa: DOC502 NotFoundError and ConflictError are raised by self._open_idea()
        idea = self._open_idea(idea_id)
        idea.priority = priority
        self._world.bus.changed(*BOARD_PAGES)
        return idea

    # Work items ----------------------------------------------------------------------------

    def _item(self, item_id: str) -> WorkItem:
        found = next((item for item in self._world.work_items if item.id == item_id), None)
        if found is None:
            raise NotFoundError("That work item doesn't exist.")
        return found

    def set_item_paused(self, item_id: str, paused: bool) -> WorkItem:
        """Pause or resume a work item (spec 7.10): its sessions hold at the next step boundary.

        Args:
            item_id: The work item.
            paused: True to pause, False to resume.

        Returns:
            The item as the boards show it.

        Raises:
            NotFoundError: No such work item.
        """  # noqa: DOC502 NotFoundError is raised by self._item()
        item = self._item(item_id)
        item.paused = paused
        self._hold_thread(item.thread_id, paused)
        return _shown_item(item)

    def set_item_priority(self, item_id: str, priority: Priority) -> WorkItem:
        """Move a work item up or down its pipeline's queue.

        Args:
            item_id: The work item.
            priority: Its new priority.

        Returns:
            The item as the boards show it.

        Raises:
            NotFoundError: No such work item.
        """  # noqa: DOC502 NotFoundError is raised by self._item()
        item = self._item(item_id)
        item.priority = priority
        self._world.bus.changed(*BOARD_PAGES)
        return _shown_item(item)

    def item_detail(self, item_id: str) -> WorkItemDetail:
        """A work item's page: stage history, gates, its review's diff and its transcripts.

        Args:
            item_id: The work item.

        Returns:
            Everything the item's page shows.

        Raises:
            NotFoundError: No such work item.
        """  # noqa: DOC502 NotFoundError is raised by self._item()
        item = self._item(item_id)
        product = self._world.products.get(item.product_id or "")
        sessions = [t for t in self.live_tasks() if t.thread_id and t.thread_id == item.thread_id]
        return WorkItemDetail(
            item=_shown_item(item),
            product=None if product is None else self._shown_product(product),
            history=work.stage_history(item_id),
            gates=work.item_gates(item_id),
            review=next((r for r in work.reviews() if r.item_id == item_id), None),
            diff=work.diffs(item_id),
            transcripts=[
                TranscriptLog(
                    task_id=task.id,
                    employee_name=task.employee_name,
                    department=task.department,
                    doing=task.doing,
                    entries=self._world.transcripts.get(task.id, []),
                )
                for task in sessions
            ],
        )

    def _hold_thread(self, thread_id: str | None, paused: bool) -> None:
        """Pause or resume a thread and every session on it, then tell the pages."""
        record = self._world.threads.get(thread_id or "")
        if record is not None:
            record.paused = paused
        for task in self._world.tasks.values():
            if thread_id and task.thread_id == thread_id:
                task.paused = paused
        self._world.bus.changed(*THREAD_PAGES)

    def _end_sessions(self, thread_id: str) -> None:
        for task_id in [t.id for t in self._world.tasks.values() if t.thread_id == thread_id]:
            del self._world.tasks[task_id]

    # Products ------------------------------------------------------------------------------

    def retire_product(self, product_id: str) -> WorkItem:
        """Ask Foreman to retire a released product (spec 17.21).

        This opens the retirement work item at D0 and its approval card (class P); nothing stops
        until the Owner approves the card. Denying it leaves the product running.

        Args:
            product_id: The product.

        Returns:
            The retirement work item.

        Raises:
            NotFoundError: No such product.
            ConflictError: It is not released, or its retirement is already open.
        """
        product = self._world.products.get(product_id)
        if product is None:
            raise NotFoundError("That product doesn't exist.")
        if product.state != "released":
            raise ConflictError(f"{product.name} is already being retired.")
        token = secrets.token_hex(2)
        approval_id, thread_id = f"AP-{token}", f"TH-{token}"
        title = f"Retire {product.name}"
        item = WorkItem(
            id=f"WI-{token}",
            title=title,
            risk="R1",
            status=StatusLabel(status="attention", label=work.phase_label(0, "Needs you at G1")),
            stages=work.stage_rail(0),
            progress=0.0,
            employee_name="Foreman",
            department="governance",
            employee_state="waiting",
            now="Foreman needs your yes to retire it",
            eta="Waits for your approval",
            cost_usd=0.0,
            waiting_on_owner=True,
            product_id=product.id,
            thread_id=thread_id,
            kind="retirement",
        )
        self._world.approvals[approval_id] = Approval(
            id=approval_id,
            title=title,
            employee_name="Foreman",
            department="governance",
            domain="Development",
            data_class="internal",
            approval_class="P",
            principal="Owner",
            pipeline="Development",
            summary=RETIREMENT_SUMMARY,
            needs_step_up=False,
            state="pending",
        )
        name, department, pipeline = LEADS["foreman"]
        self._world.threads[thread_id] = ThreadRecord(
            id=thread_id,
            title=title,
            kind="work_item",
            unit_id=item.id,
            lead_id="foreman",
            lead_name=name,
            lead_department=department,
            pipeline=pipeline,
            principal="owner",
            since="today",
            approval_id=approval_id,
        )
        self._world.work_items.append(item)
        product.state = "retiring"
        self._world.bus.changed(*THREAD_PAGES, "approvals")
        return item

    # Threads and roles ---------------------------------------------------------------------

    def move_thread(self, thread_id: str, lead_id: str) -> Thread:
        """Move a misrouted thread to another lead (spec 15.8.5). Moving it back is the Undo.

        Args:
            thread_id: The thread.
            lead_id: The lead to move it to, by its id in Chat.

        Returns:
            The thread, with its new lead.

        Raises:
            NotFoundError: No such thread or lead.
            ConflictError: It is resolved, or it is already with that lead.
        """  # noqa: DOC503 NotFoundError is raised by self._thread_record()
        record = self._thread_record(thread_id)
        if lead_id not in LEADS:
            raise NotFoundError("There's no lead by that name.")
        if record.outcome is not None:
            raise ConflictError("This thread is resolved. Reopen it first.")
        name, department, pipeline = LEADS[lead_id]
        if record.lead_id == lead_id:
            raise ConflictError(f"This thread is already with {name}.")
        record.lead_id, record.lead_name = lead_id, name
        record.lead_department, record.pipeline = department, pipeline
        self._world.bus.changed(*THREAD_PAGES)
        return self._shown(record, self.live_tasks())

    def suggest_role(self, suggestion: RoleSuggestion) -> LifecycleProposal:
        """Suggest a new role. It becomes an open lifecycle proposal for Cadence (spec 7.2, 14.7).

        Args:
            suggestion: The role's title and why it is needed.

        Returns:
            The proposal.

        Raises:
            ConflictError: It has no title.
        """
        title = suggestion.title.strip()
        if not title:
            raise ConflictError("Name the role first.")
        reason = suggestion.reason.strip()
        proposal = LifecycleProposal(
            id=f"LP-{secrets.token_hex(2)}",
            text=f"New role: {title}." + (f" {reason}" if reason else ""),
            source=ROLE_SOURCE,
            state="open",
        )
        self._world.proposals[proposal.id] = proposal
        self._world.bus.changed("directory")
        return proposal
