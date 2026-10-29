"""The four services Brain depends on, as typed interfaces.

Each protocol mirrors one real interface in spec 6.2:

- `ApprovalGate`: the gate on 127.0.0.1:8404. Approvals, critical decisions, settings, the kill
  switch, the contact allowlist, service restarts and passkey step-up.
- `PipelineEngine`: the engine on 127.0.0.1:8407. Owner commands and the read endpoints for tasks,
  work, the directory, personal records, Setup, the schedule and maintenance.
- `StatusAggregator`: Brain's own aggregator of every service's `GET /health` and `GET /metrics`,
  the watchdog's status file and the audit query socket (spec 7.3).
- `ChatRelay`: the relay that alone holds the OpenClaw gateway token and forwards only
  `chat.history` and `chat.send` for the leads' web identities (spec 6.2, decision 80).

Only mocks implement them today (`control_center.backends.mock`). They exist as protocols rather
than as the mocks' concrete types because each one gets a second, real implementation in the build
phase that delivers its service (spec 24.1), and the routes must not change when it does.

Arguments named `step_up` carry a proof from `ApprovalGate.verify_step_up`, or None. The gate, not
Brain, decides whether an action needs one, and raises `StepUpRequiredError` when it is missing.
"""

from datetime import datetime
from typing import Protocol

from control_center.contract.common import Principal
from control_center.contract.gate import (
    Approval,
    ApprovalDecision,
    CriticalDecision,
    PlatformState,
    Setting,
    SettingsIndex,
    StepUpProof,
)
from control_center.contract.personal import (
    Case,
    CaseAction,
    Contact,
    ContactsOverview,
    FinanceOverview,
    PersonalOverview,
    SetupAction,
    SetupStep,
    TrustChange,
)
from control_center.contract.status import (
    BackupsOverview,
    ConnectionsOverview,
    DocsOverview,
    MaintenanceOverview,
    ModelsOverview,
    ScheduleOverview,
    SecurityOverview,
    ServicesOverview,
    SpendOverview,
    SystemOverview,
    VoiceOverview,
)
from control_center.contract.today import AgendaItem, ChatThread, SearchResults
from control_center.contract.work import (
    Directory,
    Intervention,
    LiveTask,
    ProposalDecision,
    TaskDetail,
    WorkBoard,
)


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

    def set_trust(self, contact_id: str, change: TrustChange, step_up: str | None) -> Contact:
        """Change a contact's trust. Allowlisting needs a step-up; removing does not."""
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

    def create_step_up_challenge(self) -> str:
        """Start a passkey step-up and return the challenge the authenticator signs."""
        ...

    def verify_step_up(self, challenge: str, assertion: str) -> StepUpProof:
        """Check a passkey assertion and return a short-lived proof for gated actions."""
        ...


class PipelineEngine(Protocol):
    """Owner commands and the engine's read endpoints (spec C3, C4)."""

    def live_tasks(self) -> list[LiveTask]:
        """Running tasks first, then queued ones."""
        ...

    def task_detail(self, task_id: str) -> TaskDetail:
        """One task with its stage rail and transcript so far."""
        ...

    def intervene(self, task_id: str, intervention: Intervention) -> TaskDetail:
        """Note, pause, resume, redirect or stop a task (spec 7.10)."""
        ...

    def work_board(self) -> WorkBoard:
        """Work items, ideas and review requests."""
        ...

    def directory(self) -> Directory:
        """Every employee and open lifecycle proposal."""
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

    def search(self, query: str) -> SearchResults:
        """Search cases, documents, contacts, employees and audit events."""
        ...


class StatusAggregator(Protocol):
    """Health, metrics and read-only platform views (spec 7.3)."""

    def sampled_at(self) -> datetime:
        """When health and metrics were last collected. Tiles show this so they can go stale."""
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


class ChatRelay(Protocol):
    """Web chat with the leads, through the chat relay (spec 6.2)."""

    def thread(self, lead_id: str) -> ChatThread:
        """The lead and its message history."""
        ...

    def send(self, lead_id: str, text: str) -> ChatThread:
        """Send the Owner's message; the reply arrives as `chat.message` events."""
        ...
