/**
 * @file Live: everything the employees are doing right now (design: Live; spec 7.13, 15.8.9;
 * decision 125).
 *
 * The deck at the top shows the whole system at once: the token rate, its waveform, and every
 * session as a face in orbit. Under it, what needs the Owner comes first, then one card per
 * thread, where the sessions on it read as a relay of faces from one employee to the next, and
 * the one at work shows what it is doing now. Scheduled work, which belongs to no thread, gets a
 * card of its own. Pressing a card, a face in its relay or a row that needs you opens that
 * session's transcript and controls in place, so the Owner never loses their spot.
 *
 * Only the open transcript streams tokens, which keeps the event stream inside its budget (7.17).
 */
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useLiveTasks, useModels, useTaskDetail } from "../api/queries";
import type {
  Intervention,
  LiveTask,
  SessionState,
  Stage,
  TaskDetail,
  TranscriptEntry,
} from "../api/types";
import { Avatar } from "../components/Avatar";
import { Counter } from "../components/Counter";
import {
  FILTERS,
  LiveDeck,
  LiveFilters,
  needsOwner,
  passes,
  type Filter,
} from "../components/LiveDeck";
import { LiveAvatar } from "../components/LiveFace";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Reflow, ReflowItem, Reveal } from "../components/Reflow";

/** One transcript entry: tool calls are chips, generating text has a soft cursor. */
function Entry({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === "tool") {
    return (
      <li className="tool-chip mono small">
        {entry.done ? "✓" : "◐"} {entry.text}
      </li>
    );
  }
  return (
    <li className={`entry entry-${entry.kind}`}>
      {entry.kind === "owner_note" && <span className="muted small">Your note · </span>}
      {entry.text}
      {entry.kind === "generating" && !entry.done && (
        <span className="cursor" aria-hidden="true">
          ▍
        </span>
      )}
    </li>
  );
}

/** Note, Pause or Resume, Redirect and Stop for one task. */
function Interventions({ detail }: { detail: TaskDetail }) {
  const [note, setNote] = useState("");
  const act = useAction<TaskDetail>({ refresh: ["live"] });
  const send_ = (kind: Intervention["kind"], text: string | null = null) =>
    act.run(() => send("POST", `/live/${detail.task.id}/interventions`, { kind, text }));
  const { paused } = detail.task;
  return (
    <div className="stack">
      <textarea
        className="field"
        aria-label={`Note to ${detail.task.employee_name} (applies before its next step)`}
        placeholder={`Note to ${detail.task.employee_name} (applies before its next step)`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="row wrap">
        <button
          type="button"
          className="btn primary"
          disabled={act.busy || !note.trim()}
          onClick={async () => {
            // Keep the text if the note was refused, so the Owner can fix it or send it elsewhere.
            if (await send_("note", note.trim())) setNote("");
          }}
        >
          Send note
        </button>
        <button
          type="button"
          className="btn"
          disabled={act.busy}
          onClick={() => send_(paused ? "resume" : "pause")}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={act.busy || !note.trim()}
          onClick={() => send_("redirect", note.trim())}
        >
          Redirect
        </button>
        <button
          type="button"
          className="btn destructive"
          disabled={act.busy}
          onClick={() => send_("stop")}
        >
          Stop
        </button>
      </div>
    </div>
  );
}

/** The stages as a segmented bar, with the current one named. */
function StageBar({ stages }: { stages: Stage[] }) {
  const current = stages.find((stage) => stage.state === "current");
  const done = stages.filter((stage) => stage.state === "done").length;
  return (
    <div className="stage-bar">
      <ol aria-label={`Stage ${current?.code ?? "done"}, ${done} of ${stages.length} done`}>
        {stages.map((stage) => (
          <li
            key={stage.code}
            className={`stage-seg stage-seg-${stage.state}`}
            title={stage.code}
          />
        ))}
      </ol>
      <span className="muted tiny mono">
        {current ? `${current.code} · ${done} of ${stages.length} done` : "All stages done"}
      </span>
    </div>
  );
}

/** The transcript and controls for the chosen task, opened in place. */
function TaskTranscript({ taskId }: { taskId: string }) {
  const query = useTaskDetail(taskId);
  return (
    <div className="live-open">
      <QueryState query={query}>
        {(detail) => (
          <div className="stack">
            <p className="muted small">
              {detail.task.employee_name} · {detail.task.item} · {detail.task.model}
            </p>
            {detail.stage_rail.length > 0 && <StageBar stages={detail.stage_rail} />}
            <ol className="transcript" aria-live="polite">
              {detail.transcript.map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </ol>
            <Interventions detail={detail} />
          </div>
        )}
      </QueryState>
    </div>
  );
}

/** States from most to least alive; a card is ordered, and its sessions relayed, by these. */
const ORDER: SessionState[] = ["running", "blocked", "waiting", "paused", "queued"];
const rank = (task: LiveTask) => ORDER.indexOf(task.session_state);

const STATE_WORDS: Record<SessionState, string> = {
  running: "running",
  waiting: "waiting",
  paused: "paused",
  blocked: "blocked",
  queued: "queued",
};

/** One card's worth of sessions: a thread's, or a single piece of scheduled work. */
interface Card {
  key: string;
  title: string;
  lead: string | null;
  /** The liveliest session, which the card shows when nothing on it is open. */
  first: LiveTask;
  sessions: LiveTask[];
}

/** Sessions into cards, one per thread and one per scheduled session, liveliest first. */
function intoCards(sessions: LiveTask[]): Card[] {
  const cards = new Map<string, Card>();
  sessions.forEach((session) => {
    const key = session.thread_id ?? session.id;
    const card = cards.get(key) ?? {
      key,
      title: session.thread_title ?? session.item,
      lead: session.thread_id ? session.lead_name : null,
      first: session,
      sessions: [],
    };
    card.sessions.push(session);
    cards.set(key, card);
  });
  const sorted = [...cards.values()].map((card) => {
    const ordered = [...card.sessions].sort((a, b) => rank(a) - rank(b));
    return { ...card, first: ordered[0] ?? card.first, sessions: ordered };
  });
  return sorted.sort((a, b) => rank(a.first) - rank(b.first));
}

/** The relay: each session on a thread as a face, joined to the next; the live link flows. */
function Relay({
  sessions,
  chosen,
  onChoose,
}: {
  sessions: LiveTask[];
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  return (
    <ol className="relay" aria-label="Sessions on this thread">
      {sessions.map((session, index) => (
        <li key={session.id} className="relay-step">
          {index > 0 && (
            <span
              className={`relay-link${sessions[index - 1]?.session_state === "running" ? " live" : ""}`}
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            className={`relay-stop state-${session.session_state}`}
            aria-pressed={chosen === session.id}
            onClick={() => onChoose(session.id)}
          >
            <span aria-hidden="true">
              <Avatar
                department={session.department}
                state={session.state}
                name={session.employee_name}
                size={session.session_state === "running" ? 36 : 28}
                rate={session.tokens_per_second}
                peek={false}
              />
            </span>
            <span className="tiny">{session.employee_name}</span>
            <span className="visually-hidden">
              , {STATE_WORDS[session.session_state]}: {session.item}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** What the liveliest session on a card is doing right now. */
function Now({ session }: { session: LiveTask }) {
  const writing = session.state === "generating";
  return (
    <div className="live-now">
      <span className="live-now-label tiny">
        <span>
          {session.employee_name} · {session.item}
        </span>
        {session.tokens_per_second !== null && (
          <span className="mono">
            <Counter value={session.tokens_per_second} suffix=" tok/s" />
          </span>
        )}
      </span>
      <span className="mono small">
        {session.paused ? "Paused" : session.doing}
        {writing && (
          <span className="cursor" aria-hidden="true">
            ▍
          </span>
        )}
      </span>
    </div>
  );
}

/** One thread, or one piece of scheduled work, as a card that opens in place. */
function ThreadCard({
  card,
  chosen,
  onChoose,
}: {
  card: Card;
  chosen: string | null;
  onChoose: (id: string | null) => void;
}) {
  const { first } = card;
  const open = card.sessions.find((session) => session.id === chosen);
  const state = first.session_state;
  return (
    <article className={`card live-card${open ? " open" : ""}`} aria-label={card.title}>
      <button
        type="button"
        className="live-card-head"
        aria-expanded={Boolean(open)}
        onClick={() => onChoose(open ? null : first.id)}
      >
        {card.lead ? (
          <LiveAvatar name={card.lead} size={32} />
        ) : (
          <Avatar
            department={first.department}
            state={first.state}
            name={first.employee_name}
            size={32}
            rate={first.tokens_per_second}
            peek={false}
          />
        )}
        <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="row-title">{card.title}</span>
          <span className="muted small">
            {card.lead ? `${card.lead}'s thread` : `Scheduled · ${first.employee_name}`}
          </span>
        </span>
        <span className={`state-pill state-${state}`}>{STATE_WORDS[state]}</span>
        <ChevronDown className="live-card-chevron" size={18} aria-hidden="true" />
      </button>
      {card.sessions.length > 1 && (
        <Relay
          sessions={card.sessions}
          chosen={open?.id ?? null}
          onChoose={(id) => onChoose(id === chosen ? null : id)}
        />
      )}
      <Now session={open ?? first} />
      <Reveal when={Boolean(open)}>{open && <TaskTranscript taskId={open.id} />}</Reveal>
    </article>
  );
}

/** What is waiting on the Owner: an answer, or a way past a block. */
function NeedsYou({
  sessions,
  chosen,
  onChoose,
}: {
  sessions: LiveTask[];
  chosen: string | null;
  onChoose: (id: string | null) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <section className="card needs-you" aria-label="Needs you">
      <div className="section-head">
        <h2>Needs you</h2>
        <span className="muted small">{sessions.length}</span>
      </div>
      {sessions.map((session) => {
        const open = session.id === chosen;
        return (
          <div key={session.id} className="needs-row">
            <button
              type="button"
              className="needs-row-head"
              aria-expanded={open}
              onClick={() => onChoose(open ? null : session.id)}
            >
              <Avatar
                department={session.department}
                state={session.state}
                name={session.employee_name}
                size={32}
                peek={false}
              />
              <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                <span className="row-title">
                  {session.employee_name} {session.doing}
                </span>
                <span className="muted small">
                  {session.item}
                  {session.thread_title && ` · ${session.thread_title}`}
                </span>
              </span>
              <span className={`state-pill state-${session.session_state}`}>
                {session.session_state === "blocked" ? "blocked" : "you"}
              </span>
              <ChevronDown className="live-card-chevron" size={18} aria-hidden="true" />
            </button>
            <Reveal when={open}>
              <TaskTranscript taskId={session.id} />
            </Reveal>
          </div>
        );
      })}
    </section>
  );
}

/** What needs the Owner, then a card per thread; both reflow as the filter changes. */
function Sessions({
  visible,
  chosen,
  onChoose,
}: {
  visible: LiveTask[];
  chosen: string | null;
  onChoose: (id: string | null) => void;
}) {
  const needs = visible.filter(needsOwner);
  const cards = intoCards(visible.filter((task) => !needsOwner(task)));
  return (
    <>
      <Reflow>
        {needs.length > 0 && (
          <ReflowItem key="needs">
            <NeedsYou sessions={needs} chosen={chosen} onChoose={onChoose} />
          </ReflowItem>
        )}
      </Reflow>
      <Reflow>
        {cards.length > 0 && (
          <ReflowItem key="threads">
            <Section title="Threads" aside={`${cards.length}`}>
              <div className="live-cards">
                <Reflow>
                  {cards.map((card) => (
                    <ReflowItem key={card.key}>
                      <ThreadCard card={card} chosen={chosen} onChoose={onChoose} />
                    </ReflowItem>
                  ))}
                </Reflow>
              </div>
            </Section>
          </ReflowItem>
        )}
        {visible.length === 0 && (
          <ReflowItem key="empty">
            <p className="empty">Nothing here right now.</p>
          </ReflowItem>
        )}
      </Reflow>
    </>
  );
}

const isFilter = (value: string | null): value is Filter => FILTERS.includes(value as Filter);

/** The Live page. */
export default function Live() {
  const [params, setParams] = useSearchParams();
  const chosen = params.get("task");
  const shown = params.get("show");
  const filter: Filter = isFilter(shown) ? shown : "all";
  const tasks = useLiveTasks();
  const poolMode = useModels().data?.pool_mode;
  const update = (next: { task?: string | null; show?: Filter }) => {
    const task = next.task === undefined ? chosen : next.task;
    const show = next.show ?? filter;
    const entries: Record<string, string> = {};
    if (show !== "all") entries.show = show;
    if (task) entries.task = task;
    setParams(entries, { replace: next.task === undefined });
  };
  const choose = (task: string | null) => update({ task });

  return (
    <Page title="Live">
      <QueryState query={tasks}>
        {(all) => {
          const visible = all.filter((task) => passes(task, filter));
          return (
            <>
              <LiveDeck tasks={all} mode={poolMode} />
              <LiveFilters tasks={all} filter={filter} onFilter={(show) => update({ show })} />
              <Sessions visible={visible} chosen={chosen} onChoose={choose} />
            </>
          );
        }}
      </QueryState>
    </Page>
  );
}
