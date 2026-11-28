/**
 * @file Spend: this month's money, and the home of every optional paid feature and its cap
 * (design: Spend; spec 3.6). Everything is off with a $0 cap until the Owner turns it on.
 *
 * The forecast says whether it is measured or simulated (7.18). Raising a cap shows its impact
 * before it applies; lowering one takes one tap.
 */
import { useSpend } from "../api/queries";
import { Page, Section } from "../components/Page";
import { PaidFeatureCard } from "../components/PaidFeatureCard";
import { QueryState } from "../components/QueryState";
import { StatusText } from "../design/status";
import { Ledger } from "./spend/Ledger";

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
          <div className="card row">
            <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
              <span className="muted">Forecast for {spend.month}</span>
              <span className="muted tiny">
                {spend.forecast.note} · {spend.forecast.source}
              </span>
            </span>
            <span className="tile-value mono">{spend.forecast.value}</span>
          </div>
          <Section title="Optional paid features" aside="Turning one on needs your passkey">
            <div className="card-grid">
              {spend.features.map((feature) => (
                <PaidFeatureCard key={feature.id} feature={feature} />
              ))}
            </div>
          </Section>
          <Section title="Ledger">
            <Ledger ledger={spend.ledger} />
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
