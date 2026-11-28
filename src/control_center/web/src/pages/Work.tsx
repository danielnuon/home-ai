/**
 * @file Work: every thread by state, and the boards of work items, ideas, reviews and products
 * (design: Work; spec 7.2, 15.8.9, 17.10, 17.19, 17.21).
 *
 * Threads is the default view: every open piece of work across pipelines and personal
 * operations, grouped by state with what needs someone first, then the recently resolved, and the
 * archived ones behind a filter. Lead, pipeline, principal and state filter it. The boards are the
 * other view: work items, with pause, priority and their own page; reviews, which open the diff;
 * ideas, which the Owner submits, edits, pauses, re-prioritises and withdraws; and products, with
 * their repository, GitHub mirror, open pull requests, work in progress and Retire. Every choice is
 * in the URL, so a link from Today opens the right view.
 */
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Archive,
  CircleSlash,
  Lightbulb,
  Minus,
  Pause,
  PencilLine,
  Play,
  Power,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useWorkBoard } from "../api/queries";
import type {
  Department,
  Idea,
  LeadRef,
  Priority,
  Product,
  Thread,
  ThreadsOverview,
  WorkBoard,
  WorkItem,
} from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { Segmented } from "../components/Controls";
import { ALL, FilterMenu } from "../components/FilterMenu";
import { AvatarGroup, LiveAvatar } from "../components/LiveFace";
import { useMoreMenu, type MoreAction } from "../components/MoreMenu";
import type { SwipeAction } from "../components/Swipe";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Reflow, ReflowItem, Swap } from "../components/Reflow";
import { Sheet } from "../components/Sheet";
import { StageRail } from "../components/StageRail";
import { ThreadCard, THREAD_STATE } from "../components/ThreadCard";
import { AnimatePresence, LEAVE, m } from "../design/motion";
import { StatusText } from "../design/status";

const REFRESH = ["work", "today", "live"];

const PRIORITY_WORDS: Record<Priority, string> = {
  high: "High priority",
  normal: "Normal priority",
  low: "Low priority",
};

const PRIORITY_ICON = { high: ArrowUp, normal: Minus, low: ArrowDown } as const;

/** The three priorities as "…" menu items, leaving out the one it already has. */
function priorityActions(current: Priority, set: (next: Priority) => void): MoreAction[] {
  return (["high", "normal", "low"] as const)
    .filter((priority) => priority !== current)
    .map((priority) => ({
      label: `Make it ${PRIORITY_WORDS[priority].toLowerCase()}`,
      icon: PRIORITY_ICON[priority],
      onSelect: () => set(priority),
    }));
}

// Work items ------------------------------------------------------------------------------------

/** Pause, resume and priority for one work item, each with Undo on its toast. */
export function useItemActions(item: WorkItem) {
  const path = `/work-items/${item.id}`;
  const undo = useAction<WorkItem>({ refresh: REFRESH });
  const put = (field: "paused" | "priority", value: boolean | string) => () =>
    send<WorkItem>("PUT", `${path}/${field}`, { [field]: value });
  const pause = useAction<WorkItem>({
    refresh: REFRESH,
    done: (changed) => ({
      message: changed.paused ? `Paused: ${item.title}` : `Resumed: ${item.title}`,
      undo: () => void undo.run(put("paused", !changed.paused)),
    }),
  });
  const prioritise = useAction<WorkItem>({
    refresh: REFRESH,
    done: (changed) => ({
      message: `${PRIORITY_WORDS[changed.priority]}: ${item.title}`,
      undo: () => void undo.run(put("priority", item.priority)),
    }),
  });
  const pauseAction: MoreAction = item.paused
    ? { label: "Resume", icon: Play, onSelect: () => void pause.run(put("paused", false)) }
    : { label: "Pause", icon: Pause, onSelect: () => void pause.run(put("paused", true)) };
  const setPriority = (next: Priority) => void prioritise.run(put("priority", next));
  return {
    busy: pause.busy || prioritise.busy,
    pauseAction,
    setPriority,
    priorityActions: priorityActions(item.priority, setPriority),
  };
}

/** The small facts under a work item: priority, rework cycles. */
function ItemTags({ item }: { item: WorkItem }) {
  return (
    <>
      {item.priority !== "normal" && <span className="tag">{PRIORITY_WORDS[item.priority]}</span>}
      {item.rework_count > 0 && (
        <span className="tag">
          {item.rework_count} rework {item.rework_count === 1 ? "cycle" : "cycles"}
        </span>
      )}
      {item.kind === "retirement" && <span className="tag">Retirement</span>}
    </>
  );
}

/** One work item: who has it, where it is, what it costs so far; it opens its own page. */
function WorkCard({ item }: { item: WorkItem }) {
  const navigate = useNavigate();
  const { pauseAction, priorityActions: priorities } = useItemActions(item);
  const href = `/work/items/${item.id}`;
  const { triggerProps, button, menu } = useMoreMenu(
    [
      { label: "Open", icon: ArrowUpRight, onSelect: () => navigate(href) },
      pauseAction,
      ...priorities,
    ],
    item.title,
  );
  return (
    <article
      className={`card stack ${item.waiting_on_owner ? "attention" : ""}`}
      aria-label={item.title}
      {...triggerProps}
    >
      <div className="row">
        <LiveAvatar
          name={item.employee_name}
          department={item.department}
          fallback={item.employee_state}
        />
        <Link to={href} className="grow card-link">
          <h3>{item.title}</h3>
          <p className="muted small">
            <span className="mono">{item.id}</span> · {item.employee_name} · {item.now}
          </p>
        </Link>
        <span className="tag">{item.risk}</span>
        {button}
        {menu}
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
      <div className="row wrap small">
        <StatusText value={item.status} className="grow" />
        <ItemTags item={item} />
        <span className="muted">
          {item.eta} · ${item.cost_usd.toFixed(2)}
        </span>
      </div>
      <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
        <button type="button" className="btn compact" onClick={pauseAction.onSelect}>
          {pauseAction.label}
        </button>
      </div>
    </article>
  );
}

// Ideas -----------------------------------------------------------------------------------------

/** The sheet that submits a new idea, or edits one. */
function IdeaSheet({
  idea,
  open,
  onClose,
}: {
  idea: Idea | null;
  open: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(idea?.title ?? "");
  const [summary, setSummary] = useState(idea?.summary ?? "");
  const { run, busy } = useAction<Idea>({
    refresh: REFRESH,
    done: (saved) => (idea ? `Saved: ${saved.title}` : `Spark has your idea: ${saved.title}`),
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = { title, summary };
    const saved = await run(() =>
      idea ? send<Idea>("PUT", `/ideas/${idea.id}`, body) : send<Idea>("POST", "/ideas", body),
    );
    if (saved) onClose();
  };
  return (
    <Sheet open={open} title={idea ? "Edit the idea" : "Submit an idea"} onClose={onClose}>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <p className="muted">
          {idea
            ? "Spark sees the change at its next step."
            : "Spark, the Ideation Lead, restates it and asks what matters, in its own thread."}
        </p>
        <input
          className="field"
          aria-label="Title"
          placeholder="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <textarea
          className="field"
          rows={4}
          aria-label="Describe it in your own words"
          placeholder="Describe it in your own words"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
          {idea ? "Save" : "Submit the idea"}
        </button>
      </form>
    </Sheet>
  );
}

/** Every action on an idea: pause or resume, priority, withdraw or reopen, each with Undo. */
function useIdeaActions(idea: Idea, onEdit: () => void) {
  const navigate = useNavigate();
  const path = `/ideas/${idea.id}`;
  const undo = useAction<Idea>({ refresh: REFRESH });
  const post = (verb: "withdraw" | "reopen") => () => send<Idea>("POST", `${path}/${verb}`);
  const put = (field: "paused" | "priority", value: boolean | string) => () =>
    send<Idea>("PUT", `${path}/${field}`, { [field]: value });
  const act = useAction<Idea>({
    refresh: REFRESH,
    done: (changed) =>
      changed.withdrawn
        ? { message: `Withdrawn: ${idea.title}`, undo: () => void undo.run(post("reopen")) }
        : changed.paused !== idea.paused
          ? {
              message: `${changed.paused ? "Paused" : "Resumed"}: ${idea.title}`,
              undo: () => void undo.run(put("paused", idea.paused)),
            }
          : changed.priority !== idea.priority
            ? {
                message: `${PRIORITY_WORDS[changed.priority]}: ${idea.title}`,
                undo: () => void undo.run(put("priority", idea.priority)),
              }
            : `Reopened: ${idea.title}`,
  });
  if (idea.withdrawn) {
    const reopen: SwipeAction = {
      label: "Reopen",
      icon: RotateCcw,
      onSelect: () => void act.run(post("reopen")),
    };
    return { start: reopen, end: undefined, more: [reopen as MoreAction] };
  }
  const pause: SwipeAction = idea.paused
    ? { label: "Resume", icon: Play, onSelect: () => void act.run(put("paused", false)) }
    : { label: "Pause", icon: Pause, onSelect: () => void act.run(put("paused", true)) };
  const withdraw: SwipeAction & MoreAction = {
    label: "Withdraw",
    icon: CircleSlash,
    destructive: true,
    tone: "clay",
    onSelect: () => void act.run(post("withdraw")),
  };
  const more: MoreAction[] = [
    { label: "Edit", icon: PencilLine, onSelect: onEdit },
    pause,
    ...priorityActions(idea.priority, (next) => void act.run(put("priority", next))),
  ];
  if (idea.thread_id) {
    more.push({
      label: "Open its thread",
      icon: ArrowUpRight,
      onSelect: () => navigate(`/chat?lead=spark&thread=${idea.thread_id}`),
    });
  }
  more.push(withdraw);
  return { start: pause, end: withdraw, more };
}

/** One idea as a managed row: swipe right to pause or resume, left to withdraw. */
function IdeaRow({ idea, onEdit }: { idea: Idea; onEdit: () => void }) {
  const actions = useIdeaActions(idea, onEdit);
  const facts = [
    idea.lead,
    idea.withdrawn ? "Withdrawn" : idea.paused ? `Paused · ${idea.state}` : idea.state,
    idea.priority === "normal" ? null : PRIORITY_WORDS[idea.priority],
  ].filter(Boolean);
  return (
    <ActionRow
      title={idea.title}
      meta={[idea.summary, facts.join(" · ")].filter(Boolean).join(" — ")}
      leading={<LiveAvatar name={idea.lead} size={28} />}
      start={actions.start}
      end={actions.end}
      more={actions.more}
    />
  );
}

/** The ideas board: Submit an idea, then every idea, withdrawn ones last. */
function Ideas({ ideas }: { ideas: Idea[] }) {
  const [editing, setEditing] = useState<Idea | null>(null);
  const [adding, setAdding] = useState(false);
  const ordered = [...ideas.filter((i) => !i.withdrawn), ...ideas.filter((i) => i.withdrawn)];
  return (
    <Section title="Ideas" aside={`${ideas.filter((i) => !i.withdrawn).length} open`}>
      <button type="button" className="btn" onClick={() => setAdding(true)}>
        <Lightbulb size={18} aria-hidden="true" />
        Submit an idea
      </button>
      <div className="list">
        <AnimatePresence initial={false} mode="popLayout">
          {ordered.map((idea) => (
            <m.div key={idea.id} layout="position" exit={LEAVE}>
              <IdeaRow idea={idea} onEdit={() => setEditing(idea)} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
      {/* A fresh form each time it opens, so it starts from the idea it edits. */}
      <IdeaSheet
        key={editing?.id ?? (adding ? "new" : "closed")}
        idea={editing}
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </Section>
  );
}

// Products --------------------------------------------------------------------------------------

/** One product: its repository, its GitHub mirror and open pull requests, WIP, and Retire. */
function ProductCard({ product }: { product: Product }) {
  const { run, busy } = useAction<WorkItem>({
    refresh: [...REFRESH, "approvals", "platform"],
    done: (item) => `Foreman opened ${item.id}. Approve it in Approvals to go ahead.`,
  });
  const retire = () => void run(() => send<WorkItem>("POST", `/products/${product.id}/retire`));
  const actions: MoreAction[] = [];
  if (product.github_url) {
    const url = product.github_url;
    actions.push({
      label: "Open on GitHub",
      icon: ArrowUpRight,
      onSelect: () => window.open(url, "_blank", "noopener"),
    });
  }
  if (product.state === "released") {
    actions.push({ label: "Ask Foreman to retire it", icon: Power, onSelect: retire });
  }
  const { triggerProps, button, menu } = useMoreMenu(actions, product.name);
  return (
    <article className="card stack" aria-label={product.name} {...triggerProps}>
      <div className="row">
        <h3 className="grow">{product.name}</h3>
        <span className="tag">{product.state === "retiring" ? "Retiring" : "Released"}</span>
        {button}
        {menu}
      </div>
      <p className="small mono muted">{product.repo_path}</p>
      <p className="small">
        {product.wip} of {product.wip_limit} work items in build and test
      </p>
      {product.pull_requests.length > 0 && (
        <ul className="stack" style={{ ["--gap" as string]: "var(--space-2)" }}>
          {product.pull_requests.map((pr) => (
            <li key={pr.number}>
              <a className="btn compact" href={pr.url} target="_blank" rel="noreferrer">
                #{pr.number} {pr.title}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
        {product.github_url && (
          <a className="btn compact" href={product.github_url} target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        )}
        {product.state === "released" && (
          <button type="button" className="btn compact" disabled={busy} onClick={retire}>
            Retire
          </button>
        )}
      </div>
    </article>
  );
}

// Threads ---------------------------------------------------------------------------------------

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
  const pick = (next: string) => onChange(next === value ? ALL : next);
  return (
    <div className="face-filter" role="group" aria-label="Lead">
      <button
        type="button"
        aria-label="All leads"
        aria-pressed={value === ALL}
        onClick={() => onChange(ALL)}
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
function ThreadGrid({ threads, leads }: { threads: Thread[]; leads: LeadRef[] }) {
  return (
    <div className="card-grid">
      <Reflow>
        {threads.map((thread) => (
          <ReflowItem key={thread.id}>
            <ThreadCard thread={thread} leads={leads} />
          </ReflowItem>
        ))}
      </Reflow>
    </div>
  );
}

const PRINCIPALS = [
  ["owner", "You"],
  ["mom", "Mom"],
  ["dad", "Dad"],
] as const;

/** The thread filters, all in the URL: lead, pipeline, principal, state and archived. */
interface ThreadFilters {
  lead: string;
  pipeline: string;
  principal: string;
  state: string;
  archived: boolean;
}

function readFilters(params: URLSearchParams): ThreadFilters {
  return {
    lead: params.get("lead") ?? ALL,
    pipeline: params.get("pipeline") ?? ALL,
    principal: params.get("principal") ?? ALL,
    state: params.get("state") ?? ALL,
    archived: params.get("archived") === "1",
  };
}

/** The filters as URL parameters, leaving out every one at All. */
function writeFilters(filters: ThreadFilters): Record<string, string> {
  const out: Record<string, string> = {};
  (["lead", "pipeline", "principal", "state"] as const).forEach((key) => {
    if (filters[key] !== ALL) out[key] = filters[key];
  });
  if (filters.archived) out.archived = "1";
  return out;
}

/** Pipeline, principal and state pills, and the Archived switch. */
function FilterBar({
  filters,
  pipelines,
  onChange,
}: {
  filters: ThreadFilters;
  pipelines: string[];
  onChange: (next: ThreadFilters) => void;
}) {
  const set = (key: "pipeline" | "principal" | "state") => (value: string) =>
    onChange({ ...filters, [key]: value });
  const states = Object.entries(THREAD_STATE)
    .filter(([state]) => state !== "resolved")
    .map(([state, words]) => [state, words.label] as const);
  return (
    <div className="row wrap filter-bar" role="group" aria-label="Filters">
      <FilterMenu
        label="Pipeline"
        value={filters.pipeline}
        options={pipelines.map((p) => [p, p] as const)}
        onChange={set("pipeline")}
      />
      <FilterMenu
        label="For"
        value={filters.principal}
        options={PRINCIPALS}
        onChange={set("principal")}
      />
      <FilterMenu label="State" value={filters.state} options={states} onChange={set("state")} />
      <button
        type="button"
        className="btn compact filter-button"
        aria-pressed={filters.archived}
        onClick={() => onChange({ ...filters, archived: !filters.archived })}
      >
        <Archive size={16} aria-hidden="true" />
        Archived
      </button>
    </div>
  );
}

/** The Threads view: filters, open threads by state, the recently resolved, then archived. */
function Threads({
  threads,
  leads: movable,
  filters,
  onFilters,
}: {
  threads: ThreadsOverview;
  leads: LeadRef[];
  filters: ThreadFilters;
  onFilters: (next: ThreadFilters) => void;
}) {
  const every = [...threads.open, ...threads.recently_resolved, ...threads.archived];
  const leads = leadsOf(every);
  const pipelines = [...new Set(every.map((thread) => thread.pipeline))];
  const shown = (thread: Thread) =>
    (filters.lead === ALL || thread.lead_name === filters.lead) &&
    (filters.pipeline === ALL || thread.pipeline === filters.pipeline) &&
    (filters.principal === ALL || thread.principal === filters.principal) &&
    (filters.state === ALL || thread.state === filters.state);
  const open = threads.open.filter(shown);
  const stateChosen = filters.state !== ALL;
  const resolved = stateChosen ? [] : threads.recently_resolved.filter(shown);
  const archived = filters.archived && !stateChosen ? threads.archived.filter(shown) : [];
  return (
    <>
      <LeadFilter
        leads={leads}
        value={filters.lead}
        onChange={(lead) => onFilters({ ...filters, lead })}
      />
      <FilterBar filters={filters} pipelines={pipelines} onChange={onFilters} />
      <ThreadSections
        open={open}
        resolved={resolved}
        archived={archived}
        filters={filters}
        leads={movable}
      />
    </>
  );
}

/** Open threads by state, the recently resolved, then the archived ones when asked for. */
function ThreadSections({
  open,
  resolved,
  archived,
  filters,
  leads: movable,
}: {
  open: Thread[];
  resolved: Thread[];
  archived: Thread[];
  filters: ThreadFilters;
  leads: LeadRef[];
}) {
  return (
    <>
      <Reflow>
        {open.length === 0 && (
          <ReflowItem key="empty">
            <p className="card empty">No open threads here.</p>
          </ReflowItem>
        )}
        {byState(open).map(([state, group]) => (
          <ReflowItem key={state}>
            <Section title={THREAD_STATE[state].label} aside={`${group.length}`}>
              <ThreadGrid threads={group} leads={movable} />
            </Section>
          </ReflowItem>
        ))}
        {resolved.length > 0 && (
          <ReflowItem key="resolved">
            <Section title="Recently resolved">
              <ThreadGrid threads={resolved} leads={movable} />
            </Section>
          </ReflowItem>
        )}
        {filters.archived && (
          <ReflowItem key="archived">
            <Section title="Archived" aside={`${archived.length}`}>
              {archived.length === 0 ? (
                <p className="card empty">Nothing archived matches these filters.</p>
              ) : (
                <ThreadGrid threads={archived} leads={movable} />
              )}
            </Section>
          </ReflowItem>
        )}
      </Reflow>
    </>
  );
}

// Boards ----------------------------------------------------------------------------------------

const VIEWS = [
  { value: "threads", label: "Threads" },
  { value: "boards", label: "Boards" },
] as const;

/** The boards view: work items by stage, reviews waiting, ideas, and products. */
function Boards({ board }: { board: WorkBoard }) {
  return (
    <>
      <Section
        title="In progress"
        aside={`${board.items.length} items · ${board.wip.in_progress} of ${board.wip.limit} in build and test`}
      >
        <div className="card-grid">
          {board.items.map((item) => (
            <WorkCard key={item.id} item={item} />
          ))}
        </div>
      </Section>
      <Section title="Reviews">
        <div className="list">
          {board.reviews.map((review) => (
            <ActionRow
              key={review.id}
              title={review.title}
              meta={`${review.reviewer} · readability ${review.readability} · +${review.added_lines} −${review.removed_lines}`}
              leading={<LiveAvatar name={review.reviewer} size={28} />}
              href={review.item_id ? `/work/items/${review.item_id}#diff` : null}
            />
          ))}
        </div>
      </Section>
      <Ideas ideas={board.ideas} />
      <Section title="Products">
        <div className="card-grid">
          {board.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </Section>
    </>
  );
}

/** The Work page. */
export default function Work() {
  const query = useWorkBoard();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "boards" ? "boards" : "threads";
  const filters = readFilters(params);
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
                leads={board.leads}
                filters={filters}
                onFilters={(next) => setParams(writeFilters(next))}
              />
            )}
          </Swap>
        )}
      </QueryState>
    </Page>
  );
}
