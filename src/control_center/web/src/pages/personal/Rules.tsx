/**
 * @file Personal's rules: the routing and category rules made from corrections, each editable in
 * the sheet and deletable to the 30-day trash with Undo (spec 7.2, Personal; 20.12).
 */
import { PencilLine } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { Rule } from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { Section } from "../../components/Page";
import { Sheet } from "../../components/Sheet";
import { GlidingList, useDeleteToTrash, useLast } from "./shared";

/** The rule's fields, starting from what it says now. */
function RuleForm({ rule, onDone }: { rule: Rule; onDone: () => void }) {
  const [form, setForm] = useState({ when: rule.when, then: rule.then });
  const { run, busy } = useAction<Rule>({ refresh: ["personal"], done: () => "Rule saved" });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => send<Rule>("PUT", `/rules/${rule.id}`, form))) onDone();
  };
  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <label className="stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
        <span className="small">When</span>
        <input
          className="field"
          value={form.when}
          onChange={(event) => setForm({ ...form, when: event.target.value })}
        />
      </label>
      <label className="stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
        <span className="small">{rule.kind === "category" ? "File under" : "Send to"}</span>
        <input
          className="field"
          value={form.then}
          onChange={(event) => setForm({ ...form, then: event.target.value })}
        />
      </label>
      <button
        type="submit"
        className="btn primary"
        disabled={busy || !form.when.trim() || !form.then.trim()}
      >
        Save the rule
      </button>
    </form>
  );
}

/** The edit-a-rule sheet. */
function RuleSheet({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const shown = useLast(rule);
  return (
    <Sheet open={rule !== null} title="Edit the rule" onClose={onClose}>
      {shown && <RuleForm key={shown.id} rule={shown} onDone={onClose} />}
    </Sheet>
  );
}

/** One rule: swipe right to edit, left to delete. */
function RuleRow({ rule, onEdit }: { rule: Rule; onEdit: () => void }) {
  const edit = { label: "Edit", icon: PencilLine, onSelect: onEdit };
  const del = useDeleteToTrash(`/rules/${rule.id}`);
  return (
    <ActionRow
      title={`${rule.when} → ${rule.then}`}
      meta={`${rule.kind === "category" ? "Category" : "Routing"} rule · ${rule.source}`}
      onOpen={onEdit}
      start={edit}
      end={del}
      more={[edit, { ...del, destructive: true }]}
    />
  );
}

/**
 * The rules section.
 *
 * @param props - The rules.
 * @returns The section.
 */
export function RulesSection({ rules }: { rules: Rule[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Section title="Rules" aside={`${rules.length} rules`}>
      <p className="muted small">
        Made when you correct a category, a principal or a domain, so it's decided the same way next
        time.
      </p>
      <GlidingList
        empty="No rules yet. Fix a category on Finance and one appears here."
        items={rules.map((rule) => ({
          key: rule.id,
          node: <RuleRow rule={rule} onEdit={() => setEditing(rule.id)} />,
        }))}
      />
      <RuleSheet
        rule={rules.find((r) => r.id === editing) ?? null}
        onClose={() => setEditing(null)}
      />
    </Section>
  );
}
