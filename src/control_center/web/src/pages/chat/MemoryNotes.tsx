/**
 * @file Memory on a chat message (spec 15.9.3). Under a reply that read saved notes, a "Used
 * memory" chip opens the list, each note linking to the Memory view. Under a message that saved or
 * learned a note, a line says so with Edit, which opens it in the Memory view, and Undo, which
 * forgets it.
 */
import { Brain, Pencil, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { ChatMessage, MemoryNote, MemoryOverview } from "../../api/types";

/** Where a note opens in the Memory view. */
const memoryPath = (id: string) => `/chat?view=memory&item=${encodeURIComponent(id)}`;

const LABEL: Record<MemoryNote["outcome"], string> = {
  saved: "Saved to memory",
  updated: "Updated in memory",
  learned: "Learned",
  not_saved: "Not saved",
};

/** "Used memory": the saved notes a reply read, each opening in the Memory view. */
export function UsedMemory({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const used = message.memory_used;
  if (used.length === 0) return null;
  return (
    <div className="used-memory stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
      <button
        type="button"
        className="btn ghost chat-tool"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Brain size={14} aria-hidden="true" />
        Used memory · {used.length}
      </button>
      {open && (
        <ul className="used-memory-list small">
          {used.map((item) => (
            <li key={item.id}>
              <Link to={memoryPath(item.id)}>{item.text}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One note the turn saved or learned, with Edit and Undo. */
function NoteLine({ note }: { note: MemoryNote }) {
  const [undone, setUndone] = useState(false);
  const action = useAction<MemoryOverview>({ refresh: ["memory"] });
  const id = note.item_id ?? "";
  const undo = async () => {
    const answer = await action.run(() => send("POST", `/memory/${id}/forget`));
    if (answer) setUndone(true);
  };
  if (undone) return <p className="memory-note muted small">Removed from memory.</p>;
  return (
    <div className="memory-note stack small" style={{ ["--gap" as string]: "0" }}>
      <span className="row memory-note-text">
        <Brain size={14} aria-hidden="true" />
        <span>
          {LABEL[note.outcome]}: {note.text}
        </span>
      </span>
      <span className="row">
        <Link
          to={memoryPath(id)}
          className="btn ghost chat-tool"
          aria-label={`Edit "${note.text}"`}
        >
          <Pencil size={14} aria-hidden="true" />
          Edit
        </Link>
        <button
          type="button"
          className="btn ghost chat-tool"
          aria-label={`Undo "${note.text}"`}
          disabled={action.busy}
          onClick={() => void undo()}
        >
          <Undo2 size={14} aria-hidden="true" />
          Undo
        </button>
      </span>
    </div>
  );
}

/** What the message saved or learned. A note that was not saved is said in the reply itself. */
export function MemoryNotes({ message }: { message: ChatMessage }) {
  const kept = message.memory_notes.filter((note) => note.outcome !== "not_saved");
  if (kept.length === 0) return null;
  return (
    <>
      {kept.map((note) => (
        <NoteLine key={note.item_id} note={note} />
      ))}
    </>
  );
}
