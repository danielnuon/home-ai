/**
 * @file A conversation's privacy (spec 15.9.6). Before the first message, the Private switch makes
 * the new chat temporary: no memory is read or written, it is left out of search and of Work, and
 * its transcript is deleted after 24 hours unless the Owner keeps it. In a temporary chat a banner
 * says so, with "Keep this chat". In any other thread, "Learn from this chat" is the switch for
 * "Don't learn from this chat": off, nothing is learned from it, though it still reads memory.
 */
import { EyeOff } from "lucide-react";
import type { ChatThread } from "../../api/types";
import { Switch } from "../../components/Controls";
import { timeLeft } from "../../design/time";
import type { useChatControl } from "./Message";

type Control = ReturnType<typeof useChatControl>;

/** The Private switch on a new chat, before its first message. */
export function PrivateSwitch(props: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="chat-privacy row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="small row-title">Private</span>
        <span className="tiny muted">
          Temporary chat: no memory, not searchable, deleted after 24 hours.
        </span>
      </span>
      <Switch checked={props.checked} label="Private" onChange={props.onChange} />
    </div>
  );
}

/** The banner of a temporary chat, with the way to keep it. */
function TemporaryBanner({ until, control }: { until: string; control: Control }) {
  return (
    <div className="chat-privacy temporary row" role="status">
      <EyeOff size={16} aria-hidden="true" />
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="small row-title">Temporary chat · {timeLeft(until)}</span>
        <span className="tiny muted">
          No memory is read or written, and it isn't searchable. Approvals still apply.
        </span>
      </span>
      <button
        type="button"
        className="btn compact"
        disabled={control.busy}
        onClick={() => void control.run("/keep")}
      >
        Keep this chat
      </button>
    </div>
  );
}

/** "Learn from this chat": off is "Don't learn from this chat". */
function LearningSwitch({ chat, control }: { chat: ChatThread; control: Control }) {
  const learning = chat.thread?.learning ?? true;
  const change = (next: boolean) => void control.run("/learning", { learning: next }, "PUT");
  return (
    <div className="chat-privacy row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="small row-title">Learn from this chat</span>
        <span className="tiny muted">
          {learning
            ? "What is learned here may be saved to memory."
            : "Nothing is learned from this chat. Saying “remember” still works."}
        </span>
      </span>
      <Switch
        checked={learning}
        label="Learn from this chat"
        disabled={control.busy}
        onChange={change}
      />
    </div>
  );
}

/** The privacy of the thread on show: the temporary banner, or the learning switch. */
export function ChatPrivacy({ chat, control }: { chat: ChatThread; control: Control }) {
  const until = chat.thread?.temporary_until;
  if (!chat.thread) return null;
  return until ? (
    <TemporaryBanner until={until} control={control} />
  ) : (
    <LearningSwitch chat={chat} control={control} />
  );
}
