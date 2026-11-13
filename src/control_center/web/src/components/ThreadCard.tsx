/**
 * @file One thread: a piece of work from first message to resolution, with its state, its lead,
 * and the one thing the Owner can do about it (spec 15.8.3, 15.8.9).
 *
 * The state is derived by the engine and only shown here. Resolve and Reopen are one tap each and
 * undo one another (15.8.10). A thread that needs the Owner offers no Resolve: closing it would
 * hide the decision it waits for, so it links to that decision instead.
 */
import { Link } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import type { StatusLabel, Thread } from "../api/types";
import { StatusText } from "../design/status";

/** Each thread state as the Owner reads it: a status color and shape, and a word. */
export const THREAD_STATE: Record<Thread["state"], StatusLabel> = {
  blocked: { status: "problem", label: "Blocked" },
  needs_owner: { status: "attention", label: "Needs you" },
  paused: { status: "neutral", label: "Paused" },
  working: { status: "in_progress", label: "Working" },
  review_ready: { status: "healthy", label: "Ready for review" },
  waiting: { status: "neutral", label: "Waiting" },
  idle: { status: "neutral", label: "Idle" },
  resolved: { status: "healthy", label: "Resolved" },
};

/** Where the Owner answers what a thread waits on: its approval card, or its lead in Chat. */
function answerPath(thread: Thread): string {
  return thread.approval_id ? "/approvals" : `/chat?lead=${thread.lead_id}`;
}

/** Resolve and Reopen for one thread, each offering the other as Undo. */
function useThreadActions(thread: Thread) {
  const refresh = ["work", "today", "live"];
  const post = (verb: "resolve" | "reopen") => () =>
    send<Thread>("POST", `/threads/${thread.id}/${verb}`);
  const undo = useAction<Thread>({ refresh });
  const resolve = useAction<Thread>({
    refresh,
    done: () => ({
      message: `Resolved: ${thread.title}`,
      undo: () => void undo.run(post("reopen")),
    }),
  });
  const reopen = useAction<Thread>({ refresh, done: () => `Reopened: ${thread.title}` });
  return {
    busy: resolve.busy || reopen.busy,
    resolve: () => resolve.run(post("resolve")),
    reopen: () => reopen.run(post("reopen")),
  };
}

/** The buttons a thread's state allows. */
function ThreadActions({ thread }: { thread: Thread }) {
  const { busy, resolve, reopen } = useThreadActions(thread);
  if (thread.state === "resolved") {
    return (
      <button type="button" className="btn compact" disabled={busy} onClick={reopen}>
        Reopen
      </button>
    );
  }
  if (thread.state === "needs_owner") {
    return (
      <Link to={answerPath(thread)} className="btn compact primary">
        {thread.approval_id ? "Open approval" : `Answer ${thread.lead_name}`}
      </Link>
    );
  }
  const reviewing = thread.state === "review_ready";
  return (
    <>
      <button
        type="button"
        className={`btn compact ${reviewing ? "primary" : ""}`}
        disabled={busy}
        onClick={resolve}
      >
        {reviewing ? "Looks good" : "Resolve"}
      </button>
      {reviewing && (
        <Link to={`/chat?lead=${thread.lead_id}`} className="btn compact">
          Follow up
        </Link>
      )}
    </>
  );
}

/** One thread as a card: its title and state, who leads it, what is happening, and its actions. */
export function ThreadCard({ thread }: { thread: Thread }) {
  const needsSomeone = thread.state === "blocked" || thread.state === "needs_owner";
  return (
    <article className={`card stack ${needsSomeone ? "attention" : ""}`} aria-label={thread.title}>
      <div className="row">
        <h3 className="grow">{thread.title}</h3>
        <StatusText value={THREAD_STATE[thread.state]} className="small" />
      </div>
      <p className="small">{thread.detail}</p>
      <div className="row wrap small">
        <span className="grow muted">
          {thread.lead_name} · {thread.pipeline} ·{" "}
          <span className="mono">{thread.unit_id ?? thread.id}</span>
        </span>
        <ThreadActions thread={thread} />
      </div>
    </article>
  );
}
