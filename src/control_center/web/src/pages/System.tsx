/**
 * @file System: the Mac's memory, pressure and health at a glance (design: System).
 */
import { useSystem } from "../api/queries";
import type { MemoryZone } from "../api/types";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles, RowList } from "../components/Rows";
import { StatusText } from "../design/status";

const ZONE_COLORS = ["var(--data-1)", "var(--data-2)", "var(--data-3)", "var(--line-strong)"];

/** Memory zones as one bar, each zone's share of its budget, with a legend in words. */
function MemoryBar({ zones }: { zones: MemoryZone[] }) {
  const total = zones.reduce((sum, zone) => sum + zone.budget_gb, 0) || 1;
  return (
    <div className="stack">
      <div className="memory-bar" aria-hidden="true">
        {zones.map((zone, index) => (
          <span
            key={zone.name}
            style={{ flexGrow: zone.budget_gb / total, background: ZONE_COLORS[index % 4] }}
          >
            <span style={{ transform: `scaleX(${Math.min(zone.used_gb / zone.budget_gb, 1)})` }} />
          </span>
        ))}
      </div>
      <ul className="legend small">
        {zones.map((zone, index) => (
          <li key={zone.name}>
            <span
              className="swatch"
              style={{ background: ZONE_COLORS[index % 4] }}
              aria-hidden="true"
            />
            {zone.name} · {zone.used_gb} of {zone.budget_gb} GB
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The System page. */
export default function System() {
  const query = useSystem();
  return (
    <QueryState query={query}>
      {(system) => (
        <Page title="System" subtitle={<StatusText value={system.summary} />}>
          <Section title="Memory" aside={system.machine}>
            <div className="card stack">
              <MemoryBar zones={system.zones} />
              <p className="small">
                Pressure <StatusText value={system.pressure} /> · swap {system.swap}
              </p>
            </div>
          </Section>
          <MetricTiles metrics={system.tiles} />
          <Section title="Health">
            <RowList rows={system.rows} />
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
