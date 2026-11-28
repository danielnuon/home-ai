/**
 * @file Finance's sections: the month against budget, net worth and cash flow (each figure opens
 * its rows), upcoming bills, statement imports with Upload, accounts to map, and requests
 * (spec 7.2, Finance; 20.4; 20.9). Read-only: Brain never moves money (22.2).
 */
import { ClipboardCheck, FileCheck2, Upload, UserRound } from "lucide-react";
import type { ChangeEvent } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type {
  FinanceOverview,
  Principal,
  StatementImport,
  UnmappedAccount,
  WorkRequested,
} from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { Section } from "../../components/Page";
import { Sparkline } from "../../components/Sparkline";
import { StatusText } from "../../design/status";
import { GlidingList, PRINCIPAL_NAMES, PRINCIPALS } from "../personal/shared";
import { dollars } from "./Sources";

/** Opens a figure's source rows. */
type OpenFigure = (figure: { id: string; name: string }) => void;

type Props = { finance: FinanceOverview; onOpen: OpenFigure };

/**
 * Spending against budget for each category this month; each line opens its transactions.
 *
 * @param props - The page's data and how to open a figure.
 * @returns The section.
 */
export function Budget({ finance, onOpen }: Props) {
  return (
    <Section title={finance.month} aside={finance.days_elapsed}>
      <div className="list">
        {finance.budget.map((line) => {
          const share = line.budget > 0 ? Math.min(line.spent / line.budget, 1) : 0;
          return (
            <button
              key={line.id}
              type="button"
              className="list-row figure-button budget-line"
              onClick={() => onOpen({ id: line.id, name: line.name })}
            >
              <span className="grow stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
                <span className="row">
                  <span className="grow row-title">{line.name}</span>
                  <span className="mono small">
                    ${line.spent} of ${line.budget}
                  </span>
                </span>
                <span
                  className={`progress ${line.spent > line.budget ? "over" : ""}`}
                  aria-hidden="true"
                >
                  <span style={{ transform: `scaleX(${share})` }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * Net worth and three months of money in and out, each opening its rows.
 *
 * @param props - The page's data and how to open a figure.
 * @returns The section.
 */
export function CashFlow({ finance, onOpen }: Props) {
  const top = Math.max(1, ...finance.cash_flow.flatMap((m) => [m.money_in, m.money_out]));
  const worth = finance.net_worth;
  return (
    <Section title="Cash flow">
      <button
        type="button"
        className="card tile figure-button"
        onClick={() => onOpen({ id: "net-worth", name: worth.name })}
      >
        <span className="muted small">{worth.name}</span>
        <span className="row">
          <span className="tile-value grow">{worth.value}</span>
          <Sparkline values={worth.spark} />
        </span>
      </button>
      <div className="cash-flow">
        {finance.cash_flow.map((month) => (
          <button
            key={month.id}
            type="button"
            className="card cash-month figure-button"
            onClick={() => onOpen({ id: month.id, name: `${month.month} cash flow` })}
          >
            <span className="row-title">{month.month}</span>
            <span className="muted small">In {dollars(month.money_in)}</span>
            <span className="cash-bar in" aria-hidden="true">
              <span style={{ transform: `scaleX(${month.money_in / top})` }} />
            </span>
            <span className="muted small">Out {dollars(month.money_out)}</span>
            <span className="cash-bar out" aria-hidden="true">
              <span style={{ transform: `scaleX(${month.money_out / top})` }} />
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

/**
 * Bills coming due. Brain reminds; it never pays.
 *
 * @param props - The page's data.
 * @returns The section.
 */
export function Bills({ finance }: { finance: FinanceOverview }) {
  return (
    <Section title="Upcoming bills">
      <GlidingList
        empty="No bills due in the next 30 days."
        items={finance.bills.map((bill) => ({
          key: bill.id,
          node: (
            <ActionRow
              title={`${bill.name} · ${dollars(bill.amount)}`}
              meta={`${bill.due} · ${bill.account}`}
              status={bill.status}
            />
          ),
        }))}
      />
    </Section>
  );
}

/** One import, with a file chooser that uploads a statement for that account. */
function ImportRow({ item, principal }: { item: StatementImport; principal: Principal }) {
  const { run, busy } = useAction<StatementImport>({
    refresh: ["finance"],
    done: () => `Imported a statement for ${item.account}`,
  });
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void run(() =>
      send<StatementImport>("POST", `/finance/${principal}/imports/${item.id}/upload`, {
        filename: file.name,
        size_bytes: file.size,
      }),
    );
  };
  const overdue = item.status.status === "attention";
  return (
    <li className="list-row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{item.account}</span>
        <span className="muted small">{item.meta}</span>
      </span>
      <StatusText value={item.status} className="small" />
      <label className={`btn compact file-button ${overdue ? "primary" : ""}`}>
        <Upload size={16} aria-hidden="true" />
        Upload
        <input
          type="file"
          accept=".csv,.ofx,.qfx"
          aria-label={`Upload a statement for ${item.account}`}
          disabled={busy}
          onChange={choose}
        />
      </label>
    </li>
  );
}

/**
 * Statement imports, each with Upload, and the inbox folder that takes the same files.
 *
 * @param props - The page's data and its principal.
 * @returns The section.
 */
export function Imports({ finance }: { finance: FinanceOverview }) {
  return (
    <Section title="Statement imports">
      <ul className="list">
        {finance.imports.map((item) => (
          <ImportRow key={item.id} item={item} principal={finance.principal} />
        ))}
      </ul>
      <p className="muted small">
        CSV, OFX or QFX. Or drop the export in <span className="mono">{finance.inbox}</span>.
      </p>
    </Section>
  );
}

/** One account to map: its "…" menu and swipe offer each principal. */
function UnmappedRow({ account }: { account: UnmappedAccount }) {
  const { run } = useAction<StatementImport>({
    refresh: ["finance", "personal"],
    done: () => `${account.name} mapped`,
  });
  const mapTo = (principal: Principal) => ({
    label: `Map to ${PRINCIPAL_NAMES[principal]}`,
    icon: UserRound,
    onSelect: () =>
      void run(() =>
        send<StatementImport>("POST", `/finance/accounts/${account.id}/map`, { principal }),
      ),
  });
  return (
    <ActionRow
      title={account.name}
      meta={account.meta}
      status={{ status: "attention", label: "Not mapped" }}
      start={mapTo("owner")}
      more={PRINCIPALS.map((p) => mapTo(p.value))}
    />
  );
}

/**
 * Accounts that belong to no one yet, shown until each is mapped.
 *
 * @param props - The page's data.
 * @returns The section, or nothing when every account is mapped.
 */
export function Unmapped({ finance }: { finance: FinanceOverview }) {
  if (finance.unmapped.length === 0) return null;
  return (
    <Section title="Accounts to map" aside={`${finance.unmapped.length} found`}>
      <GlidingList
        empty="Every account belongs to someone."
        items={finance.unmapped.map((account) => ({
          key: account.id,
          node: <UnmappedRow account={account} />,
        }))}
      />
    </Section>
  );
}

/**
 * Ask Ledger for an import check or the monthly close.
 *
 * @param props - The page's data.
 * @returns The two buttons.
 */
export function Requests({ finance }: { finance: FinanceOverview }) {
  const { run, busy } = useAction<WorkRequested>({
    refresh: ["work", "today"],
    done: (work) => work.message,
  });
  const ask = (kind: "import_check" | "monthly_close") =>
    void run(() => send<WorkRequested>("POST", `/finance/${finance.principal}/requests`, { kind }));
  return (
    <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
      <button type="button" className="btn" disabled={busy} onClick={() => ask("import_check")}>
        <FileCheck2 size={18} aria-hidden="true" />
        Request an import check
      </button>
      <button type="button" className="btn" disabled={busy} onClick={() => ask("monthly_close")}>
        <ClipboardCheck size={18} aria-hidden="true" />
        Request the monthly close
      </button>
    </div>
  );
}
