/**
 * @file Docs: the guides and references that ship with Brain (design: Docs; spec 7.2).
 *
 * Each document opens in the reader. Its "…" menu also asks Wayfinder about it or requests a
 * change, which becomes a work item.
 */
import { Compass, FileText, PencilLine } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDocs } from "../api/queries";
import type { Row } from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { useGuide } from "../shell/Guide";

/** One document row, with its "…" menu. */
function DocRow({ row }: { row: Row }) {
  const navigate = useNavigate();
  const { open } = useGuide();
  const readable = row.href?.startsWith("/docs/") ?? false;
  const more = readable
    ? [
        { label: "Open", icon: FileText, onSelect: () => navigate(row.href ?? "/docs") },
        { label: "Ask Wayfinder about this", icon: Compass, onSelect: () => open(row.title) },
        {
          label: "Request a change",
          icon: PencilLine,
          onSelect: () => navigate(`${row.href ?? "/docs"}?request=1`),
        },
      ]
    : undefined;
  return (
    <ActionRow title={row.title} meta={row.meta} status={row.status} href={row.href} more={more} />
  );
}

/** The Docs page. */
export default function Docs() {
  const query = useDocs();
  return (
    <Page title="Docs" subtitle="How Brain works, in plain words.">
      <QueryState query={query}>
        {(overview) =>
          overview.groups.map((group) => (
            <Section key={group.name} title={group.name} aside={group.note}>
              <div className="list">
                {group.rows.map((row) => (
                  <DocRow key={row.id} row={row} />
                ))}
              </div>
            </Section>
          ))
        }
      </QueryState>
    </Page>
  );
}
