/**
 * @file Live: every open session by state, and the open transcript of one (design: Live;
 * spec 7.13, 15.8.9).
 *
 * Sessions are grouped by state (running, waiting, paused, blocked, queued) and, within a state,
 * by thread, with each sub-agent's session nested under its thread and lead. Scheduled work
 * belongs to no thread and is grouped on its own.
 *
 * Choosing a task opens its transcript beside the list on wider screens and in a sheet on a phone.
 * Only the open transcript streams tokens, which keeps the event stream inside its budget (7.17).
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useLiveTasks, useModels, useTaskDetail } from "../api/queries";
import type {
  Intervention,
  LiveTask,
  SessionState,
  TaskDetail,
  TranscriptEntry,
} from "../api/types";
import { LiveCard, TaskLine } from "../components/LiveCard";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Sheet } from "../components/Sheet";
import { StageRail } from "../components/StageRail";
import { useLayout } from "../design/useLayout";

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

/** The transcript and controls for the chosen task. */
function TaskTranscript({ taskId }: { taskId: string }) {
  const query = useTaskDetail(taskId);
  return (
    <QueryState query={query}>
      {(detail) => (
        <div className="stack">
          <p className="muted small">
            {detail.task.doing} · {detail.task.model}
          </p>
          <StageRail stages={detail.stage_rail} />
          <ol className="transcript" aria-live="polite">
            {detail.transcript.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ol>
          <Interventions detail={detail} />
        </div>
      )}
    </QueryState>
  );
}

/** Session states in the order Live lists them: what is moving first, what has not started last. */
const STATE_SECTIONS: [SessionState, string][] = [
  ["running", "Running"],
  ["waiting", "Waiting"],
  ["paused", "Paused"],
  ["blocked", "Blocked"],
  ["queued", "Queued"],
];

const SCHEDULED = "Scheduled work";

/** A thread's sessions, lead first, so sub-agents sit under their lead. */
function byThread(sessions: LiveTask[]): [string, LiveTask[]][] {
  const groups = new Map<string, LiveTask[]>();
  sessions.forEach((session) => {
    const heading = session.thread_title
      ? `${session.lead_name} · ${session.thread_title}`
      : SCHEDULED;
    groups.set(heading, [...(groups.get(heading) ?? []), session]);
  });
  const leadFirst = (a: LiveTask, b: LiveTask) => Number(isSubAgent(a)) - Number(isSubAgent(b));
  return [...groups].map(([heading, group]) => [heading, [...group].sort(leadFirst)]);
}

/** Whether a session is a sub-agent's: on a thread, and not the thread's lead. */
function isSubAgent(session: LiveTask): boolean {
  return session.lead_name !== null && session.lead_name !== session.employee_name;
}

/** Every session in one state, under its thread and lead. */
function SessionsInState({
  title,
  sessions,
  onChoose,
}: {
  title: string;
  sessions: LiveTask[];
  onChoose: (id: string) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <Section title={title} aside={`${sessions.length}`}>
      {byThread(sessions).map(([heading, group]) => (
        <div key={heading} className="stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
          <h3 className="small muted">{heading}</h3>
          <div className="list">
            {group.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`list-row ${isSubAgent(session) ? "sub-agent" : ""}`}
                onClick={() => onChoose(session.id)}
              >
                <TaskLine task={session} />
                {isSubAgent(session) && <span className="tag">sub-agent</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

/** The Live page. */
export default function Live() {
  const layout = useLayout();
  const [params, setParams] = useSearchParams();
  const chosen = params.get("task");
  const tasks = useLiveTasks();
  const poolMode = useModels().data?.pool_mode;
  const choose = (id: string | null) => setParams(id ? { task: id } : {});

  const list = (
    <QueryState query={tasks}>
      {(all) => (
        <>
          <LiveCard tasks={all} listRunning={false} />
          {STATE_SECTIONS.map(([state, words]) => (
            <SessionsInState
              key={state}
              title={words}
              sessions={all.filter((session) => session.session_state === state)}
              onChoose={choose}
            />
          ))}
        </>
      )}
    </QueryState>
  );
  const chosenTask = tasks.data?.find((task) => task.id === chosen);
  const title = chosenTask ? `${chosenTask.employee_name} · ${chosenTask.item}` : "Task";

  return (
    <Page title="Live" subtitle={poolMode}>
      {layout === "phone" || !chosen ? (
        list
      ) : (
        <div className="list-detail">
          <div className="stack">{list}</div>
          <section className="card stack" aria-label={title}>
            <div className="section-head">
              <h2>{title}</h2>
              <button type="button" className="btn ghost compact" onClick={() => choose(null)}>
                Close
              </button>
            </div>
            <TaskTranscript taskId={chosen} />
          </section>
        </div>
      )}
      {layout === "phone" && (
        <Sheet open={chosen !== null} title={title} onClose={() => choose(null)}>
          {chosen && <TaskTranscript taskId={chosen} />}
        </Sheet>
      )}
    </Page>
  );
}
