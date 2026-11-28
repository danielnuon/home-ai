/**
 * @file One saved note in the Memory view (spec 15.9.7): its text, scope, how and when it was
 * saved, how often it is used and where it came from, with Pin, Edit and Forget. Forget offers
 * Undo for ten minutes.
 */
import { Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { MemoryItem } from "../../api/types";
import { useToast } from "../../components/Toasts";
import type { useMemoryAction } from "./useMemoryAction";

type Action = ReturnType<typeof useMemoryAction>;

const HOW: Record<MemoryItem["how"], string> = {
  said: "you said",
  learned: "learned",
  imported: "imported",
  confirmed: "you confirmed",
};

const day = (at: string) => new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });

/** "Everyone · learned Oct 25 · used 3 times, last Oct 24". */
function meta(item: MemoryItem): string {
  const saved = `${item.scope_label} · ${HOW[item.how]} ${day(item.saved_at)}`;
  if (item.status === "proposed") return `${saved} · ${item.source ?? "waiting for you"}`;
  if (item.use_count === 0 || !item.last_used) return `${saved} · not used yet`;
  const times = item.use_count === 1 ? "once" : `${item.use_count} times`;
  return `${saved} · used ${times}, last ${day(item.last_used)}`;
}

/** The field that replaces a note's text while the Owner edits it. */
function EditNote(props: { item: MemoryItem; action: Action; onDone: () => void }) {
  const { item, action, onDone } = props;
  const [text, setText] = useState(item.text);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (await action.run(`/memory/${item.id}`, { text }, "PUT")) onDone();
  };
  return (
    <form className="stack" onSubmit={save}>
      <textarea
        className="field"
        aria-label="Edit the note"
        value={text}
        rows={2}
        onChange={(event) => setText(event.target.value)}
      />
      <span className="row">
        <button type="submit" className="btn primary compact" disabled={action.busy}>
          Save
        </button>
        <button type="button" className="btn compact" onClick={onDone}>
          Cancel
        </button>
      </span>
    </form>
  );
}

/** Pin, Edit and Forget under an active note. */
function NoteTools(props: { item: MemoryItem; action: Action; onEdit: () => void }) {
  const { item, action, onEdit } = props;
  const toast = useToast();
  const forget = async () => {
    if (!(await action.run(`/memory/${item.id}/forget`))) return;
    toast({
      message: "Forgotten.",
      undo: () => void action.run(`/memory/${item.id}/restore`),
    });
  };
  const PinIcon = item.pinned ? PinOff : Pin;
  return (
    <span className="chat-tools row wrap">
      <button
        type="button"
        className="btn ghost chat-tool"
        disabled={action.busy}
        onClick={() => void action.run(`/memory/${item.id}`, { pinned: !item.pinned }, "PUT")}
      >
        <PinIcon size={14} aria-hidden="true" />
        {item.pinned ? "Unpin" : "Pin"}
      </button>
      <button type="button" className="btn ghost chat-tool" onClick={onEdit}>
        <Pencil size={14} aria-hidden="true" />
        Edit
      </button>
      <button
        type="button"
        className="btn ghost chat-tool"
        disabled={action.busy}
        onClick={() => void forget()}
      >
        <Trash2 size={14} aria-hidden="true" />
        Forget
      </button>
    </span>
  );
}

/** The note's tags: pinned, "don't bring up", replaced. */
function Tags({ item }: { item: MemoryItem }) {
  return (
    <>
      {item.pinned && <span className="tag tiny">Pinned</span>}
      {item.kind === "avoid" && <span className="tag tiny">Don't bring up</span>}
      {item.status === "superseded" && <span className="tag tiny">Replaced</span>}
    </>
  );
}

/** One note, with its controls while it is in use. */
export function MemoryItemRow(props: { item: MemoryItem; action: Action; focused: boolean }) {
  const { item, action, focused } = props;
  const [editing, setEditing] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) row.current?.scrollIntoView?.({ block: "center" });
  }, [focused]);
  return (
    <li ref={row} className={`memory-item stack${focused ? " focused" : ""}`}>
      {editing ? (
        <EditNote item={item} action={action} onDone={() => setEditing(false)} />
      ) : (
        <span className="row wrap">
          <span className="grow">{item.text}</span>
          <Tags item={item} />
        </span>
      )}
      <span className="muted tiny">{meta(item)}</span>
      {item.source_thread_id && (
        <Link
          className="tiny"
          to={`/chat?lead=${item.source_lead_id ?? "atlas"}&thread=${item.source_thread_id}`}
        >
          From {item.source_thread_title ?? "a chat"}
        </Link>
      )}
      {item.status === "active" && !editing && (
        <NoteTools item={item} action={action} onEdit={() => setEditing(true)} />
      )}
    </li>
  );
}
