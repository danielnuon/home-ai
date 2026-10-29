/**
 * @file Decisions: critical decisions the platform made, open ones first (design: Decisions;
 * spec 11.9).
 */
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useDecisions } from "../api/queries";
import type { CriticalDecision } from "../api/types";
import { DecisionCard } from "../components/DecisionCard";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";

/** A past decision, with Reopen for a vetoed one. */
function PastDecision({ decision }: { decision: CriticalDecision }) {
  const reopen = useAction<CriticalDecision>({
    refresh: ["decisions"],
    done: () => `Reopened ${decision.id}`,
  });
  return (
    <div className="list-row">
      <span className="mono small">{decision.id}</span>
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{decision.title}</span>
        <span className="muted small">
          {decision.decided_on} · {decision.status.replace("_", " ")}
        </span>
      </span>
      {decision.status === "vetoed" && (
        <button
          type="button"
          className="btn compact"
          disabled={reopen.busy}
          onClick={() =>
            reopen.run((proof) =>
              send("POST", `/decisions/${decision.id}/reopen`, undefined, proof),
            )
          }
        >
          Reopen
        </button>
      )}
    </div>
  );
}

/** The Decisions page. */
export default function Decisions() {
  const query = useDecisions();
  return (
    <Page
      title="Decisions"
      subtitle="Choices Brain made for the platform. Each one counts down; you can veto any of them."
    >
      <QueryState query={query}>
        {(decisions) => (
          <>
            <Section title="Open">
              {decisions
                .filter((decision) => decision.open)
                .map((decision) => (
                  <DecisionCard key={decision.id} decision={decision} full />
                ))}
              {!decisions.some((decision) => decision.open) && (
                <p className="card empty">No open decisions. New ones appear on Today too.</p>
              )}
            </Section>
            <Section title="Earlier">
              <div className="list">
                {decisions
                  .filter((decision) => !decision.open)
                  .map((decision) =>
                    // Acknowledged but still vetoable: keep the countdown and the Veto button.
                    decision.vetoable && decision.status === "pending_window" ? (
                      <DecisionCard key={decision.id} decision={decision} />
                    ) : (
                      <PastDecision key={decision.id} decision={decision} />
                    ),
                  )}
              </div>
            </Section>
          </>
        )}
      </QueryState>
    </Page>
  );
}
