"""The four services Brain depends on, as typed interfaces.

Each protocol mirrors one real interface in spec 6.2:

- `ApprovalGate`: the gate on 127.0.0.1:8404. Approvals, critical decisions, settings, the kill
  switch, the contact allowlist, service restarts and passkey step-up.
- `PipelineEngine`: the engine on 127.0.0.1:8407. Owner commands and the read endpoints for tasks,
  work, the directory, personal records, Setup, the schedule and maintenance.
- `StatusAggregator`: Brain's own aggregator of every service's `GET /health` and `GET /metrics`,
  the watchdog's status file and the audit query socket (spec 7.3).
- `LeadChat`: the pipeline engine's chat endpoints on 127.0.0.1:8407, which run each turn in the
  thread's lead session (spec 6.2, 15.8.8, decision 103).

Only mocks implement them today (`control_center.backends.mock`). They exist as protocols rather
than as the mocks' concrete types because each one gets a second, real implementation in the build
phase that delivers its service (spec 24.1), and the routes must not change when it does.

Arguments named `step_up` carry a proof from `ApprovalGate.verify_step_up`, or None. The gate, not
Brain, decides whether an action needs one, and raises `StepUpRequiredError` when it is missing.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from control_center.contract.common import Metric, Principal
from control_center.contract.gate import (
    Approval,
    ApprovalDecision,
    BatchToggle,
    CriticalDecision,
    DraftEdit,
    PlatformState,
    Setting,
    SettingsIndex,
    StepUpProof,
)
from control_center.contract.memory import MemoryKind, MemoryOverview
from control_center.contract.people import (
    Contact,
    ContactDetail,
    ContactDraft,
    ContactMerge,
    ContactRemoved,
    ContactsOverview,
    HouseholdMember,
    PrincipalDraft,
    PrincipalMapping,
    PrincipalRemove,
    TrustChange,
)
from control_center.contract.personal import (
    Case,
    CaseAction,
    DomainDetail,
    FinanceOverview,
    PersonalOverview,
    SetupAction,
    SetupStep,
    StatementImport,
)
from control_center.contract.records import (
    AccountMapping,
    CaseCreate,
    CategoryFixed,
    ChecklistItem,
    DocumentUpload,
    DomainRecord,
    FigureSources,
    FinanceRequest,
    Obligation,
    ObligationCreate,
    RecordCreate,
    RecordEdit,
    Rule,
    RuleEdit,
    StatementUpload,
    WorkRequested,
)
from control_center.contract.shell import (
    ArkDriveStarted,
    DocChangeRequested,
    DocPage,
    GuideAnswer,
    GuideQuestion,
    LibraryAnswer,
    LibraryOverview,
    LibrarySearchResults,
    OfflinePack,
    TrashItem,
    TrashOverview,
)
from control_center.contract.status import (
    BackupsOverview,
    ConnectionsOverview,
    DocsOverview,
    Finding,
    MaintenanceOverview,
    MetricCatalog,
    ModelsOverview,
    PoolMode,
    PruneDone,
    ScheduleOverview,
    SecurityOverview,
    ServiceLog,
    ServicesOverview,
    SpendOverview,
    SystemOverview,
    VoiceOverview,
)
from control_center.contract.today import (
    AgendaItem,
    Alert,
    AlertAction,
    ChatThread,
    SearchResults,
    Tile,
)
from control_center.contract.work import (
    Directory,
    Intervention,
    LiveTask,
    ProposalDecision,
    TaskDetail,
    Thread,
    ThreadsOverview,
    WorkBoard,
)
from control_center.events import EventBus


class ApprovalGate(Protocol):
    """The single authority for every approval, control and setting (spec C8)."""

    def platform_state(self) -> PlatformState:
        """Global states (stop-all, away, quiet hours, degraded modes) and navigation badges."""
        ...

    def list_approvals(self) -> list[Approval]:
        """Every approval card, pending ones first."""
        ...

    def decide(self, approval_id: str, decision: ApprovalDecision, step_up: str | None) -> Approval:
        """Approve or deny a card; may raise step-up, conflict or not-found errors."""
        ...

    def undo_decision(self, approval_id: str) -> Approval:
        """Take back a decision while the gate is still holding its action."""
        ...

    def list_decisions(self) -> list[CriticalDecision]:
        """Every critical decision record, open ones first."""
        ...

    def acknowledge(self, decision_id: str) -> CriticalDecision:
        """Acknowledge a critical decision. It takes effect as its record says."""
        ...

    def veto(self, decision_id: str, reason: str | None) -> CriticalDecision:
        """Veto a critical decision: cancel it if it is waiting, revert it if it is in effect."""
        ...

    def reopen(self, decision_id: str) -> CriticalDecision:
        """Undo an acknowledgement or a veto while the decision's veto window is still open."""
        ...

    def settings(self) -> SettingsIndex:
        """Every setting with its history, and the hard limits."""
        ...

    def change_setting(self, key: str, value: str, step_up: str | None) -> Setting:
        """Change a setting. Loosening needs a step-up; values past a hard limit are refused."""
        ...

    def revert_setting(self, key: str, step_up: str | None) -> Setting:
        """Return a setting to its previous value, with the same step-up rule as a change."""
        ...

    def stop_all(self) -> PlatformState:
        """Kill switch: stop every agent, pipeline and outbound message. Never needs a step-up."""
        ...

    def resume_all(self, step_up: str | None) -> PlatformState:
        """Resume after a stop. Always needs a step-up."""
        ...

    def contacts(self) -> ContactsOverview:
        """Household principals and outside contacts with their trust levels."""
        ...

    def contact_detail(self, contact_id: str) -> ContactDetail:
        """One contact with its history and the drafts and rules that mention it."""
        ...

    def add_contact(self, draft: ContactDraft, step_up: str | None) -> Contact:
        """Add a contact. Adding one already allowlisted needs a step-up."""
        ...

    def edit_contact(self, contact_id: str, draft: ContactDraft, step_up: str | None) -> Contact:
        """Change a contact's details. Giving it more trust needs a step-up."""
        ...

    def set_trust(self, contact_id: str, change: TrustChange, step_up: str | None) -> Contact:
        """Change a contact's trust. Allowlisting needs a step-up; removing does not."""
        ...

    def merge_contact(self, contact_id: str, merge: ContactMerge) -> Contact:
        """Fold a contact into another, which keeps its trust. The merged one goes to the trash."""
        ...

    def remove_contact(self, contact_id: str) -> ContactRemoved:
        """Send a contact to the 30-day trash."""
        ...

    def add_principal(self, draft: PrincipalDraft, step_up: str | None) -> HouseholdMember:
        """Add a household principal. Always needs a step-up."""
        ...

    def map_principal(
        self, principal_id: str, mapping: PrincipalMapping, step_up: str | None
    ) -> HouseholdMember:
        """Map accounts and calendars to a principal. Mapping anything new needs a step-up."""
        ...

    def remove_principal(
        self, principal_id: str, remove: PrincipalRemove, step_up: str | None
    ) -> HouseholdMember:
        """Start removing a principal, with seven days of undo. Needs a step-up."""
        ...

    def undo_remove_principal(self, principal_id: str) -> HouseholdMember:
        """Keep a principal whose removal hasn't become permanent."""
        ...

    def edit_draft(self, approval_id: str, edit: DraftEdit) -> Approval:
        """Replace a pending card's draft with the Owner's wording."""
        ...

    def toggle_batch_message(
        self, approval_id: str, message_id: str, toggle: BatchToggle
    ) -> Approval:
        """Tick or untick one message of a pending batch card."""
        ...

    def allow_recipient(self, approval_id: str, step_up: str | None) -> Approval:
        """Allowlist a card's recipient from the card itself. Needs a step-up."""
        ...

    def set_employee_enabled(self, employee_id: str, enabled: bool, step_up: str | None) -> None:
        """Enable (loosening, step-up) or disable (tightening) an employee."""
        ...

    def decide_proposal(self, proposal_id: str, decision: ProposalDecision) -> None:
        """Approve or decline one of Cadence's lifecycle proposals."""
        ...

    def restart_service(self, service_id: str, step_up: str | None) -> None:
        """Ask the watchdog, through a signed control record, to restart a service."""
        ...

    def request_restore(self, what: str, point: str, step_up: str | None) -> str:
        """Restore a file, folder or record into a side folder. Returns where it will appear."""
        ...

    def run_prune(self, plan_id: str, step_up: str | None) -> PruneDone:
        """Run the prune plan the Owner has seen, behind a step-up (spec 13.7)."""
        ...

    def alerts(self) -> list[Alert]:
        """Open alerts for Today; a snoozed one returns when its snooze ends."""
        ...

    def alert_action(self, alert_id: str, action: AlertAction) -> Alert:
        """Acknowledge or snooze an alert, or reopen it (the undo of either)."""
        ...

    def write_ark_drive(self, volume: str, step_up: str | None) -> ArkDriveStarted:
        """Write an Ark drive to an external volume (spec 12.8). Always needs a step-up."""
        ...

    def save_setup_secret(
        self, step_id: str, field_id: str, value: str, step_up: str | None
    ) -> SetupStep:
        """Save a Setup step's secret to the Keychain (spec 24.5). Always needs a step-up."""
        ...

    def create_step_up_challenge(self) -> str:
        """Start a passkey step-up and return the challenge the authenticator signs."""
        ...

    def verify_step_up(self, challenge: str, assertion: str) -> StepUpProof:
        """Check a passkey assertion and return a short-lived proof for gated actions."""
        ...


class PipelineEngine(Protocol):
    """Owner commands and the engine's read endpoints (spec C3, C4)."""

    def live_tasks(self) -> list[LiveTask]:
        """Every open session with its state (spec 15.8.2), running ones first."""
        ...

    def threads(self) -> ThreadsOverview:
        """Open threads in the state order of spec 15.8.3, then the recently resolved."""
        ...

    def resolve_thread(self, thread_id: str) -> Thread:
        """Resolve a thread and end its sessions. Refused while it waits on the Owner."""
        ...

    def reopen_thread(self, thread_id: str) -> Thread:
        """Reopen a resolved thread; the undo of resolving."""
        ...

    def task_detail(self, task_id: str) -> TaskDetail:
        """One task with its stage rail and transcript so far."""
        ...

    def intervene(self, task_id: str, intervention: Intervention) -> TaskDetail:
        """Note, pause, resume, redirect or stop a task (spec 7.10)."""
        ...

    def work_board(self) -> WorkBoard:
        """Threads, work items, ideas and review requests."""
        ...

    def directory(self) -> Directory:
        """Every employee, with its status rolled up from sessions, and open proposals."""
        ...

    def agenda(self) -> list[AgendaItem]:
        """Today's agenda across every principal."""
        ...

    def personal(self) -> PersonalOverview:
        """Cases due soon, domains and recent automatic changes."""
        ...

    def case_action(self, case_id: str, action: CaseAction) -> Case:
        """Mark a case done, snooze it, or reopen it."""
        ...

    def undo_change(self, change_id: str) -> PersonalOverview:
        """Undo a recent automatic change."""
        ...

    def finance(self, principal: Principal) -> FinanceOverview:
        """Budget, net worth and statement imports for one principal."""
        ...

    def create_case(self, body: CaseCreate) -> Case:
        """Add a case (spec 20.3)."""
        ...

    def reassign_case(self, case_id: str, employee_name: str) -> Case:
        """Hand a case to the Owner or another employee."""
        ...

    def add_case_note(self, case_id: str, text: str) -> Case:
        """Add a note to a case."""
        ...

    def create_obligation(self, body: ObligationCreate) -> Obligation:
        """Add a date obligation."""
        ...

    def set_checklist(self, item_id: str, done: bool) -> ChecklistItem:
        """Tick or untick an onboarding checklist step."""
        ...

    def domain_detail(self, domain_id: str) -> DomainDetail:
        """One domain's records and documents."""
        ...

    def add_record(self, domain_id: str, body: RecordCreate) -> DomainRecord:
        """Add a register entry to a domain."""
        ...

    def upload_document(self, domain_id: str, body: DocumentUpload) -> DomainRecord:
        """File an uploaded document into a domain."""
        ...

    def edit_record(self, record_id: str, body: RecordEdit) -> DomainRecord:
        """Rename a record or change its details."""
        ...

    def delete_record(self, record_id: str) -> TrashItem:
        """Move a record or document to the 30-day trash."""
        ...

    def edit_rule(self, rule_id: str, body: RuleEdit) -> Rule:
        """Change a routing or category rule."""
        ...

    def delete_rule(self, rule_id: str) -> TrashItem:
        """Move a rule to the 30-day trash."""
        ...

    def figure_sources(self, principal: Principal, figure_id: str) -> FigureSources:
        """The rows behind one Finance figure."""
        ...

    def fix_category(
        self, principal: Principal, transaction_id: str, category: str
    ) -> CategoryFixed:
        """Move a transaction to another category, adding a rule."""
        ...

    def upload_statement(
        self, principal: Principal, import_id: str, body: StatementUpload
    ) -> StatementImport:
        """Import a statement export for one account."""
        ...

    def map_account(self, account_id: str, body: AccountMapping) -> StatementImport:
        """Give a found account to a principal."""
        ...

    def finance_request(self, principal: Principal, body: FinanceRequest) -> WorkRequested:
        """Ask for an import check or the monthly close."""
        ...

    def interview_answer(self, step_id: str, text: str) -> SetupStep:
        """Answer Atlas's current profile interview question."""
        ...

    def interview_confirm(self, step_id: str) -> SetupStep:
        """Save the facts the profile interview proposed."""
        ...

    def interview_restart(self, step_id: str) -> SetupStep:
        """Start the profile interview over."""
        ...

    def setup_steps(self) -> list[SetupStep]:
        """Every Owner input from the register as a step card."""
        ...

    def setup_action(self, step_id: str, action: SetupAction) -> SetupStep:
        """Start, defer, resume or redo a Setup step."""
        ...

    def schedule(self) -> ScheduleOverview:
        """Jobs, the maintenance lock and quiet hours."""
        ...

    def set_job_paused(self, job_id: str, paused: bool) -> ScheduleOverview:
        """Pause or resume one job."""
        ...

    def run_job(self, job_id: str) -> ScheduleOverview:
        """Run one job now, if the maintenance lock allows it."""
        ...

    def maintenance(self) -> MaintenanceOverview:
        """Pipeline C's state, last batch and findings."""
        ...

    def set_maintenance_running(self, running: bool) -> MaintenanceOverview:
        """Pause or resume Pipeline C."""
        ...

    def toggle_fix_reverted(self, fix_id: str) -> MaintenanceOverview:
        """Revert a merged maintenance fix, or undo that revert."""
        ...

    def docs(self) -> DocsOverview:
        """Documentation by area with review status."""
        ...

    def set_pool_mode(self, mode: PoolMode) -> None:
        """Put the model pool in another mode (spec 8.3)."""
        ...

    def end_pool_mode(self) -> None:
        """End image or video mode; the pool returns to mode L."""
        ...

    def run_health_check(self) -> None:
        """Check services, the audit chain, drives and the network now."""
        ...

    def pressure_drill(self) -> None:
        """Step memory pressure to its next level, as a resilience drill (spec 7.17)."""
        ...

    def pin_family(self, family: str, pinned: bool) -> None:
        """Pin a family's model through re-selection, or unpin it."""
        ...

    def run_selection(self) -> None:
        """Queue a selector run for the next window (spec 8.6)."""
        ...

    def service_log(self, service_id: str) -> ServiceLog:
        """A service's full masked log, newest first."""
        ...

    def set_job_time(self, job_id: str, time: str) -> ScheduleOverview:
        """Move a job to another start time."""
        ...

    def run_restore_drill(self) -> None:
        """Restore into a scratch folder and verify it (spec 13.5)."""
        ...

    def make_prune_plan(self) -> None:
        """Work out what a prune would remove, removing nothing."""
        ...

    def discard_prune_plan(self) -> None:
        """Put the prune plan away."""
        ...

    def wont_fix(self, finding_id: str, reason: str) -> Finding:
        """Close a maintenance finding as won't-fix, with the reason."""
        ...

    def reopen_finding(self, finding_id: str) -> Finding:
        """Reopen a won't-fix finding."""
        ...

    def metrics(self, page: str) -> MetricCatalog:
        """The metric catalog with 7- and 30-day trends for a page (spec 7.18)."""
        ...

    def search(self, query: str) -> SearchResults:
        """Search cases, documents, contacts, employees and audit events."""
        ...

    def guide_ask(self, question: GuideQuestion) -> GuideAnswer:
        """Wayfinder's read-only answer about the page on screen (spec 14.8)."""
        ...

    def doc_page(self, doc_id: str) -> DocPage:
        """One document, rendered for the Docs reader."""
        ...

    def request_doc_change(self, doc_id: str, text: str) -> DocChangeRequested:
        """Turn a change request on a document into a work item."""
        ...

    def trash(self) -> TrashOverview:
        """Everything deleted in the last 30 days (spec 7.16, rule 11)."""
        ...

    def restore_from_trash(self, item_id: str) -> TrashItem:
        """Put a deleted item back on its home page."""
        ...

    def purge_from_trash(self, item_id: str) -> None:
        """Delete an item for good. It can't be undone."""
        ...

    def offline_pack(self) -> OfflinePack:
        """The offline pack for the phone, while it is on (spec 7.7)."""
        ...

    def library(self) -> LibraryOverview:
        """The offline library's page, while it is on (spec 12.8)."""
        ...

    def library_search(self, query: str) -> LibrarySearchResults:
        """Search the library's quick cards and pages."""
        ...

    def library_ask(self, question: str) -> LibraryAnswer:
        """Ask the librarian, under Ark's safety rules."""
        ...


class StatusAggregator(Protocol):
    """Health, metrics and read-only platform views (spec 7.3)."""

    def sampled_at(self) -> datetime:
        """When health and metrics were last collected. Tiles show this so they can go stale."""
        ...

    def subsystem_tiles(self, spend: SpendOverview) -> list[Tile]:
        """One tile per subsystem for Today (spec 7.2), each stamped with its sample time.

        Takes the Spend page's data, which Today also shows, so it is gathered once.
        """
        ...

    def health_metrics(self) -> list[Metric]:
        """Today's "How it's running" figures (a selection from 7.18), as live samples."""
        ...

    def system(self) -> SystemOverview:
        """Machine, memory zones, pressure and hardware signals."""
        ...

    def services(self) -> ServicesOverview:
        """Every service with its health and masked log lines."""
        ...

    def models(self) -> ModelsOverview:
        """Family assignments, pool mode and the independent-reviewer preview."""
        ...

    def spend(self) -> SpendOverview:
        """The ledger and the optional paid features."""
        ...

    def security(self) -> SecurityOverview:
        """Kill switch, flags, sign-in methods and masked audit lines."""
        ...

    def backups(self) -> BackupsOverview:
        """Backup mode, targets, restore drill and retention."""
        ...

    def connections(self) -> ConnectionsOverview:
        """Accounts, Mac permissions, platform links and paid providers."""
        ...

    def voice(self) -> VoiceOverview:
        """Voice profiles for approval calls."""
        ...


class LeadChat(Protocol):
    """Web chat with the leads, through the pipeline engine's chat endpoints (spec 6.2)."""

    def thread(self, lead_id: str, thread_id: str | None = None) -> ChatThread:
        """The lead, its threads, and the messages of the thread picked (none for a new chat)."""
        ...

    def send(
        self, lead_id: str, text: str, thread_id: str | None = None, temporary: bool = False
    ) -> ChatThread:
        """Send the Owner's message, starting a thread (temporary if asked) if none is given."""
        ...

    def keep(self, lead_id: str, thread_id: str) -> ChatThread:
        """Turn a temporary chat into a normal thread (spec 15.9.6)."""
        ...

    def set_learning(self, lead_id: str, thread_id: str, learning: bool) -> ChatThread:
        """Turn "Don't learn from this chat" off or on."""
        ...

    def edit(self, lead_id: str, thread_id: str, message_id: str, text: str) -> ChatThread:
        """Re-run the turn from an edited Owner message as a new branch (spec 15.9.8)."""
        ...

    def regenerate(self, lead_id: str, thread_id: str, message_id: str) -> ChatThread:
        """Write a lead's reply again as a new branch."""
        ...

    def switch(self, lead_id: str, thread_id: str, message_id: str) -> ChatThread:
        """Show the branch that runs through a message; the next turn continues it."""
        ...

    def branch(self, lead_id: str, thread_id: str, message_id: str) -> ChatThread:
        """Start a new conversation thread from the branch on show, up to a message."""
        ...

    def stop(self, lead_id: str, thread_id: str) -> ChatThread:
        """End the reply being written at once."""
        ...

    def remember(self, lead_id: str, thread_id: str, message_id: str) -> ChatThread:
        """Save one of the Owner's messages to memory: the Remember action (spec 15.9.3)."""
        ...


class ChatMemory(Protocol):
    """The Owner's saved notes and the Memory view (spec 15.9.7)."""

    def overview(self) -> MemoryOverview:
        """Every item, whether memory is paused, and the forgets that can still be undone."""
        ...

    def add(self, text: str, kind: MemoryKind = "avoid") -> MemoryOverview:
        """Add a note in the view, most often "don't bring this up"."""
        ...

    def edit(self, item_id: str, text: str | None, pinned: bool | None) -> MemoryOverview:
        """Change an item's text, or pin or unpin it."""
        ...

    def forget(self, item_id: str) -> MemoryOverview:
        """Forget an item; it can be brought back for ten minutes."""
        ...

    def restore(self, item_id: str) -> MemoryOverview:
        """Undo a forget while it can still be undone."""
        ...

    def confirm(self, item_id: str) -> MemoryOverview:
        """Confirm a proposed item."""
        ...

    def dismiss(self, item_id: str) -> MemoryOverview:
        """Turn down a proposed item."""
        ...

    def set_paused(self, paused: bool) -> MemoryOverview:
        """Pause or resume memory."""
        ...


@dataclass(frozen=True)
class Backends:
    """The services every route can reach, plus the event bus they publish to."""

    gate: ApprovalGate
    engine: PipelineEngine
    status: StatusAggregator
    chat: LeadChat
    memory: ChatMemory
    bus: EventBus
