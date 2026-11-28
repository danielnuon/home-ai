/**
 * @file Personal's cases: by principal, with Add a case, and each case's sheet for its notes and
 * who it is assigned to (spec 7.2, Personal; 20.3).
 *
 * A row swipes right for Done and left for Snooze; its "…" menu also reassigns and adds a note.
 * Pressing the row opens the case in the sheet, so the list stays where it was.
 */
import { AlarmClock, Check, MessageSquarePlus, Plus, RotateCcw, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { Case, PersonalOverview, Principal } from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { Segmented } from "../../components/Controls";
import { Section } from "../../components/Page";
import { Sheet } from "../../components/Sheet";
import {
  GlidingList,
  isoDate,
  PRINCIPAL_FILTERS,
  PRINCIPAL_NAMES,
  PRINCIPALS,
  shows,
  useLast,
  type PrincipalFilter,
} from "./shared";

const REFRESH = ["personal", "today"];

/** Done, Snooze, Reopen, reassign and note, as one hook so the row and the sheet agree. */
function useCaseActions(item: Case) {
  const act = useAction<Case>({ refresh: REFRESH, done: (c) => `${c.title}: ${c.state}` });
  const quiet = useAction<Case>({ refresh: REFRESH });
  return {
    busy: act.busy || quiet.busy,
    state: (action: "done" | "snooze" | "reopen") =>
      act.run(() => send<Case>("POST", `/cases/${item.id}/action`, { action })),
    reassign: (employee_name: string) =>
      quiet.run(() => send<Case>("POST", `/cases/${item.id}/reassign`, { employee_name })),
    note: (text: string) =>
      quiet.run(() => send<Case>("POST", `/cases/${item.id}/notes`, { text })),
  };
}

/** A select over plain names, such as the assignees or the domains. */
function NameSelect({
  label,
  value,
  names,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  names: string[];
  disabled?: boolean;
  onChange: (name: string) => void;
}) {
  return (
    <select
      className="field"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

/** A case's notes, and the field for a new one. */
function Notes({ item }: { item: Case }) {
  const [text, setText] = useState("");
  const actions = useCaseActions(item);
  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (await actions.note(text)) setText("");
  };
  return (
    <>
      <h3>Notes</h3>
      {item.notes.length === 0 ? (
        <p className="muted small">No notes yet. Add one for whoever picks this up.</p>
      ) : (
        <ul className="list">
          {item.notes.map((note) => (
            <li key={note.id} className="list-row small">
              {note.text}
            </li>
          ))}
        </ul>
      )}
      <form className="stack" onSubmit={(event) => void addNote(event)}>
        <textarea
          className="field"
          rows={3}
          aria-label="New note"
          placeholder="Add a note"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn" disabled={actions.busy || !text.trim()}>
          Add the note
        </button>
      </form>
    </>
  );
}

/** One case: what it is, who has it, and its notes. */
function CaseDetail({ item, assignees }: { item: Case; assignees: string[] }) {
  const actions = useCaseActions(item);
  return (
    <div className="stack">
      <p className="muted">
        {PRINCIPAL_NAMES[item.principal]} · {item.domain} · due {item.due}
      </p>
      <NameSelect
        label="Assigned to"
        value={item.employee_name}
        names={assignees}
        disabled={actions.busy}
        onChange={(name) => void actions.reassign(name)}
      />
      <Notes item={item} />
    </div>
  );
}

/** One case's sheet; it keeps the case while it slides away. */
function CaseSheet({
  item,
  assignees,
  onClose,
}: {
  item: Case | null;
  assignees: string[];
  onClose: () => void;
}) {
  const shown = useLast(item);
  return (
    <Sheet open={item !== null} title={shown?.title ?? "Case"} onClose={onClose}>
      {shown && <CaseDetail item={shown} assignees={assignees} />}
    </Sheet>
  );
}

type CaseForm = {
  title: string;
  domain: string;
  principal: Principal;
  due: string;
  employee_name: string;
};

/** The fields of a new case. */
function CaseFields({
  form,
  overview,
  onChange,
}: {
  form: CaseForm;
  overview: PersonalOverview;
  onChange: (next: CaseForm) => void;
}) {
  return (
    <>
      <input
        className="field"
        aria-label="What needs doing"
        placeholder="What needs doing"
        value={form.title}
        onChange={(event) => onChange({ ...form, title: event.target.value })}
      />
      <Segmented
        label="Whose case"
        value={form.principal}
        options={PRINCIPALS}
        onChange={(principal) => onChange({ ...form, principal })}
      />
      <NameSelect
        label="Domain"
        value={form.domain}
        names={overview.domains.map((d) => d.name)}
        onChange={(domain) => onChange({ ...form, domain })}
      />
      <input
        className="field"
        type="date"
        aria-label="Due"
        value={form.due}
        onChange={(event) => onChange({ ...form, due: event.target.value })}
      />
      <NameSelect
        label="Assigned to"
        value={form.employee_name}
        names={overview.assignees}
        onChange={(employee_name) => onChange({ ...form, employee_name })}
      />
    </>
  );
}

/** The add-a-case sheet. */
function AddCaseSheet({
  open,
  overview,
  onClose,
}: {
  open: boolean;
  overview: PersonalOverview;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CaseForm>({
    title: "",
    domain: overview.domains[0]?.name ?? "",
    principal: "owner",
    due: isoDate(7),
    employee_name: "Atlas",
  });
  const { run, busy } = useAction<Case>({ refresh: REFRESH, done: (c) => `Added ${c.title}` });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => send<Case>("POST", "/cases", form))) {
      setForm({ ...form, title: "" });
      onClose();
    }
  };
  return (
    <Sheet open={open} title="Add a case" onClose={onClose}>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <CaseFields form={form} overview={overview} onChange={setForm} />
        <button type="submit" className="btn primary" disabled={busy || !form.title.trim()}>
          Add the case
        </button>
      </form>
    </Sheet>
  );
}

/** One case row. */
function CaseRow({ item, onOpen }: { item: Case; onOpen: () => void }) {
  const actions = useCaseActions(item);
  const done = { label: "Done", icon: Check, onSelect: () => void actions.state("done") };
  const snooze = {
    label: "Snooze",
    icon: AlarmClock,
    tone: "sand" as const,
    onSelect: () => void actions.state("snooze"),
  };
  const reopen = { label: "Reopen", icon: RotateCcw, onSelect: () => void actions.state("reopen") };
  const open = item.state === "open";
  const notes = item.notes.length
    ? ` · ${item.notes.length} note${item.notes.length > 1 ? "s" : ""}`
    : "";
  return (
    <ActionRow
      title={item.title}
      meta={`${PRINCIPAL_NAMES[item.principal]} · ${item.domain} · ${item.employee_name} · ${item.due}${notes}`}
      status={open ? item.status : { status: "neutral", label: "Snoozed" }}
      onOpen={onOpen}
      start={open ? done : reopen}
      end={open ? snooze : undefined}
      more={[
        ...(open ? [done, snooze] : [reopen]),
        { label: "Reassign…", icon: UserRound, onSelect: onOpen },
        { label: "Add a note…", icon: MessageSquarePlus, onSelect: onOpen },
      ]}
    />
  );
}

/**
 * The cases section, filtered by principal.
 *
 * @param props - The Personal page's data.
 * @returns The section.
 */
export function CasesSection({ overview }: { overview: PersonalOverview }) {
  const [filter, setFilter] = useState<PrincipalFilter>("all");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const cases = overview.cases.filter((c) => shows(filter, c.principal));
  const opened = overview.cases.find((c) => c.id === openId) ?? null;
  return (
    <Section title="Cases" aside={`${cases.filter((c) => c.state === "open").length} open`}>
      <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
        <Segmented
          label="Whose cases"
          value={filter}
          options={PRINCIPAL_FILTERS}
          onChange={setFilter}
        />
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" />
          Add a case
        </button>
      </div>
      <GlidingList
        empty="Nothing open here. Add a case, or ask Atlas in Chat."
        items={cases.map((item) => ({
          key: item.id,
          node: <CaseRow item={item} onOpen={() => setOpenId(item.id)} />,
        }))}
      />
      <AddCaseSheet open={adding} overview={overview} onClose={() => setAdding(false)} />
      <CaseSheet item={opened} assignees={overview.assignees} onClose={() => setOpenId(null)} />
    </Section>
  );
}
