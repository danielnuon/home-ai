/**
 * @file A setting's default, its change history and the one-step revert (spec 7.9: "Every change
 * is audited, shown with its history, and revertible in one step").
 *
 * Reverting goes through the gate like any change, so reverting to a looser value still asks for
 * the passkey.
 */
import { useState } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import type { Setting } from "../api/types";
import { Sheet } from "./Sheet";

const VIA = { brain: "in Brain", discord: "in Discord", desk: "at the desk" } as const;

/** A value as the Owner reads it: "$20", "twilio default", "on". */
export function displayValue(setting: Setting, value: string): string {
  return setting.kind === "money" ? `$${value}` : value.replaceAll("_", " ");
}

/** "Oct 25, 14:05" in the Owner's locale. */
function when(at: string): string {
  return new Date(at).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The sheet's contents: the default, every change newest first, and Revert. */
function HistoryBody({ setting, onDone }: { setting: Setting; onDone: () => void }) {
  const latest = setting.history[0];
  const action = useAction<Setting>({
    refresh: ["settings", setting.owner_page],
    done: (result) => `${result.label}: back to ${displayValue(result, result.value)}`,
  });
  const revert = async () => {
    const reverted = await action.run((proof) =>
      send<Setting>("POST", `/settings/${setting.key}/revert`, undefined, proof),
    );
    if (reverted) onDone();
  };
  return (
    <div className="stack">
      <p className="muted small">Default: {displayValue(setting, setting.default)}</p>
      <ol className="list">
        {setting.history.map((change) => (
          <li key={change.at} className="list-row">
            <span className="grow">
              {displayValue(setting, change.old)} → {displayValue(setting, change.new)}
            </span>
            <span className="muted small">
              {when(change.at)} · {VIA[change.via]}
            </span>
          </li>
        ))}
      </ol>
      {latest && (
        <button type="button" className="btn" disabled={action.busy} onClick={() => void revert()}>
          Revert to {displayValue(setting, latest.old)}
        </button>
      )}
    </div>
  );
}

/** "Default: off" and, once the setting has changed, a History button that opens the sheet. */
export function SettingHistory({ setting }: { setting: Setting }) {
  const [open, setOpen] = useState(false);
  const isDefault = setting.value === setting.default;
  return (
    <span className="row setting-history">
      <span className="muted tiny">
        {isDefault ? "At default" : `Default: ${displayValue(setting, setting.default)}`}
      </span>
      {setting.history.length > 0 && (
        <>
          <button type="button" className="btn ghost compact" onClick={() => setOpen(true)}>
            History
          </button>
          <Sheet open={open} title={setting.label} onClose={() => setOpen(false)}>
            <HistoryBody setting={setting} onDone={() => setOpen(false)} />
          </Sheet>
        </>
      )}
    </span>
  );
}
