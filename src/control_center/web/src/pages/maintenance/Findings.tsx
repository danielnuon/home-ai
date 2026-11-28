/**
 * @file Maintenance findings: open one to read what was found and the evidence, and mark it
 * won't-fix with a reason that stays on it (spec 7.2, Maintenance; 18.7). Reopen is the Undo.
 */
import { Ban, FileSearch, Undo2 } from "lucide-react";
import { useState } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { Finding } from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { Section } from "../../components/Page";
import { Reveal } from "../../components/Reflow";
import { Sheet } from "../../components/Sheet";

/** Reopen a finding; also the Undo on the won't-fix toast. */
function useReopen(finding: Finding) {
  const reopen = useAction<Finding>({
    refresh: ["maintenance"],
    done: () => `${finding.id} reopened`,
  });
  return () => void reopen.run(() => send("POST", `/maintenance/findings/${finding.id}/reopen`));
}

/** The reason field and Mark won't fix; the toast offers Undo. */
function WontFixForm({ finding, onDone }: { finding: Finding; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const reopen = useReopen(finding);
  const close = useAction<Finding>({
    refresh: ["maintenance"],
    done: (result) => ({ message: `${result.id} won't be fixed`, undo: reopen }),
  });
  const submit = async () => {
    const path = `/maintenance/findings/${finding.id}/wont-fix`;
    const done = await close.run(() => send("POST", path, { reason }));
    if (done) onDone();
  };
  return (
    <div className="stack">
      <textarea
        className="field"
        aria-label="Why it won't be fixed"
        placeholder="Why, for the record"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button
        type="button"
        className="btn primary"
        disabled={close.busy || !reason.trim()}
        onClick={() => void submit()}
      >
        Mark won't fix
      </button>
    </div>
  );
}

/** The finding's detail and evidence, with Won't fix and its reason field. */
function FindingSheet({
  finding,
  asking,
  onClose,
}: {
  finding: Finding | null;
  asking: boolean;
  onClose: () => void;
}) {
  const [why, setWhy] = useState(asking);
  return (
    <Sheet open={finding !== null} title={finding?.title ?? "Finding"} onClose={onClose}>
      {finding && (
        <div className="stack">
          <p className="muted small">
            {finding.id} · {finding.severity} · {finding.meta}
          </p>
          <p>{finding.detail}</p>
          <ul className="log mono tiny">
            {finding.evidence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {finding.state === "wont_fix" ? (
            <p className="small">Won't fix: {finding.reason}</p>
          ) : (
            <button type="button" className="btn" aria-expanded={why} onClick={() => setWhy(!why)}>
              <Ban size={18} aria-hidden="true" />
              Won't fix
            </button>
          )}
          <Reveal when={why && finding.state === "open"}>
            <WontFixForm finding={finding} onDone={onClose} />
          </Reveal>
        </div>
      )}
    </Sheet>
  );
}

const SEVERITY: Record<Finding["severity"], { status: "problem" | "attention" | "neutral" }> = {
  high: { status: "problem" },
  medium: { status: "attention" },
  low: { status: "neutral" },
};

/** One finding as a row: open it, or swipe left for Won't fix (Reopen once closed). */
function FindingRow({
  finding,
  onOpen,
}: {
  finding: Finding;
  onOpen: (finding: Finding, asking: boolean) => void;
}) {
  const reopen = useReopen(finding);
  const open = { label: "Open", icon: FileSearch, onSelect: () => onOpen(finding, false) };
  const closed = finding.state === "wont_fix";
  const second = closed
    ? { label: "Reopen", icon: Undo2, onSelect: reopen }
    : {
        label: "Won't fix",
        icon: Ban,
        tone: "sand" as const,
        onSelect: () => onOpen(finding, true),
      };
  return (
    <ActionRow
      title={finding.title}
      meta={closed ? `Won't fix · ${finding.reason ?? ""}` : finding.meta}
      status={{
        status: closed ? "neutral" : SEVERITY[finding.severity].status,
        label: finding.severity,
      }}
      start={open}
      end={second}
      more={[open, second]}
    />
  );
}

/** The findings register. */
export function Findings({ findings }: { findings: Finding[] }) {
  const [shown, setShown] = useState<{ finding: Finding; asking: boolean } | null>(null);
  const current = shown && (findings.find((f) => f.id === shown.finding.id) ?? shown.finding);
  return (
    <Section title="Findings">
      <div className="list">
        {findings.map((finding) => (
          <FindingRow
            key={finding.id}
            finding={finding}
            onOpen={(f, asking) => setShown({ finding: f, asking })}
          />
        ))}
      </div>
      <FindingSheet
        key={shown ? `${shown.finding.id}-${String(shown.asking)}` : "none"}
        finding={current}
        asking={shown?.asking ?? false}
        onClose={() => setShown(null)}
      />
    </Section>
  );
}
