/**
 * @file Finance: one principal's month against budget, cash flow, bills, statement imports and
 * the accounts to map, every figure opening the rows it is computed from (spec 7.2, Finance).
 * Read-only: Brain never moves money (spec 22.2, hard limits).
 */
import { useState } from "react";
import { useFinance } from "../api/queries";
import type { Principal } from "../api/types";
import { Segmented } from "../components/Controls";
import { Swap } from "../components/Reflow";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Bills, Budget, CashFlow, Imports, Requests, Unmapped } from "./finance/Sections";
import { SourcesSheet } from "./finance/Sources";
import { PRINCIPALS } from "./personal/shared";

/** The Finance page. */
export default function Finance() {
  const [principal, setPrincipal] = useState<Principal>("owner");
  const [figure, setFigure] = useState<{ id: string; name: string } | null>(null);
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
          onChange={(next) => {
            setFigure(null);
            setPrincipal(next);
          }}
        />
      }
    >
      <QueryState query={query}>
        {(finance) => (
          <Swap id={principal}>
            <Requests finance={finance} />
            <Budget finance={finance} onOpen={setFigure} />
            <CashFlow finance={finance} onOpen={setFigure} />
            <Bills finance={finance} />
            <Unmapped finance={finance} />
            <Imports finance={finance} />
          </Swap>
        )}
      </QueryState>
      <SourcesSheet principal={principal} figure={figure} onClose={() => setFigure(null)} />
    </Page>
  );
}
