/**
 * @file One approval: what an employee wants to send, book or release, and the Owner's answer.
 *
 * Approve and Deny show their effect at once with an 8-second Undo (spec 7.4). Deny takes an
 * optional reason that goes back to the employee (7.16, rule 4). An approval that lapses says that
 * nothing will happen: approvals wait, they are never approved by timeout (rule 8).
 *
 * While it waits, the Owner can reword the draft, untick messages in a batch, and allowlist a
 * recipient who isn't yet ("Always allow this contact", a step-up, rule 4) (spec 7.2, Approvals).
 */
import { Pencil, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import type { Approval } from "../api/types";
import { LiveAvatar } from "./LiveFace";
import { Reveal, Swap } from "./Reflow";

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
      <Reveal when={denying} className="stack">
        <textarea
          className="field"
          aria-label="Reason for the employee (optional)"
          placeholder="Reason for the employee (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Reveal>
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

/** The draft, and while the card waits, a way to reword it before approving. */
function Draft({ approval, pending }: { approval: Approval; pending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(approval.draft ?? "");
  const save = useAction<Approval>({ refresh: ["approvals"], done: () => "Draft saved" });
  const submit = async () => {
    const saved = await save.run(() =>
      send<Approval>("PUT", `/approvals/${approval.id}/draft`, { draft: text }),
    );
    if (saved) setEditing(false);
  };
  if (approval.draft === null || approval.draft === undefined) return null;
  return (
    <Swap id={editing ? "editing" : "reading"} className="stack">
      {editing ? (
        <>
          <textarea
            className="field draft-field"
            aria-label={`Draft for ${approval.title}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={save.busy}
              onClick={() => void submit()}
            >
              Save draft
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <blockquote className="draft">{approval.draft}</blockquote>
          {pending && (
            <button
              type="button"
              className="btn compact"
              onClick={() => {
                setText(approval.draft ?? "");
                setEditing(true);
              }}
            >
              <Pencil size={16} aria-hidden="true" /> Edit draft
            </button>
          )}
        </>
      )}
    </Swap>
  );
}

/** A batch's messages, each with a tick; approving sends only the ticked ones. */
function Batch({ approval, pending }: { approval: Approval; pending: boolean }) {
  const toggle = useAction<Approval>({ refresh: ["approvals"] });
  if (!approval.batch?.length) return null;
  const sent = approval.batch.filter((message) => message.included).length;
  return (
    <fieldset className="stack batch" style={{ ["--gap" as string]: "var(--space-1)" }}>
      <legend className="small muted">
        Sending {sent} of {approval.batch.length}
      </legend>
      {approval.batch.map((message) => (
        <label key={message.id} className="row check-row">
          <input
            type="checkbox"
            checked={message.included}
            disabled={!pending || toggle.busy}
            onChange={(event) =>
              void toggle.run(() =>
                send<Approval>("PUT", `/approvals/${approval.id}/batch/${message.id}`, {
                  included: event.target.checked,
                }),
              )
            }
          />
          <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
            <span>{message.recipient}</span>
            <span className="muted small">{message.summary}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** "Always allow this contact", on a card to a saved contact who isn't allowlisted yet. */
function AllowRecipient({ approval }: { approval: Approval }) {
  const allow = useAction<Approval>({
    refresh: ["approvals", "contacts"],
    done: (card) => `${card.recipient ?? "This contact"} is allowlisted`,
  });
  if (!approval.contact_id || !approval.recipient_trust) return null;
  if (approval.recipient_trust === "allowlisted") return null;
  return (
    <button
      type="button"
      className="btn compact"
      disabled={allow.busy}
      onClick={() =>
        void allow.run((proof) =>
          send<Approval>("POST", `/approvals/${approval.id}/allow-recipient`, undefined, proof),
        )
      }
    >
      <ShieldCheck size={16} aria-hidden="true" /> Always allow this contact
    </button>
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
        <LiveAvatar
          name={approval.employee_name}
          department={approval.department}
          idleAs={pending ? "waiting" : undefined}
        />
        <div className="grow">
          <h3>{approval.title}</h3>
          <p className="muted small">{describe(approval)}</p>
        </div>
        <span className="tag">{approval.data_class}</span>
      </div>
      <p className="small">{approval.summary}</p>
      <Draft approval={approval} pending={pending} />
      <Batch approval={approval} pending={pending} />
      {approval.release && <ReleaseLine release={approval.release} />}
      {pending && <AllowRecipient approval={approval} />}
      <Swap id={pending ? "pending" : approval.state} className="stack">
        {pending ? (
          <ApprovalActions approval={approval} />
        ) : (
          <p className="muted small">{DECIDED_WORDS[approval.state]}</p>
        )}
      </Swap>
    </article>
  );
}
