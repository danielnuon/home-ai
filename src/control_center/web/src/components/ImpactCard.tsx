/**
 * @file What a change will do before it is made (spec 7.18, "Impact preview").
 *
 * Only the metrics the change moves, each as "now → predicted" with where the number came from,
 * so a simulated or estimated figure is never mistaken for a measured one.
 */
import type { ImpactLine } from "../api/types";
import { StatusText } from "../design/status";

const SOURCE_TAG: Record<ImpactLine["source"], string> = {
  measured: "healthy",
  simulated: "info",
  estimate: "attention",
};

/** The impact preview for one setting or feature. */
export function ImpactCard({
  lines,
  title = "Impact preview",
}: {
  lines: ImpactLine[];
  title?: string;
}) {
  if (lines.length === 0) return null;
  return (
    <section className="impact" aria-label={title}>
      <h3 className="small">{title}</h3>
      <ul className="impact-lines">
        {lines.map((line) => (
          <li key={line.name} className="row">
            <span className="grow">{line.name}</span>
            <span className="mono small">{line.change}</span>
            <span className={`tag ${SOURCE_TAG[line.source]}`}>{line.source}</span>
            {line.status && <StatusText value={line.status} className="small" />}
          </li>
        ))}
      </ul>
    </section>
  );
}
