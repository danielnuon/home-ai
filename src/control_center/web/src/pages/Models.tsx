/**
 * @file Models: which local model serves each family, the pool's mode, and the independent
 * reviewer option with its impact preview (design: Models; spec 7.18).
 */
import { useModels, useSettings } from "../api/queries";
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
          <Section title="Independent reviewer">
            <ReviewerSetting />
            <ImpactCard lines={models.reviewer_impact} />
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
