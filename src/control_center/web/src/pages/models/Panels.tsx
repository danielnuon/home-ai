/**
 * @file The Models page's read-mostly panels: queue depth, local versus cloud, the Routing panel
 * (spec 8.10) and candidate benchmark cards (8.6). Every figure says where it comes from (7.18).
 */
import { Check, X } from "lucide-react";
import type { Candidate, ModelsOverview, SourcedFigure } from "../../api/types";
import { Section } from "../../components/Page";
import { StatusText } from "../../design/status";

const TIER_COLORS = ["var(--data-1)", "var(--data-3)", "var(--data-2)", "var(--clay-fill)"];

/** Figures as small tiles, each with its source. */
export function FigureGrid({ figures }: { figures: SourcedFigure[] }) {
  return (
    <div className="figure-grid">
      {figures.map((figure) => (
        <div key={figure.name} className="figure">
          <span className="muted small">{figure.name}</span>
          <span className="row-title">{figure.value}</span>
          <span className="tag">{figure.source}</span>
        </div>
      ))}
    </div>
  );
}

/** Calls per tier per family, gate rate against the control, cloud spend and refusals. */
export function Routing({ routing }: { routing: ModelsOverview["routing"] }) {
  return (
    <Section title="Routing" aside={routing.cloud_spend}>
      <ul className="list">
        {routing.rows.map((row) => (
          <li key={row.family} className="list-row">
            <span className="mono small family">{row.family}</span>
            <span className="grow stack" style={{ ["--gap" as string]: "4px" }}>
              <span className="tier-bar" aria-hidden="true">
                {row.tiers.map((share, tier) => (
                  <span
                    key={tier}
                    style={{
                      flexGrow: share,
                      background: TIER_COLORS[tier],
                      display: share ? undefined : "none",
                    }}
                  />
                ))}
              </span>
              <span className="muted small">
                {row.tiers.map((share, tier) => `T${tier} ${share}%`).join(" · ")}
              </span>
            </span>
            <span className="small">
              {row.gate_rate} vs {row.control}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">First-pass gate rate per family, against the random control.</p>
      <FigureGrid figures={routing.refusals} />
    </Section>
  );
}

/** One candidate's benchmark card. */
function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <article className="card stack" aria-label={candidate.model}>
      <span className="row">
        <span className="mono small family">{candidate.family}</span>
        <span className="grow row-title">{candidate.model}</span>
        <StatusText value={candidate.verdict} className="small" />
      </span>
      <FigureGrid figures={candidate.figures} />
      <ul className="legend small">
        {candidate.gates.map((gate) => (
          <li key={gate.name}>
            {gate.passed ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <X size={14} aria-hidden="true" />
            )}{" "}
            {gate.name} {gate.passed ? "passed" : "failed"}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Benchmark cards from the last selector run. */
export function Candidates({ candidates }: { candidates: Candidate[] }) {
  return (
    <Section title="Candidates" aside="From the last selector run">
      <div className="stack">
        {candidates.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} />
        ))}
      </div>
    </Section>
  );
}
