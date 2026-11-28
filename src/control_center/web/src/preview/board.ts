/**
 * @file The preview engine's Work boards: ideas, work items, products, item pages, moves and
 * suggested roles. A port of `backends/mock/engine_board.py`; every change is an Owner command.
 */
import type { components } from "../api/schema";
import type { Thread, WorkBoard, WorkItem } from "../api/types";
import { conflict, notFound } from "./errors";
import { liveTasks, shownThread, THREAD_PAGES, threadRecord, threads } from "./work";
import type { MockWorld } from "./world";

type Schemas = components["schemas"];
type Idea = Schemas["Idea"];
type Product = Schemas["Product"];
type Priority = Idea["priority"];

const BOARD_PAGES = ["work", "today"];

const currentStage = (item: WorkItem) =>
  item.stages.find((stage) => stage.state === "current")?.code ?? "D0";

/** The item as the boards show it: a paused item says so in its status (spec 7.10). */
function shownItem(item: WorkItem): WorkItem {
  if (!item.paused) return item;
  const phase = item.status.label.split(" · ")[0] ?? "";
  return {
    ...item,
    status: { status: "neutral", label: `${phase} · Paused` },
    now: "Paused by you. Nothing runs until you resume it.",
  };
}

/** Highest priority first, then in fixture order (`Array.sort` is stable). */
function byPriority<T extends { priority: Priority }>(world: MockWorld, items: T[]): T[] {
  const order = world.constants.priority_order;
  return [...items].sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
}

function shownProduct(world: MockWorld, product: Product): Product {
  const wip = world.work_items.filter(
    (item) =>
      item.product_id === product.id && world.constants.wip_stages.includes(currentStage(item)),
  ).length;
  return { ...product, wip };
}

/** Threads, work items, ideas, reviews and products, with work in progress counted. */
export function workBoard(world: MockWorld): WorkBoard {
  const items = world.work_items.map(shownItem);
  return {
    threads: threads(world),
    items: byPriority(world, items),
    ideas: byPriority(world, Object.values(world.ideas)),
    reviews: world.fixtures.reviews,
    products: Object.values(world.products).map((p) => shownProduct(world, p)),
    wip: {
      in_progress: items.filter((i) => world.constants.wip_stages.includes(currentStage(i))).length,
      limit: world.constants.wip_global,
    },
    leads: Object.entries(world.fixtures.thread_leads).map(
      ([id, [name, department, pipeline]]) => ({
        id,
        name,
        department,
        pipeline,
      }),
    ),
  };
}

// Ideas -----------------------------------------------------------------------------------------

function ideaRecord(world: MockWorld, id: string): Idea {
  const idea = world.ideas[id];
  if (!idea) throw notFound("That idea doesn't exist.");
  return idea;
}

function openIdea(world: MockWorld, id: string): Idea {
  const idea = ideaRecord(world, id);
  if (idea.withdrawn) throw conflict("This idea was withdrawn. Reopen it first.");
  return idea;
}

function leadOf(world: MockWorld, leadId: string) {
  const [name, department, pipeline] = world.fixtures.thread_leads[leadId] ?? [];
  if (!name || !department || !pipeline) throw notFound("There's no lead by that name.");
  return { name, department, pipeline };
}

interface NewRecord {
  id: string;
  title: string;
  leadId: string;
  kind: Thread["kind"];
  unitId: string;
  approvalId?: string | null;
}

/** A new thread record with nothing recorded about it yet. */
function newRecord(
  world: MockWorld,
  { id, title, leadId, kind, unitId, approvalId = null }: NewRecord,
) {
  const lead = leadOf(world, leadId);
  world.threads[id] = {
    id,
    title,
    kind,
    unit_id: unitId,
    lead_id: leadId,
    lead_name: lead.name,
    lead_department: lead.department,
    pipeline: lead.pipeline,
    principal: "owner",
    since: "today",
    owner_decision: null,
    approval_id: approvalId,
    proposed_resolution: null,
    waiting_for: null,
    outcome: null,
    branched_from: null,
    temporary_until: null,
    learning: true,
    paused: false,
    archived: false,
  };
}

/** Captures a new idea and opens its thread with the Ideation Lead (spec 16.1). */
export function submitIdea(world: MockWorld, title: string, summary: string): Idea {
  const trimmed = title.trim();
  if (!trimmed) throw conflict("Give the idea a title first.");
  const token = world.ids(2);
  const leadId = world.constants.idea_lead;
  const idea: Idea = {
    id: `ID-${token}`,
    title: trimmed,
    state: "Captured",
    lead: leadOf(world, leadId).name,
    summary: summary.trim(),
    priority: "normal",
    paused: false,
    withdrawn: false,
    thread_id: `TH-${token}`,
  };
  newRecord(world, { id: `TH-${token}`, title: trimmed, leadId, kind: "idea", unitId: idea.id });
  world.ideas = { [idea.id]: idea, ...world.ideas };
  world.bus.changed(...THREAD_PAGES);
  return idea;
}

/** Changes an idea's title or description; its thread takes the new title. */
export function editIdea(world: MockWorld, id: string, title: string, summary: string): Idea {
  const idea = openIdea(world, id);
  const trimmed = title.trim();
  if (!trimmed) throw conflict("Give the idea a title first.");
  idea.title = trimmed;
  idea.summary = summary.trim();
  const record = world.threads[idea.thread_id ?? ""];
  if (record) record.title = trimmed;
  world.bus.changed(...THREAD_PAGES);
  return idea;
}

function endSessions(world: MockWorld, threadId: string): void {
  for (const task of Object.values(world.tasks)) {
    if (task.thread_id === threadId) Reflect.deleteProperty(world.tasks, task.id);
  }
}

/** Withdraws an idea: its thread resolves as withdrawn and its sessions end. */
export function withdrawIdea(world: MockWorld, id: string): Idea {
  const idea = openIdea(world, id);
  idea.withdrawn = true;
  const record = world.threads[idea.thread_id ?? ""];
  if (record) {
    record.outcome = "Withdrawn by you.";
    endSessions(world, record.id);
  }
  world.bus.changed(...THREAD_PAGES);
  return idea;
}

/** Reopens a withdrawn idea; its thread opens again with no session. */
export function reopenIdea(world: MockWorld, id: string): Idea {
  const idea = ideaRecord(world, id);
  if (!idea.withdrawn) throw conflict("This idea is already open.");
  idea.withdrawn = false;
  const record = world.threads[idea.thread_id ?? ""];
  if (record) record.outcome = null;
  world.bus.changed(...THREAD_PAGES);
  return idea;
}

/** Pauses or resumes a thread and every session on it. */
function holdThread(world: MockWorld, threadId: string | null, paused: boolean): void {
  const record = world.threads[threadId ?? ""];
  if (record) record.paused = paused;
  for (const task of Object.values(world.tasks)) {
    if (threadId && task.thread_id === threadId) task.paused = paused;
  }
  world.bus.changed(...THREAD_PAGES);
}

/** Pauses or resumes an idea's analysis. */
export function setIdeaPaused(world: MockWorld, id: string, paused: boolean): Idea {
  const idea = openIdea(world, id);
  idea.paused = paused;
  holdThread(world, idea.thread_id, paused);
  return idea;
}

/** Moves an idea up or down the ideas board. */
export function setIdeaPriority(world: MockWorld, id: string, priority: Priority): Idea {
  const idea = openIdea(world, id);
  idea.priority = priority;
  world.bus.changed(...BOARD_PAGES);
  return idea;
}

// Work items ------------------------------------------------------------------------------------

function itemRecord(world: MockWorld, id: string): WorkItem {
  const item = world.work_items.find((candidate) => candidate.id === id);
  if (!item) throw notFound("That work item doesn't exist.");
  return item;
}

/** Pauses or resumes a work item; its sessions hold at the next step boundary. */
export function setItemPaused(world: MockWorld, id: string, paused: boolean): WorkItem {
  const item = itemRecord(world, id);
  item.paused = paused;
  holdThread(world, item.thread_id, paused);
  return shownItem(item);
}

/** Moves a work item up or down its pipeline's queue. */
export function setItemPriority(world: MockWorld, id: string, priority: Priority): WorkItem {
  const item = itemRecord(world, id);
  item.priority = priority;
  world.bus.changed(...BOARD_PAGES);
  return shownItem(item);
}

/** A work item's page: stage history, gates, its review's diff and its transcripts. */
export function itemDetail(world: MockWorld, id: string): Schemas["WorkItemDetail"] {
  const item = itemRecord(world, id);
  const product = world.products[item.product_id ?? ""];
  const f = world.fixtures;
  const sessions = liveTasks(world).filter(
    (task) => task.thread_id !== null && task.thread_id === item.thread_id,
  );
  return {
    item: shownItem(item),
    product: product ? shownProduct(world, product) : null,
    history: f.item_history[id] ?? f.new_item_history,
    gates: f.item_gates[id] ?? f.new_item_gates,
    review: f.reviews.find((review) => review.item_id === id) ?? null,
    diff: f.item_diffs[id] ?? [],
    transcripts: sessions.map((task) => ({
      task_id: task.id,
      employee_name: task.employee_name,
      department: task.department,
      doing: task.doing,
      entries: world.transcripts[task.id] ?? [],
    })),
  };
}

// Products --------------------------------------------------------------------------------------

/** The retirement's approval card (class P): nothing stops until the Owner approves it. */
function retirementCard(world: MockWorld, id: string, title: string): Schemas["Approval"] {
  return {
    id,
    title,
    employee_name: "Foreman",
    department: "governance",
    domain: "Development",
    data_class: "internal",
    approval_class: "P",
    tier: null,
    principal: "Owner",
    recipient: null,
    recipient_trust: null,
    contact_id: null,
    pipeline: "Development",
    batch: null,
    summary: world.constants.retirement_summary,
    draft: null,
    release: null,
    expires_at: null,
    needs_step_up: false,
    state: "pending",
    decided_note: null,
    undo_until: null,
  };
}

/** Asks Foreman to retire a released product: its retirement work item and approval card. */
export function retireProduct(world: MockWorld, id: string): WorkItem {
  const product = world.products[id];
  if (!product) throw notFound("That product doesn't exist.");
  if (product.state !== "released") throw conflict(`${product.name} is already being retired.`);
  const token = world.ids(2);
  const [approvalId, threadId, title] = [`AP-${token}`, `TH-${token}`, `Retire ${product.name}`];
  const item: WorkItem = {
    id: `WI-${token}`,
    title,
    risk: "R1",
    status: { status: "attention", label: world.fixtures.retirement_label },
    stages: world.fixtures.intake_stage.stages,
    progress: 0,
    employee_name: "Foreman",
    department: "governance",
    employee_state: "waiting",
    now: "Foreman needs your yes to retire it",
    eta: "Waits for your approval",
    cost_usd: 0,
    waiting_on_owner: true,
    priority: "normal",
    paused: false,
    rework_count: 0,
    product_id: product.id,
    thread_id: threadId,
    kind: "retirement",
  };
  world.approvals[approvalId] = retirementCard(world, approvalId, title);
  newRecord(world, {
    id: threadId,
    title,
    leadId: "foreman",
    kind: "work_item",
    unitId: item.id,
    approvalId,
  });
  world.work_items.push(item);
  product.state = "retiring";
  world.bus.changed(...THREAD_PAGES, "approvals");
  return item;
}

// Threads and roles -----------------------------------------------------------------------------

/** Moves a misrouted thread to another lead (spec 15.8.5); moving it back is the Undo. */
export function moveThread(world: MockWorld, id: string, leadId: string): Thread {
  const record = threadRecord(world, id);
  const lead = leadOf(world, leadId);
  if (record.outcome !== null) throw conflict("This thread is resolved. Reopen it first.");
  if (record.lead_id === leadId) throw conflict(`This thread is already with ${lead.name}.`);
  record.lead_id = leadId;
  record.lead_name = lead.name;
  record.lead_department = lead.department;
  record.pipeline = lead.pipeline;
  world.bus.changed(...THREAD_PAGES);
  return shownThread(world, record, liveTasks(world));
}

/** Turns the Owner's suggested role into an open lifecycle proposal for Cadence. */
export function suggestRole(
  world: MockWorld,
  title: string,
  reason: string,
): Schemas["LifecycleProposal"] {
  const trimmed = title.trim();
  if (!trimmed) throw conflict("Name the role first.");
  const why = reason.trim();
  const proposal: Schemas["LifecycleProposal"] = {
    id: `LP-${world.ids(2)}`,
    text: `New role: ${trimmed}.${why ? ` ${why}` : ""}`,
    source: world.constants.role_source,
    state: "open",
  };
  world.proposals[proposal.id] = proposal;
  world.bus.changed("directory");
  return proposal;
}
