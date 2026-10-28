/**
 * @file Live: every running and queued task, and the open transcript of one (design: Live;
 * spec 7.13).
 *
 * Choosing a task opens its transcript beside the list on wider screens and in a sheet on a phone.
 * Only the open transcript streams tokens, which keeps the event stream inside its budget (7.17).
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useLiveTasks, useModels, useTaskDetail } from "../api/queries";
import type { Intervention, TaskDetail, TranscriptEntry } from "../api/types";
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
            await send_("note", note.trim());
            setNote("");
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
          <LiveCard tasks={all} />
          <Section title="Queued">
            <div className="list">
              {all
                .filter((task) => task.queued)
                .map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="list-row"
                    onClick={() => choose(task.id)}
                  >
                    <TaskLine task={task} />
                  </button>
                ))}
            </div>
          </Section>
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
