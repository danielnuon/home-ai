"""The mock engine's personal records, finance and Setup interview (spec 7.2, 20.3 to 20.13, 24.5).

Personal: cases (add, reassign, note), obligations and their calendar, each domain's records and
documents, rules, the brief archive, connector sync status and the onboarding checklist. Finance:
every figure computed from its source rows, category fixes that add a rule, statement uploads,
account mapping and requests for an import check or the monthly close. Setup: Atlas's profile
interview inside its step card. Deleted records, documents and rules go to the shared 30-day trash
(`engine_shell.send_to_trash`) with restorers registered here.
"""

import secrets
from datetime import UTC, date, datetime, time
from typing import Any

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.engine_shell import RESTORERS, send_to_trash
from control_center.backends.mock.fixtures import personal, records, work
from control_center.backends.mock.world import MockWorld
from control_center.contract.common import Metric, Principal, StatusLabel
from control_center.contract.personal import (
    BudgetLine,
    Case,
    DomainDetail,
    FinanceOverview,
    PersonalOverview,
    SetupStep,
    StatementImport,
)
from control_center.contract.records import (
    AccountMapping,
    CaseCreate,
    CaseNote,
    CashFlowMonth,
    CategoryFixed,
    ChecklistItem,
    DocumentUpload,
    DomainRecord,
    FigureSources,
    FinanceRequest,
    Interview,
    InterviewTurn,
    Obligation,
    ObligationCreate,
    RecordCreate,
    RecordEdit,
    Rule,
    RuleEdit,
    SourceRow,
    StatementUpload,
    WorkRequested,
)
from control_center.contract.shell import TrashItem
from control_center.contract.work import WorkItem


def _put_record(world: MockWorld, payload: Any) -> None:
    if payload is not None:
        world.records[payload.id] = payload


def _put_rule(world: MockWorld, payload: Any) -> None:
    if payload is not None:
        world.rules[payload.id] = payload


RESTORERS["record"] = _put_record
RESTORERS["document"] = _put_record
RESTORERS["rule"] = _put_rule


def days_until(due: datetime, now: datetime) -> int:
    """Whole calendar days from `now` to `due`, in UTC; 0 is today."""
    return (due.astimezone(UTC).date() - now.astimezone(UTC).date()).days


def due_label(due: date, today: date) -> str:
    """The due date as a case shows it: "today", otherwise "Dec 3"."""
    return "today" if due == today else f"{records.MONTHS[due.month - 1]} {due.day}"


def size_label(size_bytes: int) -> str:
    """A file size as the record shows it, rounded up: "412 KB" or "1.1 MB"."""
    mega = 1024 * 1024
    if size_bytes < mega:
        return f"{max(1, (size_bytes + 1023) // 1024)} KB"
    tenths = (size_bytes * 10 + mega - 1) // mega
    return f"{tenths // 10}.{tenths % 10} MB"


def _required(text: str, refusal: str) -> str:
    """`text` stripped, or a conflict with `refusal` when there is nothing left."""
    if not text.strip():
        raise ConflictError(refusal)
    return text.strip()


class RecordsDesk:
    """Personal records, finance and the Setup interview: part of `MockPipelineEngine`."""

    _world: MockWorld

    # Personal overview ------------------------------------------------------------------------

    def personal(self) -> PersonalOverview:
        """Everything on the Personal page. Obligations are counted against the clock each read.

        Returns:
            Open and snoozed cases, obligations soonest first, domains, rules, briefs, sync
            status, the onboarding checklist and recent automatic changes.
        """
        now = self._world.clock()
        for item in self._world.obligations.values():
            item.days = days_until(item.next_due, now) if item.next_due else None
        dated = sorted(
            (o for o in self._world.obligations.values() if o.next_due),
            key=lambda o: o.next_due or now,
        )
        by_usage = [o for o in self._world.obligations.values() if not o.next_due]
        return PersonalOverview(
            cases=[case for case in self._world.cases.values() if case.state != "done"],
            obligations=[*dated, *by_usage],
            domains=personal.domains(),
            rules=list(self._world.rules.values()),
            briefs=records.briefs(),
            sync=records.sync_status(),
            checklist=list(self._world.checklist.values()),
            recent_changes=list(self._world.changes.values()),
            assignees=records.ASSIGNEES,
        )

    # Cases ------------------------------------------------------------------------------------

    def _case(self, case_id: str) -> Case:
        case = self._world.cases.get(case_id)
        if case is None:
            raise NotFoundError("That case no longer exists.")
        return case

    @staticmethod
    def _domain_name(name: str) -> str:
        if name not in records.DOMAIN_IDS:
            raise ConflictError("Pick one of the domains.")
        return name

    @staticmethod
    def _assignee(name: str) -> str:
        if name not in records.ASSIGNEES:
            raise ConflictError("Pick someone from the list.")
        return name

    def create_case(self, body: CaseCreate) -> Case:
        """Add a case the Owner asked for (spec 20.3).

        Args:
            body: Its title, domain, principal, due date and assignee.

        Returns:
            The new case, open.
        """  # noqa: DOC503 ConflictError is raised by _required, _domain_name and _assignee
        title = _required(body.title, "Give the case a title first.")
        today = self._world.clock().astimezone(UTC).date()
        case = Case(
            id=f"CS-{secrets.token_hex(2)}",
            title=title,
            domain=self._domain_name(body.domain),
            principal=body.principal,
            employee_name=self._assignee(body.employee_name),
            due=due_label(body.due, today),
            status=(
                StatusLabel(status="attention", label="Due today")
                if body.due <= today
                else StatusLabel(status="in_progress", label="Open")
            ),
            state="open",
        )
        self._world.cases = {case.id: case, **self._world.cases}
        self._world.bus.changed("personal", "today")
        return case

    def reassign_case(self, case_id: str, employee_name: str) -> Case:
        """Hand a case to the Owner or another employee.

        Args:
            case_id: The case.
            employee_name: "You" or an employee's name.

        Returns:
            The case with its new assignee.
        """  # noqa: DOC503 NotFoundError and ConflictError are raised by _case and _assignee
        case = self._case(case_id)
        case.employee_name = self._assignee(employee_name)
        self._world.bus.changed("personal")
        return case

    def add_case_note(self, case_id: str, text: str) -> Case:
        """Add the Owner's note to a case.

        Args:
            case_id: The case.
            text: The note.

        Returns:
            The case with the note last.
        """  # noqa: DOC503 NotFoundError and ConflictError are raised by _case and _required
        case = self._case(case_id)
        note = CaseNote(
            id=f"CN-{secrets.token_hex(2)}",
            text=_required(text, "Type the note first."),
            at=self._world.clock(),
        )
        case.notes.append(note)
        self._world.bus.changed("personal")
        return case

    # Obligations and the checklist ------------------------------------------------------------

    def create_obligation(self, body: ObligationCreate) -> Obligation:
        """Add a date obligation; it creates a case `lead_days` before it is due (spec 20.3).

        Args:
            body: Its title, domain, principal, first due date, repeat and lead time.

        Returns:
            The new obligation.
        """  # noqa: DOC503 ConflictError is raised by _required and _domain_name
        due = datetime.combine(body.due, time(12, 0), tzinfo=UTC)
        item = Obligation(
            id=f"OB-{secrets.token_hex(2)}",
            title=_required(body.title, "Give the obligation a title first."),
            domain=self._domain_name(body.domain),
            principal=body.principal,
            kind="date",
            rule=records.REPEAT_WORDS[body.repeat],
            lead_days=body.lead_days,
            next_due=due,
            days=days_until(due, self._world.clock()),
        )
        self._world.obligations[item.id] = item
        self._world.bus.changed("personal")
        return item

    def set_checklist(self, item_id: str, done: bool) -> ChecklistItem:
        """Tick or untick an onboarding checklist step.

        Args:
            item_id: The step.
            done: Whether it is done.

        Returns:
            The step.

        Raises:
            NotFoundError: No such step.
        """
        item = self._world.checklist.get(item_id)
        if item is None:
            raise NotFoundError("That checklist step doesn't exist.")
        item.done = done
        self._world.bus.changed("personal")
        return item

    # Domains, records and documents -----------------------------------------------------------

    def domain_detail(self, domain_id: str) -> DomainDetail:
        """One domain's records and documents.

        Args:
            domain_id: The domain's id, such as "home-auto".

        Returns:
            The domain and its records, newest first.

        Raises:
            NotFoundError: No such domain.
        """
        domain = next((d for d in personal.domains() if d.id == domain_id), None)
        if domain is None:
            raise NotFoundError("That domain doesn't exist.")
        rows = [r for r in self._world.records.values() if r.domain_id == domain_id]
        return DomainDetail(domain=domain, records=rows)

    def _file(self, record: DomainRecord) -> DomainRecord:
        self._world.records = {record.id: record, **self._world.records}
        self._world.bus.changed("personal")
        return record

    def add_record(self, domain_id: str, body: RecordCreate) -> DomainRecord:
        """Add a register entry to a domain.

        Args:
            domain_id: The domain.
            body: Its principal, title and details.

        Returns:
            The new record.
        """  # noqa: DOC503 NotFoundError and ConflictError are raised by domain_detail, _required
        self.domain_detail(domain_id)

        record = DomainRecord(
            id=f"RC-{secrets.token_hex(2)}",
            domain_id=domain_id,
            principal=body.principal,
            kind="record",
            title=_required(body.title, "Give the record a name first."),
            meta=body.meta.strip() or "Added just now",
        )
        return self._file(record)

    def upload_document(self, domain_id: str, body: DocumentUpload) -> DomainRecord:
        """File an uploaded document into a domain. The mock keeps its name and size only.

        Args:
            domain_id: The domain.
            body: Whose it is, the file name and size.

        Returns:
            The new document record.

        Raises:
            ConflictError: The file is too large.
        """  # noqa: DOC503 NotFoundError is raised by domain_detail
        self.domain_detail(domain_id)
        if body.size_bytes > records.MAX_UPLOAD_BYTES:
            raise ConflictError("That file is over 25 MB. Drop it in the inbox folder instead.")

        record = DomainRecord(
            id=f"RC-{secrets.token_hex(2)}",
            domain_id=domain_id,
            principal=body.principal,
            kind="document",
            title=_required(body.filename, "Choose a file first."),
            meta=f"Filed just now · {size_label(body.size_bytes)}",
        )
        return self._file(record)

    def _record(self, record_id: str) -> DomainRecord:
        record = self._world.records.get(record_id)
        if record is None:
            raise NotFoundError("That record no longer exists.")
        return record

    def edit_record(self, record_id: str, body: RecordEdit) -> DomainRecord:
        """Rename a record or document, or change its details.

        Args:
            record_id: The record.
            body: The new name and details.

        Returns:
            The record.
        """  # noqa: DOC503 NotFoundError and ConflictError are raised by _record and _required
        record = self._record(record_id)
        record.title = _required(body.title, "A record needs a name.")
        record.meta = body.meta.strip()
        self._world.bus.changed("personal")
        return record

    def delete_record(self, record_id: str) -> TrashItem:
        """Move a record or document to the 30-day trash (spec 7.16, rule 11).

        Args:
            record_id: The record.

        Returns:
            Its trash row, so the toast's Undo can restore it.
        """  # noqa: DOC503 NotFoundError is raised by _record
        record = self._record(record_id)
        del self._world.records[record_id]
        domain = next(d.name for d in personal.domains() if d.id == record.domain_id)
        self._world.bus.changed("personal")
        return send_to_trash(
            self._world,
            kind=record.kind,
            title=record.title,
            meta=f"{domain} · {records.PRINCIPAL_NAMES[record.principal]}",
            home="/personal",
            payload=record,
        )

    # Rules ------------------------------------------------------------------------------------

    def _rule(self, rule_id: str) -> Rule:
        rule = self._world.rules.get(rule_id)
        if rule is None:
            raise NotFoundError("That rule no longer exists.")
        return rule

    def edit_rule(self, rule_id: str, body: RuleEdit) -> Rule:
        """Change what a rule matches or what it does.

        Args:
            rule_id: The rule.
            body: Its new condition and result.

        Returns:
            The rule.
        """  # noqa: DOC503 NotFoundError and ConflictError are raised by _rule and _required
        rule = self._rule(rule_id)
        rule.when = _required(body.when, "Say when the rule applies.")
        rule.then = _required(body.then, "Say what the rule does.")
        rule.source = "Edited by you · just now"
        self._world.bus.changed("personal")
        return rule

    def delete_rule(self, rule_id: str) -> TrashItem:
        """Move a rule to the 30-day trash. The model decides that case itself from now on.

        Args:
            rule_id: The rule.

        Returns:
            Its trash row.
        """  # noqa: DOC503 NotFoundError is raised by _rule
        rule = self._rule(rule_id)
        del self._world.rules[rule_id]
        self._world.bus.changed("personal")
        return send_to_trash(
            self._world,
            kind="rule",
            title=f"{rule.when} → {rule.then}",
            meta=f"{rule.kind.capitalize()} rule",
            home="/personal",
            payload=rule,
        )

    # Finance ----------------------------------------------------------------------------------

    def finance(self, principal: Principal) -> FinanceOverview:
        """One principal's month, computed from its rows. No figure is typed in (spec 20.9).

        Args:
            principal: Whose finances.

        Returns:
            Budget against actual, net worth, cash flow, bills, imports and unmapped accounts.
        """
        rows = self._world.transactions[principal]
        spent = {
            name: sum(r.amount for r in rows if r.category == name) for name in records.CATEGORIES
        }
        money_in = sum(r.amount for r in rows if r.category == records.INCOME)
        october = CashFlowMonth(
            id="cash-oct", month="Oct", money_in=money_in, money_out=sum(spent.values())
        )
        history = [
            CashFlowMonth(
                id=f"cash-{key}",
                month=month,
                money_in=records.scaled(principal, i),
                money_out=records.scaled(principal, o),
            )
            for key, month, i, o in records.CASH_FLOW_HISTORY
        ]
        worth = sum(r.amount for r in records.balances(principal))
        return FinanceOverview(
            principal=principal,
            month="October",
            days_elapsed="25 of 31 days",
            budget=[
                BudgetLine(
                    id=f"budget-{name.lower()}",
                    name=name,
                    spent=spent[name],
                    budget=records.scaled(principal, records.BUDGETS[name]),
                )
                for name in records.CATEGORIES
            ],
            net_worth=Metric(name="Net worth", value=f"${worth:,}", spark=records.NET_WORTH_SPARK),
            cash_flow=[*history, october],
            bills=records.bills(principal),
            imports=list(self._world.imports[principal].values()),
            unmapped=list(self._world.unmapped.values()),
            inbox=records.INBOX_FOLDERS[principal],
        )

    def figure_sources(self, principal: Principal, figure_id: str) -> FigureSources:
        """The rows behind one figure and how it is computed from them (spec 7.2, Finance).

        Args:
            principal: Whose finances.
            figure_id: A budget line's id, "net-worth", or a cash-flow month's id.

        Returns:
            The figure's title, formula, total and rows.

        Raises:
            NotFoundError: No figure has that id.
        """
        txs = self._world.transactions[principal]
        found = self._sources(principal, figure_id, txs)
        if found is None:
            raise NotFoundError("That figure has no sources here.")
        title, formula, rows = found
        return FigureSources(
            figure_id=figure_id,
            title=title,
            formula=formula,
            total=sum(r.amount for r in rows),
            rows=rows,
            categories=[*records.CATEGORIES, records.INCOME],
        )

    @staticmethod
    def _sources(
        principal: Principal, figure_id: str, txs: list[SourceRow]
    ) -> tuple[str, str, list[SourceRow]] | None:
        names = {f"budget-{n.lower()}": n for n in records.CATEGORIES}
        if figure_id in names:
            name = names[figure_id]
            rows = [r for r in txs if r.category == name]
            return (
                f"{name} · October",
                f"Sum of the {len(rows)} transactions filed under {name}",
                rows,
            )
        if figure_id == "net-worth":
            return (
                "Net worth · Oct 25",
                "Sum of every account's balance",
                records.balances(principal),
            )
        if figure_id == "cash-oct":
            signed = [
                r if r.category == records.INCOME else r.model_copy(update={"amount": -r.amount})
                for r in txs
            ]
            return (
                "Cash flow · October",
                "Money in minus money out, from October's transactions",
                signed,
            )
        keys = {f"cash-{k}": (k, m) for k, m, _i, _o in records.CASH_FLOW_HISTORY}
        if figure_id in keys:
            key, month = keys[figure_id]
            return (
                f"Cash flow · {month}",
                f"Money in minus money out, from {month}'s statement totals",
                records.history_rows(principal, key),
            )
        return None

    def fix_category(
        self, principal: Principal, transaction_id: str, category: str
    ) -> CategoryFixed:
        """Move a transaction to another category and add a rule for its payee (spec 20.12).

        Args:
            principal: Whose transaction.
            transaction_id: The transaction.
            category: Its right category.

        Returns:
            The new rule and what the toast says.

        Raises:
            NotFoundError: No such transaction.
            ConflictError: The category is unknown, or already the transaction's.
        """
        row = next((r for r in self._world.transactions[principal] if r.id == transaction_id), None)
        if row is None:
            raise NotFoundError("That transaction isn't in this month.")
        if category not in [*records.CATEGORIES, records.INCOME]:
            raise ConflictError("Pick one of the categories.")
        if row.category == category:
            raise ConflictError(f"It's already filed under {category}.")
        row.category = category
        rule = Rule(
            id=f"RU-{secrets.token_hex(2)}",
            kind="category",
            when=f'Payee is "{row.text}"',
            then=category,
            source="Your correction · just now",
        )
        self._world.rules[rule.id] = rule
        self._world.bus.changed("finance", "personal")
        return CategoryFixed(
            rule=rule, message=f"Moved {row.text} to {category} and added a rule for next time."
        )

    def upload_statement(
        self, principal: Principal, import_id: str, body: StatementUpload
    ) -> StatementImport:
        """Import a statement export for one account (spec 7.2, Finance; 7.16, rule 4).

        Args:
            principal: Whose account.
            import_id: The account's import row.
            body: The file's name and size; the mock reads nothing else.

        Returns:
            The import row, now current.

        Raises:
            NotFoundError: No such account.
            ConflictError: Not a CSV, OFX or QFX file, or too large.
        """
        item = self._world.imports[principal].get(import_id)
        if item is None:
            raise NotFoundError("That account isn't on this page.")
        name = body.filename.strip()
        if not name.lower().endswith(records.STATEMENT_TYPES):
            raise ConflictError("Brain reads CSV, OFX or QFX exports. Export one from your bank.")
        if body.size_bytes > records.MAX_UPLOAD_BYTES:
            raise ConflictError("That file is over 25 MB. Drop it in the inbox folder instead.")
        item.status = StatusLabel(status="healthy", label="Current")
        item.meta = f"Imported {name} just now · Tally is checking it"
        self._world.bus.changed("finance", "personal")
        return item

    def map_account(self, account_id: str, body: AccountMapping) -> StatementImport:
        """Give a found account to a principal, and record the routing rule (spec 20.4).

        Args:
            account_id: The unmapped account.
            body: Its principal.

        Returns:
            The account's new import row on that principal's page.

        Raises:
            NotFoundError: No such unmapped account.
        """
        account = self._world.unmapped.pop(account_id, None)
        if account is None:
            raise NotFoundError("That account is already mapped.")
        item = StatementImport(
            id=f"IM-{account.id.lower()}",
            account=account.name,
            meta="Mapped just now · waiting for its first statement",
            status=StatusLabel(status="in_progress", label="Waiting"),
        )
        self._world.imports[body.principal][item.id] = item
        rule = Rule(
            id=f"RU-{secrets.token_hex(2)}",
            kind="routing",
            when=f"Statements for {account.name}",
            then=f"Principal {records.PRINCIPAL_NAMES[body.principal]}",
            source="Mapped in Finance · just now",
        )
        self._world.rules[rule.id] = rule
        self._world.bus.changed("finance", "personal")
        return item

    def finance_request(self, principal: Principal, body: FinanceRequest) -> WorkRequested:
        """Ask for an import check or the monthly close; it becomes a work item (spec 20.9).

        Args:
            principal: Whose finances.
            body: Which request.

        Returns:
            The work item's id and what the toast says.
        """
        title, employee, now = records.REQUEST_WORDS[body.kind]
        item = WorkItem(
            id=f"WI-{secrets.token_hex(2)}",
            title=title.format(who=records.PRINCIPAL_NAMES[principal]),
            risk="R0",
            status=StatusLabel(status="in_progress", label=work.phase_label(0, "D0 intake")),
            stages=work.stage_rail(0),
            progress=0.0,
            employee_name=employee,
            department="personal",
            employee_state="thinking",
            now=now,
            eta="Within the hour",
            cost_usd=0.0,
            waiting_on_owner=False,
        )
        self._world.work_items.append(item)
        self._world.bus.changed("work", "today")
        return WorkRequested(work_item_id=item.id, message=f"Requested. {item.id} is on Work.")

    # Setup interview --------------------------------------------------------------------------

    def _interview(self, step_id: str) -> tuple[SetupStep, Interview]:
        step = self._world.setup.get(step_id)
        if step is None or step.interview is None:
            raise NotFoundError("That step has no interview.")
        if step.state == "waiting":
            raise ConflictError(f"This step is waiting: {step.waiting_on}.")
        return step, step.interview

    def interview_answer(self, step_id: str, text: str) -> SetupStep:
        """Answer Atlas's current question; Atlas asks the next, or proposes what to save.

        Args:
            step_id: The step with the interview.
            text: The Owner's answer.

        Returns:
            The step, with the interview moved on.

        Raises:
            ConflictError: The answer is empty, or every question is answered.
        """  # noqa: DOC503 NotFoundError is also raised by _interview
        step, interview = self._interview(step_id)
        answer = _required(text, "Type an answer first.")
        if interview.asked >= interview.total:
            raise ConflictError("Every question is answered. Confirm, or start over.")
        interview.turns.append(InterviewTurn(speaker="owner", text=answer))
        interview.asked += 1
        if interview.asked < interview.total:
            question = records.INTERVIEW_QUESTIONS[interview.asked][1]
            interview.turns.append(InterviewTurn(speaker="atlas", text=question))
        else:
            answers = [t.text for t in interview.turns if t.speaker == "owner"]
            interview.facts = [
                f"{label}: {said}"
                for (label, _q), said in zip(records.INTERVIEW_QUESTIONS, answers, strict=True)
            ]
            interview.turns.append(InterviewTurn(speaker="atlas", text=records.INTERVIEW_DONE))
        self._world.bus.changed("setup")
        return step

    def interview_confirm(self, step_id: str) -> SetupStep:
        """Save the facts Atlas proposed; the step is then done, with that as its proof.

        Args:
            step_id: The step with the interview.

        Returns:
            The step, done.

        Raises:
            ConflictError: Some questions are still unanswered.
        """  # noqa: DOC503 NotFoundError is also raised by _interview
        step, interview = self._interview(step_id)
        if interview.asked < interview.total:
            raise ConflictError("Answer every question first.")
        step.state = "done"
        step.proof = f"{len(interview.facts)} facts saved to your profile · Atlas uses them now"
        self._world.bus.changed("setup", "today", "platform")
        return step

    def interview_restart(self, step_id: str) -> SetupStep:
        """Start the interview over from the first question.

        Args:
            step_id: The step with the interview.

        Returns:
            The step, with a fresh interview.
        """  # noqa: DOC503 NotFoundError and ConflictError are raised by _interview
        step, _interview = self._interview(step_id)
        step.interview = records.interview()
        if step.state == "done":
            step.state, step.proof = "ready", None
        self._world.bus.changed("setup", "today", "platform")
        return step
