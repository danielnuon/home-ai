/**
 * @file The Live widget on Today (decision 126): the same deck as the top of Live (the total token
 * rate, its waveform and every session's face in orbit), then who is doing what.
 */
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { LiveTask } from "../api/types";
import { Avatar } from "./Avatar";
import { Counter } from "./Counter";
import { LiveDeck } from "./LiveDeck";

/** One running or queued task, with its employee's face. */
function TaskLine({ task }: { task: LiveTask }) {
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
        <span className="muted small">
          {task.session_state === "paused" ? "Paused" : task.doing}
        </span>
      </span>
      {task.tokens_per_second !== null && (
        <span className="small">
          <Counter value={task.tokens_per_second} suffix=" tok/s" />
        </span>
      )}
    </>
  );
}

/** The deck and the running tasks, linking each to its transcript on Live. */
export function LiveCard({ tasks }: { tasks: LiveTask[] }) {
  const running = tasks.filter((task) => task.session_state === "running");
  const queued = tasks.filter((task) => task.session_state === "queued").length;
  return (
    <section className="card stack field-card" aria-label="Live">
      <Link to="/live" className="section-head section-link">
        <h2>Live</h2>
        <span className="section-cue">
          {running.length} running
          {queued > 0 && ` · ${queued} queued`}
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </Link>
      <LiveDeck tasks={tasks} />
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
