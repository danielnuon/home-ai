/**
 * @file The platform state and the kill switch (spec 7.16, rule 6: on every page).
 *
 * Stopping is tightening, so it takes effect at once with no passkey; the sheet first lists what
 * will halt (rule 5, "show the consequence first"). Resuming loosens, so the banner's Resume asks
 * for a passkey through the gate.
 */
import { OctagonX } from "lucide-react";
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useLiveTasks, usePlatform } from "../api/queries";
import type { PlatformState } from "../api/types";
import { Sheet } from "../components/Sheet";
import { StatusText } from "../design/status";

/** The sheet's body: everything that will halt. */
function WhatHalts() {
  const tasks = useLiveTasks().data ?? [];
  const running = tasks.filter((task) => !task.queued);
  return (
    <div className="stack">
      <p>
        Every pipeline, job and outgoing message stops now. Nothing is lost; Resume picks up where
        it left off.
      </p>
      {running.length > 0 && (
        <ul className="list">
          {running.map((task) => (
            <li key={task.id} className="list-row small">
              {task.employee_name} · {task.doing}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Platform status with a "Stop all…" button. `compact` drops the status line. */
export function StopControl({ compact = false }: { compact?: boolean }) {
  const platform = usePlatform().data;
  const [open, setOpen] = useState(false);
  const stop = useAction<PlatformState>({
    refresh: ["platform"],
    done: () => "Everything is stopped",
  });

  if (!platform) return null;
  return (
    <div className="stop-control stack" style={{ ["--gap" as string]: "var(--space-2)" }}>
      {!compact && <StatusText value={platform.overall} className="small" />}
      {!platform.stopped && (
        <button type="button" className="btn destructive compact" onClick={() => setOpen(true)}>
          <OctagonX size={16} aria-hidden="true" /> Stop all…
        </button>
      )}
      <Sheet open={open} title="Stop everything?" onClose={() => setOpen(false)}>
        <WhatHalts />
        <button
          type="button"
          className="btn primary sheet-action"
          disabled={stop.busy}
          onClick={async () => {
            await stop.run(() => send("POST", "/platform/stop"));
            setOpen(false);
          }}
        >
          Stop everything
        </button>
      </Sheet>
    </div>
  );
}
