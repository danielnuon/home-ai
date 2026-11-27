/**
 * @file The small trend line beside a stat tile's value (spec 7.12, "Icons and charts").
 *
 * One data color, a soft fill and no axes: it shows direction, not exact values. The values it
 * draws are already in the tile's words, so it is hidden from screen readers.
 *
 * When a new sample arrives the line morphs to its new shape rather than redrawing (7.14,
 * "Numbers and charts"), and a live figure's newest point breathes softly so the Owner can see it
 * is being measured (decision 129).
 */
import { m } from "../design/motion";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** A live sample: its newest point breathes. */
  live?: boolean;
}

const MORPH = { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] } as const;

/** A filled trend line, or nothing when there are fewer than two points. */
export function Sparkline({ values, width = 72, height = 24, live = false }: SparklineProps) {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => [
    index * step,
    height - 2 - ((value - low) / span) * (height - 4),
  ]);
  const line = `M${points.map(([x, y]) => `${x?.toFixed(1)},${y?.toFixed(1)}`).join(" L")}`;
  const [lastX, lastY] = points[points.length - 1] ?? [0, 0];
  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <m.path
        initial={false}
        animate={{ d: `${line} L${width},${height} L0,${height} Z` }}
        transition={MORPH}
        fill="var(--data-1)"
        opacity="0.12"
      />
      <m.path
        initial={false}
        animate={{ d: line }}
        transition={MORPH}
        fill="none"
        stroke="var(--data-1)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {live && (
        <m.circle
          className="spark-now"
          initial={false}
          animate={{ cy: lastY }}
          transition={MORPH}
          cx={lastX}
          r="2.5"
        />
      )}
    </svg>
  );
}
