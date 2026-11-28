/**
 * @file What the Personal, domain and Finance pages share: principal names, the principal filter,
 * a list whose rows glide in and out, and the Undo that brings a deleted item back from the trash.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { Principal, TrashItem } from "../../api/types";
import { useToast } from "../../components/Toasts";
import { AnimatePresence, LEAVE, m } from "../../design/motion";

/** What each principal is called on screen. */
export const PRINCIPAL_NAMES: Record<Principal, string> = { owner: "You", mom: "Mom", dad: "Dad" };

/** The three principals, for a Segmented control. */
export const PRINCIPALS = [
  { value: "owner", label: "You" },
  { value: "mom", label: "Mom" },
  { value: "dad", label: "Dad" },
] as const;

export type PrincipalFilter = Principal | "all";

/** The principals and All, for a list filter. */
export const PRINCIPAL_FILTERS = [{ value: "all", label: "All" }, ...PRINCIPALS] as const;

/** Whether an item belongs under the filter. */
export const shows = (filter: PrincipalFilter, principal: Principal) =>
  filter === "all" || filter === principal;

/**
 * A list whose rows rise in when added and glide out when removed (decision 128).
 *
 * @param props - The rows, each with its key, and what to say when there are none.
 * @returns The list.
 */
export function GlidingList({
  items,
  empty,
}: {
  items: { key: string; node: ReactNode }[];
  empty: string;
}) {
  if (items.length === 0) return <p className="list empty">{empty}</p>;
  return (
    <div className="list">
      <AnimatePresence initial={false} mode="popLayout">
        {items.map(({ key, node }) => (
          <m.div key={key} layout="position" exit={LEAVE}>
            {node}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * The toast after something went to the trash, with Undo that restores it at once.
 *
 * @param refresh - The resources to refetch once it is back.
 * @returns A function that shows the toast for a trash row.
 */
function useTrashedToast(refresh: string[]) {
  const toast = useToast();
  const client = useQueryClient();
  return (item: TrashItem) =>
    toast({
      message: `${item.title} is in Recently deleted for 30 days`,
      undo: () =>
        void send("POST", `/trash/${item.id}/restore`).then(() =>
          [...refresh, "trash"].forEach(
            (name) => void client.invalidateQueries({ queryKey: [name] }),
          ),
        ),
    });
}

/**
 * A row's Delete: it sends the item to the 30-day trash and shows the toast with Undo.
 *
 * @param path - The item's resource, such as "/rules/RU-1".
 * @returns The Delete action, for a row's end swipe and its "…" menu.
 */
export function useDeleteToTrash(path: string) {
  const trashed = useTrashedToast(["personal"]);
  const { run } = useAction<TrashItem>({ refresh: ["personal", "trash"] });
  const remove = async () => {
    const item = await run(() => send<TrashItem>("DELETE", path));
    if (item) trashed(item);
  };
  return { label: "Delete", icon: Trash2, tone: "clay" as const, onSelect: () => void remove() };
}

/** Today's date as the date field wants it, "2026-11-28", plus `days`. */
export function isoDate(days = 0): string {
  const when = new Date(Date.now() + days * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/**
 * The value while it is set, and the last one set after it clears, so a sheet keeps its content
 * while it slides away instead of emptying first (decision 128).
 *
 * @param value - What the sheet shows, or null once it is closing.
 * @returns What to render.
 */
export function useLast<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
