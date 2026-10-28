/**
 * @file Short, kind wording for times (spec 7.12, "Words").
 */

/** "18 h left", "40 min left" or "ending now" until an ISO time. */
export function timeLeft(until: string, now = Date.now()): string {
  const minutes = Math.round((Date.parse(until) - now) / 60_000);
  if (minutes <= 0) return "ending now";
  if (minutes < 60) return `${minutes} min left`;
  return `${Math.round(minutes / 60)} h left`;
}

/** "14:05" in the Owner's locale, for chat and transcript times. */
export function clockTime(at: string): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
