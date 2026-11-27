/**
 * @file The Owner's arrangement of Today's widgets (spec 7.2, Today: "Customizable widgets").
 *
 * The layout is a preference of this browser, not platform state, so it lives in local storage
 * and never reaches the server. Reading tolerates anything stored there: an unknown widget is
 * dropped, a widget added in a later release joins hidden, so an update never rearranges a page
 * the Owner has already set up. If storage is blocked, the layout lasts until the tab closes.
 */
import { useSyncExternalStore } from "react";

/** Every widget Today can show. */
export type WidgetId =
  "needs" | "live" | "agenda" | "work" | "team" | "away" | "health" | "systems";

/** Small is one column of four, medium two, large the whole row. */
export type WidgetSize = "s" | "m" | "l";

/** What a widget is and the sizes it supports. */
export interface WidgetInfo {
  name: string;
  description: string;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  /** Pinned widgets can move and resize but never leave Today (spec 7.16, rule 6). */
  pinned?: boolean;
}

/** The order, visibility and size of each widget. */
export interface HomeLayout {
  order: WidgetId[];
  hidden: WidgetId[];
  size: Partial<Record<WidgetId, WidgetSize>>;
}

/** The catalogue, in the recommended order. */
export const WIDGETS: Record<WidgetId, WidgetInfo> = {
  needs: {
    name: "Needs you",
    description: "Approvals and threads waiting on you",
    sizes: ["m", "l"],
    defaultSize: "m",
    pinned: true,
  },
  live: {
    name: "Live",
    description: "What the team is doing right now",
    sizes: ["m", "l"],
    defaultSize: "m",
  },
  agenda: {
    name: "Today",
    description: "Your calendar and what is due",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  work: {
    name: "Work",
    description: "Threads by state",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  team: {
    name: "Team",
    description: "Each lead and what they are doing",
    sizes: ["s", "m", "l"],
    defaultSize: "s",
  },
  away: {
    name: "Away mode",
    description: "Pause pipelines while you are away",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  health: {
    name: "How it's running",
    description: "Latency, model swaps, review wait and memory",
    sizes: ["m", "l"],
    defaultSize: "m",
  },
  systems: {
    name: "Systems",
    description: "Services, models, backups and connections",
    sizes: ["m", "l"],
    defaultSize: "m",
  },
};

const IDS = Object.keys(WIDGETS) as WidgetId[];

/**
 * The recommended layout: what needs the Owner and what is happening first, then the day and the
 * team at a glance, then health. On a phone the same order stacks into one column.
 */
export const DEFAULT_LAYOUT: HomeLayout = { order: IDS, hidden: [], size: {} };

/** The size a widget shows at. */
export const sizeOf = (layout: HomeLayout, id: WidgetId): WidgetSize =>
  layout.size[id] ?? WIDGETS[id].defaultSize;

/** The widgets on Today, in order. */
export const visible = (layout: HomeLayout): WidgetId[] =>
  layout.order.filter((id) => !layout.hidden.includes(id));

/** Moves a widget one place earlier (-1) or later (1) among the visible ones. */
export function moveWidget(layout: HomeLayout, id: WidgetId, step: -1 | 1): HomeLayout {
  const shown = visible(layout);
  const other = shown[shown.indexOf(id) + step];
  return other ? placeAt(layout, id, other) : layout;
}

/** Puts `id` where `target` is, shifting the rest, as a drag does. */
export function placeAt(layout: HomeLayout, id: WidgetId, target: WidgetId): HomeLayout {
  if (id === target) return layout;
  const order = layout.order.filter((other) => other !== id);
  const at =
    order.indexOf(target) + (layout.order.indexOf(id) < layout.order.indexOf(target) ? 1 : 0);
  order.splice(at, 0, id);
  return { ...layout, order };
}

/** Sets a widget's size, if it supports it. */
export function resizeWidget(layout: HomeLayout, id: WidgetId, size: WidgetSize): HomeLayout {
  if (!WIDGETS[id].sizes.includes(size)) return layout;
  return { ...layout, size: { ...layout.size, [id]: size } };
}

/** Takes a widget off Today. Pinned widgets stay. */
export function hideWidget(layout: HomeLayout, id: WidgetId): HomeLayout {
  if (WIDGETS[id].pinned || layout.hidden.includes(id)) return layout;
  return { ...layout, hidden: [...layout.hidden, id] };
}

/** Puts a hidden widget back, at the end. */
export function showWidget(layout: HomeLayout, id: WidgetId): HomeLayout {
  const order = [...layout.order.filter((other) => other !== id), id];
  return { ...layout, order, hidden: layout.hidden.filter((other) => other !== id) };
}

/** Reads a stored layout, repairing anything unexpected. */
export function parseLayout(raw: string | null): HomeLayout {
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const stored = JSON.parse(raw) as Partial<HomeLayout>;
    const known = (ids: unknown): WidgetId[] =>
      Array.isArray(ids) ? ids.filter((id): id is WidgetId => IDS.includes(id as WidgetId)) : [];
    const order = [...new Set(known(stored.order))];
    const added = IDS.filter((id) => !order.includes(id));
    const hidden = [...known(stored.hidden), ...added].filter((id) => !WIDGETS[id].pinned);
    const size: HomeLayout["size"] = {};
    for (const id of IDS) {
      const value = stored.size?.[id];
      if (value && WIDGETS[id].sizes.includes(value)) size[id] = value;
    }
    return { order: [...order, ...added], hidden: [...new Set(hidden)], size };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const KEY = "brain.home-layout";
const listeners = new Set<() => void>();
let current: HomeLayout | null = null;

/** The stored layout right now, for handlers that outlive a render, such as a drag. */
export function currentLayout(): HomeLayout {
  return load();
}

function load(): HomeLayout {
  if (current) return current;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage is blocked; keep the layout in memory for this tab.
  }
  current = parseLayout(raw);
  return current;
}

function save(next: HomeLayout): void {
  current = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // As above: the layout still applies until the tab closes.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current layout and a setter that stores it. */
export function useHomeLayout(): [HomeLayout, (next: HomeLayout) => void] {
  const layout = useSyncExternalStore(subscribe, load, () => DEFAULT_LAYOUT);
  return [layout, save];
}
