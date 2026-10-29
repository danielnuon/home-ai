/**
 * @file The control for one setting, the same wherever the setting appears (spec 7.16, rule 7:
 * Settings is an index, and no setting changes only there or only on its own page).
 *
 * The server decides what is tightening and what is loosening; when a change loosens, it answers
 * "step-up required" and `useAction` asks for the passkey. Money settings show their ceiling from
 * policy.yaml, which the gate refuses to exceed.
 */
import { useState, type ReactNode } from "react";
import { displayValue, useChangeSetting } from "../api/settings";
import type { Setting } from "../api/types";
import { Switch } from "./Controls";
import { SettingHistory } from "./SettingHistory";

/** A dollar cap with a Save button; the ceiling is shown because the gate enforces it. */
function MoneyField({ setting }: { setting: Setting }) {
  const { change, busy } = useChangeSetting(setting);
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
    </form>
  );
}

/** The control that fits the setting's kind. */
function SettingControl({ setting }: { setting: Setting }) {
  const { change, busy } = useChangeSetting(setting);
  switch (setting.kind) {
    case "switch":
      return (
        <Switch
          checked={setting.value === "on"}
          label={setting.label}
          disabled={busy}
          onChange={(next) => void change(next ? "on" : "off")}
        />
      );
    case "money":
      return <MoneyField key={setting.value} setting={setting} />;
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
