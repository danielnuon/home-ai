/**
 * @file Chat: talk to one of the five leads in plain words (design: Chat; spec 7.16, rule 12).
 *
 * It reads like a messaging app: a row of contact circles at the top, one per lead, each with
 * the lead's face, live state and what they are doing; then the conversation and the message box.
 * On a phone the conversation is the screen itself rather than a card: the lead's name stays
 * pinned at the top, bubbles run edge to edge, and the message box sits on the tab bar (decision 135).
 * The reply streams in over the event stream as the lead writes it. When a request needs the
 * Owner's approval, the lead's message links to the approval card rather than acting. New
 * messages rise in; nothing pops (spec 7.14).
 */
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useChat } from "../api/queries";
import type { ChatLead, ChatMessage, ChatThread } from "../api/types";
import { ApprovalPeek } from "../components/ApprovalPeek";
import { Avatar, STATE_WORDS } from "../components/Avatar";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { AnimatePresence, ARRIVE, m } from "../design/motion";
import { clockTime } from "../design/time";
import { scroller } from "../shell/scroll";

const DEFAULT_LEAD = "atlas";

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

/** The message box. */
function Composer({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [text, setText] = useState("");
  const post = useAction<ChatThread>({ refresh: ["chat"] });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const sent = await post.run(() => send("POST", `/chat/${leadId}`, { text: text.trim() }));
    if (sent) setText("");
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
function useFollowNewest(leadId: string, change: unknown, ownerLast: string | undefined) {
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
    if (atBottom || justSent || opened.current !== leadId) {
      end.current?.scrollIntoView?.({ block: "end" });
    }
    opened.current = leadId;
    sent.current = ownerLast;
  }, [leadId, change, ownerLast]);
  return { list, end };
}

/** The thread, kept scrolled to the newest message. */
function Thread({ thread }: { thread: ChatThread }) {
  const last = thread.messages.at(-1);
  const { list, end } = useFollowNewest(
    thread.lead.id,
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

/** The Chat page. */
export default function Chat() {
  const [params, setParams] = useSearchParams();
  const leadId = params.get("lead") ?? DEFAULT_LEAD;
  const query = useChat(leadId);
  return (
    <QueryState query={query}>
      {(thread) => (
        <Page title="Chat">
          <Contacts
            leads={thread.leads}
            current={leadId}
            onPick={(id) => setParams({ lead: id })}
          />
          <section className="card chat stack" aria-label={`Chat with ${thread.lead.name}`}>
            <header className="row chat-head">
              <Avatar
                department={thread.lead.department}
                state={thread.lead.state}
                name={thread.lead.name}
                size={36}
              />
              <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                <span className="row-title">{thread.lead.name}</span>
                <span className="muted small">
                  {thread.lead.title} · {thread.lead.now || STATE_WORDS[thread.lead.state]}
                </span>
              </span>
            </header>
            <Thread thread={thread} />
            <Composer leadId={leadId} leadName={thread.lead.name} />
          </section>
        </Page>
      )}
    </QueryState>
  );
}
