/**
 * @file Security: the kill switch, safety flags, sign-ins and the tamper-evident audit log
 * (design: Security).
 */
import { useSecurity } from "../api/queries";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles, RowList } from "../components/Rows";
import { StopControl } from "../shell/StopControl";

/** The Security page. */
export default function Security() {
  const query = useSecurity();
  return (
    <QueryState query={query}>
      {(security) => (
        <Page
          title="Security"
          subtitle={security.stopped ? "Everything is stopped." : "Everything is running normally."}
        >
          <div className="card">
            <StopControl />
          </div>
          <MetricTiles metrics={security.tiles} />
          <Section title="Safety flags">
            <RowList rows={security.flags} />
          </Section>
          <Section title="Sign-in">
            <RowList rows={security.sign_in} />
          </Section>
          <Section title="Audit log" aside={security.chain}>
            <pre className="card log mono tiny">{security.audit.join("\n")}</pre>
          </Section>
        </Page>
      )}
    </QueryState>
  );
}
