/**
 * @file Docs: the guides and references that ship with Brain (design: Docs).
 */
import { useDocs } from "../api/queries";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { RowGroups } from "../components/Rows";

/** The Docs page. */
export default function Docs() {
  const query = useDocs();
  return (
    <Page title="Docs" subtitle="How Brain works, in plain words.">
      <QueryState query={query}>{(overview) => <RowGroups groups={overview.groups} />}</QueryState>
    </Page>
  );
}
