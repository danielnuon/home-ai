/**
 * @file A filter that picks one value from a short list: a pill that names what is shown, and
 * the shared menu with every choice (spec 7.15, pattern catalog; 7.16, rule 13).
 *
 * The pill reads "Pipeline: All" or "Pipeline: Development", so the current filter is always on
 * screen. It opens the same menu as "…", by press, right-click or long press, and the chosen value
 * carries a check. Pages keep the value in the URL so a link opens the same view.
 */
import { Check, ChevronDown } from "lucide-react";
import { useMoreMenu } from "./MoreMenu";

/** The value a filter takes when it shows everything. */
export const ALL = "all";

interface FilterMenuProps {
  label: string;
  value: string;
  /** Each choice after All, as [value, words]. */
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}

/**
 * One filter pill and its menu.
 *
 * @param props - The filter's name, its value, its choices and what to do on a change.
 * @returns The pill, with its menu.
 */
export function FilterMenu({ label, value, options, onChange }: FilterMenuProps) {
  const choices: (readonly [string, string])[] = [[ALL, "All"], ...options];
  const current = choices.find(([option]) => option === value)?.[1] ?? "All";
  const { button, menu } = useMoreMenu(
    choices.map(([option, words]) => ({
      label: words,
      icon: option === value ? Check : undefined,
      onSelect: () => onChange(option),
    })),
    label,
    { icon: ChevronDown, name: `${label}: ${current}`, text: `${label}: ${current}` },
  );
  return (
    <>
      {button}
      {menu}
    </>
  );
}
