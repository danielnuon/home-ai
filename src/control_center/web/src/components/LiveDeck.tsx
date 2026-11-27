/**
 * @file The deck at the top of Live (spec 7.13, "What alive looks like"; decision 125).
 *
 * A dark panel that shows the whole system breathing at once: the total token rate as a number
 * and as a waveform of the last half minute, and every open session as a face in orbit around a
 * pulsing core. Faces that are writing sit closest, glow, and have a thread of light running into
 * the core at their own rate; faces that wait, are blocked or are queued sit further out and
 * dimmer. Under it, the filters say how many sessions are in each state and narrow the feed.
 *
 * Budget (7.17): the waveform samples once a second, everything else is CSS transforms and
 * opacity, and with reduced motion the deck holds still.
 */
import { useEffect, useRef, useState } from "react";
import type { LiveTask } from "../api/types";
import { Avatar } from "./Avatar";
import { Counter } from "./Counter";

/** The filters under the deck, in the order they are listed. */
export const FILTERS = ["all", "needs", "running", "waiting", "queued"] as const;
/** One of the filters. */
export type Filter = (typeof FILTERS)[number];

const FILTER_WORDS: Record<Filter, string> = {
  all: "All",
  needs: "Needs you",
  running: "Running",
  waiting: "Waiting",
  queued: "Queued",
};

/** Whether a session needs the Owner: waiting on their answer, or blocked. */
export function needsOwner(task: LiveTask): boolean {
  return (
    task.session_state === "blocked" ||
    (task.session_state === "waiting" && task.waiting_on === "owner")
  );
}

/** Whether a session passes a filter. */
export function passes(task: LiveTask, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "needs") return needsOwner(task);
  if (filter === "waiting") return task.session_state === "waiting" && !needsOwner(task);
  if (filter === "running") return task.session_state === "running";
  return task.session_state === "queued" || task.session_state === "paused";
}

const SAMPLES = 32;

/** The total rate, sampled once a second for the waveform, which draws in from the right. */
function useRateHistory(total: number): number[] {
  const latest = useRef(total);
  const [history, setHistory] = useState<number[]>(() => [total, total]);
  useEffect(() => {
    latest.current = total;
  }, [total]);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setHistory((previous) => [...previous.slice(1 - SAMPLES), latest.current]);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return history;
}

/** The waveform's path in a 300 by 40 box, scaled to its own peak. */
function wavePath(history: number[]): string {
  const peak = Math.max(10, ...history);
  return history
    .map((value, index) => {
      const x = 300 - (history.length - 1 - index) * (300 / (SAMPLES - 1));
      const y = 36 - (value / peak) * 30;
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
}

/** How far apart, in radians, an outer face keeps from a writer on the inner ring. */
const CLEARANCE = 0.45;

/** An outer angle moved off any inner angle it would sit in line with. */
function clear(angle: number, inner: number[]): number {
  for (const taken of inner) {
    const gap = Math.atan2(Math.sin(angle - taken), Math.cos(angle - taken));
    if (Math.abs(gap) < CLEARANCE) return taken + (gap < 0 ? -CLEARANCE : CLEARANCE);
  }
  return angle;
}

/** Where each face sits: writers on the inner ring, everyone else spread round the outer one. */
function orbit(tasks: LiveTask[]): { task: LiveTask; x: number; y: number; inner: boolean }[] {
  const inner = tasks.filter((task) => task.session_state === "running");
  const outer = tasks.filter((task) => task.session_state !== "running").slice(0, 9);
  const spread = (count: number, start: number) =>
    Array.from({ length: count }, (_, index) => start + (index / Math.max(count, 1)) * Math.PI * 2);
  const innerAngles = spread(inner.length, Math.PI);
  const outerAngles = spread(outer.length, -Math.PI / 2).map((angle) => clear(angle, innerAngles));
  const at = (task: LiveTask, angle: number, radius: number, isInner: boolean) => ({
    task,
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius * 0.82,
    inner: isInner,
  });
  return [
    ...inner.map((task, index) => at(task, innerAngles[index] ?? 0, 26, true)),
    ...outer.map((task, index) => at(task, outerAngles[index] ?? 0, 43, false)),
  ];
}

/** Every session as a face in orbit; writers on the inner ring, with light flowing to the core. */
function Orbit({ tasks }: { tasks: LiveTask[] }) {
  const faces = orbit(tasks);
  return (
    <div className="live-orbit">
      <span className="live-ring live-ring-outer" aria-hidden="true" />
      <span className="live-ring live-ring-inner" aria-hidden="true" />
      <span className="live-core" aria-hidden="true" />
      <svg
        className="live-beams"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {faces
          .filter((face) => face.inner)
          .map(({ task, x, y }) => (
            <line
              key={task.id}
              x1={x}
              y1={y}
              x2="50"
              y2="50"
              style={{
                ["--flow" as string]: `${Math.max(0.5, 40 / (task.tokens_per_second || 20))}s`,
              }}
            />
          ))}
      </svg>
      {faces.map(({ task, x, y, inner }) => (
        <span
          key={task.id}
          className={`live-node ${inner ? "inner" : `outer state-${task.session_state}`}`}
          style={{ left: `${x}%`, top: `${y}%` }}
        >
          <Avatar
            department={task.department}
            state={task.state}
            name={task.employee_name}
            size={inner ? 40 : 26}
            rate={task.tokens_per_second}
          />
          {inner && task.tokens_per_second !== null && (
            <span className="live-node-rate mono">
              <Counter value={task.tokens_per_second} />
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** The deck: the rate, the waveform and every session in orbit. */
export function LiveDeck({ tasks, mode }: { tasks: LiveTask[]; mode?: string }) {
  const running = tasks.filter((task) => task.session_state === "running");
  const total = running.reduce((sum, task) => sum + (task.tokens_per_second ?? 0), 0);
  const history = useRateHistory(total);
  return (
    <section className="live-deck" aria-label="Everything running now">
      <div className="live-deck-head">
        <span className="live-deck-rate mono">
          <Counter value={total} />
        </span>
        <span className="live-deck-unit">tok/s right now</span>
        {mode && <span className="live-deck-mode">{mode}</span>}
      </div>
      <Orbit tasks={tasks} />
      <svg className="live-wave" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
        <path d={wavePath(history)} />
      </svg>
    </section>
  );
}

/** The filters under the deck, each with its count; a filter with nothing in it is left out. */
export function LiveFilters({
  tasks,
  filter,
  onFilter,
}: {
  tasks: LiveTask[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  return (
    <div className="live-filters" role="group" aria-label="Show">
      {FILTERS.map((key) => {
        const count = tasks.filter((task) => passes(task, key)).length;
        if (key !== "all" && count === 0) return null;
        return (
          <button
            key={key}
            type="button"
            className={`live-filter${key === "needs" ? " needs" : ""}`}
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
          >
            {FILTER_WORDS[key]} <span className="mono">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
