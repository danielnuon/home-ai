/**
 * @file Personal's obligation calendar: what falls due in the next 30 or 90 days, the obligations
 * counted by usage, and Add an obligation (spec 7.2, Personal; 20.3).
 */
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { Obligation, PersonalOverview, Principal } from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { Segmented } from "../../components/Controls";
import { Section } from "../../components/Page";
import { Sheet } from "../../components/Sheet";
import { GlidingList, isoDate, PRINCIPAL_NAMES, PRINCIPALS } from "./shared";

const WINDOWS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

const REPEATS = [
  { value: "once", label: "Once" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

/** "today", "tomorrow" or "in 12 days", with attention once inside the lead time. */
function dueStatus(item: Obligation) {
  const days = item.days ?? 0;
  const label = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return { status: days <= item.lead_days ? ("attention" as const) : ("neutral" as const), label };
}

type ObligationForm = {
  title: string;
  domain: string;
  principal: Principal;
  due: string;
  repeat: (typeof REPEATS)[number]["value"];
  lead_days: number;
};

/** How many days ahead the obligation opens a case. */
function LeadDaysField({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <label className="row" style={{ ["--gap" as string]: "var(--space-2)" }}>
      <span className="grow small">Open a case this many days ahead</span>
      <input
        className="field money-field"
        type="number"
        min={0}
        max={180}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

/** The fields of a new obligation. */
function ObligationFields({
  form,
  overview,
  onChange,
}: {
  form: ObligationForm;
  overview: PersonalOverview;
  onChange: (next: ObligationForm) => void;
}) {
  return (
    <>
      <input
        className="field"
        aria-label="What is due"
        placeholder="What is due"
        value={form.title}
        onChange={(event) => onChange({ ...form, title: event.target.value })}
      />
      <Segmented
        label="Whose obligation"
        value={form.principal}
        options={PRINCIPALS}
        onChange={(principal) => onChange({ ...form, principal })}
      />
      <select
        className="field"
        aria-label="Domain"
        value={form.domain}
        onChange={(event) => onChange({ ...form, domain: event.target.value })}
      >
        {overview.domains.map((d) => (
          <option key={d.id} value={d.name}>
            {d.name}
          </option>
        ))}
      </select>
      <input
        className="field"
        type="date"
        aria-label="First due"
        value={form.due}
        onChange={(event) => onChange({ ...form, due: event.target.value })}
      />
      <Segmented
        label="Repeats"
        value={form.repeat}
        options={REPEATS}
        onChange={(repeat) => onChange({ ...form, repeat })}
      />
      <LeadDaysField
        value={form.lead_days}
        onChange={(lead_days) => onChange({ ...form, lead_days })}
      />
    </>
  );
}

/** The add-an-obligation sheet. */
function AddObligationSheet({
  open,
  overview,
  onClose,
}: {
  open: boolean;
  overview: PersonalOverview;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ObligationForm>({
    title: "",
    domain: overview.domains[0]?.name ?? "",
    principal: "owner",
    due: isoDate(30),
    repeat: "yearly",
    lead_days: 14,
  });
  const { run, busy } = useAction<Obligation>({
    refresh: ["personal"],
    done: (o) => `Added ${o.title}`,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => send<Obligation>("POST", "/obligations", form))) {
      setForm({ ...form, title: "" });
      onClose();
    }
  };
  return (
    <Sheet open={open} title="Add an obligation" onClose={onClose}>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <p className="muted small">
          It opens a case before it is due. For one counted by miles or meter readings, ask Atlas.
        </p>
        <ObligationFields form={form} overview={overview} onChange={setForm} />
        <button type="submit" className="btn primary" disabled={busy || !form.title.trim()}>
          Add the obligation
        </button>
      </form>
    </Sheet>
  );
}

/**
 * The obligation calendar.
 *
 * @param props - The Personal page's data.
 * @returns The section.
 */
export function CalendarSection({ overview }: { overview: PersonalOverview }) {
  const [span, setSpan] = useState<"30" | "90">("30");
  const [adding, setAdding] = useState(false);
  const dated = overview.obligations.filter((o) => o.days !== null && o.days <= Number(span));
  const byUsage = overview.obligations.filter((o) => o.kind === "usage");
  const row = (item: Obligation) => (
    <ActionRow
      title={item.title}
      meta={`${PRINCIPAL_NAMES[item.principal]} · ${item.domain} · ${item.rule}`}
      status={item.kind === "date" ? dueStatus(item) : null}
    />
  );
  return (
    <Section title="Coming up" aside={`${dated.length} in ${span} days`}>
      <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
        <Segmented label="How far ahead" value={span} options={WINDOWS} onChange={setSpan} />
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" />
          Add an obligation
        </button>
      </div>
      <GlidingList
        empty={`Nothing falls due in the next ${span} days.`}
        items={dated.map((item) => ({ key: item.id, node: row(item) }))}
      />
      {byUsage.length > 0 && (
        <GlidingList empty="" items={byUsage.map((item) => ({ key: item.id, node: row(item) }))} />
      )}
      <AddObligationSheet open={adding} overview={overview} onClose={() => setAdding(false)} />
    </Section>
  );
}
