/**
 * @file Security: the kill switch, workspaces, safety flags, denied tool calls, the allowlist,
 * sign-in and the tamper-evident audit log (spec 7.2; design: Security).
 *
 * The allowlist is only summarised here: each contact opens Contacts, where trust is managed
 * (7.16, rule 1). Removing one lowers it to known in one tap; adding one opens Contacts.
 */
import { useSecurity } from "../api/queries";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { MetricTiles, RowList } from "../components/Rows";
import { StopControl } from "../shell/StopControl";
import { Allowlist, AuditLog, SignIn, Workspaces } from "./security/parts";

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
          <Workspaces workspaces={security.workspaces} />
          <Section title="Safety flags">
            <RowList rows={security.flags} />
          </Section>
          <Section title="Denied tool calls">
            <RowList rows={security.denied} empty="Nothing was denied." />
          </Section>
          <Allowlist rows={security.allowlist} />
          <SignIn security={security} />
          <AuditLog security={security} />
        </Page>
      )}
    </QueryState>
  );
}
