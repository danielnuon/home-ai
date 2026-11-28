/**
 * @file The metric catalog with its 7- and 30-day trends (spec 7.18), shown on System, Models and
 * Settings. Each figure says where it comes from; switching the range redraws the sparklines in
 * place rather than swapping the list.
 */
import { useState } from "react";
import { useMetrics } from "../api/queries";
import type { Trend } from "../api/types";
import { StatusText } from "../design/status";
import { Segmented } from "./Controls";
import { Section } from "./Page";
import { QueryState } from "./QueryState";
import { Sparkline } from "./Sparkline";

type Range = "week" | "month";

const RANGES = [
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
] as const;

/** One figure: its name and source, the sparkline for the range, and the change. */
function TrendRow({ trend, range }: { trend: Trend; range: Range }) {
  return (
    <li className="list-row trend-row">
      <span className="stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{trend.name}</span>
        <span className="muted small">
          {trend.value} · {range === "week" ? trend.week_change : trend.month_change}
          {trend.status && (
            <>
              {" · "}
              <StatusText value={trend.status} />
            </>
          )}
        </span>
      </span>
      <Sparkline values={range === "week" ? trend.week : trend.month} />
      <span className="tag">{trend.source}</span>
    </li>
  );
}

/** A list of trends, such as Maintenance's own. */
export function TrendList({ trends, range }: { trends: Trend[]; range: Range }) {
  return (
    <ul className="list">
      {trends.map((trend) => (
        <TrendRow key={trend.name} trend={trend} range={range} />
      ))}
    </ul>
  );
}

/** The range switch, shared by every trends section. */
export function useTrendRange() {
  const [range, setRange] = useState<Range>("week");
  const control = (
    <Segmented label="Trend range" value={range} options={RANGES} onChange={setRange} />
  );
  return { range, control };
}

/** The catalog areas for `page`, each a group of trends. */
export function Trends({ page }: { page: "system" | "models" | "settings" }) {
  const query = useMetrics(page);
  const { range, control } = useTrendRange();
  return (
    <Section title="Trends" aside={control}>
      <QueryState query={query}>
        {(catalog) => (
          <div className="stack">
            {catalog.groups.map((group) => (
              <div
                key={group.area}
                className="stack"
                style={{ ["--gap" as string]: "var(--space-1)" }}
              >
                <h3 className="small muted">
                  {group.area} · {group.source}
                </h3>
                <TrendList trends={group.trends} range={range} />
              </div>
            ))}
          </div>
        )}
      </QueryState>
    </Section>
  );
}
