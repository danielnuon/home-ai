/**
 * @file The live summary shared by Today and Live: the activity field, the total token rate, and
 * who is doing what.
 */
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import type { LiveTask } from "../api/types";
import { Avatar } from "./Avatar";
import { Counter } from "./Counter";

/** three.js is only fetched on pages that show the field (spec 7.17). */
const ActivityField = lazy(() => import("./ActivityField"));

/** The total rate of everything generating right now. */
function totalRate(tasks: LiveTask[]): number {
  return tasks.reduce((sum, task) => sum + (task.tokens_per_second ?? 0), 0);
}

/** One running or queued task, with its employee's face. */
export function TaskLine({ task }: { task: LiveTask }) {
  return (
    <>
      <Avatar
        department={task.department}
        state={task.state}
        name={task.employee_name}
        size={32}
        rate={task.tokens_per_second}
      />
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">
          {task.employee_name} · {task.item}
        </span>
        <span className="muted small">{task.paused ? "Paused" : task.doing}</span>
      </span>
      {task.tokens_per_second !== null && (
        <span className="small">
          <Counter value={task.tokens_per_second} suffix=" tok/s" />
        </span>
      )}
    </>
  );
}

/** The field and the running tasks, linking each to its transcript on Live. */
export function LiveCard({ tasks, linkTo = "/live" }: { tasks: LiveTask[]; linkTo?: string }) {
  const running = tasks.filter((task) => !task.queued);
  const queued = tasks.length - running.length;
  return (
    <section className="card stack field-card" aria-label="Live">
      <div className="section-head">
        <h2>
          <Link to={linkTo} className="plain-link">
            Live
          </Link>
        </h2>
        <span className="small">
          <Counter value={totalRate(running)} suffix=" tok/s" /> · {running.length} running
          {queued > 0 && ` · ${queued} queued`}
        </span>
      </div>
      <Suspense fallback={<div className="activity-field" />}>
        <ActivityField tasks={tasks} />
      </Suspense>
      <div className="list">
        {running.map((task) => (
          <Link key={task.id} to={`/live?task=${task.id}`} className="list-row">
            <TaskLine task={task} />
          </Link>
        ))}
      </div>
    </section>
  );
}
