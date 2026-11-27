/**
 * @file The preview engine's work tracking: sessions, threads, the Work board and the Directory.
 * A port of `backends/mock/engine_work.py` and `threads.py`. Thread and employee states are
 * derived each time they are read, never stored (spec 15.8.3).
 */
import type {
  Directory,
  Employee,
  Intervention,
  LiveTask,
  SessionState,
  TaskDetail,
  Thread,
  ThreadsOverview,
  WorkBoard,
} from "../api/types";
import { conflict, notFound } from "./errors";
import type { MockWorld, ThreadRecord } from "./world";

const SESSION_PAGES = ["live", "today", "work", "directory", "chat"];
/** The resources that show thread states or count running sessions. */
export const THREAD_PAGES = [...SESSION_PAGES, "platform"];

/** A session's state from its recorded facts; the first that applies wins. */
export function sessionState(task: LiveTask): SessionState {
  if (task.paused) return "paused";
  if (task.blocked_code) return "blocked";
  if (task.waiting_on) return "waiting";
  return task.queued ? "queued" : "running";
}

const shownTask = (task: LiveTask): LiveTask => ({ ...task, session_state: sessionState(task) });

/** Running tasks first. While the kill switch is on, every task shows as paused. */
export function liveTasks(world: MockWorld): LiveTask[] {
  const tasks = Object.values(world.tasks).sort((a, b) => Number(a.queued) - Number(b.queued));
  const shown = world.stopped
    ? tasks.map((task) => ({ ...task, paused: true, tokens_per_second: null }))
    : tasks;
  return shown.map(shownTask);
}

function taskRecord(world: MockWorld, id: string): LiveTask {
  const task = world.tasks[id];
  if (!task) throw notFound("That task has finished or never existed.");
  return task;
}

/** The task, its stage rail if it belongs to a work item, and its transcript. */
export function taskDetail(world: MockWorld, id: string): TaskDetail {
  const task = taskRecord(world, id);
  const stage = world.fixtures.task_stages[id];
  return {
    task: shownTask(task),
    stage_rail: stage === undefined ? [] : (world.fixtures.stage_rails[stage] ?? []),
    transcript: world.transcripts[id] ?? [],
  };
}

function appendOwnerNote(world: MockWorld, taskId: string, text: string): void {
  const entry = { id: `N-${world.ids(3)}`, kind: "owner_note" as const, text, done: true };
  (world.transcripts[taskId] ??= []).push(entry);
  world.bus.publish("transcript.append", { task_id: taskId, entry });
}

/** What each intervention does to the task, after any note is written. */
const EFFECTS: Record<Intervention["kind"], (task: LiveTask) => void> = {
  note: () => undefined,
  pause: (task) => {
    task.paused = true;
  },
  resume: (task) => {
    task.paused = false;
  },
  redirect: (task) => {
    task.doing = "is restarting with your note";
    task.paused = false;
  },
  stop: () => undefined,
};

/** Applies a note, pause, resume, redirect or stop (spec 7.10). */
export function intervene(world: MockWorld, id: string, step: Intervention): TaskDetail {
  const task = taskRecord(world, id);
  const writes = step.kind === "note" || step.kind === "redirect";
  if (writes && !(step.text ?? "").trim()) throw conflict("Write the note first.");
  if (writes) appendOwnerNote(world, id, step.text ?? "");
  EFFECTS[step.kind](task);
  if (step.kind === "stop") {
    Reflect.deleteProperty(world.tasks, id);
    world.bus.changed(...SESSION_PAGES, "platform");
    return { task: shownTask(task), stage_rail: [], transcript: [] };
  }
  world.bus.changed(...SESSION_PAGES);
  return taskDetail(world, id);
}

// Thread states (threads.py) -------------------------------------------------------------------

type Derived = [Thread["state"], string] | null;

function blocked(world: MockWorld, sessions: LiveTask[]): Derived {
  const code = sessions.find((s) => s.blocked_code)?.blocked_code;
  return code ? ["blocked", world.constants.blocked_words[code] ?? ""] : null;
}

function needsOwner(record: ThreadRecord, sessions: LiveTask[], pending: boolean): Derived {
  if (record.owner_decision !== null) return ["needs_owner", record.owner_decision];
  if (pending) return ["needs_owner", "An approval is waiting for you."];
  const asking = sessions.find((s) => s.waiting_on === "owner");
  return asking ? ["needs_owner", `${asking.employee_name} ${asking.doing}`] : null;
}

function paused(sessions: LiveTask[]): Derived {
  return sessions.length > 0 && sessions.every((s) => s.paused)
    ? ["paused", "Paused. Nothing runs until it is resumed."]
    : null;
}

function working(sessions: LiveTask[]): Derived {
  const active = sessions.filter((s) => ["running", "queued"].includes(sessionState(s)));
  const first = active[0];
  if (!first) return null;
  const others = active.length > 1 ? ` · ${active.length - 1} more` : "";
  return ["working", `${first.employee_name} ${first.doing}${others}`];
}

function waiting(world: MockWorld, record: ThreadRecord, sessions: LiveTask[]): Derived {
  const on = sessions.find((s) => s.waiting_on)?.waiting_on;
  if (record.waiting_for !== null) return ["waiting", `Waiting on ${record.waiting_for}`];
  if (on && on !== "owner") return ["waiting", `Waiting on ${world.constants.waiting_words[on]}`];
  return null;
}

function derive(
  world: MockWorld,
  record: ThreadRecord,
  sessions: LiveTask[],
  pending: boolean,
): [Thread["state"], string] {
  if (record.outcome !== null) return ["resolved", record.outcome];
  const review: Derived =
    record.proposed_resolution === null ? null : ["review_ready", record.proposed_resolution];
  return (
    blocked(world, sessions) ??
    needsOwner(record, sessions, pending) ??
    paused(sessions) ??
    working(sessions) ??
    review ??
    waiting(world, record, sessions) ?? ["idle", `Idle since ${record.since}`]
  );
}

function shownThread(world: MockWorld, record: ThreadRecord, sessions: LiveTask[]): Thread {
  const card = world.approvals[record.approval_id ?? ""];
  const pending = card !== undefined && card.state === "pending";
  const own = sessions.filter((s) => s.thread_id === record.id);
  const [state, detail] = derive(world, record, own, pending);
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    unit_id: record.unit_id,
    lead_id: record.lead_id,
    lead_name: record.lead_name,
    lead_department: record.lead_department,
    pipeline: record.pipeline,
    principal: record.principal,
    state,
    detail,
    since: record.since,
    closing_summary: state === "review_ready" ? record.proposed_resolution : null,
    approval_id: pending ? record.approval_id : null,
  };
}

/** Open threads in state order, then the resolved ones. */
export function threads(world: MockWorld): ThreadsOverview {
  const sessions = liveTasks(world);
  const every = Object.values(world.threads).map((r) => shownThread(world, r, sessions));
  const order = world.constants.state_order;
  return {
    open: every
      .filter((t) => t.state !== "resolved")
      .sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state)),
    recently_resolved: every.filter((t) => t.state === "resolved"),
  };
}

function threadRecord(world: MockWorld, id: string): ThreadRecord {
  const record = world.threads[id];
  if (!record) throw notFound("That thread doesn't exist.");
  return record;
}

/** Resolves a thread and ends its sessions; refused while it waits on the Owner. */
export function resolveThread(world: MockWorld, id: string): Thread {
  const record = threadRecord(world, id);
  const shown = shownThread(world, record, liveTasks(world));
  if (shown.state === "resolved") throw conflict("This thread is already resolved.");
  if (shown.state === "needs_owner") {
    throw conflict("This thread is waiting on your decision. Answer that first.");
  }
  record.outcome = record.proposed_resolution ?? "Resolved by you.";
  for (const task of Object.values(world.tasks)) {
    if (task.thread_id === id) Reflect.deleteProperty(world.tasks, task.id);
  }
  world.bus.changed(...THREAD_PAGES);
  return shownThread(world, record, []);
}

/** Reopens a resolved thread with no session. */
export function reopenThread(world: MockWorld, id: string): Thread {
  const record = threadRecord(world, id);
  if (record.outcome === null) throw conflict("This thread is already open.");
  record.outcome = null;
  record.proposed_resolution = null;
  world.bus.changed(...THREAD_PAGES);
  return shownThread(world, record, liveTasks(world));
}

// Work board and Directory ---------------------------------------------------------------------

/** Threads, work items, ideas and reviews. */
export function workBoard(world: MockWorld): WorkBoard {
  return {
    threads: threads(world),
    items: world.work_items,
    ideas: world.fixtures.ideas,
    reviews: world.fixtures.reviews,
  };
}

function employeeStatus(world: MockWorld, employee: Employee, sessions: LiveTask[]) {
  if (world.fixtures.not_yet_hired.includes(employee.id)) return "not_yet_hired" as const;
  if (!employee.enabled) return "disabled" as const;
  const own = sessions.filter((s) => s.employee_id === employee.id);
  const states = new Set(own.map(sessionState));
  if (states.has("running")) return "active_now" as const;
  if (states.has("blocked")) return "blocked" as const;
  if (own.some((s) => s.waiting_on === "owner")) return "waiting_on_owner" as const;
  return states.has("paused") ? ("paused" as const) : ("idle" as const);
}

/** Employees with their status rolled up from sessions. */
export function directory(world: MockWorld): Directory {
  const sessions = liveTasks(world);
  return {
    employees: Object.values(world.employees).map((employee) => ({
      ...employee,
      status: employeeStatus(world, employee, sessions),
    })),
    proposals: Object.values(world.proposals),
    instruments: world.constants.instrument_count,
  };
}
