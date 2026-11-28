/**
 * @file Approvals: everything waiting for the Owner's yes or no (design: Approvals; spec 7.2, 7.4).
 *
 * The cards filter by class, pipeline, domain and principal; the filters live in the address, so
 * Back returns to the same view. A filter only offers values that some card has.
 */
import { useApprovals } from "../api/queries";
import type { Approval } from "../api/types";
import { ApprovalCard } from "../components/ApprovalCard";
import { FilterChips, optionsOf, useFilters, type FilterGroup } from "../components/FilterChips";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { AnimatePresence, LEAVE, m } from "../design/motion";

const CLASS_NAMES: Record<string, string> = { P: "Pipeline", R: "Runtime", C: "Critical" };

const FIELDS: [key: string, label: string, pick: (a: Approval) => string][] = [
  ["class", "Class", (a) => a.approval_class],
  ["pipeline", "Pipeline", (a) => a.pipeline],
  ["domain", "Domain", (a) => a.domain],
  ["principal", "For", (a) => a.principal],
];

/** The filter groups, built from the values the cards have. */
function groupsFor(approvals: Approval[]): FilterGroup[] {
  return FIELDS.map(([key, label, pick]) => ({
    key,
    label,
    options: optionsOf(approvals, pick, key === "class" ? (v) => CLASS_NAMES[v] ?? v : undefined),
  }));
}

/** A grid of cards that glide as the filters change. */
function CardGrid({ approvals }: { approvals: Approval[] }) {
  return (
    <div className="card-grid">
      <AnimatePresence initial={false} mode="popLayout">
        {approvals.map((approval) => (
          <m.div key={approval.id} layout="position" exit={LEAVE}>
            <ApprovalCard approval={approval} />
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** The Approvals page: pending first, then what was decided recently. */
export default function Approvals() {
  const query = useApprovals();
  const chosen = useFilters(FIELDS.map(([key]) => key));
  const shown = (approval: Approval) =>
    FIELDS.every(([key, , pick]) => chosen[key] === null || pick(approval) === chosen[key]);
  return (
    <Page
      title="Approvals"
      subtitle="Nothing leaves the house without you. Nothing is approved by timeout."
    >
      <QueryState query={query}>
        {(approvals) => {
          const filtered = approvals.filter(shown);
          const pending = filtered.filter((a) => a.state === "pending");
          const decided = filtered.filter((a) => a.state !== "pending");
          const narrowed = filtered.length < approvals.length;
          return (
            <>
              <FilterChips groups={groupsFor(approvals)} />
              <Section title="Waiting for you" aside={`${pending.length} open`}>
                {pending.length === 0 && (
                  <p className="card empty">
                    {narrowed
                      ? "Nothing waiting matches these filters. Choose All to see every card."
                      : "All clear. New requests appear here and on Today."}
                  </p>
                )}
                <CardGrid approvals={pending} />
              </Section>
              {decided.length > 0 && (
                <Section title="Recently decided">
                  <CardGrid approvals={decided} />
                </Section>
              )}
            </>
          );
        }}
      </QueryState>
    </Page>
  );
}
