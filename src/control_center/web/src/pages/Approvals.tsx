/**
 * @file Approvals: everything waiting for the Owner's yes or no (design: Approvals; spec 7.4).
 */
import { useApprovals } from "../api/queries";
import { ApprovalCard } from "../components/ApprovalCard";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";

/** The Approvals page: pending first, then what was decided recently. */
export default function Approvals() {
  const query = useApprovals();
  return (
    <Page
      title="Approvals"
      subtitle="Nothing leaves the house without you. Nothing is approved by timeout."
    >
      <QueryState query={query}>
        {(approvals) => {
          const pending = approvals.filter((a) => a.state === "pending");
          const decided = approvals.filter((a) => a.state !== "pending");
          return (
            <>
              <Section title="Waiting for you" aside={`${pending.length} open`}>
                {pending.length === 0 && (
                  <p className="card empty">All clear. New requests appear here and on Today.</p>
                )}
                <div className="card-grid">
                  {pending.map((approval) => (
                    <ApprovalCard key={approval.id} approval={approval} />
                  ))}
                </div>
              </Section>
              {decided.length > 0 && (
                <Section title="Recently decided">
                  <div className="card-grid">
                    {decided.map((approval) => (
                      <ApprovalCard key={approval.id} approval={approval} />
                    ))}
                  </div>
                </Section>
              )}
            </>
          );
        }}
      </QueryState>
    </Page>
  );
}
