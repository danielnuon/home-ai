/**
 * @file Filter chips kept in the address, so Back returns to the same filtered view (spec 7.16,
 * rule 14) and a filtered link can be shared.
 *
 * Each group is one row of chips with "All" first; pressing the chosen chip again clears it.
 * A group with fewer than two values to choose from is left out, since it could filter nothing.
 */
import { useSearchParams } from "react-router-dom";

/** One row of chips: its name, the address key, and the values to choose from. */
export interface FilterGroup {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/** The chosen value of each group, read from the address. */
export function useFilters(keys: string[]): Record<string, string | null> {
  const [params] = useSearchParams();
  return Object.fromEntries(keys.map((key) => [key, params.get(key)]));
}

/** Chips for each group; choosing one updates the address in place. */
export function FilterChips({ groups }: { groups: FilterGroup[] }) {
  const [params, setParams] = useSearchParams();
  const choose = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const shown = groups.filter((group) => group.options.length > 1);
  if (shown.length === 0) return null;
  return (
    <div className="filter-groups stack" style={{ ["--gap" as string]: "var(--space-2)" }}>
      {shown.map((group) => {
        const chosen = params.get(group.key);
        return (
          <div
            key={group.key}
            className="row wrap filter-row"
            role="group"
            aria-label={group.label}
          >
            <span className="muted small filter-label">{group.label}</span>
            <button
              type="button"
              className="chip"
              aria-pressed={chosen === null}
              onClick={() => choose(group.key, null)}
            >
              All
            </button>
            {group.options.map((option) => (
              <button
                key={option.value}
                type="button"
                className="chip"
                aria-pressed={chosen === option.value}
                onClick={() => choose(group.key, option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** The distinct values of `pick` across `items`, in first-seen order, as chip options. */
export function optionsOf<Item>(
  items: Item[],
  pick: (item: Item) => string | null | undefined,
  label: (value: string) => string = (value) => value,
) {
  const values = [...new Set(items.map(pick).filter((v): v is string => Boolean(v)))];
  return values.map((value) => ({ value, label: label(value) }));
}
