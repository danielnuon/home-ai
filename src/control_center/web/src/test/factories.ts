/**
 * @file Small, valid API objects for tests. Each takes overrides for the fields a test cares about.
 */
import type { Approval, ContactsOverview, Setting } from "../api/types";

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
