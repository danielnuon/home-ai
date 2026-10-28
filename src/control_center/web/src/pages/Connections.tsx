/**
 * @file Connections: accounts and providers Brain is connected to (design: Connections).
 */
import { Link } from "react-router-dom";
import { useConnections } from "../api/queries";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { RowGroups } from "../components/Rows";

/** The Connections page. */
export default function Connections() {
  const query = useConnections();
  return (
    <Page
      title="Connections"
      subtitle="Connecting an account needs your passkey; disconnecting never does."
      actions={
        <Link to="/voice" className="btn compact">
          Call voice
        </Link>
      }
    >
      <QueryState query={query}>{(overview) => <RowGroups groups={overview.groups} />}</QueryState>
    </Page>
  );
}
