/**
 * @file Stale data: a tile that has not refreshed for 3 minutes turns grey and says "stale"
 * (spec 7.3), so a dropped stream or a stalled aggregator never passes for a healthy reading.
 */
import { useEffect, useState } from "react";
import type { StatusLabel } from "../api/types";
import { clockTime } from "./time";

const STALE_AFTER_MS = 3 * 60_000;
const CHECK_EVERY_MS = 15_000;

/** The current time, updated every 15 seconds: often enough to grey a tile within the limit. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The status to show in place of a stale reading, or null while it is fresh.
 *
 * @param sampledAt - When the figure was measured; null or undefined means it never goes stale.
 * @returns "Stale · since 14:05" as a neutral status, or null.
 */
export function useStaleStatus(sampledAt: string | null | undefined): StatusLabel | null {
  const now = useNow();
  if (!sampledAt || now - Date.parse(sampledAt) < STALE_AFTER_MS) return null;
  return { status: "neutral", label: `Stale · since ${clockTime(sampledAt)}` };
}
