/**
 * @file The preview's shell surfaces: the Guide panel, the Docs reader and change requests,
 * Today's alerts, the 30-day trash, the offline pack and the offline library. A port of
 * `backends/mock/engine_shell.py` and `backends/mock/gate_shell.py`.
 *
 * An area that deletes something calls `sendToTrash` with what it removed and registers a
 * restorer for its kind in `RESTORERS`, as on the server (docs/engineering/interaction-patterns.md).
 */
import type { components } from "../api/schema";
import { conflict, notFound } from "./errors";
import { requireStepUp } from "./gate";
import { isOn, type MockWorld } from "./world";

type Schemas = components["schemas"];
type TrashItem = Schemas["TrashItem"];
type Alert = Schemas["Alert"];

/** How each kind of deleted thing goes back where it was; an area registers its own. */
export const RESTORERS: Partial<
  Record<TrashItem["kind"], (world: MockWorld, payload: unknown) => void>
> = {};

const HOME_RESOURCES: Record<string, string> = {
  "/finance": "finance",
  "/personal": "personal",
  "/contacts": "contacts",
  "/docs": "docs",
};

const DAY_MS = 24 * 3600 * 1000;

/** Keeps a deleted thing for 30 days so it can be restored. */
export function sendToTrash(
  world: MockWorld,
  fields: Pick<TrashItem, "kind" | "title" | "meta" | "home">,
  payload: unknown,
): TrashItem {
  const now = world.clock();
  const item: TrashItem = {
    id: `TR-${world.ids(2)}`,
    ...fields,
    deleted_at: now.toISOString(),
    purge_at: new Date(now.getTime() + world.constants.trash_days * DAY_MS).toISOString(),
  };
  world.trash = { [item.id]: item, ...world.trash };
  world.trashed.set(item.id, payload);
  world.bus.changed("trash");
  return item;
}

// Guide panel ----------------------------------------------------------------------------------

function pageAnswer(world: MockWorld, page: string): [string, Schemas["GuideSource"][]] {
  for (const [path, said] of Object.entries(world.fixtures.guide_pages)) {
    if (page === path || (path !== "/" && page.startsWith(`${path}/`))) return said;
  }
  return [world.fixtures.guide_fallback, []];
}

/** Wayfinder's read-only answer about the page on screen. */
export function guideAsk(
  world: MockWorld,
  question: string,
  page: string,
  context: string | null,
): Schemas["GuideAnswer"] {
  const words = question.trim().toLowerCase();
  if (!words) throw conflict("Type a question first.");
  const keyed = Object.entries(world.fixtures.wayfinder_answers).find(([w]) =>
    words.includes(w),
  )?.[1];
  const [said, sources] = pageAnswer(world, page);
  const answer = context ? `About ${context}: ${said}` : said;
  return {
    id: `GA-${world.ids(3)}`,
    question: question.trim(),
    page,
    answer: keyed ?? answer,
    sources,
  };
}

// Docs -----------------------------------------------------------------------------------------

/** One document, rendered. */
export function docPage(world: MockWorld, id: string): Schemas["DocPage"] {
  const blocks = world.fixtures.doc_bodies[id];
  const row = world.fixtures.doc_groups.flatMap((g) => g.rows).find((r) => r.id === id);
  if (!blocks || !row) throw notFound("That document doesn't exist.");
  return { id: row.id, title: row.title, meta: row.meta, status: row.status, blocks };
}

/** Turns a change request on a document into a work item. */
export function requestDocChange(
  world: MockWorld,
  id: string,
  text: string,
): Schemas["DocChangeRequested"] {
  const doc = docPage(world, id);
  if (!text.trim()) throw conflict("Say what should change first.");
  const { stages, label } = world.fixtures.intake_stage;
  const item: Schemas["WorkItem"] = {
    id: `WI-${world.ids(2)}`,
    title: `Update ${doc.title}`,
    risk: "R0",
    status: { status: "in_progress", label },
    stages,
    progress: 0,
    employee_name: "Wayfinder",
    department: "governance",
    employee_state: "thinking",
    now: `Wayfinder is routing your request: ${text.trim()}`,
    eta: "Routed within a few minutes",
    cost_usd: 0,
    waiting_on_owner: false,
  };
  world.work_items.push(item);
  world.bus.changed("work", "today");
  return { work_item_id: item.id, message: `Requested. ${item.id} is on Work.` };
}

// Alerts ---------------------------------------------------------------------------------------

/** Open alerts; a snoozed one comes back when its snooze ends. */
export function alerts(world: MockWorld): Alert[] {
  const now = world.clock().getTime();
  for (const alert of Object.values(world.alerts)) {
    if (
      alert.state === "snoozed" &&
      alert.snoozed_until &&
      Date.parse(alert.snoozed_until) <= now
    ) {
      alert.state = "open";
      alert.snoozed_until = null;
    }
  }
  return Object.values(world.alerts).filter((a) => a.state === "open");
}

/** Acknowledges or snoozes an alert, or reopens it. */
export function alertAction(world: MockWorld, id: string, action: string): Alert {
  const alert = world.alerts[id];
  if (!alert) throw notFound("That alert no longer exists.");
  if (action === "snooze") {
    alert.state = "snoozed";
    const until = world.clock().getTime() + world.constants.snooze_seconds * 1000;
    alert.snoozed_until = new Date(until).toISOString();
  } else {
    alert.state = action === "acknowledge" ? "acknowledged" : "open";
    alert.snoozed_until = null;
  }
  world.bus.changed("today");
  return alert;
}

// Trash ----------------------------------------------------------------------------------------

function forget(world: MockWorld, id: string): void {
  world.trash = Object.fromEntries(Object.entries(world.trash).filter(([key]) => key !== id));
  world.trashed.delete(id);
}

/** Items deleted in the last 30 days, newest first; older ones are purged as they lapse. */
export function trash(world: MockWorld): Schemas["TrashOverview"] {
  const now = world.clock().getTime();
  Object.values(world.trash)
    .filter((item) => Date.parse(item.purge_at) <= now)
    .forEach((item) => forget(world, item.id));
  return {
    items: Object.values(world.trash).sort(
      (a, b) => Date.parse(b.deleted_at) - Date.parse(a.deleted_at),
    ),
    retention_days: world.constants.trash_days,
  };
}

function trashItem(world: MockWorld, id: string): TrashItem {
  trash(world);
  const item = world.trash[id];
  if (!item) throw notFound("That item is no longer in the trash.");
  return item;
}

/** Puts a deleted item back on its home page. */
export function restoreFromTrash(world: MockWorld, id: string): TrashItem {
  const item = trashItem(world, id);
  RESTORERS[item.kind]?.(world, world.trashed.get(id));
  forget(world, id);
  const home = HOME_RESOURCES[item.home];
  world.bus.changed("trash", ...(home ? [home] : []));
  return item;
}

/** Deletes an item for good. */
export function purgeFromTrash(world: MockWorld, id: string): void {
  trashItem(world, id);
  forget(world, id);
  world.bus.changed("trash");
}

// Offline pack and library ---------------------------------------------------------------------

/** The offline pack, if it is on. */
export function offlinePack(world: MockWorld): Schemas["OfflinePack"] {
  if (!isOn(world, "offline_pack")) throw conflict("The offline pack is off. Turn it on first.");
  return { generated_at: world.sampledAt.toISOString(), groups: world.fixtures.offline_pack };
}

function requireLibrary(world: MockWorld): void {
  if (!isOn(world, "offline_library")) {
    throw conflict("The offline library is off. Turn it on first.");
  }
}

/** The Library page. */
export function library(world: MockWorld): Schemas["LibraryOverview"] {
  requireLibrary(world);
  return {
    categories: world.fixtures.library_categories,
    quick_cards: world.fixtures.quick_cards,
    tiers: world.fixtures.library_tiers,
    safety_test: { status: "healthy", label: "Passed 200 of 200 · Nov 20" },
    offgrid: false,
    battery: null,
    volumes: world.constants.ark_volumes,
  };
}

/** Quick cards whose title, category or steps contain the words. */
export function librarySearch(world: MockWorld, query: string): Schemas["LibrarySearchResults"] {
  requireLibrary(world);
  const needle = query.trim().toLowerCase();
  const results = world.fixtures.quick_cards
    .filter(
      (c) => needle && [c.title, c.category, ...c.steps].join(" ").toLowerCase().includes(needle),
    )
    .map((c) => ({ id: c.id, title: c.title, meta: `${c.category} · ${c.source}`, href: "" }));
  return { query, results };
}

/** The librarian's answer: a red flag opens its quick card; no passage means no answer. */
export function libraryAsk(world: MockWorld, question: string): Schemas["LibraryAnswer"] {
  requireLibrary(world);
  const words = question.trim().toLowerCase();
  if (!words) throw conflict("Type a question first.");
  const { red_flags, quick_cards, library_answers, library_caveat, no_passage } = world.fixtures;
  const flag = Object.entries(red_flags).find(([w]) => words.includes(w))?.[1];
  const card = quick_cards.find((c) => c.id === flag);
  if (card) {
    return {
      question: question.trim(),
      answer: null,
      quick_card: card,
      citations: [],
      note: library_caveat,
    };
  }
  const found = Object.entries(library_answers).find(([w]) => words.includes(w))?.[1];
  return {
    question: question.trim(),
    answer: found ? found[0] : null,
    quick_card: null,
    citations: found ? found[1] : [],
    note: found ? library_caveat : no_passage,
  };
}

/** Writes an Ark drive to an external volume. Always needs a step-up. */
export function writeArkDrive(
  world: MockWorld,
  volume: string,
  stepUp: string | null,
): Schemas["ArkDriveStarted"] {
  requireLibrary(world);
  if (!world.constants.ark_volumes.includes(volume)) throw notFound("That drive isn't connected.");
  requireStepUp(world, stepUp, "Writing an Ark drive needs your passkey.");
  const tiers = world.fixtures.library_tiers
    .filter((t) => t.installed)
    .map((t) => t.name)
    .join(", ");
  return { message: `Writing ${tiers} to ${volume}. You'll get a notice when it's done.` };
}
