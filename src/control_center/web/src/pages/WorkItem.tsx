/**
 * @file A work item's own page: where it is, what it went through, its gates, the diff under
 * review and its transcripts (spec 7.2, Work; 17.3, 17.10, 17.19).
 *
 * Pause, Resume and priority are here as buttons, with Undo on the toast, and its thread opens in
 * Chat. The diff viewer lists each changed file, open by default, with added and removed lines
 * marked by colour and by a + or − so the change reads without colour too. A link that ends in
 * "#diff" scrolls straight to it.
 */
import { ArrowUpRight, Compass, MessageCircle } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useWorkItem } from "../api/queries";
import type { DiffFile, Priority, WorkItemDetail } from "../api/types";
import { Segmented } from "../components/Controls";
import { LiveAvatar } from "../components/LiveFace";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { StageRail } from "../components/StageRail";
import { StatusText } from "../design/status";
import { useGuide, useGuideContext } from "../shell/Guide";
import { useItemActions } from "./Work";

const PRIORITIES = [
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
] as const;

const GATE_STATUS = {
  passed: { status: "healthy", label: "Passed" },
  waiting: { status: "attention", label: "Waiting" },
  todo: { status: "neutral", label: "Not yet" },
} as const;

const MARK = { add: "+", remove: "−", context: " " } as const;

/** One changed file: its path, its counts, and its lines. */
function FileDiff({ file }: { file: DiffFile }) {
  return (
    <details className="card diff-file" open>
      <summary className="row">
        <span className="grow mono small">{file.path}</span>
        <span className="mono small">
          <span className="status-healthy">+{file.added}</span>{" "}
          <span className="status-problem">−{file.removed}</span>
        </span>
      </summary>
      <pre className="diff" tabIndex={0} aria-label={`Changes to ${file.path}`}>
        {file.lines.map((line, index) => (
          <span key={index} className={`diff-line diff-${line.kind}`}>
            <span aria-hidden="true">{MARK[line.kind]} </span>
            {line.kind !== "context" && (
              <span className="visually-hidden">
                {line.kind === "add" ? "Added: " : "Removed: "}
              </span>
            )}
            {line.text}
            {"\n"}
          </span>
        ))}
      </pre>
    </details>
  );
}

/** The status card at the top, with Pause or Resume, priority and the thread. */
function Summary({ detail }: { detail: WorkItemDetail }) {
  const { item } = detail;
  const { busy, pauseAction, setPriority } = useItemActions(item);
  const { open } = useGuide();
  return (
    <article className={`card stack ${item.waiting_on_owner ? "attention" : ""}`}>
      <div className="row">
        <LiveAvatar name={item.employee_name} department={item.department} />
        <p className="grow">
          {item.now}
          <br />
          <span className="muted small">
            <span className="mono">{item.id}</span> · {item.risk} · {item.eta} · $
            {item.cost_usd.toFixed(2)} · {item.rework_count} rework{" "}
            {item.rework_count === 1 ? "cycle" : "cycles"}
          </span>
        </p>
      </div>
      <StageRail stages={item.stages} />
      <StatusText value={item.status} />
      <Segmented
        label="Priority"
        options={PRIORITIES}
        value={item.priority}
        onChange={(next: Priority) => {
          if (next !== item.priority) setPriority(next);
        }}
      />
      <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
        <button type="button" className="btn" disabled={busy} onClick={pauseAction.onSelect}>
          {pauseAction.label}
        </button>
        {item.thread_id && (
          <Link to={`/chat?lead=foreman&thread=${item.thread_id}`} className="btn">
            <MessageCircle size={18} aria-hidden="true" />
            Open its thread
          </Link>
        )}
        <button type="button" className="btn" onClick={() => open()}>
          <Compass size={18} aria-hidden="true" />
          Ask Wayfinder
        </button>
      </div>
    </article>
  );
}

/** The product's repository and pull request for this item (spec 17.19). */
function Repository({ detail }: { detail: WorkItemDetail }) {
  const { product, item } = detail;
  if (!product) return null;
  const pr = product.pull_requests.find((request) => request.item_id === item.id);
  return (
    <Section title="Repository">
      <div className="card stack">
        <p className="row-title">{product.name}</p>
        <p className="mono small muted">{product.repo_path}</p>
        <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
          {pr && (
            <a className="btn compact" href={pr.url} target="_blank" rel="noreferrer">
              Pull request #{pr.number}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
          {product.github_url && (
            <a className="btn compact" href={product.github_url} target="_blank" rel="noreferrer">
              GitHub
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </Section>
  );
}

/** The transcript of each session on the item, with a way into Live. */
function Transcripts({ detail }: { detail: WorkItemDetail }) {
  return (
    <Section title="Transcripts">
      {detail.transcripts.length === 0 ? (
        <p className="card empty">Nobody is working on it right now.</p>
      ) : (
        detail.transcripts.map((log) => (
          <div key={log.task_id} className="card stack">
            <div className="row">
              <LiveAvatar name={log.employee_name} department={log.department} size={28} />
              <span className="grow row-title">
                {log.employee_name} {log.doing}
              </span>
              <Link to={`/live?task=${log.task_id}`} className="btn compact">
                Open in Live
              </Link>
            </div>
            {log.entries.length === 0 ? (
              <p className="muted small">Nothing yet.</p>
            ) : (
              <ul className="stack small" style={{ ["--gap" as string]: "var(--space-1)" }}>
                {log.entries
                  .filter((entry) => entry.text)
                  .map((entry) => (
                    <li key={entry.id} className={entry.kind === "tool" ? "mono muted" : ""}>
                      {entry.text}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ))
      )}
    </Section>
  );
}

/** History, gates, diff and transcripts. */
function Body({ detail }: { detail: WorkItemDetail }) {
  return (
    <>
      <Summary detail={detail} />
      <Section title="Stage history">
        <ol className="list">
          {detail.history.map((event, index) => (
            <li key={index} className="list-row">
              <span className="tag mono">{event.code}</span>
              <span className="grow">{event.text}</span>
              <span className="muted small">{event.when}</span>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Gates">
        <ul className="list">
          {detail.gates.map((gate) => (
            <li key={gate.code} className="list-row">
              <span className="tag mono">{gate.code}</span>
              <span className="grow">{gate.name}</span>
              <StatusText value={GATE_STATUS[gate.state]} className="small" />
            </li>
          ))}
        </ul>
      </Section>
      <Repository detail={detail} />
      <Diff detail={detail} />
      <Transcripts detail={detail} />
    </>
  );
}

/** The review and its diff; "#diff" in the address scrolls to it. */
function Diff({ detail }: { detail: WorkItemDetail }) {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === "#diff") document.getElementById("diff")?.scrollIntoView({ block: "start" });
  }, [hash]);
  return (
    <div id="diff">
      <Section
        title="Changes under review"
        aside={
          detail.review ? `${detail.review.reviewer} · ${detail.review.readability}` : undefined
        }
      >
        {detail.diff.length === 0 ? (
          <p className="card empty">No review request yet. The diff appears here once there is.</p>
        ) : (
          detail.diff.map((file) => <FileDiff key={file.path} file={file} />)
        )}
      </Section>
    </div>
  );
}

/** The work item page. */
export default function WorkItemPage() {
  const { id = "" } = useParams();
  const query = useWorkItem(id);
  useGuideContext(query.data?.item.title ?? null);
  return (
    <Page title={query.data?.item.title ?? "Work item"} subtitle={query.data?.item.status.label}>
      <QueryState query={query}>{(detail) => <Body detail={detail} />}</QueryState>
    </Page>
  );
}
