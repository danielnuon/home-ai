/**
 * @file The one sheet that adds a contact or edits one (spec 7.16, rule 1: the same sheet wherever
 * the list appears). Adding one as Allowlisted asks for the passkey; Known needs nothing more.
 */
import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type {
  Contact,
  ContactChannel,
  ContactDraft,
  HouseholdMember,
  Trust,
} from "../../api/types";
import { Sheet } from "../../components/Sheet";
import { CHANNEL_KINDS, TRUST_LEVELS } from "./words";

interface FormProps {
  /** The contact to edit, "new" to add one, or null when closed. */
  editing: Contact | "new" | null;
  household: HouseholdMember[];
  onClose: () => void;
}

const blank = (): ContactDraft => ({
  name: "",
  area: "",
  principal: "owner",
  channels: [{ kind: "email", value: "" }],
  trust: "known",
});

const draftFrom = (contact: Contact): ContactDraft => ({
  name: contact.name,
  area: contact.area,
  principal: contact.principal,
  channels: contact.channels.map((c) => ({ ...c })),
  trust: contact.trust,
});

/** The channel rows: a kind, its value, and a button to take the row away. */
function ChannelRows({
  channels,
  onChange,
}: {
  channels: ContactChannel[];
  onChange: (next: ContactChannel[]) => void;
}) {
  const put = (index: number, change: Partial<ContactChannel>) =>
    onChange(channels.map((c, i) => (i === index ? { ...c, ...change } : c)));
  return (
    <fieldset className="stack form-group" style={{ ["--gap" as string]: "var(--space-2)" }}>
      <legend className="small muted">How to reach them</legend>
      {channels.map((channel, index) => (
        <div key={index} className="row">
          <select
            className="field select"
            aria-label={`Channel ${index + 1} kind`}
            value={channel.kind}
            onChange={(e) => put(index, { kind: e.target.value as ContactChannel["kind"] })}
          >
            {CHANNEL_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
          <input
            className="field grow"
            aria-label={`Channel ${index + 1}`}
            value={channel.value}
            onChange={(e) => put(index, { value: e.target.value })}
          />
          <button
            type="button"
            className="btn icon"
            aria-label={`Remove channel ${index + 1}`}
            onClick={() => onChange(channels.filter((_, i) => i !== index))}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn compact"
        onClick={() => onChange([...channels, { kind: "email", value: "" }])}
      >
        <Plus size={16} aria-hidden="true" /> Add a channel
      </button>
    </fieldset>
  );
}

/** A labelled single-line field. */
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="stack form-group">
      <span className="small muted">{label}</span>
      <input className="field" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** A labelled choice. */
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="stack form-group">
      <span className="small muted">{label}</span>
      <select className="field select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The fields, holding the draft from the moment the sheet opens. */
function ContactFields({
  editing,
  household,
  onClose,
}: {
  editing: Contact | "new";
  household: HouseholdMember[];
  onClose: () => void;
}) {
  const adding = editing === "new";
  const [draft, setDraft] = useState<ContactDraft>(() => (adding ? blank() : draftFrom(editing)));
  const { run, busy } = useAction<Contact>({
    refresh: ["contacts"],
    done: (saved) => (adding ? `Added ${saved.name}` : `Saved ${saved.name}`),
  });
  const set = (change: Partial<ContactDraft>) => setDraft((before) => ({ ...before, ...change }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run((proof) =>
      adding
        ? send<Contact>("POST", "/contacts", draft, proof)
        : send<Contact>("PUT", `/contacts/${editing.id}`, draft, proof),
    );
    if (saved) onClose();
  };
  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <TextField label="Name" value={draft.name} onChange={(name) => set({ name })} />
      <TextField
        label="Area, such as Health or Rental"
        value={draft.area ?? ""}
        onChange={(area) => set({ area })}
      />
      <SelectField
        label="Deals with"
        value={draft.principal ?? ""}
        options={[
          { value: "", label: "The whole household" },
          ...household.map((member) => ({ value: member.id, label: member.name })),
        ]}
        onChange={(principal) => set({ principal: principal || null })}
      />
      <ChannelRows channels={draft.channels ?? []} onChange={(channels) => set({ channels })} />
      {adding && (
        <SelectField
          label="Trust"
          value={draft.trust ?? "known"}
          options={TRUST_LEVELS.map((l) => ({ value: l.value, label: `${l.label}: ${l.meaning}` }))}
          onChange={(trust) => set({ trust: trust as Trust })}
        />
      )}
      <button type="submit" className="btn primary block" disabled={busy}>
        {adding ? "Add contact" : "Save"}
      </button>
    </form>
  );
}

/** Add or edit a contact. */
export function ContactForm({ editing, household, onClose }: FormProps) {
  const title = editing === "new" ? "Add a contact" : `Edit ${editing?.name ?? ""}`;
  return (
    <Sheet open={editing !== null} title={title} onClose={onClose}>
      {editing !== null && (
        <ContactFields
          key={editing === "new" ? "new" : editing.id}
          editing={editing}
          household={household}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}
