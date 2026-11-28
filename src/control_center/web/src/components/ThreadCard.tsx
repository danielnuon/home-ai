/**
 * @file One thread: a piece of work from first message to resolution, with its state, its lead,
 * and the one thing the Owner can do about it (spec 15.8.3, 15.8.9).
 *
 * The state is derived by the engine and only shown here. Resolve and Reopen are one tap each and
 * undo one another (15.8.10). A thread that needs the Owner offers no Resolve: closing it would
 * hide the decision it waits for, so it links to that decision instead. Its "…" menu holds the
 * same actions, Open in Chat, and Move to each other lead when the page passes the leads (15.8.5).
 */
import { ArrowRightLeft, Check, MessageCircle, RotateCcw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import type { LeadRef, StatusLabel, Thread } from "../api/types";
import { StatusText } from "../design/status";
import { LiveAvatar } from "./LiveFace";
import { useMoreMenu, type MoreAction } from "./MoreMenu";

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

/** The thread's conversation in Chat. */
export function chatPath(thread: Thread): string {
  return `/chat?lead=${thread.lead_id}&thread=${thread.id}`;
}

/** Where the Owner answers what a thread waits on: its approval card, or its lead in Chat. */
function answerPath(thread: Thread): string {
  return thread.approval_id ? "/approvals" : chatPath(thread);
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

/** Move to another lead, one tap, with moving back as the Undo (spec 15.8.5, 15.8.10). */
function useMove(thread: Thread) {
  const refresh = ["work", "today", "live", "chat"];
  const post = (leadId: string) => () =>
    send<Thread>("POST", `/threads/${thread.id}/move`, { lead_id: leadId });
  const undo = useAction<Thread>({ refresh });
  const move = useAction<Thread>({
    refresh,
    done: (moved) => ({
      message: `Moved to ${moved.lead_name}: ${thread.title}`,
      undo: () => void undo.run(post(thread.lead_id)),
    }),
  });
  return (leadId: string) => void move.run(post(leadId));
}

/** Everything the thread offers, for its "…" menu. */
function useThreadMenu(thread: Thread, leads: LeadRef[]): MoreAction[] {
  const navigate = useNavigate();
  const { resolve, reopen } = useThreadActions(thread);
  const move = useMove(thread);
  const actions: MoreAction[] = [];
  if (thread.state === "resolved") {
    actions.push({ label: "Reopen", icon: RotateCcw, onSelect: () => void reopen() });
  } else if (thread.state !== "needs_owner") {
    actions.push({ label: "Resolve", icon: Check, onSelect: () => void resolve() });
  }
  actions.push({
    label: "Open in Chat",
    icon: MessageCircle,
    onSelect: () => navigate(chatPath(thread)),
  });
  if (thread.state !== "resolved") {
    leads
      .filter((lead) => lead.id !== thread.lead_id)
      .forEach((lead) =>
        actions.push({
          label: `Move to ${lead.name}`,
          icon: ArrowRightLeft,
          onSelect: () => move(lead.id),
        }),
      );
  }
  return actions;
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
        <Link to={chatPath(thread)} className="btn compact">
          Follow up
        </Link>
      )}
    </>
  );
}

/**
 * One thread as a card: its title and state, who leads it, what is happening, and its actions.
 *
 * @param props - The thread, and the leads it can be moved to (none on pages that don't move).
 * @returns The card.
 */
export function ThreadCard({ thread, leads = [] }: { thread: Thread; leads?: LeadRef[] }) {
  const needsSomeone = thread.state === "blocked" || thread.state === "needs_owner";
  const { triggerProps, button, menu } = useMoreMenu(useThreadMenu(thread, leads), thread.title);
  return (
    <article
      className={`card stack ${needsSomeone ? "attention" : ""}`}
      aria-label={thread.title}
      {...triggerProps}
    >
      <div className="row">
        <h3 className="grow">{thread.title}</h3>
        <StatusText value={THREAD_STATE[thread.state]} className="small" />
        {button}
        {menu}
      </div>
      <p className="small">{thread.detail}</p>
      <div className="row wrap small">
        <LiveAvatar
          name={thread.lead_name}
          department={thread.lead_department}
          size={24}
          idleAs={thread.state === "needs_owner" ? "waiting" : undefined}
        />
        <span className="grow muted">
          {thread.lead_name} · {thread.pipeline} ·{" "}
          <span className="mono">{thread.unit_id ?? thread.id}</span>
        </span>
        <ThreadActions thread={thread} />
      </div>
    </article>
  );
}
