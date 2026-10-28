/**
 * @file A critical decision record: a platform choice the AI made, and the Owner's veto
 * (spec 11.9; 7.16, rule 8).
 *
 * Decisions count down; approvals wait. So this card never says "approve": it says what was
 * decided, why, what else was considered, and offers Acknowledge or Veto, with the veto's effect
 * shown before it is pressed (rule 5).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import type { CriticalDecision } from "../api/types";
import { timeLeft } from "../design/time";
import { Sheet } from "./Sheet";

const STATUS_WORDS: Record<CriticalDecision["status"], string> = {
  pending_window: "Takes effect when the window ends",
  in_effect: "In effect",
  vetoed: "Vetoed",
  reversed: "Reversed",
  superseded: "Superseded",
};

interface DecisionCardProps {
  decision: CriticalDecision;
  /** Shows rationale, rejected options, risks and evidence. */
  full?: boolean;
}

/** The detail a full card shows below the summary. */
function Reasoning({ decision }: { decision: CriticalDecision }) {
  return (
    <div className="stack small">
      <p>{decision.rationale}</p>
      {decision.rejected.length > 0 && (
        <ul className="plain">
          {decision.rejected.map((option) => (
            <li key={option.option}>
              <strong>Rejected: {option.option}.</strong> {option.effect} {option.outcome}
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Risks: {decision.risks}</p>
      <p className="muted">Evidence: {decision.evidence}</p>
    </div>
  );
}

/** The veto sheet: what it undoes, an optional reason, and the button. */
function VetoSheet({
  decision,
  open,
  onClose,
}: {
  decision: CriticalDecision;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const veto = useAction<CriticalDecision>({
    refresh: ["decisions", "today"],
    done: () => `Vetoed ${decision.id}`,
  });
  return (
    <Sheet open={open} title={`Veto ${decision.id}?`} onClose={onClose}>
      <div className="stack">
        <p>{decision.veto_preview}</p>
        <textarea
          className="field"
          aria-label="Reason (goes to the employee)"
          placeholder="Reason (goes to the employee)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button
          type="button"
          className="btn primary"
          disabled={veto.busy}
          onClick={async () => {
            await veto.run(() =>
              send("POST", `/decisions/${decision.id}/veto`, { reason: reason || null }),
            );
            onClose();
          }}
        >
          Veto
        </button>
      </div>
    </Sheet>
  );
}

/** Whether the Owner can still act on a decision: its window is open, or it is unacknowledged. */
export function isOpenDecision(decision: CriticalDecision): boolean {
  return (
    decision.status === "pending_window" ||
    (decision.status === "in_effect" && !decision.acknowledged)
  );
}

/** The countdown while the window is open, otherwise the status in words. */
function whenWords(decision: CriticalDecision): string {
  if (decision.window_ends && decision.status === "pending_window")
    return timeLeft(decision.window_ends);
  return STATUS_WORDS[decision.status];
}

/** Acknowledge, Veto and (on short cards) Details. */
function DecisionActions({
  decision,
  full,
  onVeto,
}: {
  decision: CriticalDecision;
  full: boolean;
  onVeto: () => void;
}) {
  const acknowledge = useAction<CriticalDecision>({
    refresh: ["decisions", "today"],
    done: () => `Acknowledged ${decision.id}`,
  });
  return (
    <div className="row wrap">
      <button
        type="button"
        className="btn primary"
        disabled={acknowledge.busy || decision.acknowledged}
        onClick={() => acknowledge.run(() => send("POST", `/decisions/${decision.id}/acknowledge`))}
      >
        {decision.acknowledged ? "Acknowledged" : "Acknowledge"}
      </button>
      <button type="button" className="btn" onClick={onVeto}>
        Veto…
      </button>
      {!full && (
        <Link to="/decisions" className="btn ghost">
          Details
        </Link>
      )}
    </div>
  );
}

/** One critical decision with Acknowledge and Veto while it is open. */
export function DecisionCard({ decision, full = false }: DecisionCardProps) {
  const [vetoing, setVetoing] = useState(false);
  const open = isOpenDecision(decision);

  return (
    <article className={`card stack ${open ? "attention" : ""}`} aria-label={decision.title}>
      <div className="row">
        <span className="grow small status-attention">
          ▲ Critical decision · <span className="mono">{decision.id}</span>
        </span>
        <span className="muted small">{whenWords(decision)}</span>
      </div>
      <h3>{decision.title}</h3>
      <p className="small">{decision.summary}</p>
      {full && <Reasoning decision={decision} />}
      {decision.veto_reason && <p className="muted small">Your reason: {decision.veto_reason}</p>}
      {open && <DecisionActions decision={decision} full={full} onVeto={() => setVetoing(true)} />}
      <VetoSheet decision={decision} open={vetoing} onClose={() => setVetoing(false)} />
    </article>
  );
}
