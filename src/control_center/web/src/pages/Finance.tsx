/**
 * @file Finance: one principal's month against budget, net worth, and statement imports
 * (design: Finance). Read-only: Brain never moves money (spec 22.2, hard limits).
 */
import { useState } from "react";
import { useFinance } from "../api/queries";
import type { FinanceOverview, Principal } from "../api/types";
import { Segmented } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles } from "../components/Rows";
import { StatusText } from "../design/status";

const PRINCIPALS = [
  { value: "owner", label: "You" },
  { value: "mom", label: "Mom" },
  { value: "dad", label: "Dad" },
] as const;

/** Spending against budget for each category this month. */
function Budget({ finance }: { finance: FinanceOverview }) {
  return (
    <Section title={finance.month} aside={finance.days_elapsed}>
      <ul className="list">
        {finance.budget.map((line) => {
          const share = line.budget > 0 ? Math.min(line.spent / line.budget, 1) : 0;
          return (
            <li key={line.name} className="list-row budget-line">
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
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/**
 * Statement imports. An overdue one offers Upload right here (spec 7.16, rule 4); the button is
 * disabled until the connector service exists to receive the file.
 */
function Imports({ finance }: { finance: FinanceOverview }) {
  return (
    <Section title="Statement imports">
      <ul className="list">
        {finance.imports.map((item) => (
          <li key={item.account} className="list-row">
            <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
              <span className="row-title">{item.account}</span>
              <span className="muted small">{item.meta}</span>
            </span>
            <StatusText value={item.status} className="small" />
            {item.status.status === "attention" && (
              <button
                type="button"
                className="btn compact"
                disabled
                title="Uploads arrive with the connector service"
              >
                Upload
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The Finance page. */
export default function Finance() {
  const [principal, setPrincipal] = useState<Principal>("owner");
  const query = useFinance(principal);
  return (
    <Page
      title="Finance"
      subtitle="Read-only. Brain tracks and reminds; it never pays, transfers or trades."
      actions={
        <Segmented
          label="Whose finances"
          value={principal}
          options={PRINCIPALS}
          onChange={setPrincipal}
        />
      }
    >
      <QueryState query={query}>
        {(finance) => (
          <>
            <Budget finance={finance} />
            <MetricTiles metrics={[finance.net_worth]} />
            <Imports finance={finance} />
          </>
        )}
      </QueryState>
    </Page>
  );
}
