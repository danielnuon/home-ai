/**
 * @file Ambient time: the background shifts slowly through the day, from a cool dawn tint to a
 * warm dusk, in the Still Water palette (spec 7.14).
 *
 * Two fixed tint layers sit behind everything and only their opacity changes, over minutes, so it
 * costs nothing per frame and is never noticed as movement. The hour is the Owner's own
 * (America/Los_Angeles), as on Today. Reduce Motion keeps it: it is a colour, not a movement.
 */
import { useEffect, useState } from "react";

const OWNER_TIME_ZONE = "America/Los_Angeles";
const EVERY_MS = 5 * 60 * 1000;

/** The Owner's hour of the day as a fraction, 0 to 24. */
function ownerHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OWNER_TIME_ZONE,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") + get("minute") / 60;
}

/** How strongly a tint shows: full at `peak`, nothing `width` hours either side. */
const bump = (hour: number, peak: number, width: number) =>
  Math.max(0, 1 - Math.abs(hour - peak) / width);

/**
 * How much dawn and dusk show at an hour: dawn around 7:00, dusk around 18:30.
 *
 * @param hour - The Owner's hour, 0 to 24.
 * @returns The two layers' opacities.
 */
export function ambientAt(hour: number): { dawn: number; dusk: number } {
  return { dawn: bump(hour, 7, 3.5), dusk: bump(hour, 18.5, 3.5) };
}

/** The two tint layers, refreshed every five minutes. */
export function Ambient() {
  const [tint, setTint] = useState(() => ambientAt(ownerHour(new Date())));
  useEffect(() => {
    const timer = window.setInterval(() => setTint(ambientAt(ownerHour(new Date()))), EVERY_MS);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-dawn" style={{ opacity: tint.dawn }} />
      <div className="ambient-dusk" style={{ opacity: tint.dusk }} />
    </div>
  );
}
