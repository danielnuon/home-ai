/**
 * @file Spend: this month's money, and the home of every optional paid feature and its cap
 * (design: Spend; spec 3.6). Everything is off with a $0 cap until the Owner turns it on.
 */
import { useSpend } from "../api/queries";
import { Page, Section } from "../components/Page";
import { PaidFeatureCard } from "../components/PaidFeatureCard";
import { QueryState } from "../components/QueryState";
import { RowList } from "../components/Rows";
import { StatusText } from "../design/status";

/** The Spend page. */
export default function Spend() {
  const query = useSpend();
  return (
    <QueryState query={query}>
      {(spend) => (
        <Page title="Spend" subtitle={<StatusText value={spend.summary} />}>
          <div className="card row">
            <span className="grow muted">{spend.month} so far</span>
            <span className="tile-value mono">${spend.total_usd.toFixed(2)}</span>
          </div>
          <Section title="Optional paid features" aside="Turning one on needs your passkey">
            <div className="card-grid">
              {spend.features.map((feature) => (
                <PaidFeatureCard key={feature.id} feature={feature} />
              ))}
            </div>
          </Section>
          <Section title="Ledger">
            <RowList
              rows={spend.ledger}
              empty="No charges this month. Every paid call would be listed here."
            />
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
