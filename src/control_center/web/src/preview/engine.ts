/**
 * @file The preview engine's personal records, Setup, schedule, maintenance, docs and search.
 * A port of `backends/mock/engine.py`.
 */
import type {
  Case,
  MaintenanceOverview,
  PersonalOverview,
  ScheduleOverview,
  SearchResults,
  SetupStep,
} from "../api/types";
import { conflict, notFound } from "./errors";
import { setting, type MockWorld } from "./world";

const CASE_STATE_AFTER: Record<string, Case["state"]> = {
  done: "done",
  snooze: "snoozed",
  reopen: "open",
};

/** Open and snoozed cases, domains and recent automatic changes. */
export function personal(world: MockWorld): PersonalOverview {
  return {
    cases: Object.values(world.cases).filter((c) => c.state !== "done"),
    domains: world.fixtures.domains,
    recent_changes: Object.values(world.changes),
  };
}

/** Marks a case done, snoozes it, or reopens it. */
export function caseAction(world: MockWorld, id: string, action: string): Case {
  const found = world.cases[id];
  const next = CASE_STATE_AFTER[action];
  if (!found) throw notFound("That case no longer exists.");
  if (next) found.state = next;
  world.bus.changed("personal", "today");
  return found;
}

/** Undoes an automatic change. */
export function undoChange(world: MockWorld, id: string): PersonalOverview {
  const change = world.changes[id];
  if (!change) throw notFound("That change is too old to undo here; see History.");
  change.undone = true;
  world.bus.changed("personal");
  return personal(world);
}

/** Defers or resumes a step, or records that the Owner started it. */
export function setupAction(world: MockWorld, id: string, action: string): SetupStep {
  const step = world.setup[id];
  if (!step) throw notFound("That Setup step doesn't exist.");
  if (step.state === "waiting") throw conflict(`This step is waiting: ${step.waiting_on}.`);
  if (action === "defer") step.state = "deferred";
  if (action === "resume" || action === "redo") {
    step.state = "ready";
    step.proof = null;
  }
  world.bus.changed("setup", "today", "platform");
  return step;
}

/** Jobs, the maintenance lock and quiet hours. */
export function schedule(world: MockWorld): ScheduleOverview {
  return {
    now: "22:45",
    lock: { status: "healthy", label: "Free · next taken by Snapshots at 23:30" },
    quiet_hours: setting(world, "quiet_hours"),
    jobs: Object.values(world.jobs),
  };
}

function job(world: MockWorld, id: string) {
  const found = world.jobs[id];
  if (!found) throw notFound("That job doesn't exist.");
  return found;
}

/** Pauses or resumes a job. */
export function setJobPaused(world: MockWorld, id: string, paused: boolean): ScheduleOverview {
  job(world, id).paused = paused;
  world.bus.changed("schedule");
  return schedule(world);
}

/** Runs a job now; refused while everything is stopped. */
export function runJob(world: MockWorld, id: string): ScheduleOverview {
  const found = job(world, id);
  if (world.stopped) throw conflict("Everything is stopped. Resume first.");
  found.last_run = { status: "healthy", label: "ok · just now" };
  world.bus.changed("schedule", "backups");
  return schedule(world);
}

/** Pipeline C's state, last batch and findings. */
export function maintenance(world: MockWorld): MaintenanceOverview {
  return {
    running: world.maintenance_running,
    summary: "Custodian · 2 products scanned, 2 with fixes on · 0 reverts in 30 days",
    stats: world.fixtures.maintenance_stats,
    batch: Object.values(world.fixes),
    findings: world.fixtures.findings,
  };
}

/** Pauses or resumes Pipeline C. */
export function setMaintenanceRunning(world: MockWorld, running: boolean): MaintenanceOverview {
  world.maintenance_running = running;
  world.bus.changed("maintenance");
  return maintenance(world);
}

/** Reverts a fix, or undoes the revert. */
export function toggleFixReverted(world: MockWorld, id: string): MaintenanceOverview {
  const fix = world.fixes[id];
  if (!fix) throw notFound("That fix isn't in the last batch.");
  fix.reverted = !fix.reverted;
  world.bus.changed("maintenance");
  return maintenance(world);
}

/** Case-insensitive substring search over the fixture index, with Wayfinder's answer. */
export function search(world: MockWorld, query: string): SearchResults {
  const needle = query.trim().toLowerCase();
  const sections = world.fixtures.search_index.map((section) => ({
    name: section.name,
    results: section.results.filter(
      (hit) => hit.title.toLowerCase().includes(needle) || hit.meta.toLowerCase().includes(needle),
    ),
  }));
  const answer = Object.entries(world.fixtures.wayfinder_answers).find(
    ([word]) => needle && needle.includes(word),
  );
  return {
    query,
    answer: answer?.[1] ?? null,
    sections: needle ? sections.filter((section) => section.results.length > 0) : [],
  };
}
