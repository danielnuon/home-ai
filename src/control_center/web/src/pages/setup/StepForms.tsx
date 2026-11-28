/**
 * @file What a Setup step card holds besides its buttons: the secret form, which saves each
 * value behind a passkey and never shows it again, and Atlas's profile interview (spec 24.5;
 * decision 167).
 */
import { CircleCheck, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { SecretField, SetupStep } from "../../api/types";
import { AnimatePresence, LEAVE, m } from "../../design/motion";

type Interview = NonNullable<SetupStep["interview"]>;

const REFRESH = ["setup", "platform", "today"];

/** One secret: a password field and Save, or "Saved" once it is stored. */
function SecretRow({ step, field }: { step: SetupStep; field: SecretField }) {
  const [value, setValue] = useState("");
  const { run, busy } = useAction<SetupStep>({
    refresh: REFRESH,
    done: () => `${field.label} saved`,
  });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run((proof) =>
      send<SetupStep>("POST", `/setup/${step.id}/secrets/${field.id}`, { value }, proof),
    );
    if (saved) setValue("");
  };
  if (field.saved) {
    return (
      <p className="row small status-healthy">
        <CircleCheck size={16} aria-hidden="true" />
        {field.label} saved
      </p>
    );
  }
  return (
    <form
      className="stack"
      style={{ ["--gap" as string]: "var(--space-1)" }}
      onSubmit={(e) => void save(e)}
    >
      <label className="stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
        <span className="small">{field.label}</span>
        <input
          className="field"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <span className="muted tiny">{field.hint}</span>
      <button type="submit" className="btn" disabled={busy || !value}>
        Save with your passkey
      </button>
    </form>
  );
}

/**
 * The step's secrets, while it is not waiting on something else.
 *
 * @param props - The step.
 * @returns The form, or nothing when the step needs no secret.
 */
export function SecretForm({ step }: { step: SetupStep }) {
  if (step.secrets.length === 0 || step.state === "waiting") return null;
  return (
    <div className="stack" style={{ ["--gap" as string]: "var(--space-2)" }}>
      {step.secrets.map((field) => (
        <SecretRow key={field.id} step={step} field={field} />
      ))}
    </div>
  );
}

/** The answer field, or the facts to confirm once every question is answered. */
function InterviewInput({ step, interview }: { step: SetupStep; interview: Interview }) {
  const [text, setText] = useState("");
  const { run, busy } = useAction<SetupStep>({ refresh: REFRESH });
  const confirm = useAction<SetupStep>({ refresh: REFRESH, done: () => "Profile saved" });
  const answer = async (event: FormEvent) => {
    event.preventDefault();
    const next = await run(() =>
      send<SetupStep>("POST", `/setup/${step.id}/interview/answer`, { text }),
    );
    if (next) setText("");
  };
  if (interview.asked >= interview.total) {
    return (
      <div className="stack" style={{ ["--gap" as string]: "var(--space-2)" }}>
        <ul className="plain small">
          {interview.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <button
          type="button"
          className="btn primary"
          disabled={confirm.busy}
          onClick={() =>
            void confirm.run(() => send("POST", `/setup/${step.id}/interview/confirm`))
          }
        >
          Save these to my profile
        </button>
      </div>
    );
  }
  return (
    <form
      className="row"
      style={{ ["--gap" as string]: "var(--space-2)" }}
      onSubmit={(e) => void answer(e)}
    >
      <input
        className="field grow"
        aria-label="Your answer"
        placeholder="Your answer"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="btn" disabled={busy || !text.trim()}>
        Answer
      </button>
    </form>
  );
}

/**
 * Atlas's profile interview inside its step card, while the step is open.
 *
 * @param props - The step.
 * @returns The interview, or nothing when the step has none or is done.
 */
export function InterviewPanel({ step }: { step: SetupStep }) {
  const restart = useAction<SetupStep>({ refresh: REFRESH });
  const interview = step.interview;
  if (!interview || step.state === "done") return null;
  return (
    <div className="interview" aria-label="Profile interview">
      <span className="row">
        <span className="grow muted small">
          Question {Math.min(interview.asked + 1, interview.total)} of {interview.total}
        </span>
        {interview.asked > 0 && (
          <button
            type="button"
            className="btn compact"
            disabled={restart.busy}
            onClick={() =>
              void restart.run(() => send("POST", `/setup/${step.id}/interview/restart`))
            }
          >
            <RotateCcw size={16} aria-hidden="true" />
            Start over
          </button>
        )}
      </span>
      <AnimatePresence initial={false}>
        {interview.turns.map((turn, index) => (
          <m.p
            key={`${index}-${turn.speaker}`}
            className={`interview-turn ${turn.speaker}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={LEAVE}
          >
            {turn.text}
          </m.p>
        ))}
      </AnimatePresence>
      <InterviewInput step={step} interview={interview} />
    </div>
  );
}
