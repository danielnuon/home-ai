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
 * messages rise in; nothing pops (spec 7.14).
 */
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ChevronLeft, SquarePen } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useChat } from "../api/queries";
import type { ChatLead, ChatMessage, ChatThread, Thread } from "../api/types";
import { ApprovalPeek } from "../components/ApprovalPeek";
import { Avatar, STATE_WORDS } from "../components/Avatar";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { chatPath, THREAD_STATE } from "../components/ThreadCard";
import { AnimatePresence, ARRIVE, m } from "../design/motion";
import { StatusText } from "../design/status";
import { clockTime } from "../design/time";
import { useLayout } from "../design/useLayout";
import { scroller } from "../shell/scroll";

const DEFAULT_LEAD = "atlas";

/** The `thread` value for a chat that has no thread yet; it gets one with its first message. */
const NEW_CHAT = "new";

/** One message bubble. */
function Message({ message, thread }: { message: ChatMessage; thread: ChatThread }) {
  const mine = message.author === "owner";
  return (
    <m.li className={`message ${mine ? "mine" : "theirs"}`} {...ARRIVE}>
      {!mine && (
        <Avatar
          department={thread.lead.department}
          state={message.streaming ? "generating" : "idle"}
          name={thread.lead.name}
          size={28}
        />
      )}
      <div className="bubble stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
        <p>
          {message.text}
          {message.streaming && (
            <span className="cursor" aria-hidden="true">
              ▍
            </span>
          )}
        </p>
        {message.note && <p className="muted small">{message.note}</p>}
        {message.approval_id && <ApprovalPeek approvalId={message.approval_id} />}
        <span className="muted tiny">{clockTime(message.at)}</span>
      </div>
    </m.li>
  );
}

interface ComposerProps {
  leadId: string;
  leadName: string;
  /** The thread the message continues, or null to start one. */
  threadId: string | null;
  /** Called with the new thread's id after the first message of a new chat. */
  onStarted: (threadId: string) => void;
}

/** The message box. */
function Composer({ leadId, leadName, threadId, onStarted }: ComposerProps) {
  const [text, setText] = useState("");
  const client = useQueryClient();
  const post = useAction<ChatThread>({ refresh: ["chat"] });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const body = { text: text.trim(), thread_id: threadId };
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
      <button
        type="submit"
        className="btn primary send"
        aria-label="Send"
        disabled={post.busy || !text.trim()}
      >
        <ArrowUp size={18} aria-hidden="true" />
      </button>
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
function Messages({ thread }: { thread: ChatThread }) {
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
          <Message key={message.id} message={message} thread={thread} />
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

/** The conversation: its title and lead, the messages, and the message box. */
function Conversation({ chat, phone }: { chat: ChatThread; phone: boolean }) {
  const navigate = useNavigate();
  const { lead } = chat;
  return (
    <section className="card chat stack" aria-label={`Chat with ${lead.name}`}>
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
      <Messages thread={chat} />
      <OnTheBar>
        <Composer
          key={chat.thread?.id ?? NEW_CHAT}
          leadId={lead.id}
          leadName={lead.name}
          threadId={chat.thread?.id ?? null}
          onStarted={(id) => navigate(`/chat?lead=${lead.id}&thread=${id}`, { replace: true })}
        />
      </OnTheBar>
    </section>
  );
}

/**
 * The Chat page. `lead` picks the lead and `thread` the conversation: a thread id, `new` for a new
 * chat, or nothing. With nothing, a phone shows the list and a wider screen opens a new chat.
 */
export default function Chat() {
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
