/**
 * @file The household on Contacts: its principals, the accounts and calendars mapped to each, and
 * adding or removing a principal (spec 7.2, Contacts; 7.16, Principal and account mapping).
 *
 * Adding a principal and mapping a new account to one loosen what employees may read, so both ask
 * for the passkey; unmapping takes one tap. Removing a principal asks for the passkey too, then
 * leaves seven days to keep them before their data is archived or deleted for good.
 */
import { Link2, Plus, RotateCcw, UserMinus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { ContactsOverview, HouseholdMember, LinkableAccount } from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { Section } from "../../components/Page";
import { Sheet } from "../../components/Sheet";
import { AnimatePresence, LEAVE, m } from "../../design/motion";
import { dayLabel } from "./words";

type Panel =
  | { kind: "add" }
  | { kind: "map"; member: HouseholdMember }
  | { kind: "remove"; member: HouseholdMember }
  | null;

/** Ticks for each account or calendar of one kind. */
function AccountTicks({
  legend,
  accounts,
  chosen,
  onChange,
}: {
  legend: string;
  accounts: LinkableAccount[];
  chosen: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="stack form-group" style={{ ["--gap" as string]: "var(--space-1)" }}>
      <legend className="small muted">{legend}</legend>
      {accounts.map((account) => (
        <label key={account.id} className="row check-row">
          <input
            type="checkbox"
            checked={chosen.includes(account.id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...chosen, account.id]
                  : chosen.filter((id) => id !== account.id),
              )
            }
          />
          <span className="grow">{account.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Map accounts and calendars to one principal. */
function MapSheet({
  member,
  accounts,
  onClose,
}: {
  member: HouseholdMember | null;
  accounts: LinkableAccount[];
  onClose: () => void;
}) {
  return (
    <Sheet
      open={member !== null}
      title={`${member?.name ?? ""}'s accounts and calendars`}
      onClose={onClose}
    >
      {member && <MapForm key={member.id} member={member} accounts={accounts} onClose={onClose} />}
    </Sheet>
  );
}

/** The ticks, holding what is chosen from the moment the sheet opens. */
function MapForm({
  member,
  accounts,
  onClose,
}: {
  member: HouseholdMember;
  accounts: LinkableAccount[];
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState({ accounts: member.accounts, calendars: member.calendars });
  const { run, busy } = useAction<HouseholdMember>({
    refresh: ["contacts"],
    done: (saved) => `Saved ${saved.name}'s accounts`,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run((proof) =>
      send<HouseholdMember>("PUT", `/principals/${member.id}/accounts`, chosen, proof),
    );
    if (saved) onClose();
  };
  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <p className="muted small">
        An account belongs to one person, so mapping it here moves it from anyone else. Adding one
        asks for your passkey; taking one away doesn't.
      </p>
      <AccountTicks
        legend="Accounts"
        accounts={accounts.filter((a) => a.kind === "account")}
        chosen={chosen.accounts}
        onChange={(next) => setChosen((c) => ({ ...c, accounts: next }))}
      />
      <AccountTicks
        legend="Calendars"
        accounts={accounts.filter((a) => a.kind === "calendar")}
        chosen={chosen.calendars}
        onChange={(next) => setChosen((c) => ({ ...c, calendars: next }))}
      />
      <button type="submit" className="btn primary block" disabled={busy}>
        Save
      </button>
    </form>
  );
}

/** Remove a principal, choosing what happens to their data after seven days. */
function RemoveSheet({ member, onClose }: { member: HouseholdMember | null; onClose: () => void }) {
  const [keep, setKeep] = useState<"archive" | "delete">("archive");
  const { run, busy } = useAction<HouseholdMember>({
    refresh: ["contacts"],
    done: (gone) => `Removing ${gone.name}. You have 7 days to keep them.`,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!member) return;
    const gone = await run((proof) =>
      send<HouseholdMember>("POST", `/principals/${member.id}/remove`, { keep }, proof),
    );
    if (gone) onClose();
  };
  const name = member?.name ?? "";
  return (
    <Sheet open={member !== null} title={`Remove ${name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <p>
          {name}'s employees stop at once. For 7 days you can keep {name} and nothing is lost; after
          that it is permanent and can't be undone.
        </p>
        <fieldset className="stack form-group" style={{ ["--gap" as string]: "var(--space-1)" }}>
          <legend className="small muted">After 7 days, their data is</legend>
          <label className="row check-row">
            <input
              type="radio"
              name="keep"
              checked={keep === "archive"}
              onChange={() => setKeep("archive")}
            />
            <span className="grow">Archived, kept offline for the records</span>
          </label>
          <label className="row check-row">
            <input
              type="radio"
              name="keep"
              checked={keep === "delete"}
              onChange={() => setKeep("delete")}
            />
            <span className="grow">Deleted for good</span>
          </label>
        </fieldset>
        <button type="submit" className="btn destructive block" disabled={busy}>
          Remove {name}
        </button>
      </form>
    </Sheet>
  );
}

/** Add a principal by name. */
function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const { run, busy } = useAction<HouseholdMember>({
    refresh: ["contacts"],
    done: (added) => `Added ${added.name}. Map their accounts next.`,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const added = await run((proof) =>
      send<HouseholdMember>("POST", "/principals", { name }, proof),
    );
    if (added) {
      setName("");
      onClose();
    }
  };
  return (
    <Sheet open={open} title="Add a person" onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <p className="muted small">
          A principal has their own accounts, calendars and employees. Adding one asks for your
          passkey.
        </p>
        <label className="stack form-group">
          <span className="small muted">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn primary block" disabled={busy}>
          Add to the household
        </button>
      </form>
    </Sheet>
  );
}

/** One principal: map accounts, remove, or keep one being removed. */
function MemberRow({
  member,
  onPanel,
}: {
  member: HouseholdMember;
  onPanel: (panel: Panel) => void;
}) {
  const keep = useAction<HouseholdMember>({
    refresh: ["contacts"],
    done: (kept) => `Kept ${kept.name}`,
  });
  const keepAction = {
    label: `Keep ${member.name}`,
    icon: RotateCcw,
    onSelect: () =>
      void keep.run(() => send<HouseholdMember>("POST", `/principals/${member.id}/undo-remove`)),
  };
  const mapAction = {
    label: "Map accounts and calendars",
    icon: Link2,
    onSelect: () => onPanel({ kind: "map", member }),
  };
  const removeAction = {
    label: "Remove from the household",
    icon: UserMinus,
    destructive: true,
    onSelect: () => onPanel({ kind: "remove", member }),
  };
  const removal = member.removal;
  const meta = removal
    ? `Removing · data ${removal.keep === "archive" ? "archived" : "deleted"} ${dayLabel(
        removal.undo_until,
      )}`
    : member.meta;
  const more = removal
    ? [keepAction]
    : member.role === "owner"
      ? [mapAction]
      : [mapAction, removeAction];
  return (
    <ActionRow
      title={member.name}
      meta={meta}
      status={removal ? { status: "attention", label: "Removing" } : null}
      start={removal ? keepAction : mapAction}
      more={more}
    />
  );
}

/** The Household section and its sheets. */
export function Household({ overview }: { overview: ContactsOverview }) {
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);
  return (
    <Section
      title="Household"
      aside={
        <button type="button" className="btn compact" onClick={() => setPanel({ kind: "add" })}>
          <Plus size={16} aria-hidden="true" /> Add a person
        </button>
      }
    >
      <div className="list">
        <AnimatePresence initial={false} mode="popLayout">
          {overview.household.map((member) => (
            <m.div key={member.id} layout="position" exit={LEAVE}>
              <MemberRow member={member} onPanel={setPanel} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
      <AddSheet open={panel?.kind === "add"} onClose={close} />
      <MapSheet
        member={panel?.kind === "map" ? panel.member : null}
        accounts={overview.accounts}
        onClose={close}
      />
      <RemoveSheet member={panel?.kind === "remove" ? panel.member : null} onClose={close} />
    </Section>
  );
}
