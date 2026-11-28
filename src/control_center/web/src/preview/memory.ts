/**
 * @file The preview's conversation memory: the Memory view and what chat saves, learns and cites.
 * A port of `backends/mock/memory.py` and `memory_rules.py` (spec 15.9.2, 15.9.3, 15.9.7). The
 * text checks stand in for the engine's EXTRACT call and detectors; keep them the same as Python's.
 */
import type { MemoryItem, MemoryNote, MemoryOverview } from "../api/types";
import { conflict, notFound } from "./errors";
import type { MockWorld, ThreadRecord } from "./world";

type MemoryKind = MemoryItem["kind"];
type MemoryRef = { id: string; text: string };

// The rules (`memory_rules.py`) -----------------------------------------------------------------

const EXPLICIT = /^(?:please\s+)?(?:remember(?:\s+that)?|from now on)[\s,:]+(.+)$/i;
const STANDING_ORDER =
  /\b(?:always|automatically|auto)[\s-]*(?:approve|send|pay)\w*\b|\bauto-?send\w*\b/i;
const SECRET = /\b(?:password|passcode|pin|code|ssn|social security|account number)\b|\d{6,}/i;
const RESTRICTED =
  /\b(?:health|doctor|pharmacy|insurance|medical|medicine|bank|tax|taxes|money|salary|invest\w*|tenant|rent|rental|mom|dad|mother|father)\b/i;
const LEARNABLE = /\b(?:I prefer|I'd rather|I like|call me|my favou?rite)\b[^.!?\n]*/gi;
const STOPWORDS = new Set(
  (
    "about after again also been before being could does from have just know like make more " +
    "much need only please really should some than that their them then there these they this " +
    "want what when where which will with would your"
  ).split(" "),
);

const tidy = (text: string): string => {
  const plain = text.split(/\s+/).filter(Boolean).join(" ");
  if (!plain) return plain;
  const capital = plain.charAt(0).toUpperCase() + plain.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

/** The note the Owner asked to save, or null when the message asks for none. */
function explicit(text: string): string | null {
  const match = EXPLICIT.exec(text.trim());
  if (!match?.[1]) return null;
  return text.trim().toLowerCase().startsWith("from now on") ? tidy(text) : tidy(match[1]);
}

function refusal(world: MockWorld, text: string): string | null {
  if (!text.trim()) return "Write the note first.";
  if (STANDING_ORDER.test(text)) {
    return "Not saved: a note can't approve, send or pay for anything. Set an approval rule in Settings instead.";
  }
  if (SECRET.test(text)) {
    return "Not saved: codes, passwords and account numbers are never kept in memory.";
  }
  if (RESTRICTED.test(text))
    return "Not saved: restricted notes arrive with the restricted domains.";
  const most = world.constants.item_max_chars;
  return text.length > most ? `Not saved: a note holds at most ${most} characters.` : null;
}

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9']+/g) ?? []);

function same(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)];
  return x.size === y.size && [...x].every((word) => y.has(word));
}

function contradicts(next: string, old: string): boolean {
  const [x, y] = [words(next), words(old)];
  const union = new Set([...x, ...y]);
  const shared = [...x].filter((word) => y.has(word)).length;
  return union.size > 0 && !same(next, old) && shared / union.size >= 0.5;
}

function relevant(note: string, message: string): boolean {
  const key = [...words(message)].filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const have = words(note);
  return key.some((word) => have.has(word));
}

function learnable(world: MockWorld, text: string): string[] {
  const found = [...text.matchAll(LEARNABLE)].map((match) => tidy(match[0]));
  return found
    .filter((item) => refusal(world, item) === null)
    .slice(0, world.constants.max_learned_per_turn);
}

// The Memory view -------------------------------------------------------------------------------

const MEMORY_PAGES = ["memory", "chat"];

/** Every item, newest first, whether memory is paused, and the forgets still undoable. */
export function memoryOverview(world: MockWorld): MemoryOverview {
  const now = world.clock().getTime();
  for (const [id, { until }] of world.memoryForgotten) {
    if (until.getTime() <= now) world.memoryForgotten.delete(id);
  }
  return {
    items: Object.values(world.memories).sort(
      (a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at),
    ),
    paused: world.memory_paused,
    pinned_max: world.constants.pinned_max,
    forgotten: [...world.memoryForgotten.values()].map(({ item, until }) => ({
      id: item.id,
      text: item.text,
      undo_until: until.toISOString(),
    })),
  };
}

function item(world: MockWorld, id: string): MemoryItem {
  const found = world.memories[id];
  if (!found) throw notFound("That note isn't in memory.");
  return found;
}

function changed(world: MockWorld): MemoryOverview {
  world.bus.changed(...MEMORY_PAGES);
  return memoryOverview(world);
}

function checked(world: MockWorld, text: string): string {
  const tidied = tidy(text);
  const reason = refusal(world, tidied);
  if (reason !== null) throw conflict(reason);
  return tidied;
}

/** Adds a note in the view: most often "don't bring this up". */
export function memoryAdd(world: MockWorld, text: string, kind: MemoryKind = "avoid") {
  save(world, checked(world, text), "said", kind);
  return changed(world);
}

/** Changes an item's text, or pins or unpins it. */
export function memoryEdit(
  world: MockWorld,
  id: string,
  change: { text?: string | null; pinned?: boolean | null },
): MemoryOverview {
  const found = item(world, id);
  if (found.status !== "active") {
    throw conflict("Only a note in use can be changed. Confirm it first.");
  }
  if (typeof change.text === "string") found.text = checked(world, change.text);
  const most = world.constants.pinned_max;
  if (change.pinned && !found.pinned) {
    const count = Object.values(world.memories).filter((m) => m.pinned).length;
    if (count >= most) throw conflict(`At most ${most} notes can be pinned. Unpin one first.`);
  }
  if (typeof change.pinned === "boolean") found.pinned = change.pinned;
  return changed(world);
}

/** Forgets an item; it can be brought back for ten minutes. */
export function memoryForget(world: MockWorld, id: string): MemoryOverview {
  const found = item(world, id);
  Reflect.deleteProperty(world.memories, id);
  const until = world.clock().getTime() + world.constants.forget_undo_seconds * 1000;
  world.memoryForgotten.set(id, { item: found, until: new Date(until) });
  return changed(world);
}

/** Undoes a forget while its ten minutes last. */
export function memoryRestore(world: MockWorld, id: string): MemoryOverview {
  memoryOverview(world);
  const found = world.memoryForgotten.get(id);
  if (!found) throw conflict("That note can't be brought back any more.");
  world.memoryForgotten.delete(id);
  world.memories[id] = found.item;
  return changed(world);
}

function proposed(world: MockWorld, id: string): MemoryItem {
  const found = item(world, id);
  if (found.status !== "proposed") throw conflict("That note isn't waiting for you.");
  return found;
}

/** Confirms a proposed item: it is saved and used from now on. */
export function memoryConfirm(world: MockWorld, id: string): MemoryOverview {
  const found = proposed(world, id);
  found.status = "active";
  found.how = "confirmed";
  return changed(world);
}

/** Turns down a proposed item: nothing is saved. */
export function memoryDismiss(world: MockWorld, id: string): MemoryOverview {
  proposed(world, id);
  Reflect.deleteProperty(world.memories, id);
  return changed(world);
}

/** Pauses or resumes memory. */
export function memoryPause(world: MockWorld, paused: boolean): MemoryOverview {
  world.memory_paused = paused;
  return changed(world);
}

// What chat does with memory --------------------------------------------------------------------

const active = (world: MockWorld) =>
  Object.values(world.memories).filter((m) => m.status === "active");

function save(
  world: MockWorld,
  text: string,
  how: MemoryItem["how"],
  kind: MemoryKind = "note",
  thread: ThreadRecord | null = null,
): MemoryNote {
  const current = active(world);
  const known = current.find((m) => same(m.text, text));
  if (known) return { outcome: "saved", item_id: known.id, text: known.text };
  const created = newItem(world, text, how, kind, thread);
  world.memories[created.id] = created;
  const old = current.find((m) => contradicts(text, m.text));
  if (old) {
    old.status = "superseded";
    old.superseded_by = created.id;
  }
  world.bus.changed("memory");
  const outcome = old ? "updated" : how === "learned" ? "learned" : "saved";
  return { outcome, item_id: created.id, text };
}

/** A new note in the Owner's scope, from what was said in `thread`. */
function newItem(
  world: MockWorld,
  text: string,
  how: MemoryItem["how"],
  kind: MemoryKind,
  thread: ThreadRecord | null,
): MemoryItem {
  return {
    id: `MEM-${world.ids(3)}`,
    text,
    kind,
    scope: "owner",
    scope_label: "Everyone",
    lead_id: null,
    principal: "owner",
    status: "active",
    how,
    pinned: false,
    source_thread_id: thread?.id ?? null,
    source_thread_title: thread?.title ?? null,
    source_lead_id: thread?.lead_id ?? null,
    source: null,
    saved_at: world.clock().toISOString(),
    last_used: null,
    use_count: 0,
    superseded_by: null,
  };
}

/** Saves what the Owner asked to remember in a thread, or says why it was not saved. */
export function remember(world: MockWorld, text: string, thread: ThreadRecord): MemoryNote {
  if (thread.temporary_until !== null) {
    return {
      outcome: "not_saved",
      item_id: null,
      text: "Not saved: a temporary chat keeps no memory.",
    };
  }
  const tidied = tidy(text);
  const reason = refusal(world, tidied);
  if (reason !== null) return { outcome: "not_saved", item_id: null, text: reason };
  return save(world, tidied, "said", "note", thread);
}

/** What the lead learns from the Owner's message, unless learning is off for it. */
export function learn(world: MockWorld, text: string, thread: ThreadRecord): MemoryNote[] {
  if (world.memory_paused || !thread.learning || thread.temporary_until) return [];
  const known = active(world).map((m) => m.text);
  return learnable(world, text)
    .filter((found) => !known.some((k) => same(found, k)))
    .map((found) => save(world, found, "learned", "note", thread));
}

/** The items a reply reads: pinned ones, then the relevant, up to eight. */
export function recall(
  world: MockWorld,
  text: string,
  leadId: string,
  thread: ThreadRecord,
): MemoryRef[] {
  if (world.memory_paused || thread.temporary_until !== null) return [];
  const readable = active(world).filter((m) => m.lead_id === null || m.lead_id === leadId);
  const chosen = [
    ...readable.filter((m) => m.pinned),
    ...readable.filter((m) => !m.pinned && relevant(m.text, text)),
  ].slice(0, world.constants.items_per_turn);
  const now = world.clock().toISOString();
  for (const used of chosen) {
    used.last_used = now;
    used.use_count += 1;
  }
  if (chosen.length > 0) world.bus.changed("memory");
  return chosen.map((m) => ({ id: m.id, text: m.text }));
}

/** Whether a message asks for a note to be saved: the note, or null. */
export const askedToRemember = explicit;
