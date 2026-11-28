/**
 * @file The spend ledger, grouped by service, pipeline, idea, work item or month (spec 7.2, Spend).
 * Changing the grouping reflows the groups in place rather than redrawing the list.
 */
import { useState } from "react";
import type { LedgerEntry } from "../../api/types";
import { Segmented } from "../../components/Controls";
import { AnimatePresence, LEAVE, m } from "../../design/motion";

type By = "service" | "pipeline" | "idea" | "work_item" | "month";

const BY: { value: By; label: string }[] = [
  { value: "service", label: "Service" },
  { value: "pipeline", label: "Pipeline" },
  { value: "idea", label: "Idea" },
  { value: "work_item", label: "Work item" },
  { value: "month", label: "Month" },
];

const NONE: Record<By, string> = {
  service: "No service",
  pipeline: "No pipeline",
  idea: "Not from an idea",
  work_item: "Not from a work item",
  month: "No month",
};

const usd = (amount: number) => `$${amount.toFixed(2)}`;

/** The entries in groups, in the order each group first appears, with each group's total. */
function groupLedger(ledger: LedgerEntry[], by: By) {
  const groups = new Map<string, LedgerEntry[]>();
  for (const entry of ledger) {
    const name = entry[by] ?? NONE[by];
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  return [...groups].map(([name, entries]) => ({
    name,
    entries,
    total: entries.reduce((sum, e) => sum + e.amount_usd, 0),
  }));
}

/** The ledger with its grouping control. */
export function Ledger({ ledger }: { ledger: LedgerEntry[] }) {
  const [by, setBy] = useState<By>("service");
  if (ledger.length === 0) {
    return <p className="list empty">No charges yet. Every paid call would be listed here.</p>;
  }
  return (
    <div className="stack">
      <Segmented label="Group the ledger by" value={by} options={BY} onChange={setBy} />
      <AnimatePresence initial={false} mode="popLayout">
        {groupLedger(ledger, by).map((group) => (
          <m.div key={`${by}:${group.name}`} layout="position" exit={LEAVE} className="stack">
            <div className="row small">
              <span className="grow row-title">{group.name}</span>
              <span className="mono">{usd(group.total)}</span>
            </div>
            <div className="list">
              {group.entries.map((entry) => (
                <div key={entry.id} className="list-row small">
                  <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                    <span>{entry.what}</span>
                    <span className="muted tiny">
                      {entry.day} {entry.month} · {entry.quantity}
                    </span>
                  </span>
                  <span className="mono">{usd(entry.amount_usd)}</span>
                </div>
              ))}
            </div>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
