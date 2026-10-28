/**
 * @file Setup: the first-run steps that need the Owner's hands, required ones first
 * (design: Setup).
 *
 * Each step says why it matters and what works without it, so deferring is an informed choice.
 */
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useSetup } from "../api/queries";
import type { SetupStep } from "../api/types";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { StatusText } from "../design/status";

type StepAction = "start" | "defer" | "resume" | "redo";

/** The buttons a step offers in its current state. */
function actionsFor(step: SetupStep): { action: StepAction; label: string }[] {
  switch (step.state) {
    case "ready":
      return step.required
        ? [{ action: "start", label: step.cta }]
        : [
            { action: "start", label: step.cta },
            { action: "defer", label: "Later" },
          ];
    case "deferred":
      return [{ action: "resume", label: "Set up now" }];
    case "done":
      return [{ action: "redo", label: "Redo" }];
    case "waiting":
      return [];
  }
}

/** One setup step. */
function Step({ step }: { step: SetupStep }) {
  const act = useAction<SetupStep>({ refresh: ["setup", "platform", "today"] });
  return (
    <article
      className={`card stack ${step.state === "ready" && step.required ? "attention" : ""}`}
      aria-label={step.title}
    >
      <div className="row">
        <div className="grow">
          <h3>{step.title}</h3>
          <p className="muted small">
            {step.duration} · {step.required ? "required" : "optional"} · {step.state}
          </p>
        </div>
      </div>
      <p className="small">{step.why}</p>
      <p className="muted small">Until then: {step.until}</p>
      {step.waiting_on && (
        <p className="status-in_progress small">◐ Waiting on {step.waiting_on}</p>
      )}
      {step.proof && <p className="status-healthy small">● {step.proof}</p>}
      {step.checks.length > 0 && (
        <ul className="plain small">
          {step.checks.map((check) => (
            <li key={check.name}>
              {check.name}: <StatusText value={check.status} />
            </li>
          ))}
        </ul>
      )}
      <div className="row wrap">
        {actionsFor(step).map(({ action, label }) => (
          <button
            key={action}
            type="button"
            className={`btn ${action === "start" || action === "resume" ? "primary" : ""}`}
            disabled={act.busy}
            onClick={() => act.run(() => send("POST", `/setup/${step.id}`, { action }))}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="tiny muted">{step.stub}</p>
    </article>
  );
}

/** The Setup page. */
export default function Setup() {
  const query = useSetup();
  return (
    <Page
      title="Setup"
      subtitle="A few things only you can do. Everything else is already running."
    >
      <QueryState query={query}>
        {(steps) => (
          <div className="card-grid">
            {steps.map((step) => (
              <Step key={step.id} step={step} />
            ))}
          </div>
        )}
      </QueryState>
    </Page>
  );
}
