/**
 * @file Small, valid API objects for tests. Each takes overrides for the fields a test cares about.
 */
import type {
  Approval,
  ContactsOverview,
  CriticalDecision,
  LiveTask,
  Setting,
  Thread,
} from "../api/types";

/** A pending one-tap approval. */
export function makeApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: "AP-1",
    title: "Reply to Dr. Patel",
    employee_name: "Chrono",
    department: "personal",
    domain: "Health",
    data_class: "internal",
    approval_class: "P",
    tier: "T2",
    principal: "owner",
    recipient: "Dr. Patel's office",
    recipient_trust: "allowlisted",
    summary: "Confirm Tuesday 10:30.",
    draft: "Tuesday at 10:30 works. Thank you!",
    release: null,
    expires_at: null,
    needs_step_up: false,
    state: "pending",
    decided_note: null,
    undo_until: null,
    ...overrides,
  };
}

/** One household member and one contact. */
export function makeContacts(
  trust: ContactsOverview["contacts"][number]["trust"] = "known",
): ContactsOverview {
  return {
    household: [{ id: "owner", name: "You", meta: "Owner" }],
    contacts: [{ id: "C-1", name: "A-1 Plumbing", meta: "Home · vendor", trust }],
  };
}

/** A money setting with a policy ceiling. */
export function makeMoneySetting(overrides: Partial<Setting> = {}): Setting {
  return {
    key: "budget.voice",
    label: "Approval calls: monthly cap",
    note: "Spending stops at the cap",
    category: "Calls",
    kind: "money",
    value: "0",
    default: "0",
    choices: [],
    on_is_loosening: true,
    ceiling: 20,
    owner_page: "spend",
    cost_note: "Hard ceiling $20 a month",
    history: [],
    ...overrides,
  };
}

/** An acknowledged critical decision that is in effect, so a veto would revert it. */
export function makeDecision(overrides: Partial<CriticalDecision> = {}): CriticalDecision {
  return {
    id: "CDR-1",
    title: "Use the smaller embedding model",
    summary: "Frees 2 GB for the coding model.",
    rationale: "Search quality held in the evaluation.",
    rejected: [],
    risks: "Slightly weaker recall on long documents.",
    evidence: "Evaluation run 41.",
    effect: "immediate",
    window_ends: null,
    veto_preview: "Vetoing reloads the larger model.",
    status: "in_effect",
    acknowledged: true,
    decided_on: "Oct 28",
    veto_reason: null,
    open: false,
    vetoable: true,
    ...overrides,
  };
}

/** A thread Bolt is working on, led by Foreman. */
export function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "TH-1",
    title: "Lease Reminders 1.2",
    kind: "work_item",
    unit_id: "WI-0031",
    lead_id: "foreman",
    lead_name: "Foreman",
    lead_department: "governance",
    pipeline: "Development",
    principal: "owner",
    state: "working",
    detail: "Bolt is writing the reminder schedule",
    since: "Oct 27",
    closing_summary: null,
    approval_id: null,
    ...overrides,
  };
}

/** Bolt's running sub-agent session on Foreman's thread. */
export function makeSession(overrides: Partial<LiveTask> = {}): LiveTask {
  return {
    id: "T-1",
    employee_id: "ENG-1",
    employee_name: "Bolt",
    department: "engineering",
    state: "generating",
    doing: "is writing the reminder schedule",
    item: "WI-0031 Lease Reminders",
    model: "coding model",
    lane: "development",
    started_at: null,
    tokens_per_second: 41,
    queued: false,
    paused: false,
    waiting_on: null,
    blocked_code: null,
    thread_id: "TH-1",
    thread_title: "Lease Reminders 1.2",
    lead_name: "Foreman",
    session_state: "running",
    ...overrides,
  };
}
