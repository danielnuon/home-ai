/**
 * @file The offline pack on this device (spec 7.7): fetched from Brain, kept in the browser's
 * Cache Storage, and read back from there when the Mac can't be reached.
 *
 * The pack exists only after the Owner turns it on with a passkey, and it is kept only on the
 * Owner's own devices: turning it off deletes this device's copy. A fresh copy is fetched when
 * the page opens and the saved one is a day old.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, API_BASE, getJson } from "./client";
import type { OfflinePack } from "./types";

const CACHE = "brain-offline-pack";
const KEY = `${API_BASE}/offline-pack`;
const DAY_MS = 24 * 3600 * 1000;

const hasCache = () => typeof caches !== "undefined";

async function save(pack: OfflinePack): Promise<void> {
  if (!hasCache()) return;
  const cache = await caches.open(CACHE);
  await cache.put(
    KEY,
    new Response(JSON.stringify(pack), { headers: { "Content-Type": "application/json" } }),
  );
}

async function saved(): Promise<OfflinePack | null> {
  if (!hasCache()) return null;
  const found = await (await caches.open(CACHE)).match(KEY);
  return found ? ((await found.json()) as OfflinePack) : null;
}

/** The pack, and whether it came from this device because Brain could not be reached. */
interface PackOnDevice {
  pack: OfflinePack;
  fromDevice: boolean;
}

async function load(): Promise<PackOnDevice> {
  try {
    const pack = await getJson<OfflinePack>("/offline-pack");
    await save(pack);
    return { pack, fromDevice: false };
  } catch (error) {
    // Brain answered with a refusal (the pack is off): that is the answer, not an outage.
    if (error instanceof ApiError) throw error;
    const copy = await saved();
    if (copy) return { pack: copy, fromDevice: true };
    throw error;
  }
}

/**
 * The offline pack while the feature is on; this device's copy is deleted when it is off.
 *
 * @param on - Whether the offline pack setting is on; undefined while Brain can't be asked, when
 *   this device's copy is shown if it has one.
 * @returns The query for the pack.
 */
export function useOfflinePack(on: boolean | undefined) {
  useEffect(() => {
    if (on === false && hasCache()) void caches.delete(CACHE);
  }, [on]);
  return useQuery({
    queryKey: ["offline"],
    queryFn: load,
    enabled: on !== false,
    staleTime: DAY_MS,
  });
}
