/**
 * @file Chat: talk to one of the five leads in plain words (design: Chat; spec 7.16, rule 12).
 *
 * It reads like a messaging app: a row of contact circles at the top, one per lead, each with
 * the lead's face, live state and what they are doing; under the lead picked, that lead's threads
 * with their states and New chat; then the conversation and the message box. Every chat is a
 * thread (spec 15.8.1, 15.8.9): picking one continues it, and New starts one with the first message.
 * On a phone the list and the conversation are two screens, as in a messaging app, and the
 * conversation is the screen itself rather than a card: its title stays pinned at the top with a
 * way back to the list, bubbles run edge to edge, and the message box sits on the tab bar
 * (decisions 135, 137). On wider screens the list sits beside the conversation.
 * The reply streams in over the event stream as the lead writes it. When a request needs the
 * Owner's approval, the lead's message links to the approval card rather than acting. New
 * messages rise in; nothing pops (spec 7.14). The Memory tab lists the Owner's saved notes
 * (15.9.7).
 */
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ChevronLeft, Square, SquarePen } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useChat } from "../api/queries";
import type { ChatLead, ChatThread, Thread } from "../api/types";
import { Avatar, STATE_WORDS } from "../components/Avatar";
import { Segmented } from "../components/Controls";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { chatPath, THREAD_STATE } from "../components/ThreadCard";
import { AnimatePresence } from "../design/motion";
import { StatusText } from "../design/status";
import { useLayout } from "../design/useLayout";
import { scroller } from "../shell/scroll";
import { Message, useChatControl } from "./chat/Message";
import { MemoryView } from "./chat/MemoryView";
import { ChatPrivacy, PrivateSwitch } from "./chat/Privacy";

type Control = ReturnType<typeof useChatControl>;

const DEFAULT_LEAD = "atlas";

/** The `thread` value for a chat that has no thread yet; it gets one with its first message. */
const NEW_CHAT = "new";

interface ComposerProps {
  leadId: string;
  leadName: string;
  /** The thread the message continues, or null to start one. */
  threadId: string | null;
  /** Called with the new thread's id after the first message of a new chat. */
  onStarted: (threadId: string) => void;
  /** While a reply is being written, the send button stops it instead (spec 15.9.8). */
  onStop: (() => void) | null;
  /** Whether a new chat starts as a temporary chat (spec 15.9.6). */
  temporary?: boolean;
}

/** The message box. */
function Composer({ leadId, leadName, threadId, onStarted, onStop, temporary }: ComposerProps) {
  const [text, setText] = useState("");
  const client = useQueryClient();
  const post = useAction<ChatThread>({ refresh: ["chat"] });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const body = { text: text.trim(), thread_id: threadId, temporary: temporary === true };
    const sent = await post.run(() => send<ChatThread>("POST", `/chat/${leadId}`, body));
    if (!sent) return;
    setText("");
    if (threadId === null && sent.thread) {
      client.setQueryData(["chat", leadId, sent.thread.id], sent);
      onStarted(sent.thread.id);
    }
  };
  return (
    <form className="composer row" onSubmit={submit}>
      <input
        className="field grow"
        aria-label={`Message ${leadName}`}
        placeholder={`Message ${leadName}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {onStop && !text.trim() ? (
        <button type="button" className="btn primary send" aria-label="Stop" onClick={onStop}>
          <Square size={14} fill="currentColor" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="submit"
          className="btn primary send"
          aria-label="Send"
          disabled={post.busy || !text.trim()}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}

/**
 * Keeps the newest message in view without fighting the reader. On a wide screen the messages
 * scroll in their own panel, which is moved directly so the page never jumps. On a phone there is
 * one scroller, the page, so a reply follows the conversation only while the Owner is already at
 * the bottom (or has just opened it, or just sent something), and never pulls them away from what
 * they scrolled up to read.
 */
function useFollowNewest(openKey: string, change: unknown, ownerLast: string | undefined) {
  const list = useRef<HTMLOListElement>(null);
  const end = useRef<HTMLLIElement>(null);
  const opened = useRef<string | null>(null);
  const sent = useRef(ownerLast);
  useEffect(() => {
    const panel = list.current;
    if (!panel) return;
    if (getComputedStyle(panel).overflowY === "auto") {
      panel.scrollTop = panel.scrollHeight;
      return;
    }
    const page = scroller();
    const atBottom = page.scrollHeight - page.clientHeight - page.scrollTop < 160;
    const justSent = sent.current !== ownerLast;
    if (atBottom || justSent || opened.current !== openKey) {
      end.current?.scrollIntoView?.({ block: "end" });
    }
    opened.current = openKey;
    sent.current = ownerLast;
  }, [openKey, change, ownerLast]);
  return { list, end };
}

/** The conversation's messages, kept scrolled to the newest. */
function Messages({ thread, control }: { thread: ChatThread; control: Control }) {
  const latest = thread.messages.findLast((message) => message.author === "lead")?.id;
  const last = thread.messages.at(-1);
  const { list, end } = useFollowNewest(
    thread.thread?.id ?? `${thread.lead.id}:${NEW_CHAT}`,
    `${last?.id}:${last?.text.length}`,
    thread.messages.findLast((message) => message.author === "owner")?.id,
  );
  return (
    <ol ref={list} className="messages" aria-live="polite">
      {thread.messages.length === 0 && (
        <li className="empty">
          Ask {thread.lead.name} anything, or ask them to do something for you.
        </li>
      )}
      <AnimatePresence initial={false}>
        {thread.messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            chat={thread}
            control={control}
            latest={message.id === latest}
          />
        ))}
      </AnimatePresence>
      <li ref={end} className="messages-end" aria-hidden="true" />
    </ol>
  );
}

/**
 * On a phone the message box is fixed to the screen on the tab bar. It is drawn into the app
 * frame rather than inside the page, because the page rises in with a transform, and a fixed box
 * inside a transformed one is fixed to that box instead: it rode up with the page and then
 * snapped down onto the bar when the arrival finished.
 */
function OnTheBar({ children }: { children: ReactNode }) {
  const frame = useLayout() === "phone" ? document.querySelector(".shell") : null;
  return frame ? createPortal(children, frame) : children;
}

/** The leads as contact circles: face, live state, and what each is doing. */
function Contacts({
  leads,
  current,
  onPick,
}: {
  leads: ChatLead[];
  current: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="contacts" role="group" aria-label="Leads">
      {leads.map((lead) => (
        <button
          key={lead.id}
          type="button"
          className="contact"
          aria-pressed={lead.id === current}
          onClick={() => onPick(lead.id)}
        >
          <Avatar department={lead.department} state={lead.state} name={lead.name} size={48} />
          <span className="small row-title">{lead.name}</span>
          <span className="tiny muted contact-now">{lead.now || STATE_WORDS[lead.state]}</span>
        </button>
      ))}
    </div>
  );
}

/** One of the lead's threads in the list: its title and state, and what is happening in it. */
function ThreadRow({ thread, current }: { thread: Thread; current: boolean }) {
  return (
    <li>
      <Link
        to={chatPath(thread)}
        className="thread-row stack"
        aria-current={current ? "page" : undefined}
      >
        <span className="row">
          <span className="row-title grow thread-row-title">{thread.title}</span>
          {thread.temporary_until && <span className="tag tiny">Temporary</span>}
          <StatusText value={THREAD_STATE[thread.state]} className="tiny" />
        </span>
        <span className="muted small thread-row-detail">{thread.detail}</span>
      </Link>
    </li>
  );
}

/** The lead's threads, open ones in state order and then the resolved, with New chat on top. */
function ThreadList({ chat, current }: { chat: ChatThread; current: string | null }) {
  return (
    <nav className="chat-threads stack" aria-label={`Chats with ${chat.lead.name}`}>
      <Link
        to={`/chat?lead=${chat.lead.id}&thread=${NEW_CHAT}`}
        className="btn new-chat"
        aria-current={current === NEW_CHAT ? "page" : undefined}
      >
        <SquarePen size={16} aria-hidden="true" />
        New chat
      </Link>
      {chat.threads.length === 0 ? (
        <p className="muted small">No chats with {chat.lead.name} yet.</p>
      ) : (
        <ul className="thread-rows">
          {chat.threads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} current={thread.id === current} />
          ))}
        </ul>
      )}
    </nav>
  );
}

/** Where a branched conversation came from, with the way back to it (spec 15.9.8). */
function BranchedFrom({ chat }: { chat: ChatThread }) {
  const from = chat.threads.find((thread) => thread.id === chat.thread?.branched_from);
  if (!from) return null;
  return (
    <Link to={chatPath(from)} className="branched-from small muted row">
      <ChevronLeft size={14} aria-hidden="true" />
      Branched from {from.title}
    </Link>
  );
}

/** The conversation's title, its lead and state, and on a phone the way back to the list. */
function ChatHead({ chat, phone }: { chat: ChatThread; phone: boolean }) {
  const { lead } = chat;
  return (
    <header className="row chat-head">
      {phone && (
        <Link
          to={`/chat?lead=${lead.id}`}
          className="btn icon chat-back"
          aria-label={`All chats with ${lead.name}`}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </Link>
      )}
      <Avatar department={lead.department} state={lead.state} name={lead.name} size={36} />
      <span className="grow stack chat-title" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{chat.thread?.title ?? "New chat"}</span>
        <span className="muted small">
          {lead.name} · {lead.now || STATE_WORDS[lead.state]}
        </span>
      </span>
      {chat.thread && <StatusText value={THREAD_STATE[chat.thread.state]} className="small" />}
    </header>
  );
}

/** The conversation: its title and lead, the messages, and the message box. */
function Conversation({ chat, phone }: { chat: ChatThread; phone: boolean }) {
  const navigate = useNavigate();
  const control = useChatControl(chat);
  const { lead } = chat;
  const [temporary, setTemporary] = useState(false);
  const writing = chat.thread !== null && chat.messages.some((message) => message.streaming);
  return (
    <section className="card chat stack" aria-label={`Chat with ${lead.name}`}>
      <ChatHead chat={chat} phone={phone} />
      {chat.thread?.branched_from && <BranchedFrom chat={chat} />}
      <ChatPrivacy chat={chat} control={control} />
      {!chat.thread && <PrivateSwitch checked={temporary} onChange={setTemporary} />}
      <Messages thread={chat} control={control} />
      <OnTheBar>
        <Composer
          key={chat.thread?.id ?? NEW_CHAT}
          leadId={lead.id}
          leadName={lead.name}
          threadId={chat.thread?.id ?? null}
          onStarted={(id) => {
            setTemporary(false);
            navigate(`/chat?lead=${lead.id}&thread=${id}`, { replace: true });
          }}
          onStop={writing ? () => void control.run("/stop") : null}
          temporary={temporary}
        />
      </OnTheBar>
    </section>
  );
}

type Tab = "chats" | "memory";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "chats", label: "Chats" },
  { value: "memory", label: "Memory" },
];

/**
 * The Chat page. `view=memory` opens the Memory tab, at the note `item` names. Otherwise `lead`
 * picks the lead and `thread` the conversation: a thread id, `new` for a new chat, or nothing.
 */
export default function Chat() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("view") === "memory" ? "memory" : "chats";
  const pick = (next: Tab) => setParams(next === "memory" ? { view: "memory" } : {});
  if (tab === "memory") {
    return (
      <Page title="Chat">
        <Segmented label="Chat or memory" value={tab} options={TABS} onChange={pick} />
        <MemoryView focus={params.get("item")} />
      </Page>
    );
  }
  return (
    <Chats tabs={<Segmented label="Chat or memory" value={tab} options={TABS} onChange={pick} />} />
  );
}

/** The Chats tab: the leads, their threads and the conversation. */
function Chats({ tabs }: { tabs: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const phone = useLayout() === "phone";
  const leadId = params.get("lead") ?? DEFAULT_LEAD;
  const picked = params.get("thread");
  const query = useChat(leadId, picked === NEW_CHAT ? null : picked);
  const listOnly = phone && picked === null;
  return (
    <QueryState query={query}>
      {(chat) => (
        <Page title="Chat">
          {(listOnly || !phone) && tabs}
          {(listOnly || !phone) && (
            <Contacts
              leads={chat.leads}
              current={leadId}
              onPick={(id) => setParams({ lead: id })}
            />
          )}
          {listOnly && <ThreadList chat={chat} current={null} />}
          {phone && !listOnly && <Conversation chat={chat} phone />}
          {!phone && (
            <div className="chat-layout">
              <ThreadList chat={chat} current={picked ?? NEW_CHAT} />
              <Conversation chat={chat} phone={false} />
            </div>
          )}
        </Page>
      )}
    </QueryState>
  );
}
