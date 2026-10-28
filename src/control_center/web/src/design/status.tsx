/**
 * @file Status words: color plus shape plus a word, everywhere (spec 7.12, "Status").
 */
import type { Status, StatusLabel } from "../api/types";

/** The shape that goes with each status, so status never depends on color alone. */
const STATUS_SYMBOL: Record<Status, string> = {
  healthy: "●",
  in_progress: "◐",
  attention: "▲",
  problem: "■",
  neutral: "",
};

/** A status symbol and its words, in the status's text color. */
export function StatusText({ value, className = "" }: { value: StatusLabel; className?: string }) {
  const symbol = STATUS_SYMBOL[value.status];
  return (
    <span className={`status-${value.status} ${className}`}>
      {symbol && <span aria-hidden="true">{symbol} </span>}
      {value.label}
    </span>
  );
}
