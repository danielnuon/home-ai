/**
 * @file Today in one response, composed from every preview backend. A port of `today.py`.
 */
import type { TodayOverview } from "../api/types";
import { listApprovals, listDecisions } from "./gate";
import { liveTasks, threads } from "./work";
import { healthMetrics, spend, subsystemTiles } from "./status";
import type { MockWorld } from "./world";

const OWNER_TIME_ZONE = "America/Los_Angeles";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function ownerDate(now: Date): { date: string; hour: number } {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: OWNER_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: OWNER_TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return { date, hour };
}

/** Gathers Today's sections from the gate, the engine and the status aggregator. */
export function buildToday(world: MockWorld): TodayOverview {
  const { needs_you_shown: needsShown, team_shown: teamShown } = world.constants;
  const approvals = listApprovals(world).filter((a) => a.state === "pending");
  const open = threads(world).open;
  const asking = open.filter((t) => t.state === "needs_owner" && t.approval_id === null);
  const tasks = liveTasks(world);
  const required = Object.values(world.setup).filter((step) => step.required);
  const requiredDone = required.filter((step) => step.state === "done").length;
  const money = spend(world);
  const { date, hour } = ownerDate(world.clock());
  return {
    date,
    greeting: greeting(hour),
    open_decision: listDecisions(world).find((d) => d.open) ?? null,
    needs_you: approvals.slice(0, needsShown),
    needs_you_threads: asking,
    needs_you_count: approvals.length + asking.length,
    blocked_threads: open.filter((t) => t.state === "blocked").length,
    review_ready_threads: open.filter((t) => t.state === "review_ready").length,
    agenda: world.fixtures.agenda,
    team: tasks.slice(0, teamShown).map((task) => ({
      id: task.employee_id,
      name: task.employee_name,
      department: task.department,
      state: task.state,
      doing: task.doing,
      tokens_per_second: task.tokens_per_second,
    })),
    tasks,
    tiles: subsystemTiles(world, money),
    metrics: healthMetrics(world),
    setup:
      requiredDone === required.length
        ? null
        : { required_done: requiredDone, required_total: required.length },
    spend_label: `$${money.total_usd.toFixed(2)} this month`,
  };
}
