/**
 * @file The words Contacts uses for trust, channels and dates, in one place so every sheet agrees.
 */
import type { ContactChannel, Trust } from "../../api/types";

/** Trust levels, tightest last, with what each means (spec 7.16, rule 10). */
export const TRUST_LEVELS: { value: Trust; label: string; meaning: string }[] = [
  { value: "allowlisted", label: "Allowlisted", meaning: "One-tap approvals" },
  { value: "known", label: "Known", meaning: "Full approvals" },
  { value: "unknown", label: "Unknown", meaning: "Triage only" },
  { value: "blocked", label: "Blocked", meaning: "Filed, never drafted" },
];

/** A trust level's name, such as "Allowlisted". */
export const trustLabel = (trust: Trust) =>
  TRUST_LEVELS.find((level) => level.value === trust)?.label ?? trust;

/** The ways a contact can be reached, in the order the form offers them. */
export const CHANNEL_KINDS: { value: ContactChannel["kind"]; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "text", label: "Text" },
  { value: "post", label: "Post" },
];

/** A channel kind's name, such as "Email". */
export const channelLabel = (kind: ContactChannel["kind"]) =>
  CHANNEL_KINDS.find((c) => c.value === kind)?.label ?? kind;

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "Nov 27": the day something happened or will happen. */
export const dayLabel = (iso: string) => DAY.format(new Date(iso));
