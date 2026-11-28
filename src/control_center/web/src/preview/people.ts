/**
 * @file The preview's people: contacts, their trust, and the household's principals. A port of
 * `backends/mock/gate_people.py` and `fixtures/contacts.py`; the parity test holds the two to the
 * same answers.
 *
 * Loosening asks for a passkey and tightening takes one tap (spec 7.16, rule 3). A removed contact
 * goes to the shared trash (rule 11); a removed principal has seven days of undo.
 */
import type { components } from "../api/schema";
import type { Contact, Trust } from "../api/types";
import { conflict, notFound } from "./errors";
import { requireStepUp, TRUST_ORDER } from "./gate";
import { RESTORERS, sendToTrash } from "./shell";
import type { MockWorld } from "./world";

type Schemas = components["schemas"];
type Member = Schemas["HouseholdMember"];
type ContactEvent = Schemas["ContactEvent"];
type ContactDraft = Schemas["ContactDraft"];

const TRUST_WORDS: Record<Trust, string> = {
  allowlisted: "Allowlisted",
  known: "Known",
  unknown: "Unknown",
  blocked: "Blocked",
};

const DAY_MS = 24 * 3600 * 1000;

const loosens = (from: Trust, to: Trust) => TRUST_ORDER.indexOf(to) > TRUST_ORDER.indexOf(from);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const unique = <T>(items: T[]) => [...new Set(items)];
const without = <T>(record: Record<string, T>, id: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== id));

/** The line under a principal's name: who they are and what is mapped to them. */
function householdMeta(member: Member): string {
  const who = member.role === "owner" ? "Owner" : "Principal";
  return `${who} · ${plural((member.accounts ?? []).length, "account")} · ${plural(
    (member.calendars ?? []).length,
    "calendar",
  )}`;
}

function contactMeta(world: MockWorld, contact: Contact): string {
  const kinds = unique((contact.channels ?? []).map((c) => c.kind));
  const parts = [contact.area ?? ""];
  const principal = contact.principal ? world.household[contact.principal] : undefined;
  if (contact.principal && contact.principal !== "owner" && principal) parts.push(principal.name);
  if (kinds.length) parts.push(kinds.join(", "));
  return parts.filter(Boolean).join(" · ");
}

RESTORERS.contact = (world, payload) => {
  const [contact, history] = payload as [Contact, ContactEvent[]];
  world.contacts[contact.id] = contact;
  world.contact_history[contact.id] = history;
  world.bus.changed("contacts", "security");
};

function contactRecord(world: MockWorld, id: string): Contact {
  const contact = world.contacts[id];
  if (!contact) throw notFound("That contact no longer exists.");
  return contact;
}

function purgeRemovedPrincipals(world: MockWorld): void {
  const now = world.clock().getTime();
  const gone = Object.values(world.household)
    .filter((m) => m.removal && Date.parse(m.removal.undo_until) <= now)
    .map((m) => m.id);
  for (const id of gone) {
    world.household = without(world.household, id);
    for (const contact of Object.values(world.contacts)) {
      if (contact.principal === id) {
        contact.principal = null;
        contact.meta = contactMeta(world, contact);
      }
    }
  }
  if (gone.length) world.bus.changed("contacts");
}

function principalRecord(world: MockWorld, id: string): Member {
  purgeRemovedPrincipals(world);
  const member = world.household[id];
  if (!member) throw notFound("That person isn't in the household.");
  return member;
}

// Reading --------------------------------------------------------------------------------------

/** The Contacts page. */
export function contactsOverview(world: MockWorld): Schemas["ContactsOverview"] {
  purgeRemovedPrincipals(world);
  return {
    household: Object.values(world.household),
    contacts: Object.values(world.contacts),
    accounts: world.fixtures.linkable_accounts,
  };
}

/** One contact with its history and the drafts and rules that mention it. */
export function contactDetail(world: MockWorld, id: string): Schemas["ContactDetail"] {
  const contact = contactRecord(world, id);
  const drafts = Object.values(world.approvals)
    .filter((a) => a.contact_id === id && a.state === "pending")
    .map((a) => ({ kind: "draft" as const, id: a.id, title: a.title, href: "/approvals" }));
  const rules = world.fixtures.contact_rules
    .filter(([, , mentions]) => mentions.includes(id))
    .map(([ruleId, title]) => ({ kind: "rule" as const, id: ruleId, title, href: "/personal" }));
  return { contact, history: world.contact_history[id] ?? [], mentions: [...drafts, ...rules] };
}

// Contacts -------------------------------------------------------------------------------------

function draftOf(body: Record<string, unknown>): ContactDraft {
  return {
    name: typeof body.name === "string" ? body.name : "",
    area: typeof body.area === "string" ? body.area : "",
    principal: typeof body.principal === "string" ? body.principal : null,
    channels: Array.isArray(body.channels) ? (body.channels as ContactDraft["channels"]) : [],
    trust: typeof body.trust === "string" ? (body.trust as Trust) : "known",
  };
}

function checkDraft(world: MockWorld, draft: ContactDraft): void {
  if (!draft.name.trim()) throw conflict("Give the contact a name first.");
  if ((draft.channels ?? []).some((c) => !c.value.trim())) {
    throw conflict("Fill in each channel, or remove the empty one.");
  }
  if (draft.principal != null && !world.household[draft.principal]) {
    throw conflict("That person isn't in the household.");
  }
}

function fill(world: MockWorld, contact: Contact, draft: ContactDraft): void {
  contact.name = draft.name.trim();
  contact.area = (draft.area ?? "").trim();
  contact.principal = draft.principal ?? null;
  contact.channels = (draft.channels ?? []).map((c) => ({ kind: c.kind, value: c.value.trim() }));
  contact.trust = draft.trust ?? "known";
  contact.meta = contactMeta(world, contact);
}

function trashContact(world: MockWorld, contact: Contact, history: ContactEvent[]): string {
  world.contacts = without(world.contacts, contact.id);
  world.contact_history = without(world.contact_history, contact.id);
  const meta = [TRUST_WORDS[contact.trust], contact.area ?? ""].filter(Boolean).join(" · ");
  const item = sendToTrash(
    world,
    { kind: "contact", title: contact.name, meta, home: "/contacts" },
    [contact, history],
  );
  return item.id;
}

/** Adds a contact; adding one already allowlisted needs a step-up. */
export function addContact(
  world: MockWorld,
  body: Record<string, unknown>,
  stepUp: string | null,
): Contact {
  const draft = draftOf(body);
  checkDraft(world, draft);
  if (loosens("known", draft.trust ?? "known")) {
    requireStepUp(world, stepUp, `Allowlisting ${draft.name.trim()} needs your passkey.`);
  }
  const contact: Contact = {
    id: `C-${world.ids(2)}`,
    name: "",
    meta: "",
    trust: draft.trust ?? "known",
    area: "",
    principal: null,
    channels: [],
    linked_accounts: [],
  };
  fill(world, contact, draft);
  world.contacts[contact.id] = contact;
  world.contact_history[contact.id] = [];
  world.bus.changed("contacts", "security");
  return contact;
}

/** Changes a contact's details; giving it more trust needs a step-up. */
export function editContact(
  world: MockWorld,
  id: string,
  body: Record<string, unknown>,
  stepUp: string | null,
): Contact {
  const contact = contactRecord(world, id);
  const draft = draftOf(body);
  checkDraft(world, draft);
  if (loosens(contact.trust, draft.trust ?? "known")) {
    requireStepUp(world, stepUp, `Trusting ${contact.name} more needs your passkey.`);
  }
  fill(world, contact, draft);
  world.bus.changed("contacts", "security");
  return contact;
}

/** Changes a contact's trust; more trust needs a step-up. */
export function setTrust(
  world: MockWorld,
  id: string,
  trust: Trust,
  stepUp: string | null,
): Contact {
  const contact = contactRecord(world, id);
  if (loosens(contact.trust, trust)) {
    requireStepUp(world, stepUp, `Trusting ${contact.name} more needs your passkey.`);
  }
  contact.trust = trust;
  world.bus.changed("contacts", "security");
  return contact;
}

/** Folds one contact into another, which keeps its own trust; the merged one goes to the trash. */
export function mergeContact(world: MockWorld, id: string, into: string): Contact {
  const source = contactRecord(world, id);
  const target = contactRecord(world, into);
  if (source.id === target.id) throw conflict("Choose a different contact to merge into.");
  const seen = new Set(target.channels.map((c) => `${c.kind}\u0000${c.value}`));
  target.channels = [
    ...target.channels,
    ...source.channels.filter((c) => !seen.has(`${c.kind}\u0000${c.value}`)),
  ];
  target.linked_accounts = unique([...target.linked_accounts, ...source.linked_accounts]);
  target.principal = target.principal || source.principal || null;
  target.meta = contactMeta(world, target);
  const moved = world.contact_history[source.id] ?? [];
  world.contact_history[target.id] = [...(world.contact_history[target.id] ?? []), ...moved].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
  trashContact(world, source, moved);
  world.bus.changed("contacts", "security");
  return target;
}

/** Sends a contact to the 30-day trash. */
export function removeContact(world: MockWorld, id: string): Schemas["ContactRemoved"] {
  const contact = contactRecord(world, id);
  const trashId = trashContact(world, contact, world.contact_history[id] ?? []);
  world.bus.changed("contacts", "security");
  return { trash_id: trashId, message: `${contact.name} moved to Recently deleted.` };
}

// Principals -----------------------------------------------------------------------------------

/** Adds a household principal. Always needs a step-up. */
export function addPrincipal(world: MockWorld, rawName: string, stepUp: string | null): Member {
  const name = rawName.trim();
  if (!name) throw conflict("Give the person a name first.");
  requireStepUp(world, stepUp, `Adding ${name} to the household needs your passkey.`);
  const member: Member = {
    id: `P-${world.ids(2)}`,
    name,
    meta: "",
    role: "principal",
    accounts: [],
    calendars: [],
    removal: null,
  };
  member.meta = householdMeta(member);
  world.household[member.id] = member;
  world.bus.changed("contacts");
  return member;
}

/** Maps accounts and calendars to a principal; mapping anything new needs a step-up. */
export function mapPrincipal(
  world: MockWorld,
  id: string,
  accounts: string[],
  calendars: string[],
  stepUp: string | null,
): Member {
  const member = principalRecord(world, id);
  const kinds = new Map(world.fixtures.linkable_accounts.map((a) => [a.id, a.kind]));
  if (
    accounts.some((i) => kinds.get(i) !== "account") ||
    calendars.some((i) => kinds.get(i) !== "calendar")
  ) {
    throw conflict("That account or calendar isn't connected. Add it on Connections.");
  }
  const had = new Set([...(member.accounts ?? []), ...(member.calendars ?? [])]);
  const added = new Set([...accounts, ...calendars].filter((i) => !had.has(i)));
  if (added.size) {
    requireStepUp(world, stepUp, `Mapping accounts to ${member.name} needs your passkey.`);
  }
  for (const other of Object.values(world.household)) {
    if (other.id === member.id) continue;
    other.accounts = (other.accounts ?? []).filter((i) => !added.has(i));
    other.calendars = (other.calendars ?? []).filter((i) => !added.has(i));
    other.meta = householdMeta(other);
  }
  member.accounts = unique(accounts);
  member.calendars = unique(calendars);
  member.meta = householdMeta(member);
  world.bus.changed("contacts");
  return member;
}

/** Starts removing a principal; their data is archived or deleted after seven days. */
export function removePrincipal(
  world: MockWorld,
  id: string,
  keep: string,
  stepUp: string | null,
): Member {
  const member = principalRecord(world, id);
  if (member.role === "owner") throw conflict("The Owner can't be removed from the household.");
  if (member.removal) throw conflict(`${member.name} is already being removed.`);
  requireStepUp(world, stepUp, `Removing ${member.name} needs your passkey.`);
  const until = world.clock().getTime() + world.constants.principal_undo_days * DAY_MS;
  member.removal = {
    keep: keep === "delete" ? "delete" : "archive",
    undo_until: new Date(until).toISOString(),
  };
  world.bus.changed("contacts");
  return member;
}

/** Keeps a principal whose removal hasn't become permanent. */
export function undoRemovePrincipal(world: MockWorld, id: string): Member {
  const member = principalRecord(world, id);
  if (!member.removal) throw conflict(`${member.name} isn't being removed.`);
  member.removal = null;
  world.bus.changed("contacts");
  return member;
}
