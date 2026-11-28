/**
 * @file Recently deleted: the 30-day trash (spec 7.16, rule 11).
 *
 * Deleted records, documents, contacts and rules wait here for 30 days. Swipe one right, or press
 * Restore, to put it back where it was. Deleting one for good can't be undone, so it is a hold to
 * confirm in a sheet, never a swipe.
 */
import { ArrowUpRight, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useTrash } from "../api/queries";
import type { TrashItem } from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { HoldButton } from "../components/HoldButton";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Sheet } from "../components/Sheet";
import { AnimatePresence, LEAVE, m } from "../design/motion";
import { ROUTES } from "../routes";

const DAY_MS = 24 * 3600 * 1000;

/** "12 days left", counted to when the item is purged. */
function daysLeft(item: TrashItem, now = Date.now()): string {
  const days = Math.max(0, Math.ceil((Date.parse(item.purge_at) - now) / DAY_MS));
  return days === 1 ? "1 day left" : `${days} days left`;
}

const homeName = (home: string) => ROUTES.find((page) => page.path === home)?.label ?? "its page";

/** The sheet that deletes one item for good. */
function PurgeSheet({ item, onClose }: { item: TrashItem | null; onClose: () => void }) {
  const { run, busy } = useAction<null>({ refresh: ["trash"], done: () => "Deleted for good" });
  const purge = async () => {
    if (!item) return;
    await run(() => send<null>("POST", `/trash/${item.id}/purge`));
    onClose();
  };
  return (
    <Sheet open={item !== null} title="Delete for good" onClose={onClose}>
      <p>
        {item?.title} will be gone for good. It won't come back from the trash, and nothing else
        changes.
      </p>
      <HoldButton label="Delete forever" disabled={busy} onConfirm={() => void purge()} />
    </Sheet>
  );
}

/** One deleted item: swipe right to restore; its "…" menu also opens its page or deletes it. */
function TrashRow({ item, onPurge }: { item: TrashItem; onPurge: () => void }) {
  const navigate = useNavigate();
  const { run } = useAction<TrashItem>({
    refresh: ["trash"],
    done: (back) => `Restored to ${homeName(back.home)}`,
  });
  const restore = () => void run(() => send<TrashItem>("POST", `/trash/${item.id}/restore`));
  const restoreAction = { label: "Restore", icon: RotateCcw, onSelect: restore };
  return (
    <ActionRow
      title={item.title}
      meta={`${item.meta} · ${daysLeft(item)}`}
      start={restoreAction}
      more={[
        restoreAction,
        {
          label: `Open ${homeName(item.home)}`,
          icon: ArrowUpRight,
          onSelect: () => navigate(item.home),
        },
        { label: "Delete for good", icon: Trash2, destructive: true, onSelect: onPurge },
      ]}
    />
  );
}

/** The Recently deleted page. */
export default function Trash() {
  const query = useTrash();
  const [purging, setPurging] = useState<TrashItem | null>(null);
  return (
    <Page title="Recently deleted" subtitle="Kept for 30 days, then deleted for good.">
      <QueryState query={query}>
        {(trash) =>
          trash.items.length === 0 ? (
            <p className="list empty">
              Nothing was deleted in the last {trash.retention_days} days. Deleted records,
              documents, contacts and rules wait here so you can restore them.
            </p>
          ) : (
            <div className="list">
              <AnimatePresence initial={false} mode="popLayout">
                {trash.items.map((item) => (
                  <m.div key={item.id} layout="position" exit={LEAVE}>
                    <TrashRow item={item} onPurge={() => setPurging(item)} />
                  </m.div>
                ))}
              </AnimatePresence>
            </div>
          )
        }
      </QueryState>
      <PurgeSheet item={purging} onClose={() => setPurging(null)} />
    </Page>
  );
}
