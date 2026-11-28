/**
 * @file The control for one setting, the same wherever the setting appears (spec 7.16, rule 7:
 * Settings is an index, and no setting changes only there or only on its own page).
 *
 * The server decides what is tightening and what is loosening; when a change loosens, it answers
 * "step-up required" and `useAction` asks for the passkey. Money settings show their ceiling from
 * policy.yaml, which the gate refuses to exceed.
 */
import { useState, type ReactNode } from "react";
import { getJson } from "../api/client";
import { displayValue, useChangeSetting } from "../api/settings";
import type { ImpactLine, Setting, SettingImpact } from "../api/types";
import { Switch } from "./Controls";
import { ImpactCard } from "./ImpactCard";
import { SettingHistory } from "./SettingHistory";
import { Sheet } from "./Sheet";

/**
 * Changes a setting, first showing its impact card when the change moves speed, memory, cost or
 * assurance (spec 7.18). A change with nothing to show, or a tightening one, applies at once.
 * If the preview can't be read, the change goes ahead and the gate's answer is the toast.
 */
function useProposedChange(setting: Setting) {
  const { change, busy } = useChangeSetting(setting);
  const [pending, setPending] = useState<{ value: string; lines: ImpactLine[] } | null>(null);
  const propose = async (value: string) => {
    let lines: ImpactLine[] = [];
    try {
      const path = `/settings/${setting.key}/impact?value=${encodeURIComponent(value)}`;
      lines = (await getJson<SettingImpact>(path)).lines;
    } catch {
      lines = [];
    }
    if (lines.length > 0) setPending({ value, lines });
    else await change(value);
  };
  const apply = async () => {
    if (!pending) return;
    if (await change(pending.value)) setPending(null);
  };
  const sheet = (
    <Sheet open={pending !== null} title={setting.label} onClose={() => setPending(null)}>
      <div className="stack">
        <p>
          {pending && (
            <>
              {displayValue(setting, setting.value)} → {displayValue(setting, pending.value)}. This
              is what it will change.
            </>
          )}
        </p>
        <ImpactCard lines={pending?.lines ?? []} />
        <button
          type="button"
          className="btn primary sheet-action"
          disabled={busy}
          onClick={() => void apply()}
        >
          Apply
        </button>
      </div>
    </Sheet>
  );
  return { propose, busy, sheet };
}

/** A dollar cap with a Save button; the ceiling is shown because the gate enforces it. */
function MoneyField({ setting }: { setting: Setting }) {
  const { propose: change, busy, sheet } = useProposedChange(setting);
  const [draft, setDraft] = useState(setting.value);
  return (
    <form
      className="row money"
      onSubmit={(event) => {
        event.preventDefault();
        void change(draft);
      }}
    >
      <span aria-hidden="true">$</span>
      <input
        className="field"
        inputMode="numeric"
        aria-label={`${setting.label} in dollars a month`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {setting.ceiling !== null && <span className="muted tiny">max ${setting.ceiling}</span>}
      <button type="submit" className="btn compact" disabled={busy || draft === setting.value}>
        Save
      </button>
      {sheet}
    </form>
  );
}

/** The control that fits the setting's kind. */
function SettingControl({ setting }: { setting: Setting }) {
  if (setting.kind === "money") return <MoneyField key={setting.value} setting={setting} />;
  return <ChoiceControl setting={setting} />;
}

/** A switch, or a select for a level or choice. */
function ChoiceControl({ setting }: { setting: Setting }) {
  const { propose: change, busy, sheet } = useProposedChange(setting);
  return (
    <>
      <ChoiceInput setting={setting} busy={busy} change={change} />
      {sheet}
    </>
  );
}

interface ChoiceInputProps {
  setting: Setting;
  busy: boolean;
  change: (value: string) => Promise<void>;
}

function ChoiceInput({ setting, busy, change }: ChoiceInputProps) {
  // A free choice between off and on, such as Desk mode, is still a switch to look at.
  const onOff = setting.kind === "choice" && setting.choices.join() === "off,on";
  switch (onOff ? "switch" : setting.kind) {
    case "switch":
      return (
        <Switch
          checked={setting.value === "on"}
          label={setting.label}
          disabled={busy}
          onChange={(next) => void change(next ? "on" : "off")}
        />
      );
    default:
      return (
        <select
          className="field select"
          aria-label={setting.label}
          value={setting.value}
          disabled={busy}
          onChange={(event) => void change(event.target.value)}
        >
          {setting.choices.map((choice) => (
            <option key={choice} value={choice}>
              {displayValue(setting, choice)}
            </option>
          ))}
        </select>
      );
  }
}

interface SettingRowProps {
  setting: Setting;
  /** A link to the page that owns the setting, shown after the note on the Settings index. */
  owner?: ReactNode;
}

/** A setting as a list row: label, note, cost note, default and history, and its control. */
export function SettingRow({ setting, owner }: SettingRowProps) {
  return (
    <div className="list-row setting-row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{setting.label}</span>
        <span className="muted small">
          {setting.note}
          {setting.cost_note && ` · ${setting.cost_note}`}
          {owner && <> · {owner}</>}
        </span>
        <SettingHistory setting={setting} />
      </span>
      <SettingControl setting={setting} />
    </div>
  );
}
