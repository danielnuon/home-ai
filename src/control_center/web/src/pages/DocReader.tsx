/**
 * @file The Docs reader: one document, rendered, with Ask Wayfinder and Request a change (spec 7.2,
 * Docs). A change request becomes a work item that Wayfinder routes.
 */
import { Compass, PencilLine } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useDocPage } from "../api/queries";
import type { DocChangeRequested, DocPage } from "../api/types";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Sheet } from "../components/Sheet";
import { StatusText } from "../design/status";
import { useGuide, useGuideContext } from "../shell/Guide";

/** The document's blocks: headings, paragraphs, list items and code lines. */
function Body({ doc }: { doc: DocPage }) {
  return (
    <article className="card stack doc-body">
      {doc.blocks.map((block, index) => {
        const key = `${index}-${block.kind}`;
        if (block.kind === "heading") return <h2 key={key}>{block.text}</h2>;
        if (block.kind === "item") return <p key={key}>• {block.text}</p>;
        if (block.kind === "code")
          return (
            // A long line scrolls sideways, so the block takes focus for the keyboard.
            <pre key={key} tabIndex={0}>
              {block.text}
            </pre>
          );
        return <p key={key}>{block.text}</p>;
      })}
    </article>
  );
}

/** The change-request sheet: what should change, sent as a work item. */
function RequestChange({
  doc,
  open,
  onClose,
}: {
  doc: DocPage;
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const { run, busy } = useAction<DocChangeRequested>({
    refresh: ["work"],
    done: (made) => made.message,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const made = await run(() =>
      send<DocChangeRequested>("POST", `/docs/${doc.id}/change-requests`, { text }),
    );
    if (made) {
      setText("");
      onClose();
    }
  };
  return (
    <Sheet open={open} title="Request a change" onClose={onClose}>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <p className="muted">
          It becomes a work item on Work. Wayfinder routes it to whoever keeps {doc.title}.
        </p>
        <textarea
          className="field"
          rows={4}
          aria-label="What should change"
          placeholder="What should change"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !text.trim()}>
          Request the change
        </button>
      </form>
    </Sheet>
  );
}

/** What is under the title: Ask Wayfinder, Request a change, and the document. */
function Reader({ doc }: { doc: DocPage }) {
  const { open } = useGuide();
  const [params, setParams] = useSearchParams();
  useGuideContext(doc.title);
  const requesting = params.get("request") === "1";
  const setRequesting = (on: boolean) => setParams(on ? { request: "1" } : {}, { replace: true });
  return (
    <>
      <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
        <button type="button" className="btn" onClick={() => open()}>
          <Compass size={18} aria-hidden="true" />
          Ask Wayfinder about this page
        </button>
        <button type="button" className="btn" onClick={() => setRequesting(true)}>
          <PencilLine size={18} aria-hidden="true" />
          Request a change
        </button>
      </div>
      <Body doc={doc} />
      <RequestChange doc={doc} open={requesting} onClose={() => setRequesting(false)} />
    </>
  );
}

/** The document's review line under its title. */
function Subtitle({ doc }: { doc: DocPage | undefined }) {
  if (!doc) return null;
  return (
    <>
      {doc.meta}
      {doc.status && (
        <>
          {" · "}
          <StatusText value={doc.status} />
        </>
      )}
    </>
  );
}

/** The Docs reader page. */
export default function DocReader() {
  const { id = "" } = useParams();
  const query = useDocPage(id);
  return (
    <Page title={query.data?.title ?? "Document"} subtitle={<Subtitle doc={query.data} />}>
      <QueryState query={query}>{(doc) => <Reader doc={doc} />}</QueryState>
    </Page>
  );
}
