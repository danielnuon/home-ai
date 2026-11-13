/**
 * @file Work: every thread by state, and the boards of work items, ideas and reviews (design:
 * Work; spec 7.2, 15.8.9).
 *
 * Threads is the default view: every open piece of work across pipelines and personal
 * operations, grouped by state with what needs someone first, then the recently resolved. The
 * boards remain as the other view. Both are in the URL, so a link from Today opens the right one.
 */
import { useSearchParams } from "react-router-dom";
import { useWorkBoard } from "../api/queries";
import type { Thread, ThreadsOverview, WorkBoard, WorkItem } from "../api/types";
import { Avatar } from "../components/Avatar";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { StageRail } from "../components/StageRail";
import { ThreadCard, THREAD_STATE } from "../components/ThreadCard";
import { StatusText } from "../design/status";

/** One work item: who has it, where it is, and what it costs so far. */
function WorkCard({ item }: { item: WorkItem }) {
  return (
    <article
      className={`card stack ${item.waiting_on_owner ? "attention" : ""}`}
      aria-label={item.title}
    >
      <div className="row">
        <Avatar
          department={item.department}
          state={item.employee_state}
          name={item.employee_name}
          size={32}
        />
        <div className="grow">
          <h3>{item.title}</h3>
          <p className="muted small">
            <span className="mono">{item.id}</span> · {item.employee_name} · {item.now}
          </p>
        </div>
        <span className="tag">{item.risk}</span>
      </div>
      <StageRail stages={item.stages} />
      <div
        className="progress"
        role="progressbar"
        aria-label="Progress"
        aria-valuenow={Math.round(item.progress * 100)}
      >
        <span style={{ transform: `scaleX(${item.progress})` }} />
      </div>
      <div className="row small">
        <StatusText value={item.status} className="grow" />
        <span className="muted">
          {item.eta} · ${item.cost_usd.toFixed(2)}
        </span>
      </div>
    </article>
  );
}

/** Open threads in the order given, as [state, threads] groups. The server sorts by state. */
function byState(threads: Thread[]): [Thread["state"], Thread[]][] {
  const groups = new Map<Thread["state"], Thread[]>();
  threads.forEach((thread) =>
    groups.set(thread.state, [...(groups.get(thread.state) ?? []), thread]),
  );
  return [...groups];
}

/** A row of chips that picks one value; the pressed chip is the current one. */
function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="row wrap" role="group" aria-label={label}>
      {options.map(([option, words]) => (
        <button
          key={option}
          type="button"
          className="chip"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {words}
        </button>
      ))}
    </div>
  );
}

/** The Threads view: a lead filter, open threads by state, then the recently resolved. */
function Threads({
  threads,
  lead,
  onLead,
}: {
  threads: ThreadsOverview;
  lead: string;
  onLead: (lead: string) => void;
}) {
  const leads = [...new Set([...threads.open, ...threads.recently_resolved].map(leadName))];
  const shown = (thread: Thread) => lead === ALL_LEADS || thread.lead_name === lead;
  const open = threads.open.filter(shown);
  const resolved = threads.recently_resolved.filter(shown);
  return (
    <>
      <Chips
        label="Lead"
        options={[[ALL_LEADS, "All leads"], ...leads.map((name): [string, string] => [name, name])]}
        value={lead}
        onChange={onLead}
      />
      {open.length === 0 && <p className="card empty">No open threads here.</p>}
      {byState(open).map(([state, group]) => (
        <Section key={state} title={THREAD_STATE[state].label} aside={`${group.length}`}>
          <div className="card-grid">
            {group.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        </Section>
      ))}
      {resolved.length > 0 && (
        <Section title="Recently resolved">
          <div className="card-grid">
            {resolved.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

const ALL_LEADS = "all";

function leadName(thread: Thread): string {
  return thread.lead_name;
}

/** The boards view: work items by stage, reviews waiting, and ideas. */
function Boards({ board }: { board: WorkBoard }) {
  return (
    <>
      <Section title="In progress" aside={`${board.items.length} items`}>
        <div className="card-grid">
          {board.items.map((item) => (
            <WorkCard key={item.id} item={item} />
          ))}
        </div>
      </Section>
      <Section title="Reviews">
        <ul className="list">
          {board.reviews.map((review) => (
            <li key={review.id} className="list-row">
              <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                <span className="row-title">{review.title}</span>
                <span className="muted small">
                  {review.reviewer} · readability {review.readability}
                </span>
              </span>
              <span className="mono small">
                <span className="status-healthy">+{review.added_lines}</span>{" "}
                <span className="status-problem">−{review.removed_lines}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Ideas">
        <ul className="list">
          {board.ideas.map((idea) => (
            <li key={idea.id} className="list-row">
              <span className="grow row-title">{idea.title}</span>
              <span className="muted small">
                {idea.lead} · {idea.state}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** The Work page. */
export default function Work() {
  const query = useWorkBoard();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "boards" ? "boards" : "threads";
  const lead = params.get("lead") ?? ALL_LEADS;
  return (
    <Page title="Work" subtitle="Every piece of work the team has open, and where each one is.">
      <Chips
        label="View"
        options={[
          ["threads", "Threads"],
          ["boards", "Boards"],
        ]}
        value={view}
        onChange={(next) => setParams(next === "boards" ? { view: next } : {})}
      />
      <QueryState query={query}>
        {(board) =>
          view === "boards" ? (
            <Boards board={board} />
          ) : (
            <Threads
              threads={board.threads}
              lead={lead}
              onLead={(next) => setParams(next === ALL_LEADS ? {} : { lead: next })}
            />
          )
        }
      </QueryState>
    </Page>
  );
}
