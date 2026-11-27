/**
 * @file The preview's approval gate: approvals, decisions, settings, the kill switch, the step-up
 * and the controls over people and machinery. A line-for-line port of `backends/mock/gate*.py`
 * and `setting_rules.py`; the parity test holds the two to the same answers.
 */
import type {
  Approval,
  Contact,
  CriticalDecision,
  PlatformState,
  Setting,
  StatusLabel,
  Trust,
} from "../api/types";
import { conflict, notFound, refused, stepUpRequired } from "./errors";
import { isOn, setting, type MockWorld } from "./world";

const APPROVAL_PAGES = ["approvals", "today", "platform", "chat", "work"];
const DECISION_PAGES = ["decisions", "today", "platform"];
const TRUST_ORDER: Trust[] = ["blocked", "unknown", "known", "allowlisted"];
const OWNER_TIME_ZONE = "America/Los_Angeles";

const later = (world: MockWorld, seconds: number) =>
  new Date(world.clock().getTime() + seconds * 1000).toISOString();

const passed = (iso: string | null | undefined, now: Date) =>
  iso !== null && iso !== undefined && Date.parse(iso) <= now.getTime();

// Step-up --------------------------------------------------------------------------------------

/** A fresh challenge for the authenticator to sign. */
export function createChallenge(world: MockWorld): string {
  const challenge = world.ids(16);
  world.stepUpChallenges.add(challenge);
  return challenge;
}

/** Checks the virtual authenticator's answer and issues a single-use proof. */
export function verifyStepUp(world: MockWorld, challenge: string, assertion: string) {
  if (!world.stepUpChallenges.has(challenge)) {
    throw stepUpRequired("That passkey request expired. Try again.");
  }
  world.stepUpChallenges.delete(challenge);
  if (assertion !== world.constants.mock_assertion_prefix + challenge) {
    throw stepUpRequired("The passkey didn't match. Try again.");
  }
  const proof = world.ids(24);
  const expiresAt = later(world, world.constants.step_up_lifetime_seconds);
  world.stepUpProofs.set(proof, new Date(expiresAt));
  return { proof, expires_at: expiresAt };
}

/** Consumes a valid proof, or refuses with `why`. */
function requireStepUp(world: MockWorld, stepUp: string | null, why: string): void {
  const expiresAt = stepUp ? world.stepUpProofs.get(stepUp) : undefined;
  if (stepUp) world.stepUpProofs.delete(stepUp);
  if (!expiresAt || expiresAt < world.clock()) throw stepUpRequired(why);
}

// Approvals ------------------------------------------------------------------------------------

function expireIfLapsed(approval: Approval, now: Date): boolean {
  if (approval.state === "pending" && passed(approval.expires_at, now)) {
    approval.state = "expired";
    approval.decided_note = "Expired · nothing was sent";
    return true;
  }
  return false;
}

/** Every card, pending first; a card past its expiry becomes expired. */
export function listApprovals(world: MockWorld): Approval[] {
  const all = Object.values(world.approvals);
  const lapsed = all.map((a) => expireIfLapsed(a, world.clock()));
  if (lapsed.some(Boolean)) world.bus.changed(...APPROVAL_PAGES);
  return [...all].sort((a, b) => Number(a.state !== "pending") - Number(b.state !== "pending"));
}

function approval(world: MockWorld, id: string): Approval {
  const found = world.approvals[id];
  if (!found) throw notFound("That approval no longer exists.");
  return found;
}

function stepUpReason(card: Approval): string {
  if (card.data_class === "restricted") {
    return `${card.domain} is a restricted domain. Your passkey confirms it's you.`;
  }
  return "This approval needs your passkey.";
}

/** Approves or denies a pending card. */
export function decide(
  world: MockWorld,
  id: string,
  decision: string,
  stepUp: string | null,
): Approval {
  const card = approval(world, id);
  if (expireIfLapsed(card, world.clock())) world.bus.changed(...APPROVAL_PAGES);
  if (card.state === "expired") throw conflict("This card expired. Nothing was sent.");
  if (card.state !== "pending") throw conflict("This card was already decided.");
  if (decision === "approve") {
    if (card.needs_step_up) requireStepUp(world, stepUp, stepUpReason(card));
    card.state = "approved";
    card.decided_note = `Approved · ${card.employee_name} is sending`;
  } else {
    card.state = "denied";
    card.decided_note = `Denied · ${card.employee_name} notified`;
  }
  card.undo_until = later(world, world.constants.undo_window_seconds);
  world.bus.changed(...APPROVAL_PAGES);
  return card;
}

/** Returns a decided card to pending while the gate still holds its action. */
export function undoDecision(world: MockWorld, id: string): Approval {
  const card = approval(world, id);
  if (!card.undo_until || Date.parse(card.undo_until) < world.clock().getTime()) {
    throw conflict("Too late to undo: the action already ran.");
  }
  card.state = "pending";
  card.decided_note = null;
  card.undo_until = null;
  world.bus.changed(...APPROVAL_PAGES);
  return card;
}

// Decisions ------------------------------------------------------------------------------------

/** A decision as the server sends it, with its computed fields. */
function shownDecision(record: CriticalDecision): CriticalDecision {
  const vetoable = record.status === "pending_window" || record.status === "in_effect";
  return { ...record, vetoable, open: vetoable && !record.acknowledged };
}

function takeEffectIfDue(record: CriticalDecision, now: Date): boolean {
  if (record.status === "pending_window" && passed(record.window_ends, now)) {
    record.status = "in_effect";
    return true;
  }
  return false;
}

/** Open decisions first, then the rest in fixture order. */
export function listDecisions(world: MockWorld): CriticalDecision[] {
  const all = Object.values(world.decisions);
  if (all.map((r) => takeEffectIfDue(r, world.clock())).some(Boolean)) {
    world.bus.changed(...DECISION_PAGES);
  }
  const shown = all.map(shownDecision);
  return shown.sort((a, b) => Number(!a.open) - Number(!b.open));
}

function decisionRecord(world: MockWorld, id: string): CriticalDecision {
  const record = world.decisions[id];
  if (!record) throw notFound("That decision record doesn't exist.");
  if (takeEffectIfDue(record, world.clock())) world.bus.changed(...DECISION_PAGES);
  return record;
}

/** Acknowledges an open decision. */
export function acknowledge(world: MockWorld, id: string): CriticalDecision {
  const record = decisionRecord(world, id);
  if (!shownDecision(record).open) throw conflict("This decision is no longer open.");
  record.acknowledged = true;
  world.bus.changed(...DECISION_PAGES);
  return shownDecision(record);
}

/** Cancels a waiting decision, or reverts one in effect. */
export function veto(world: MockWorld, id: string, reason: string | null): CriticalDecision {
  const record = decisionRecord(world, id);
  if (!shownDecision(record).vetoable) throw conflict("This decision can't be vetoed any more.");
  record.status = record.status === "pending_window" ? "vetoed" : "reversed";
  record.acknowledged = false;
  record.veto_reason = reason;
  world.bus.changed(...DECISION_PAGES);
  return shownDecision(record);
}

/** Undoes an acknowledgement or a veto while the veto window is open. */
export function reopenDecision(world: MockWorld, id: string): CriticalDecision {
  const record = decisionRecord(world, id);
  if (!record.window_ends || passed(record.window_ends, world.clock())) {
    throw conflict("The veto window has ended.");
  }
  if (record.status !== "vetoed" && record.status !== "pending_window") {
    throw conflict("This decision can't be reopened.");
  }
  record.status = "pending_window";
  record.acknowledged = false;
  record.veto_reason = null;
  world.bus.changed(...DECISION_PAGES);
  return shownDecision(record);
}

// Settings -------------------------------------------------------------------------------------

function validateMoney(item: Setting, value: string): void {
  if (!/^[0-9]+$/.test(value)) throw refused("A cap is a whole number of dollars.");
  const ceiling = item.ceiling ?? null;
  if (ceiling !== null && Number(value) > ceiling) {
    throw refused(
      `$${value} is above the hard limit of $${ceiling} a month, which only changes at the desk.`,
    );
  }
}

function validate(item: Setting, value: string): void {
  if (item.kind === "switch" && value !== "on" && value !== "off") {
    throw refused(`${item.label} is a switch: use on or off.`);
  }
  if ((item.kind === "level" || item.kind === "choice") && !item.choices.includes(value)) {
    throw refused(`${value} is not one of the choices for ${item.label}.`);
  }
  if (item.kind === "money") validateMoney(item, value);
}

function isLoosening(item: Setting, value: string): boolean {
  const current = item.value;
  if (item.kind === "switch") {
    const turningOn = current === "off" && value === "on";
    const turningOff = current === "on" && value === "off";
    return item.on_is_loosening ? turningOn : turningOff;
  }
  if (item.kind === "level") return item.choices.indexOf(value) > item.choices.indexOf(current);
  if (item.kind === "money") return Number(value) > Number(current);
  return false;
}

function settingRecord(world: MockWorld, key: string): Setting {
  const found = world.settings[key];
  if (!found) throw notFound(`There is no setting called ${key}.`);
  return found;
}

/** Applies a change after checking its limit and, if it loosens, its step-up. */
export function changeSetting(
  world: MockWorld,
  key: string,
  value: string,
  stepUp: string | null,
): Setting {
  const item = settingRecord(world, key);
  validate(item, value);
  if (value === item.value) return item;
  if (isLoosening(item, value)) {
    requireStepUp(world, stepUp, `Changing ${item.label} loosens a safeguard.`);
  }
  item.history.unshift({
    at: world.clock().toISOString(),
    old: item.value,
    new: value,
    via: "brain",
  });
  item.value = value;
  world.bus.changed("settings", item.owner_page, "today", "platform");
  return item;
}

/** Changes a setting back to the value before its latest change. */
export function revertSetting(world: MockWorld, key: string, stepUp: string | null): Setting {
  const item = settingRecord(world, key);
  const last = item.history[0];
  if (!last) throw conflict(`${item.label} has no earlier value.`);
  return changeSetting(world, key, last.old, stepUp);
}

// Platform state -------------------------------------------------------------------------------

function inQuietHours(window: string, now: Date): boolean {
  const [start = "", end = ""] = window.split("–");
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: OWNER_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  if (start <= end) return start <= local && local < end;
  return local >= start || local < end;
}

const count = (n: number): StatusLabel => ({ status: "attention", label: n ? String(n) : "" });

function setupBadge(world: MockWorld): string {
  const required = Object.values(world.setup).filter((step) => step.required);
  const done = required.filter((step) => step.state === "done").length;
  return done === required.length ? "" : `${done}/${required.length}`;
}

function overall(world: MockWorld): StatusLabel {
  if (world.stopped) return { status: "problem", label: "Stopped" };
  if (isOn(world, "away_mode")) return { status: "attention", label: "Away mode" };
  return { status: "healthy", label: "All clear" };
}

/** Global banners and the navigation badges. */
export function platformState(world: MockWorld, running: number): PlatformState {
  const pending = listApprovals(world).filter((a) => a.state === "pending").length;
  const openDecisions = listDecisions(world).filter((d) => d.open).length;
  const badges: Record<string, StatusLabel> = {
    approvals: count(pending),
    decisions: count(openDecisions),
    live: { status: "neutral", label: String(running) },
    backups: { status: "attention", label: "▲" },
    setup: { status: "attention", label: setupBadge(world) },
  };
  return {
    stopped: world.stopped,
    away: isOn(world, "away_mode"),
    quiet_hours: inQuietHours(setting(world, "quiet_hours"), world.clock()),
    degraded: [],
    overall: overall(world),
    badges: Object.fromEntries(
      Object.entries(badges).filter(([, badge]) => badge.label !== "" && badge.label !== "0"),
    ),
  };
}

// People and machinery -------------------------------------------------------------------------

/** Changes a contact's trust; more trust needs a step-up. */
export function setTrust(
  world: MockWorld,
  id: string,
  trust: Trust,
  stepUp: string | null,
): Contact {
  const contact = world.contacts[id];
  if (!contact) throw notFound("That contact no longer exists.");
  if (TRUST_ORDER.indexOf(trust) > TRUST_ORDER.indexOf(contact.trust)) {
    requireStepUp(world, stepUp, `Trusting ${contact.name} more needs your passkey.`);
  }
  contact.trust = trust;
  world.bus.changed("contacts", "security");
  return contact;
}

/** Enables or disables an employee; enabling needs a step-up. */
export function setEmployeeEnabled(
  world: MockWorld,
  id: string,
  enabled: boolean,
  stepUp: string | null,
): void {
  const employee = world.employees[id];
  if (!employee) throw notFound("That employee doesn't exist.");
  if (enabled && !employee.enabled) {
    requireStepUp(world, stepUp, `Enabling ${employee.name} needs your passkey.`);
  }
  employee.enabled = enabled;
  world.bus.changed("directory");
}

/** Records the Owner's answer to a lifecycle proposal. */
export function decideProposal(world: MockWorld, id: string, decision: string): void {
  const proposal = world.proposals[id];
  if (!proposal) throw notFound("That proposal no longer exists.");
  if (proposal.state !== "open") throw conflict("This proposal was already decided.");
  proposal.state = decision === "approve" ? "approved" : "declined";
  world.bus.changed("directory");
}

/** Gates a restart behind a step-up. */
export function restartService(world: MockWorld, id: string, stepUp: string | null): void {
  const known = world.fixtures.service_groups.flatMap((g) => g.services.map((s) => s.id));
  if (!known.includes(id)) throw notFound("That service doesn't exist.");
  requireStepUp(world, stepUp, "Restarting a service needs your passkey.");
  world.bus.changed("services");
}

/** Gates a restore behind a step-up and says where the copy will appear. */
export function requestRestore(
  world: MockWorld,
  what: string,
  point: string,
  stepUp: string | null,
): string {
  requireStepUp(world, stepUp, "Restoring needs your passkey.");
  return `Restoring ${what} from ${point} into Restores on the working drive.`;
}

/** Stops everything at once. */
export function stopAll(world: MockWorld): void {
  world.stopped = true;
  world.bus.changed("*");
}

/** Resumes after a stop, behind a step-up. */
export function resumeAll(world: MockWorld, stepUp: string | null): void {
  requireStepUp(world, stepUp, "Resuming after a stop needs your passkey.");
  world.stopped = false;
  world.bus.changed("*");
}
