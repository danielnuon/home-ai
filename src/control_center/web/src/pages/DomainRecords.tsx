/**
 * @file One personal domain's records and documents: add a record, upload a document, edit either
 * in the sheet, and delete to the 30-day trash with Undo (spec 7.2, Personal; 7.16, rule 11).
 */
import { ClipboardList, FileText, PencilLine, Plus, Upload } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useDomain } from "../api/queries";
import type { DomainDetail, DomainRecord, Principal } from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { Segmented } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { Sheet } from "../components/Sheet";
import { useGuideContext } from "../shell/Guide";
import {
  GlidingList,
  PRINCIPAL_FILTERS,
  PRINCIPAL_NAMES,
  PRINCIPALS,
  shows,
  useLast,
  useDeleteToTrash,
  type PrincipalFilter,
} from "./personal/shared";

/** A record's name and details, new or changed. */
function RecordForm({
  record,
  domainId,
  onDone,
}: {
  record: DomainRecord | null;
  domainId: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    title: record?.title ?? "",
    meta: record?.meta ?? "",
    principal: record?.principal ?? ("owner" as Principal),
  });
  const { run, busy } = useAction<DomainRecord>({
    refresh: ["personal"],
    done: (saved) => (record ? `Saved ${saved.title}` : `Added ${saved.title}`),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run(() =>
      record
        ? send<DomainRecord>("PUT", `/records/${record.id}`, { title: form.title, meta: form.meta })
        : send<DomainRecord>("POST", `/domains/${domainId}/records`, form),
    );
    if (saved) onDone();
  };
  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      {!record && (
        <Segmented
          label="Whose record"
          value={form.principal}
          options={PRINCIPALS}
          onChange={(principal) => setForm({ ...form, principal })}
        />
      )}
      <input
        className="field"
        aria-label="Name"
        placeholder="Name"
        value={form.title}
        onChange={(event) => setForm({ ...form, title: event.target.value })}
      />
      <input
        className="field"
        aria-label="Details"
        placeholder="Details, such as a number or a date"
        value={form.meta}
        onChange={(event) => setForm({ ...form, meta: event.target.value })}
      />
      <button type="submit" className="btn primary" disabled={busy || !form.title.trim()}>
        {record ? "Save" : "Add the record"}
      </button>
    </form>
  );
}

/** The sheet that adds a record, or edits one. */
function RecordSheet({
  open,
  record,
  domainId,
  onClose,
}: {
  open: boolean;
  record: DomainRecord | null;
  domainId: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title={record ? "Edit" : "Add a record"} onClose={onClose}>
      <RecordForm key={record?.id ?? "new"} record={record} domainId={domainId} onDone={onClose} />
    </Sheet>
  );
}

/** Upload a document: a button over the file chooser, so the whole surface is pressable. */
function UploadButton({ domainId, principal }: { domainId: string; principal: Principal }) {
  const { run, busy } = useAction<DomainRecord>({
    refresh: ["personal"],
    done: (doc) => `Filed ${doc.title}`,
  });
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void run(() =>
      send<DomainRecord>("POST", `/domains/${domainId}/documents`, {
        principal,
        filename: file.name,
        size_bytes: file.size,
      }),
    );
  };
  return (
    <label className={`btn file-button ${busy ? "disabled" : ""}`}>
      <Upload size={18} aria-hidden="true" />
      Upload a document
      <input type="file" aria-label="Upload a document" disabled={busy} onChange={choose} />
    </label>
  );
}

/** One record or document: swipe right to edit, left to delete. */
function RecordRow({ record, onEdit }: { record: DomainRecord; onEdit: () => void }) {
  const edit = { label: "Edit", icon: PencilLine, onSelect: onEdit };
  const del = useDeleteToTrash(`/records/${record.id}`);
  const Icon = record.kind === "document" ? FileText : ClipboardList;
  return (
    <ActionRow
      title={record.title}
      meta={`${PRINCIPAL_NAMES[record.principal]} · ${record.meta}`}
      leading={<Icon size={18} aria-hidden="true" className="muted" />}
      onOpen={onEdit}
      start={edit}
      end={del}
      more={[edit, { ...del, destructive: true }]}
    />
  );
}

/** What is under the title: the filter, Add and Upload, and the two lists. */
function Records({ detail }: { detail: DomainDetail }) {
  useGuideContext(detail.domain.name);
  const [filter, setFilter] = useState<PrincipalFilter>("all");
  const [sheet, setSheet] = useState<{ record: DomainRecord | null } | null>(null);
  // Keep the last sheet's content while it slides away.
  const shown = useLast(sheet);
  const open = (record: DomainRecord | null) => setSheet({ record });
  const rows = detail.records.filter((r) => shows(filter, r.principal));
  const list = (kind: DomainRecord["kind"]) =>
    rows
      .filter((r) => r.kind === kind)
      .map((record) => ({
        key: record.id,
        node: <RecordRow record={record} onEdit={() => open(record)} />,
      }));
  return (
    <>
      <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
        <Segmented
          label="Whose records"
          value={filter}
          options={PRINCIPAL_FILTERS}
          onChange={setFilter}
        />
        <button type="button" className="btn" onClick={() => open(null)}>
          <Plus size={18} aria-hidden="true" />
          Add a record
        </button>
        <UploadButton domainId={detail.domain.id} principal={filter === "all" ? "owner" : filter} />
      </div>
      <Section title="Records">
        <GlidingList
          empty="No records here yet. Add one, or ask Atlas to list them with you."
          items={list("record")}
        />
      </Section>
      <Section title="Documents">
        <GlidingList
          empty="No documents yet. Upload one, or drop it in the inbox folder."
          items={list("document")}
        />
      </Section>
      <RecordSheet
        open={sheet !== null}
        record={shown?.record ?? null}
        domainId={detail.domain.id}
        onClose={() => setSheet(null)}
      />
    </>
  );
}

/** The domain records page. */
export default function DomainRecords() {
  const { domain = "" } = useParams();
  const query = useDomain(domain);
  const detail = query.data;
  return (
    <Page
      title={detail?.domain.name ?? "Domain"}
      subtitle={detail ? `${detail.domain.open_cases} · ${detail.domain.data_class}` : undefined}
    >
      <QueryState query={query}>{(found) => <Records detail={found} />}</QueryState>
    </Page>
  );
}
