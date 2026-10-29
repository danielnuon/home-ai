/**
 * @file Changing and reverting a setting, shared by its control and its history so both refresh
 * the same pages and say the same things.
 */
import { useAction } from "./actions";
import { send } from "./client";
import type { Setting } from "./types";

/** A value as the Owner reads it: "$20", "twilio default", "on". */
export function displayValue(setting: Setting, value: string): string {
  return setting.kind === "money" ? `$${value}` : value.replaceAll("_", " ");
}

/**
 * Returns `change`, which sends a new value, `revert`, which undoes the latest change, and `busy`.
 * Both go through the gate, so a loosening one asks for the passkey (spec 7.16, rule 3).
 *
 * @param setting - The setting to change.
 * @returns The two actions, each resolving to the updated setting or null, and the busy flag.
 */
export function useChangeSetting(setting: Setting) {
  const action = useAction<Setting>({
    refresh: ["settings", setting.owner_page],
    done: (result) => `${result.label}: ${displayValue(result, result.value)}`,
  });
  const change = (value: string) =>
    action.run((proof) => send<Setting>("PUT", `/settings/${setting.key}`, { value }, proof));
  const revert = () =>
    action.run((proof) =>
      send<Setting>("POST", `/settings/${setting.key}/revert`, undefined, proof),
    );
  return { change, revert, busy: action.busy };
}
