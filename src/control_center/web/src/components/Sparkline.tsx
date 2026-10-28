/**
 * @file The small trend line beside a stat tile's value (spec 7.12, "Icons and charts").
 *
 * One data color, a soft fill and no axes: it shows direction, not exact values. The values it
 * draws are already in the tile's words, so it is hidden from screen readers.
 */

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/** A filled trend line, or nothing when there are fewer than two points. */
export function Sparkline({ values, width = 72, height = 24 }: SparklineProps) {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const step = width / (values.length - 1);
  const points = values.map(
    (value, index) =>
      `${(index * step).toFixed(1)},${(height - 2 - ((value - low) / span) * (height - 4)).toFixed(1)}`,
  );
  const line = `M${points.join(" L")}`;
  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path d={`${line} L${width},${height} L0,${height} Z`} fill="var(--data-1)" opacity="0.12" />
      <path d={line} fill="none" stroke="var(--data-1)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
