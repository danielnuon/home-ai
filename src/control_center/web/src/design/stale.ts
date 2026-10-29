/**
 * @file Stale data: a tile that has not refreshed for 3 minutes turns grey and says "stale"
 * (spec 7.3), so a dropped stream or a stalled aggregator never passes for a healthy reading.
 *
 * Age is measured on the server's clock, not the device's: the event stream's `hello` carries the
 * server's time, and the difference is kept here, so a phone whose clock is a few minutes off
 * neither greys every tile nor hides a stalled one. One shared ticker serves every tile, and it
 * runs only while some tile that can go stale is on screen.
 */
import { useSyncExternalStore } from "react";
import type { StatusLabel } from "../api/types";
import { clockTime } from "./time";

const STALE_AFTER_MS = 3 * 60_000;
const CHECK_EVERY_MS = 15_000;

/** Server time minus device time, in milliseconds; 0 until the stream says otherwise. */
let skewMs = 0;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: number | undefined;

/** Records the server's current time, from the event stream's `hello`. */
export function setServerNow(serverNow: string): void {
  skewMs = Date.parse(serverNow) - Date.now();
  tick();
}

function tick(): void {
  now = Date.now() + skewMs;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now() + skewMs;
    timer = window.setInterval(tick, CHECK_EVERY_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

const noSubscription = () => () => undefined;

/**
 * The status to show in place of a stale reading, or null while it is fresh.
 *
 * @param sampledAt - When the figure was measured; null or undefined means it never goes stale.
 * @returns "Stale · since 14:05" as a neutral status, or null.
 */
export function useStaleStatus(sampledAt: string | null | undefined): StatusLabel | null {
  // A figure that can never go stale does not join the ticker.
  const current = useSyncExternalStore(sampledAt ? subscribe : noSubscription, () => now);
  if (!sampledAt || current - Date.parse(sampledAt) < STALE_AFTER_MS) return null;
  return { status: "neutral", label: `Stale · since ${clockTime(sampledAt)}` };
}
