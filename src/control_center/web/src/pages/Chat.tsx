/**
 * @file Chat: talk to one of the five leads in plain words (design: Chat; spec 7.16, rule 12).
 *
 * The reply streams in over the event stream as the lead writes it. When a request needs the
 * Owner's approval, the lead's message links to the approval card rather than acting.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useChat } from "../api/queries";
import type { ChatMessage, ChatThread } from "../api/types";
import { Avatar } from "../components/Avatar";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { clockTime } from "../design/time";

const DEFAULT_LEAD = "atlas";

/** One message bubble. */
function Message({ message, thread }: { message: ChatMessage; thread: ChatThread }) {
  const mine = message.author === "owner";
  return (
    <li className={`message ${mine ? "mine" : "theirs"}`}>
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
        {message.approval_id && (
          <Link to="/approvals" className="small">
            Open approval {message.approval_id}
          </Link>
        )}
        <span className="muted tiny">{clockTime(message.at)}</span>
      </div>
    </li>
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
      <button type="submit" className="btn primary" disabled={post.busy || !text.trim()}>
        Send
      </button>
    </form>
  );
}

/** The thread, kept scrolled to the newest message. */
function Thread({ thread }: { thread: ChatThread }) {
  const end = useRef<HTMLLIElement>(null);
  const last = thread.messages.at(-1);
  useEffect(() => end.current?.scrollIntoView?.({ block: "end" }), [last?.id, last?.text]);
  return (
    <ol className="messages" aria-live="polite">
      {thread.messages.length === 0 && (
        <li className="empty">
          Ask {thread.lead.name} anything, or ask them to do something for you.
        </li>
      )}
      {thread.messages.map((message) => (
        <Message key={message.id} message={message} thread={thread} />
      ))}
      <li ref={end} aria-hidden="true" />
    </ol>
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
        <Page title="Chat" subtitle={`${thread.lead.name} · ${thread.lead.title}`}>
          <div className="row wrap" role="group" aria-label="Lead">
            {thread.leads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                className="chip"
                aria-pressed={lead.id === leadId}
                onClick={() => setParams({ lead: lead.id })}
              >
                {lead.name}
              </button>
            ))}
          </div>
          <section className="card chat stack" aria-label={`Chat with ${thread.lead.name}`}>
            <Thread thread={thread} />
            <Composer leadId={leadId} leadName={thread.lead.name} />
          </section>
        </Page>
      )}
    </QueryState>
  );
}
