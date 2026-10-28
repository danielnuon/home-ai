/**
 * @file Lists of rows and tiles of metrics: the two shapes most status pages are made of.
 */
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Metric, Row, RowGroup } from "../api/types";
import { StatusText } from "../design/status";
import { Section } from "./Page";
import { Sparkline } from "./Sparkline";

/** One row: title and detail on the left, status (and a chevron when it links) on the right. */
function RowItem({ row, trailing }: { row: Row; trailing?: ReactNode }) {
  const body = (
    <>
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{row.title}</span>
        {row.meta && <span className="muted small">{row.meta}</span>}
      </span>
      {row.status && <StatusText value={row.status} className="small" />}
      {trailing}
      {row.href && <ChevronRight size={16} className="muted" aria-hidden="true" />}
    </>
  );
  return row.href ? (
    <Link to={row.href} className="list-row">
      {body}
    </Link>
  ) : (
    <div className="list-row">{body}</div>
  );
}

/** A plain list of rows, with a message when it is empty. */
export function RowList({ rows, empty = "Nothing here yet." }: { rows: Row[]; empty?: string }) {
  if (rows.length === 0) return <p className="list empty">{empty}</p>;
  return (
    <div className="list">
      {rows.map((row) => (
        <RowItem key={row.id} row={row} />
      ))}
    </div>
  );
}

/** Titled groups of rows, as on Connections and Docs. */
export function RowGroups({ groups }: { groups: RowGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <Section key={group.name} title={group.name} aside={group.note}>
          <RowList rows={group.rows} />
        </Section>
      ))}
    </>
  );
}

/** Stat tiles with a sparkline beside each value (spec 7.12, "Icons and charts"). */
export function MetricTiles({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid-tiles">
      {metrics.map((metric) => (
        <div key={metric.name} className="card tile">
          <span className="muted small">{metric.name}</span>
          <span className="row">
            <span className="tile-value grow">{metric.value}</span>
            <Sparkline values={metric.spark} />
          </span>
          {metric.status && <StatusText value={metric.status} className="small" />}
        </div>
      ))}
    </div>
  );
}
