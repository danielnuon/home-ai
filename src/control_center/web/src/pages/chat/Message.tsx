/**
 * @file One chat message with its reply controls (spec 15.9.8): edit one of the Owner's messages,
 * regenerate the lead's latest reply, branch into a new thread from any message, and ‹ 2 / 3 ›
 * to switch between the branches an edit or a regeneration made. Every control is a visible
 * button under the bubble (spec 7.15, rule 5); each answer replaces the conversation in place.
 */
import { ChevronLeft, ChevronRight, GitBranch, Pencil, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { ChatMessage, ChatThread } from "../../api/types";
import { ApprovalPeek } from "../../components/ApprovalPeek";
import { Avatar } from "../../components/Avatar";
import { ARRIVE, m } from "../../design/motion";
import { clockTime } from "../../design/time";

/** Runs one reply control and puts the conversation it answers with on screen. */
export function useChatControl(chat: ChatThread) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const action = useAction<ChatThread>({ refresh: ["chat"] });
  const run = async (path: string, body?: unknown, method: "POST" | "PUT" = "POST") => {
    const thread = chat.thread?.id ?? "";
    const answer = await action.run(() =>
      send<ChatThread>(method, `/chat/${chat.lead.id}/${thread}${path}`, body),
    );
    if (!answer?.thread) return answer;
    client.setQueryData(["chat", chat.lead.id, answer.thread.id], answer);
    if (answer.thread.id !== thread) {
      navigate(`/chat?lead=${chat.lead.id}&thread=${answer.thread.id}`);
    }
    return answer;
  };
  return { run, busy: action.busy };
}

type Control = ReturnType<typeof useChatControl>;

/** ‹ 2 / 3 ›: which of the branches at this point is on show, and the way to the others. */
function BranchSwitcher({ message, control }: { message: ChatMessage; control: Control }) {
  const count = message.sibling_ids.length;
  if (count < 2) return null;
  const go = (step: number) => {
    const target = message.sibling_ids[message.branch - 1 + step];
    if (target) void control.run(`/messages/${target}/switch`);
  };
  return (
    <span className="branch-switch row" aria-label="Branches">
      <button
        type="button"
        className="btn ghost chat-tool"
        aria-label="Previous branch"
        disabled={control.busy || message.branch === 1}
        onClick={() => go(-1)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span className="tiny muted">
        {message.branch} / {count}
      </span>
      <button
        type="button"
        className="btn ghost chat-tool"
        aria-label="Next branch"
        disabled={control.busy || message.branch === count}
        onClick={() => go(1)}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </span>
  );
}

/** The field that replaces an Owner's bubble while they edit it. */
function EditField(props: { message: ChatMessage; control: Control; onDone: () => void }) {
  const { message, control, onDone } = props;
  const [text, setText] = useState(message.text);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const answer = await control.run(`/messages/${message.id}/edit`, { text });
    if (answer) onDone();
  };
  return (
    <form className="stack chat-edit" onSubmit={save}>
      <textarea
        className="field"
        aria-label="Edit your message"
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
      />
      <span className="muted tiny">
        Sends it again as a new branch. The original stays, one tap away.
      </span>
      <span className="row">
        <button
          type="submit"
          className="btn primary compact"
          disabled={control.busy || !text.trim()}
        >
          Send edit
        </button>
        <button type="button" className="btn compact" onClick={onDone}>
          Cancel
        </button>
      </span>
    </form>
  );
}

interface ToolsProps {
  message: ChatMessage;
  control: Control;
  latest: boolean;
  onEdit: () => void;
}

/** The controls under a finished message, as small labelled buttons. */
function Tools({ message, control, latest, onEdit }: ToolsProps) {
  const mine = message.author === "owner";
  const tool = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" className="btn ghost chat-tool" disabled={control.busy} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
  return (
    <span className="chat-tools row wrap">
      <BranchSwitcher message={message} control={control} />
      {mine && tool("Edit", <Pencil size={14} aria-hidden="true" />, onEdit)}
      {!mine &&
        latest &&
        tool("Regenerate", <RotateCcw size={14} aria-hidden="true" />, () => {
          void control.run(`/messages/${message.id}/regenerate`);
        })}
      {tool("Branch", <GitBranch size={14} aria-hidden="true" />, () => {
        void control.run(`/messages/${message.id}/branch`);
      })}
    </span>
  );
}

interface MessageProps {
  message: ChatMessage;
  chat: ChatThread;
  control: Control;
  latest: boolean;
}

/** The bubble itself: the text as it streams, then its notes, approval and time. */
function Bubble({ message }: { message: ChatMessage }) {
  return (
    <div className="bubble stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
      <p>
        {message.text}
        {message.streaming && (
          <span className="cursor" aria-hidden="true">
            ▍
          </span>
        )}
      </p>
      {message.stopped && <p className="muted small">Stopped</p>}
      {message.note && <p className="muted small">{message.note}</p>}
      {message.approval_id && <ApprovalPeek approvalId={message.approval_id} />}
      <span className="muted tiny">{clockTime(message.at)}</span>
    </div>
  );
}

/** One message bubble, with its controls once it has finished. */
export function Message({ message, chat, control, latest }: MessageProps) {
  const mine = message.author === "owner";
  const [editing, setEditing] = useState(false);
  const settled = !message.streaming && !editing && chat.thread !== null;
  return (
    <m.li className={`message ${mine ? "mine" : "theirs"}`} {...ARRIVE}>
      {!mine && (
        <Avatar
          department={chat.lead.department}
          state={message.streaming ? "generating" : "idle"}
          name={chat.lead.name}
          size={28}
        />
      )}
      <div className="message-body stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
        {editing ? (
          <EditField message={message} control={control} onDone={() => setEditing(false)} />
        ) : (
          <Bubble message={message} />
        )}
        {settled && (
          <Tools
            message={message}
            control={control}
            latest={latest}
            onEdit={() => setEditing(true)}
          />
        )}
      </div>
    </m.li>
  );
}
