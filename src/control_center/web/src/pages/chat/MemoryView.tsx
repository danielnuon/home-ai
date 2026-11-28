/**
 * @file The Memory view, a tab of Chat (spec 15.9.7): every saved note by scope, what waits to be
 * confirmed, what was learned today with Undo, a way to add "don't bring this up", and the switch
 * that pauses memory. Restricted notes are not saved until Phase 10, so none is shown here yet.
 */
import { Check, Undo2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMemory } from "../../api/queries";
import type { MemoryItem, MemoryOverview } from "../../api/types";
import { Segmented, Switch } from "../../components/Controls";
import { QueryState } from "../../components/QueryState";
import { MemoryItemRow } from "./MemoryItemRow";
import { useMemoryAction } from "./useMemoryAction";

type Action = ReturnType<typeof useMemoryAction>;
type ScopeFilter = "all" | "owner" | "domain" | "product" | "lead";

const SCOPES: readonly { value: ScopeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "owner", label: "Everyone" },
  { value: "domain", label: "Domains" },
  { value: "product", label: "Products" },
  { value: "lead", label: "Leads" },
];

const inScope = (item: MemoryItem, scope: ScopeFilter) =>
  scope === "all" ||
  item.scope === scope ||
  (scope === "domain" && item.scope === "space") ||
  (scope === "product" && item.scope === "idea");

/** "Pause memory": items are kept, but none is read or learned until it resumes. */
function PauseRow({ memory, action }: { memory: MemoryOverview; action: Action }) {
  return (
    <div className="chat-privacy row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="small row-title">Pause memory</span>
        <span className="tiny muted">
          {memory.paused
            ? "Paused. Notes are kept, but no lead reads or learns any."
            : "Leads read these notes and learn new ones as you chat."}
        </span>
      </span>
      <Switch
        checked={memory.paused}
        label="Pause memory"
        disabled={action.busy}
        onChange={(paused) => void action.run("/memory/paused", { paused }, "PUT")}
      />
    </div>
  );
}

/** Notes a lead proposed from something it read: nothing is saved until the Owner confirms. */
function ToConfirm({ items, action }: { items: MemoryItem[]; action: Action }) {
  if (items.length === 0) return null;
  return (
    <section className="stack" aria-label="To confirm">
      <h2 className="small row-title">To confirm</h2>
      <ul className="memory-items">
        {items.map((item) => (
          <li key={item.id} className="memory-item stack">
            <span>{item.text}</span>
            <span className="muted tiny">{item.source ?? "Proposed by a lead"}</span>
            <span className="row">
              <button
                type="button"
                className="btn primary compact"
                disabled={action.busy}
                onClick={() => void action.run(`/memory/${item.id}/confirm`)}
              >
                <Check size={14} aria-hidden="true" />
                Save it
              </button>
              <button
                type="button"
                className="btn compact"
                disabled={action.busy}
                onClick={() => void action.run(`/memory/${item.id}/dismiss`)}
              >
                <X size={14} aria-hidden="true" />
                Don't save
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const DAY_MS = 24 * 3_600_000;

/** What leads learned in the last day, each with Undo (15.9.3, write path 2). */
function RecentlyLearned({ items, action }: { items: MemoryItem[]; action: Action }) {
  const [now] = useState(Date.now);
  const since = now - DAY_MS;
  const recent = items.filter(
    (item) =>
      item.how === "learned" && item.status === "active" && Date.parse(item.saved_at) > since,
  );
  if (recent.length === 0) return null;
  return (
    <section className="stack" aria-label="Recently learned">
      <h2 className="small row-title">Recently learned</h2>
      <ul className="memory-items">
        {recent.map((item) => (
          <li key={item.id} className="memory-item row">
            <span className="grow">{item.text}</span>
            <button
              type="button"
              className="btn ghost chat-tool"
              aria-label={`Undo "${item.text}"`}
              disabled={action.busy}
              onClick={() => void action.run(`/memory/${item.id}/forget`)}
            >
              <Undo2 size={14} aria-hidden="true" />
              Undo
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Don't bring this up": a topic no lead raises unless the Owner does. */
function AvoidForm({ action }: { action: Action }) {
  const [text, setText] = useState("");
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await action.run("/memory", { text, kind: "avoid" })) setText("");
  };
  return (
    <form className="row composer-inline" onSubmit={add}>
      <input
        className="field grow"
        aria-label="Don't bring this up"
        placeholder="Don't bring this up…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="btn compact" disabled={action.busy || !text.trim()}>
        Add
      </button>
    </form>
  );
}

/** The notes in the chosen scope, with replaced ones on request. */
function Notes(props: { memory: MemoryOverview; action: Action; focus: string | null }) {
  const { memory, action, focus } = props;
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [replaced, setReplaced] = useState(false);
  const shown = memory.items.filter(
    (item) =>
      inScope(item, scope) &&
      (item.status === "active" || (replaced && item.status === "superseded")),
  );
  return (
    <section className="stack" aria-label="Saved notes">
      <Segmented label="Scope" value={scope} options={SCOPES} onChange={setScope} />
      {shown.length === 0 ? (
        <p className="muted small">No notes here.</p>
      ) : (
        <ul className="memory-items">
          {shown.map((item) => (
            <MemoryItemRow key={item.id} item={item} action={action} focused={item.id === focus} />
          ))}
        </ul>
      )}
      <span className="row small">
        <Switch checked={replaced} label="Show replaced notes" onChange={setReplaced} />
        <span aria-hidden="true">Show replaced notes</span>
      </span>
    </section>
  );
}

/** The Memory view. `focus` is a note to scroll to and mark, from a chat's "Used memory". */
export function MemoryView({ focus }: { focus: string | null }) {
  const query = useMemory();
  const action = useMemoryAction();
  return (
    <QueryState query={query}>
      {(memory) => (
        <div className="memory-view stack">
          <PauseRow memory={memory} action={action} />
          <ToConfirm items={memory.items.filter((i) => i.status === "proposed")} action={action} />
          <RecentlyLearned items={memory.items} action={action} />
          <Notes memory={memory} action={action} focus={focus} />
          <AvoidForm action={action} />
        </div>
      )}
    </QueryState>
  );
}
