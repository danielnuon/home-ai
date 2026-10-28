/**
 * @file Maintenance: what the maintenance team fixed, what it found, and the switch to pause it
 * (design: Maintenance).
 */
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useMaintenance } from "../api/queries";
import type { MaintenanceOverview } from "../api/types";
import { Switch } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles } from "../components/Rows";

const SEVERITY_TAG = { high: "problem", medium: "attention", low: "info" } as const;

/** The fixes from the last batch, each revertible. */
function LastBatch({ overview }: { overview: MaintenanceOverview }) {
  const revert = useAction<MaintenanceOverview>({ refresh: ["maintenance"] });
  return (
    <Section title="Last batch">
      <ul className="list">
        {overview.batch.map((fix) => (
          <li key={fix.id} className="list-row">
            <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
              <span className={`row-title ${fix.reverted ? "muted" : ""}`}>{fix.title}</span>
              <span className="muted small">{fix.meta}</span>
            </span>
            <button
              type="button"
              className="btn ghost compact"
              disabled={revert.busy}
              onClick={() => revert.run(() => send("POST", `/maintenance/fixes/${fix.id}/revert`))}
            >
              {fix.reverted ? "Reapply" : "Revert"}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** What maintenance found and has not fixed. */
function Findings({ overview }: { overview: MaintenanceOverview }) {
  return (
    <Section title="Findings">
      <ul className="list">
        {overview.findings.map((finding) => (
          <li key={finding.id} className="list-row">
            <span className={`tag ${SEVERITY_TAG[finding.severity]}`}>{finding.severity}</span>
            <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
              <span className="row-title">{finding.title}</span>
              <span className="muted small">{finding.meta}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The Maintenance page. */
export default function Maintenance() {
  const query = useMaintenance();
  const toggle = useAction<MaintenanceOverview>({ refresh: ["maintenance"] });
  return (
    <QueryState query={query}>
      {(overview) => (
        <Page
          title="Maintenance"
          subtitle={overview.summary}
          actions={
            <Switch
              checked={overview.running}
              label="Maintenance running"
              disabled={toggle.busy}
              onChange={(running) =>
                toggle.run((proof) => send("PUT", "/maintenance/running", { running }, proof))
              }
            />
          }
        >
          <MetricTiles metrics={overview.stats} />
          <LastBatch overview={overview} />
          <Findings overview={overview} />
        </Page>
      )}
    </QueryState>
  );
}
