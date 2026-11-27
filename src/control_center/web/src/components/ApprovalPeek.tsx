/**
 * @file An approval named inside another object, such as a chat message, opened where it is
 * mentioned (spec 7.16, rules 2 and 11).
 *
 * The mention is a button that opens the approval's own card in the sheet, so the Owner can
 * approve or deny without leaving the conversation, and closing the sheet puts them back where
 * they were. Approvals then has nothing to add, so no link there is needed.
 */
import { Inbox } from "lucide-react";
import { useState } from "react";
import { useApprovals } from "../api/queries";
import { ApprovalCard } from "./ApprovalCard";
import { QueryState } from "./QueryState";
import { Sheet } from "./Sheet";

/** A button for an approval card, and the sheet it opens. */
export function ApprovalPeek({ approvalId }: { approvalId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn compact attach-btn" onClick={() => setOpen(true)}>
        <Inbox size={16} aria-hidden="true" />
        Review approval <span className="mono">{approvalId}</span>
      </button>
      <Sheet open={open} title="Approval" onClose={() => setOpen(false)}>
        {open && <PeekBody approvalId={approvalId} />}
      </Sheet>
    </>
  );
}

function PeekBody({ approvalId }: { approvalId: string }) {
  const query = useApprovals();
  return (
    <QueryState query={query}>
      {(approvals) => {
        const approval = approvals.find((item) => item.id === approvalId);
        return approval ? (
          <ApprovalCard approval={approval} />
        ) : (
          <p className="muted">That approval no longer exists.</p>
        );
      }}
    </QueryState>
  );
}
