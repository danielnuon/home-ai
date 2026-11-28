/**
 * @file The sheet behind every Finance figure: the rows it is computed from, how, and a category
 * select on each transaction that fixes it and adds a rule (spec 7.2, Finance; 20.12).
 */
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import { useFigureSources } from "../../api/queries";
import type { CategoryFixed, FigureSources, Principal, SourceRow } from "../../api/types";
import { QueryState } from "../../components/QueryState";
import { Sheet } from "../../components/Sheet";
import { useLast } from "../personal/shared";

/** Whole dollars as "$1,240", with a minus sign for money out. */
export const dollars = (amount: number) =>
  `${amount < 0 ? "−" : ""}$${Math.abs(amount).toLocaleString("en-US")}`;

/** One source row; a transaction's category is a select that fixes it. */
function Row({
  row,
  principal,
  categories,
}: {
  row: SourceRow;
  principal: Principal;
  categories: string[];
}) {
  const { run, busy } = useAction<CategoryFixed>({
    refresh: ["finance", "personal"],
    done: (fixed) => fixed.message,
  });
  const fix = (category: string) =>
    void run(() =>
      send<CategoryFixed>("POST", `/finance/${principal}/transactions/${row.id}/category`, {
        category,
      }),
    );
  return (
    <li className="list-row source-row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{row.text}</span>
        <span className="muted small">
          {row.day} · {row.account}
        </span>
      </span>
      {row.category !== null && (
        <select
          className="field"
          aria-label={`Category of ${row.text}`}
          value={row.category}
          disabled={busy}
          onChange={(event) => fix(event.target.value)}
        >
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
      <span className="mono small">{dollars(row.amount)}</span>
    </li>
  );
}

/** The formula, the total and the rows. */
function Body({ sources, principal }: { sources: FigureSources; principal: Principal }) {
  return (
    <div className="stack">
      <p className="muted small">{sources.formula}</p>
      <p className="row">
        <span className="grow">Total</span>
        <span className="mono">{dollars(sources.total)}</span>
      </p>
      <ul className="list">
        {sources.rows.map((row) => (
          <Row key={row.id} row={row} principal={principal} categories={sources.categories} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The sources sheet for the figure that is open, if any.
 *
 * @param props - The principal, the open figure's id and its name, and how to close.
 * @returns The sheet.
 */
export function SourcesSheet({
  principal,
  figure,
  onClose,
}: {
  principal: Principal;
  figure: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const shown = useLast(figure);
  const query = useFigureSources(principal, shown?.id ?? null);
  return (
    <Sheet open={figure !== null} title={shown?.name ?? "Sources"} onClose={onClose}>
      {shown && (
        <QueryState query={query}>
          {(sources) => <Body sources={sources} principal={principal} />}
        </QueryState>
      )}
    </Sheet>
  );
}
