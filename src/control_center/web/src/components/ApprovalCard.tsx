/**
 * @file One approval: what an employee wants to send, book or release, and the Owner's answer.
 *
 * Approve and Deny show their effect at once with an 8-second Undo (spec 7.4). Deny takes an
 * optional reason that goes back to the employee (7.16, rule 4). An approval that lapses says that
 * nothing will happen: approvals wait, they are never approved by timeout (rule 8).
 */
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import type { Approval } from "../api/types";
import { Avatar } from "./Avatar";

const DECIDED_WORDS: Partial<Record<Approval["state"], string>> = {
  approved: "Approved",
  denied: "Denied",
  expired: "Lapsed. Nothing was sent.",
};

/** The line under the title: who drafted it, the tier and how it is approved. */
function describe(approval: Approval): string {
  const parts = [approval.employee_name];
  if (approval.tier) parts.push(approval.tier);
  if (approval.recipient_trust) parts.push(`${approval.recipient_trust} contact`);
  if (approval.needs_step_up) parts.push("passkey");
  else if (approval.tier === "T2") parts.push("one tap");
  return parts.join(" · ");
}

/** The release summary for a class R approval. */
function ReleaseLine({ release }: { release: NonNullable<Approval["release"]> }) {
  return (
    <p className="small mono">
      +{release.added_lines} −{release.removed_lines} · {release.files} files ·{" "}
      {release.checks_passed}/{release.checks_total} checks · {release.rollback}
    </p>
  );
}

/** Approve, or Deny with an optional reason for the employee, with Undo on the toast. */
function ApprovalActions({ approval }: { approval: Approval }) {
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const undo = useAction<Approval>({ refresh: ["approvals"] });
  const decide = useAction<Approval>({
    refresh: ["approvals", "today"],
    done: (result) => ({
      message: `${DECIDED_WORDS[result.state] ?? "Done"}: ${result.title}`,
      undo: () => void undo.run(() => send("POST", `/approvals/${result.id}/undo`)),
    }),
  });
  const answer = (decision: "approve" | "deny") =>
    decide.run((proof) =>
      send(
        "POST",
        `/approvals/${approval.id}/decision`,
        { decision, reason: reason || null },
        proof,
      ),
    );

  return (
    <>
      {denying && (
        <textarea
          className="field"
          aria-label="Reason for the employee (optional)"
          placeholder="Reason for the employee (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      )}
      <div className="row">
        <button
          type="button"
          className="btn primary block"
          disabled={decide.busy}
          onClick={() => answer("approve")}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn block"
          disabled={decide.busy}
          onClick={() => (denying ? answer("deny") : setDenying(true))}
        >
          {denying ? "Deny with reason" : "Deny"}
        </button>
      </div>
    </>
  );
}

/** One request and, while it is pending, the Owner's answer. */
export function ApprovalCard({ approval }: { approval: Approval }) {
  const pending = approval.state === "pending";
  return (
    <article
      className={`card stack approval ${pending ? "attention" : ""}`}
      aria-label={approval.title}
    >
      <div className="row">
        <Avatar
          department={approval.department}
          state={pending ? "waiting" : "idle"}
          name={approval.employee_name}
          size={32}
        />
        <div className="grow">
          <h3>{approval.title}</h3>
          <p className="muted small">{describe(approval)}</p>
        </div>
        <span className="tag">{approval.data_class}</span>
      </div>
      <p className="small">{approval.summary}</p>
      {approval.draft && <blockquote className="draft">{approval.draft}</blockquote>}
      {approval.release && <ReleaseLine release={approval.release} />}
      {pending ? (
        <ApprovalActions approval={approval} />
      ) : (
        <p className="muted small">{DECIDED_WORDS[approval.state]}</p>
      )}
    </article>
  );
}
