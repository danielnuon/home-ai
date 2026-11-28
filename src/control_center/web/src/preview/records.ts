/**
 * @file The preview's personal records, finance and Setup forms: cases, obligations, domain
 * records and documents, rules, the checklist, Finance figures from their source rows, statement
 * uploads, account mapping, finance requests, the secret form and the profile interview. A port of
 * `backends/mock/engine_records.py` and `backends/mock/gate_records.py`.
 */
import type { Case, FinanceOverview, PersonalOverview, SetupStep } from "../api/types";
import type { components } from "../api/schema";
import { conflict, notFound } from "./errors";
import { requireStepUp } from "./gate";
import { RESTORERS, sendToTrash } from "./shell";
import type { MockWorld } from "./world";

type Schemas = components["schemas"];
type DomainRecord = Schemas["DomainRecord"];
type Rule = Schemas["Rule"];
type SourceRow = Schemas["SourceRow"];
type StatementImport = Schemas["StatementImport"];

const DAY_MS = 24 * 3600 * 1000;

const putRecord = (world: MockWorld, payload: unknown) => {
  if (payload) world.records[(payload as DomainRecord).id] = payload as DomainRecord;
};
RESTORERS.record = putRecord;
RESTORERS.document = putRecord;
RESTORERS.rule = (world, payload) => {
  if (payload) world.rules[(payload as Rule).id] = payload as Rule;
};

/** Midnight UTC of the day an instant falls on. */
const utcDay = (when: Date) =>
  Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());

/** Whole calendar days from `now` to `due`, in UTC; 0 is today. */
const daysUntil = (due: string, now: Date) =>
  Math.round((utcDay(new Date(due)) - utcDay(now)) / DAY_MS);

/** "YYYY-MM-DD" for the UTC day of an instant. */
const isoDay = (when: Date) => when.toISOString().slice(0, 10);

/** A file size as the record shows it, rounded up: "412 KB" or "1.1 MB". */
function sizeLabel(bytes: number): string {
  const mega = 1024 * 1024;
  if (bytes < mega) return `${Math.max(1, Math.floor((bytes + 1023) / 1024))} KB`;
  const tenths = Math.floor((bytes * 10 + mega - 1) / mega);
  return `${Math.floor(tenths / 10)}.${tenths % 10} MB`;
}

/** `text` trimmed, or a conflict with `refusal` when nothing is left. */
function required(text: string, refusal: string): string {
  if (!text.trim()) throw conflict(refusal);
  return text.trim();
}

function domainName(world: MockWorld, name: string): string {
  if (!(name in world.fixtures.domain_ids)) throw conflict("Pick one of the domains.");
  return name;
}

function assignee(world: MockWorld, name: string): string {
  if (!world.fixtures.assignees.includes(name)) throw conflict("Pick someone from the list.");
  return name;
}

// Personal -------------------------------------------------------------------------------------

/** Everything on the Personal page; obligations are counted against the clock on each read. */
export function personal(world: MockWorld): PersonalOverview {
  const now = world.clock();
  const all = Object.values(world.obligations);
  all.forEach((o) => (o.days = o.next_due ? daysUntil(o.next_due, now) : null));
  const dated = all
    .filter((o) => o.next_due)
    .sort((a, b) => Date.parse(a.next_due ?? "") - Date.parse(b.next_due ?? ""));
  return {
    cases: Object.values(world.cases).filter((c) => c.state !== "done"),
    obligations: [...dated, ...all.filter((o) => !o.next_due)],
    domains: world.fixtures.domains,
    rules: Object.values(world.rules),
    briefs: world.fixtures.briefs,
    sync: world.fixtures.sync,
    checklist: Object.values(world.checklist),
    recent_changes: Object.values(world.changes),
    assignees: world.fixtures.assignees,
  };
}

function findCase(world: MockWorld, id: string): Case {
  const found = world.cases[id];
  if (!found) throw notFound("That case no longer exists.");
  return found;
}

/** Adds a case the Owner asked for. */
export function createCase(world: MockWorld, body: Record<string, unknown>): Case {
  const title = required(String(body.title ?? ""), "Give the case a title first.");
  const today = isoDay(world.clock());
  const due = String(body.due);
  const [, month, day] = due.split("-").map(Number);
  const found: Case = {
    id: `CS-${world.ids(2)}`,
    title,
    domain: domainName(world, String(body.domain)),
    principal: body.principal as Case["principal"],
    employee_name: assignee(world, String(body.employee_name)),
    due: due === today ? "today" : `${world.fixtures.months[(month ?? 1) - 1]} ${day}`,
    status:
      due <= today
        ? { status: "attention", label: "Due today" }
        : { status: "in_progress", label: "Open" },
    state: "open",
    notes: [],
  };
  world.cases = { [found.id]: found, ...world.cases };
  world.bus.changed("personal", "today");
  return found;
}

/** Hands a case to the Owner or another employee. */
export function reassignCase(world: MockWorld, id: string, name: string): Case {
  const found = findCase(world, id);
  found.employee_name = assignee(world, name);
  world.bus.changed("personal");
  return found;
}

/** Adds the Owner's note to a case. */
export function addCaseNote(world: MockWorld, id: string, text: string): Case {
  const found = findCase(world, id);
  const note = {
    id: `CN-${world.ids(2)}`,
    text: required(text, "Type the note first."),
    at: world.clock().toISOString(),
  };
  found.notes.push(note);
  world.bus.changed("personal");
  return found;
}

/** Adds a date obligation. */
export function createObligation(
  world: MockWorld,
  body: Record<string, unknown>,
): Schemas["Obligation"] {
  const due = new Date(`${String(body.due)}T12:00:00Z`).toISOString();
  const item: Schemas["Obligation"] = {
    id: `OB-${world.ids(2)}`,
    title: required(String(body.title ?? ""), "Give the obligation a title first."),
    domain: domainName(world, String(body.domain)),
    principal: body.principal as Case["principal"],
    kind: "date",
    rule: world.fixtures.repeat_words[String(body.repeat)] ?? "",
    lead_days: typeof body.lead_days === "number" ? body.lead_days : 14,
    next_due: due,
    days: daysUntil(due, world.clock()),
  };
  world.obligations[item.id] = item;
  world.bus.changed("personal");
  return item;
}

/** Ticks or unticks an onboarding checklist step. */
export function setChecklist(world: MockWorld, id: string, done: boolean) {
  const item = world.checklist[id];
  if (!item) throw notFound("That checklist step doesn't exist.");
  item.done = done;
  world.bus.changed("personal");
  return item;
}

// Domains, records and documents ---------------------------------------------------------------

/** One domain's records and documents. */
export function domainDetail(world: MockWorld, id: string): Schemas["DomainDetail"] {
  const domain = world.fixtures.domains.find((d) => d.id === id);
  if (!domain) throw notFound("That domain doesn't exist.");
  return { domain, records: Object.values(world.records).filter((r) => r.domain_id === id) };
}

function file(world: MockWorld, record: DomainRecord): DomainRecord {
  world.records = { [record.id]: record, ...world.records };
  world.bus.changed("personal");
  return record;
}

/** Adds a register entry to a domain. */
export function addRecord(world: MockWorld, domainId: string, body: Record<string, unknown>) {
  domainDetail(world, domainId);
  return file(world, {
    id: `RC-${world.ids(2)}`,
    domain_id: domainId,
    principal: body.principal as Case["principal"],
    kind: "record",
    title: required(String(body.title ?? ""), "Give the record a name first."),
    meta: String(body.meta ?? "").trim() || "Added just now",
  });
}

/** Files an uploaded document; the mock keeps its name and size only. */
export function uploadDocument(world: MockWorld, domainId: string, body: Record<string, unknown>) {
  domainDetail(world, domainId);
  const size = Number(body.size_bytes ?? 0);
  if (size > world.constants.max_upload_bytes) {
    throw conflict("That file is over 25 MB. Drop it in the inbox folder instead.");
  }
  return file(world, {
    id: `RC-${world.ids(2)}`,
    domain_id: domainId,
    principal: body.principal as Case["principal"],
    kind: "document",
    title: required(String(body.filename ?? ""), "Choose a file first."),
    meta: `Filed just now · ${sizeLabel(size)}`,
  });
}

function findRecord(world: MockWorld, id: string): DomainRecord {
  const found = world.records[id];
  if (!found) throw notFound("That record no longer exists.");
  return found;
}

/** Renames a record or document, or changes its details. */
export function editRecord(world: MockWorld, id: string, title: string, meta: string) {
  const found = findRecord(world, id);
  found.title = required(title, "A record needs a name.");
  found.meta = meta.trim();
  world.bus.changed("personal");
  return found;
}

/** Moves a record or document to the 30-day trash. */
export function deleteRecord(world: MockWorld, id: string) {
  const found = findRecord(world, id);
  world.records = Object.fromEntries(Object.entries(world.records).filter(([key]) => key !== id));
  const domain = world.fixtures.domains.find((d) => d.id === found.domain_id)?.name ?? "";
  world.bus.changed("personal");
  return sendToTrash(
    world,
    {
      kind: found.kind,
      title: found.title,
      meta: `${domain} · ${world.fixtures.principal_names[found.principal]}`,
      home: "/personal",
    },
    found,
  );
}

// Rules ----------------------------------------------------------------------------------------

function findRule(world: MockWorld, id: string): Rule {
  const found = world.rules[id];
  if (!found) throw notFound("That rule no longer exists.");
  return found;
}

/** Changes what a rule matches or does. */
export function editRule(world: MockWorld, id: string, when: string, then: string): Rule {
  const found = findRule(world, id);
  found.when = required(when, "Say when the rule applies.");
  found.then = required(then, "Say what the rule does.");
  found.source = "Edited by you · just now";
  world.bus.changed("personal");
  return found;
}

/** Moves a rule to the 30-day trash. */
export function deleteRule(world: MockWorld, id: string) {
  const found = findRule(world, id);
  world.rules = Object.fromEntries(Object.entries(world.rules).filter(([key]) => key !== id));
  world.bus.changed("personal");
  const kind = found.kind.charAt(0).toUpperCase() + found.kind.slice(1);
  return sendToTrash(
    world,
    {
      kind: "rule",
      title: `${found.when} → ${found.then}`,
      meta: `${kind} rule`,
      home: "/personal",
    },
    found,
  );
}

// Finance --------------------------------------------------------------------------------------

const total = (rows: SourceRow[]) => rows.reduce((sum, r) => sum + r.amount, 0);

/** One principal's month, computed from its rows. */
export function finance(world: MockWorld, principal: string): FinanceOverview {
  const rows = world.transactions[principal];
  if (!rows) throw notFound("Not Found");
  const { categories, income, budgets, balances, cash_flow_history, bills } = world.fixtures;
  const spent = Object.fromEntries(
    categories.map((name) => [name, total(rows.filter((r) => r.category === name))]),
  );
  const october = {
    id: "cash-oct",
    month: "Oct",
    money_in: total(rows.filter((r) => r.category === income)),
    money_out: Object.values(spent).reduce((a, b) => a + b, 0),
  };
  const history = (cash_flow_history[principal] ?? []).map((m) => ({
    id: `cash-${m.key}`,
    month: m.month,
    money_in: m.money_in,
    money_out: m.money_out,
  }));
  return {
    principal: principal as FinanceOverview["principal"],
    month: "October",
    days_elapsed: "25 of 31 days",
    budget: categories.map((name) => ({
      id: `budget-${name.toLowerCase()}`,
      name,
      spent: spent[name] ?? 0,
      budget: budgets[principal]?.[name] ?? 0,
    })),
    net_worth: {
      name: "Net worth",
      value: `$${total(balances[principal] ?? []).toLocaleString("en-US")}`,
      status: null,
      spark: world.fixtures.net_worth_spark,
      sampled_at: null,
    },
    cash_flow: [...history, october],
    bills: bills[principal] ?? [],
    imports: Object.values(world.imports[principal] ?? {}),
    unmapped: Object.values(world.unmapped),
    inbox: world.fixtures.inbox_folders[principal] ?? "",
  };
}

function sources(
  world: MockWorld,
  principal: string,
  figureId: string,
  txs: SourceRow[],
): [string, string, SourceRow[]] | null {
  const { categories, income, balances, cash_flow_history } = world.fixtures;
  const name = categories.find((n) => `budget-${n.toLowerCase()}` === figureId);
  if (name) {
    const rows = txs.filter((r) => r.category === name);
    return [
      `${name} · October`,
      `Sum of the ${rows.length} transactions filed under ${name}`,
      rows,
    ];
  }
  if (figureId === "net-worth") {
    return ["Net worth · Oct 25", "Sum of every account's balance", balances[principal] ?? []];
  }
  if (figureId === "cash-oct") {
    const signed = txs.map((r) => (r.category === income ? r : { ...r, amount: -r.amount }));
    return ["Cash flow · October", "Money in minus money out, from October's transactions", signed];
  }
  const month = (cash_flow_history[principal] ?? []).find((m) => `cash-${m.key}` === figureId);
  if (month) {
    return [
      `Cash flow · ${month.month}`,
      `Money in minus money out, from ${month.month}'s statement totals`,
      month.rows,
    ];
  }
  return null;
}

/** The rows behind one figure and how it is computed from them. */
export function figureSources(
  world: MockWorld,
  principal: string,
  figureId: string,
): Schemas["FigureSources"] {
  const txs = world.transactions[principal];
  if (!txs) throw notFound("Not Found");
  const found = sources(world, principal, figureId, txs);
  if (!found) throw notFound("That figure has no sources here.");
  const [title, formula, rows] = found;
  return {
    figure_id: figureId,
    title,
    formula,
    total: total(rows),
    rows,
    categories: [...world.fixtures.categories, world.fixtures.income],
  };
}

/** Moves a transaction to another category and adds a rule for its payee. */
export function fixCategory(
  world: MockWorld,
  principal: string,
  id: string,
  category: string,
): Schemas["CategoryFixed"] {
  const row = (world.transactions[principal] ?? []).find((r) => r.id === id);
  if (!row) throw notFound("That transaction isn't in this month.");
  if (![...world.fixtures.categories, world.fixtures.income].includes(category)) {
    throw conflict("Pick one of the categories.");
  }
  if (row.category === category) throw conflict(`It's already filed under ${category}.`);
  row.category = category;
  const rule: Rule = {
    id: `RU-${world.ids(2)}`,
    kind: "category",
    when: `Payee is "${row.text}"`,
    then: category,
    source: "Your correction · just now",
  };
  world.rules[rule.id] = rule;
  world.bus.changed("finance", "personal");
  return { rule, message: `Moved ${row.text} to ${category} and added a rule for next time.` };
}

/** Imports a statement export for one account. */
export function uploadStatement(
  world: MockWorld,
  principal: string,
  id: string,
  body: Record<string, unknown>,
): StatementImport {
  const item = world.imports[principal]?.[id];
  if (!item) throw notFound("That account isn't on this page.");
  const name = String(body.filename ?? "").trim();
  if (!world.constants.statement_types.some((ext) => name.toLowerCase().endsWith(ext))) {
    throw conflict("Brain reads CSV, OFX or QFX exports. Export one from your bank.");
  }
  if (Number(body.size_bytes ?? 0) > world.constants.max_upload_bytes) {
    throw conflict("That file is over 25 MB. Drop it in the inbox folder instead.");
  }
  item.status = { status: "healthy", label: "Current" };
  item.meta = `Imported ${name} just now · Tally is checking it`;
  world.bus.changed("finance", "personal");
  return item;
}

/** Gives a found account to a principal and records the routing rule. */
export function mapAccount(world: MockWorld, id: string, principal: string): StatementImport {
  const account = world.unmapped[id];
  if (!account) throw notFound("That account is already mapped.");
  world.unmapped = Object.fromEntries(Object.entries(world.unmapped).filter(([k]) => k !== id));
  const item: StatementImport = {
    id: `IM-${account.id.toLowerCase()}`,
    account: account.name,
    meta: "Mapped just now · waiting for its first statement",
    status: { status: "in_progress", label: "Waiting" },
  };
  (world.imports[principal] ??= {})[item.id] = item;
  const rule: Rule = {
    id: `RU-${world.ids(2)}`,
    kind: "routing",
    when: `Statements for ${account.name}`,
    then: `Principal ${world.fixtures.principal_names[principal]}`,
    source: "Mapped in Finance · just now",
  };
  world.rules[rule.id] = rule;
  world.bus.changed("finance", "personal");
  return item;
}

/** Asks for an import check or the monthly close; it becomes a work item. */
export function financeRequest(
  world: MockWorld,
  principal: string,
  kind: string,
): Schemas["WorkRequested"] {
  const [title, employee, now] = world.fixtures.request_words[kind] ?? ["", "", ""];
  const { stages, label } = world.fixtures.intake_stage;
  const item: Schemas["WorkItem"] = {
    id: `WI-${world.ids(2)}`,
    title: title.replace("{who}", world.fixtures.principal_names[principal] ?? ""),
    risk: "R0",
    status: { status: "in_progress", label },
    stages,
    progress: 0,
    employee_name: employee,
    department: "personal",
    employee_state: "thinking",
    now,
    eta: "Within the hour",
    cost_usd: 0,
    waiting_on_owner: false,
    priority: "normal",
    paused: false,
    rework_count: 0,
    product_id: null,
    thread_id: null,
    kind: "build",
  };
  world.work_items.push(item);
  world.bus.changed("work", "today");
  return { work_item_id: item.id, message: `Requested. ${item.id} is on Work.` };
}

// Setup ----------------------------------------------------------------------------------------

/** A fresh profile interview, before the first answer. */
export const freshInterview = (world: MockWorld): Schemas["Interview"] =>
  JSON.parse(JSON.stringify(world.fixtures.fresh_interview)) as Schemas["Interview"];

/** Saves one Setup secret; it always needs a step-up, and the value is never kept. */
export function saveSetupSecret(
  world: MockWorld,
  stepId: string,
  fieldId: string,
  value: string,
  stepUp: string | null,
): SetupStep {
  const step = world.setup[stepId];
  const field = step?.secrets.find((f) => f.id === fieldId);
  if (!step || !field) throw notFound("That secret isn't part of this step.");
  if (step.state === "waiting") throw conflict(`This step is waiting: ${step.waiting_on}.`);
  if (value.trim().length < world.constants.secret_min_length) {
    throw conflict("That looks too short. Paste the whole value.");
  }
  requireStepUp(world, stepUp, "Saving a secret connects an account, so it needs your passkey.");
  field.saved = true;
  if (step.secrets.every((f) => f.saved)) {
    step.state = "done";
    step.proof = world.fixtures.secret_proofs[stepId] ?? null;
  }
  world.bus.changed("setup", "today", "platform");
  return step;
}

function withInterview(world: MockWorld, id: string): [SetupStep, Schemas["Interview"]] {
  const step = world.setup[id];
  if (!step?.interview) throw notFound("That step has no interview.");
  if (step.state === "waiting") throw conflict(`This step is waiting: ${step.waiting_on}.`);
  return [step, step.interview];
}

/** Answers Atlas's current question; Atlas asks the next, or proposes what to save. */
export function interviewAnswer(world: MockWorld, id: string, text: string): SetupStep {
  const [step, interview] = withInterview(world, id);
  const answer = required(text, "Type an answer first.");
  if (interview.asked >= interview.total) {
    throw conflict("Every question is answered. Confirm, or start over.");
  }
  const questions = world.fixtures.interview_questions;
  interview.turns.push({ speaker: "owner", text: answer });
  interview.asked += 1;
  if (interview.asked < interview.total) {
    interview.turns.push({ speaker: "atlas", text: questions[interview.asked]?.[1] ?? "" });
  } else {
    const answers = interview.turns.filter((t) => t.speaker === "owner").map((t) => t.text);
    interview.facts = questions.map(([label], i) => `${label}: ${answers[i]}`);
    interview.turns.push({ speaker: "atlas", text: world.fixtures.interview_done });
  }
  world.bus.changed("setup");
  return step;
}

/** Saves the facts Atlas proposed; the step is then done. */
export function interviewConfirm(world: MockWorld, id: string): SetupStep {
  const [step, interview] = withInterview(world, id);
  if (interview.asked < interview.total) throw conflict("Answer every question first.");
  step.state = "done";
  step.proof = `${interview.facts.length} facts saved to your profile · Atlas uses them now`;
  world.bus.changed("setup", "today", "platform");
  return step;
}

/** Starts the interview over from the first question. */
export function interviewRestart(world: MockWorld, id: string): SetupStep {
  const [step] = withInterview(world, id);
  step.interview = freshInterview(world);
  if (step.state === "done") {
    step.state = "ready";
    step.proof = null;
  }
  world.bus.changed("setup", "today", "platform");
  return step;
}
