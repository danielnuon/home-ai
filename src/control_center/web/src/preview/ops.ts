/**
 * @file The preview's operations controls: pool mode, health checks, the pressure drill, pins,
 * selection, service logs, job times, restore drills, prune plans, findings and the metric
 * catalog. A port of `backends/mock/engine_ops.py`.
 */
import type { components } from "../api/schema";
import { conflict, notFound, refused } from "./errors";
import { schedule } from "./engine";
import type { MockWorld } from "./world";

type Schemas = components["schemas"];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STOPPED = "Everything is stopped. Resume first.";

/** Whether critical memory pressure has paused background work (spec 7.17). */
export const heavyWorkPaused = (world: MockWorld) => world.ops.pressure === "critical";

// System ---------------------------------------------------------------------------------------

/** Puts the model pool in another mode (spec 8.3). */
export function setPoolMode(world: MockWorld, mode: string): void {
  const ops = world.ops;
  if (mode === ops.pool_mode) throw conflict(`The pool is already in mode ${mode}.`);
  const allowed = world.fixtures.operations.owner_modes as string[];
  if (!allowed.includes(mode)) {
    throw conflict("Benchmark mode starts with a selection run, from Models.");
  }
  if (heavyWorkPaused(world) && mode !== "L") {
    throw conflict("Memory pressure is critical, so the pool stays in mode L.");
  }
  ops.pool_mode = mode as typeof ops.pool_mode;
  world.bus.changed("system", "models", "today");
}

/** Ends image or video mode; the pool returns to mode L. */
export function endPoolMode(world: MockWorld): void {
  if (world.ops.pool_mode !== "I") throw conflict("The pool isn't in image or video mode.");
  world.ops.pool_mode = "L";
  world.bus.changed("system", "models", "today");
}

/** Checks services, the audit chain, drives and the network now. */
export function runHealthCheck(world: MockWorld): void {
  const rows = world.fixtures.operations.health_checks;
  const worst = rows.some((row) => row.status && row.status.status !== "healthy");
  world.ops.health_check = {
    at: world.clock().toISOString(),
    summary: worst
      ? { status: "attention", label: "1 thing needs you" }
      : { status: "healthy", label: "All clear" },
    rows,
  };
  world.bus.changed("system");
}

/** Steps memory pressure to its next level, as a resilience drill does. */
export function pressureDrill(world: MockWorld): void {
  const ops = world.ops;
  ops.pressure = world.fixtures.operations.pressure_drill[ops.pressure];
  if (ops.pressure === "critical" && (ops.pool_mode === "S" || ops.pool_mode === "I")) {
    ops.pool_mode = "L";
  }
  world.bus.changed("platform", "system", "models", "live", "schedule", "today");
}

// Models ---------------------------------------------------------------------------------------

/** Pins a family's model through re-selection, or unpins it. */
export function pinFamily(world: MockWorld, family: string, pinned: boolean): void {
  if (!world.fixtures.operations.families.includes(family)) {
    throw notFound("That model family doesn't exist.");
  }
  const pins = world.ops.pins.filter((f) => f !== family);
  world.ops.pins = pinned ? [...pins, family] : pins;
  world.bus.changed("models");
}

/** Queues a selector run for the next window. */
export function runSelection(world: MockWorld): void {
  if (world.stopped) throw conflict(STOPPED);
  if (world.ops.selection_queued) throw conflict("A selection run is already queued.");
  world.ops.selection_queued = true;
  world.bus.changed("models", "schedule");
}

// Services -------------------------------------------------------------------------------------

/** A service's full masked log, newest first. */
export function serviceLog(world: MockWorld, id: string): Schemas["ServiceLog"] {
  const service = world.fixtures.service_groups
    .flatMap((group) => group.services)
    .find((s) => s.id === id);
  if (!service) throw notFound("That service doesn't exist.");
  return {
    id: service.id,
    name: service.name,
    meta: service.meta,
    status: service.status,
    restartable: service.restartable,
    retained: world.fixtures.operations.log_retained,
    lines: world.fixtures.operations.service_logs[service.id] ?? [],
  };
}

// Schedule -------------------------------------------------------------------------------------

/** Moves a job to another start time, keeping its days. */
export function setJobTime(world: MockWorld, id: string, time: string) {
  const job = world.jobs[id];
  if (!job) throw notFound("That job doesn't exist.");
  if (job.time === null || job.time === undefined) {
    throw conflict(`${job.name} runs every few minutes; it has no start time.`);
  }
  if (!TIME.test(time)) throw refused("A start time is HH:MM, such as 23:30.");
  const clash = Object.values(world.jobs).find(
    (other) => other.id !== job.id && job.heavy && other.heavy && other.time === time,
  );
  if (clash) {
    throw conflict(
      `${clash.name} already starts at ${time}. Heavy jobs take the maintenance lock one at a time.`,
    );
  }
  job.when = job.when.replace(job.time, time);
  if (job.next_run === job.time) job.next_run = time;
  job.time = time;
  world.bus.changed("schedule");
  return schedule(world);
}

// Backups --------------------------------------------------------------------------------------

/** Restores into a scratch folder and checks it; the mock's drill passes at once. */
export function runRestoreDrill(world: MockWorld): void {
  if (world.stopped) throw conflict(STOPPED);
  const detail = world.fixtures.operations.drill_detail;
  const passed = { status: "healthy", label: "Passed" } as const;
  world.ops.drills = [
    { id: `drill-${world.ids(2)}`, title: "Today", meta: detail, status: passed, href: null },
    ...world.ops.drills,
  ];
  world.ops.drill = { status: passed, detail: `Today · ${detail}` };
  world.bus.changed("backups", "schedule");
}

/** Works out what a prune would remove under the retention rules. Removes nothing. */
export function makePrunePlan(world: MockWorld): void {
  const o = world.fixtures.operations;
  world.ops.prune_plan = {
    id: `PP-${world.ids(2)}`,
    created_at: world.clock().toISOString(),
    removes: o.prune_removes,
    frees: o.prune_frees,
    keeps: o.prune_keeps,
  };
  world.bus.changed("backups");
}

/** Puts the plan away without pruning. */
export function discardPrunePlan(world: MockWorld): void {
  if (!world.ops.prune_plan) throw conflict("There's no prune plan to discard.");
  world.ops.prune_plan = null;
  world.bus.changed("backups");
}

// Maintenance ----------------------------------------------------------------------------------

function finding(world: MockWorld, id: string) {
  const found = world.ops.findings[id];
  if (!found) throw notFound("That finding isn't in the register.");
  return found;
}

/** Closes a finding as won't-fix; it stays in the register with the reason. */
export function wontFix(world: MockWorld, id: string, reason: string) {
  const found = finding(world, id);
  if (!reason.trim()) {
    throw conflict("Say why it won't be fixed; the reason stays on the finding.");
  }
  if (found.state === "wont_fix") throw conflict("That finding is already marked won't-fix.");
  found.state = "wont_fix";
  found.reason = reason.trim();
  world.bus.changed("maintenance");
  return found;
}

/** Reopens a won't-fix finding; the Undo of marking it. */
export function reopenFinding(world: MockWorld, id: string) {
  const found = finding(world, id);
  if (found.state === "open") throw conflict("That finding is already open.");
  found.state = "open";
  found.reason = null;
  world.bus.changed("maintenance");
  return found;
}

// Metric catalog -------------------------------------------------------------------------------

/** The metric catalog with 7- and 30-day trends, for one page (spec 7.18). */
export function metrics(world: MockWorld, page: string): Schemas["MetricCatalog"] {
  const o = world.fixtures.operations;
  const areas = o.page_areas[page];
  return { groups: o.metric_catalog.filter((g) => !areas || areas.includes(g.area)) };
}
