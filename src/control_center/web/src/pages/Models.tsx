/**
 * @file Models: which local model serves each family, the pool's mode, the Tokens panel with its
 * caps, and the independent reviewer option with its impact preview (design: Models; spec 7.18,
 * 8.8.7).
 */
import { useModels, useSettings } from "../api/queries";
import type { ModelsOverview, SourcedFigure } from "../api/types";
import { ImpactCard } from "../components/ImpactCard";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles } from "../components/Rows";
import { SettingRow } from "../components/SettingControl";
import { StatusText } from "../design/status";

/** The independent reviewer switch, from the shared settings. */
function ReviewerSetting() {
  const setting = useSettings().data?.settings.find((s) => s.key === "models.review.independent");
  return setting ? (
    <div className="list">
      <SettingRow setting={setting} />
    </div>
  ) : null;
}

/** One group of figures, each with where it comes from (spec 7.18). */
function Figures({ title, figures }: { title: string; figures: SourcedFigure[] }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
      <h3 className="small muted">{title}</h3>
      <ul className="list">
        {figures.map((figure) => (
          <li key={figure.name} className="list-row">
            <span className="grow row-title">{figure.name}</span>
            <span className="small">{figure.value}</span>
            <span className="tag">{figure.source}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The token caps, from the shared settings. Lowering one is one tap; raising one asks. */
function TokenCaps() {
  const caps = (useSettings().data?.settings ?? []).filter((setting) =>
    setting.key.startsWith("models.tokens."),
  );
  return (
    <div className="list">
      {caps.map((setting) => (
        <SettingRow key={setting.key} setting={setting} />
      ))}
    </div>
  );
}

/** The Tokens panel: how fast the GPU turns tokens into finished work (spec 8.8.7). */
function Tokens({ tokens }: { tokens: ModelsOverview["tokens"] }) {
  return (
    <Section title="Tokens">
      <Figures title="Speed and use" figures={tokens.speeds} />
      <Figures title="Tokens per outcome, by role" figures={tokens.tokens_per_outcome} />
      <Figures title="GPU-seconds today, by priority" figures={tokens.gpu_seconds} />
      <h3 className="small muted">Caps</h3>
      <ImpactCard lines={tokens.cap_impact} />
      <TokenCaps />
    </Section>
  );
}

/** The Models page. */
export default function Models() {
  const query = useModels();
  return (
    <QueryState query={query}>
      {(models) => (
        <Page
          title="Models"
          subtitle={`${models.pool_mode} · ${models.resident} resident · ${models.swaps_today}`}
        >
          <MetricTiles metrics={models.stats} />
          <Section title="Model families">
            <ul className="list">
              {models.assignments.map((assignment) => (
                <li key={assignment.family} className="list-row">
                  <span className="mono small family">{assignment.family}</span>
                  <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                    <span className="row-title">{assignment.model}</span>
                    <span className="muted small">{assignment.meta}</span>
                  </span>
                  <StatusText value={assignment.residency} className="small" />
                </li>
              ))}
            </ul>
          </Section>
          <Tokens tokens={models.tokens} />
          <Section title="Independent reviewer">
            <ReviewerSetting />
            <ImpactCard lines={models.reviewer_impact} />
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
