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
import type { Department, Thread, ThreadsOverview, WorkBoard, WorkItem } from "../api/types";
import { Segmented } from "../components/Controls";
import { AvatarGroup, LiveAvatar } from "../components/LiveFace";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Reflow, ReflowItem, Swap } from "../components/Reflow";
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
        <LiveAvatar
          name={item.employee_name}
          department={item.department}
          fallback={item.employee_state}
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

interface Lead {
  name: string;
  department: Department;
}

/** Each lead once, in the order they first appear. */
function leadsOf(threads: Thread[]): Lead[] {
  const leads = new Map<string, Lead>();
  threads.forEach((thread) =>
    leads.set(thread.lead_name, { name: thread.lead_name, department: thread.lead_department }),
  );
  return [...leads.values()];
}

/**
 * The lead filter: a quiet row of faces with their names, no chips. All shows the faces together.
 * The chosen one is marked by a line under its name; pressing it again goes back to All.
 */
function LeadFilter({
  leads,
  value,
  onChange,
}: {
  leads: Lead[];
  value: string;
  onChange: (value: string) => void;
}) {
  const pick = (next: string) => onChange(next === value ? ALL_LEADS : next);
  return (
    <div className="face-filter" role="group" aria-label="Lead">
      <button
        type="button"
        aria-label="All leads"
        aria-pressed={value === ALL_LEADS}
        onClick={() => onChange(ALL_LEADS)}
      >
        <AvatarGroup faces={leads} size={26} max={3} />
        <span>All</span>
      </button>
      {leads.map((lead) => (
        <button
          key={lead.name}
          type="button"
          aria-pressed={value === lead.name}
          onClick={() => pick(lead.name)}
        >
          <LiveAvatar name={lead.name} department={lead.department} size={26} />
          <span>{lead.name}</span>
        </button>
      ))}
    </div>
  );
}

/** A grid of thread cards whose cards come, go and glide as a filter changes. */
function ThreadGrid({ threads }: { threads: Thread[] }) {
  return (
    <div className="card-grid">
      <Reflow>
        {threads.map((thread) => (
          <ReflowItem key={thread.id}>
            <ThreadCard thread={thread} />
          </ReflowItem>
        ))}
      </Reflow>
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
  const leads = leadsOf([...threads.open, ...threads.recently_resolved]);
  const shown = (thread: Thread) => lead === ALL_LEADS || thread.lead_name === lead;
  const open = threads.open.filter(shown);
  const resolved = threads.recently_resolved.filter(shown);
  return (
    <>
      <LeadFilter leads={leads} value={lead} onChange={onLead} />
      <Reflow>
        {open.length === 0 && (
          <ReflowItem key="empty">
            <p className="card empty">No open threads here.</p>
          </ReflowItem>
        )}
        {byState(open).map(([state, group]) => (
          <ReflowItem key={state}>
            <Section title={THREAD_STATE[state].label} aside={`${group.length}`}>
              <ThreadGrid threads={group} />
            </Section>
          </ReflowItem>
        ))}
        {resolved.length > 0 && (
          <ReflowItem key="resolved">
            <Section title="Recently resolved">
              <ThreadGrid threads={resolved} />
            </Section>
          </ReflowItem>
        )}
      </Reflow>
    </>
  );
}

const ALL_LEADS = "all";

const VIEWS = [
  { value: "threads", label: "Threads" },
  { value: "boards", label: "Boards" },
] as const;

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
              <LiveAvatar name={review.reviewer} size={28} />
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
              <LiveAvatar name={idea.lead} size={28} />
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
      <Segmented
        label="View"
        options={VIEWS}
        value={view}
        onChange={(next) => setParams(next === "boards" ? { view: next } : {})}
      />
      <QueryState query={query}>
        {(board) => (
          <Swap id={view}>
            {view === "boards" ? (
              <Boards board={board} />
            ) : (
              <Threads
                threads={board.threads}
                lead={lead}
                onLead={(next) => setParams(next === ALL_LEADS ? {} : { lead: next })}
              />
            )}
          </Swap>
        )}
      </QueryState>
    </Page>
  );
}
