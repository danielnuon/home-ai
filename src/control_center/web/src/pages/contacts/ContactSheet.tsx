/**
 * @file A contact's sheet: its trust, channels, linked accounts and history, and the actions that
 * change it (spec 7.2, Contacts).
 *
 * Removing a contact shows what mentions it first, the drafts waiting to go to it and the rules
 * that name it (7.16, rule 5), then sends it to Recently deleted with Undo on the toast (rule 11).
 * Merging folds it into another contact, which keeps its own trust, so a merge never loosens.
 */
import { ArrowUpRight, GitMerge, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import { useContactDetail } from "../../api/queries";
import type {
  Contact,
  ContactDetail,
  ContactRemoved,
  ContactsOverview,
  Trust,
} from "../../api/types";
import { Sheet } from "../../components/Sheet";
import { Swap } from "../../components/Reflow";
import { channelLabel, dayLabel, TRUST_LEVELS } from "./words";

export type SheetView = "detail" | "merge" | "remove";

interface SheetProps {
  contactId: string | null;
  view: SheetView;
  overview: ContactsOverview;
  onView: (view: SheetView) => void;
  onEdit: (contact: Contact) => void;
  onClose: () => void;
}

/** The trust picker. Raising trust asks for the passkey; lowering it takes this one change. */
function TrustPicker({ contact }: { contact: Contact }) {
  const change = useAction({ refresh: ["contacts"], done: () => "Trust updated" });
  const setTrust = (trust: Trust) =>
    change.run((proof) => send("PUT", `/contacts/${contact.id}/trust`, { trust }, proof));
  return (
    <label className="stack form-group">
      <span className="small muted">Trust</span>
      <select
        className="field select"
        aria-label={`Trust for ${contact.name}`}
        value={contact.trust}
        disabled={change.busy}
        onChange={(event) => void setTrust(event.target.value as Trust)}
      >
        {TRUST_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}: {level.meaning}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Channels, who they deal with, and linked accounts. */
function Facts({ contact, overview }: { contact: Contact; overview: ContactsOverview }) {
  const forName =
    overview.household.find((m) => m.id === contact.principal)?.name ?? "The whole household";
  return (
    <dl className="list facts">
      {contact.channels.map((channel) => (
        <div key={`${channel.kind}-${channel.value}`} className="list-row">
          <dt className="grow muted">{channelLabel(channel.kind)}</dt>
          <dd>{channel.value}</dd>
        </div>
      ))}
      <div className="list-row">
        <dt className="grow muted">Deals with</dt>
        <dd>{forName}</dd>
      </div>
      <div className="list-row">
        <dt className="grow muted">Linked accounts</dt>
        <dd>{contact.linked_accounts.join(", ") || "None yet"}</dd>
      </div>
    </dl>
  );
}

/** Channels, who they deal with, linked accounts, history and the actions. */
function Details({
  detail,
  overview,
  onView,
  onEdit,
}: {
  detail: ContactDetail;
  overview: ContactsOverview;
  onView: (view: SheetView) => void;
  onEdit: () => void;
}) {
  const { contact, history } = detail;
  return (
    <div className="stack">
      <TrustPicker contact={contact} />
      <Facts contact={contact} overview={overview} />
      <h3>History</h3>
      {history.length === 0 ? (
        <p className="muted small">
          No messages or approvals yet. They appear here as they happen.
        </p>
      ) : (
        <ul className="list">
          {history.map((event) => (
            <li key={`${event.at}-${event.title}`} className="list-row">
              <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                <span className="row-title">{event.title}</span>
                <span className="muted small">{event.detail}</span>
              </span>
              <span className="muted small">{dayLabel(event.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="row wrap">
        <button type="button" className="btn" onClick={onEdit}>
          <Pencil size={16} aria-hidden="true" /> Edit
        </button>
        <button type="button" className="btn" onClick={() => onView("merge")}>
          <GitMerge size={16} aria-hidden="true" /> Merge
        </button>
        <button type="button" className="btn" onClick={() => onView("remove")}>
          <Trash2 size={16} aria-hidden="true" /> Remove
        </button>
      </div>
    </div>
  );
}

/** What else changes, listed before the contact is removed. */
function RemoveView({ detail, onDone }: { detail: ContactDetail; onDone: () => void }) {
  const { contact, mentions } = detail;
  const restore = useAction({ refresh: ["contacts", "trash"] });
  const { run, busy } = useAction<ContactRemoved>({
    refresh: ["contacts", "trash"],
    done: (removed) => ({
      message: removed.message,
      undo: () => void restore.run(() => send("POST", `/trash/${removed.trash_id}/restore`)),
    }),
  });
  const remove = async () => {
    const removed = await run(() => send<ContactRemoved>("POST", `/contacts/${contact.id}/remove`));
    if (removed) onDone();
  };
  return (
    <div className="stack">
      {mentions.length === 0 ? (
        <p>Nothing waiting on {contact.name} mentions them, so nothing else changes.</p>
      ) : (
        <>
          <p>These mention {contact.name}. Drafts to them will need a new recipient.</p>
          <ul className="list">
            {mentions.map((mention) => (
              <li key={mention.id}>
                <Link to={mention.href} className="list-row">
                  <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                    <span className="row-title">{mention.title}</span>
                    <span className="muted small">
                      {mention.kind === "draft" ? "Draft waiting for you" : "Rule"} · {mention.id}
                    </span>
                  </span>
                  <ArrowUpRight size={16} className="muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">
        It goes to Recently deleted for 30 days, where you can restore it.
      </p>
      <button
        type="button"
        className="btn destructive block"
        disabled={busy}
        onClick={() => void remove()}
      >
        Remove {contact.name}
      </button>
    </div>
  );
}

/** Choose the contact to fold this one into. */
function MergeView({
  detail,
  overview,
  onDone,
}: {
  detail: ContactDetail;
  overview: ContactsOverview;
  onDone: () => void;
}) {
  const { contact } = detail;
  const others = overview.contacts.filter((c) => c.id !== contact.id);
  const [into, setInto] = useState(others[0]?.id ?? "");
  const target = others.find((c) => c.id === into);
  const { run, busy } = useAction<Contact>({
    refresh: ["contacts", "trash"],
    done: (kept) => `Merged into ${kept.name}`,
  });
  const merge = async () => {
    const kept = await run(() => send<Contact>("POST", `/contacts/${contact.id}/merge`, { into }));
    if (kept) onDone();
  };
  return (
    <div className="stack">
      <label className="stack form-group">
        <span className="small muted">Merge {contact.name} into</span>
        <select className="field select" value={into} onChange={(e) => setInto(e.target.value)}>
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
        </select>
      </label>
      {target && (
        <p className="muted small">
          {contact.name}'s channels, accounts and history move to {target.name}, who stays{" "}
          {target.trust}. {contact.name} goes to Recently deleted, so you can undo this there.
        </p>
      )}
      <button
        type="button"
        className="btn primary block"
        disabled={busy || !target}
        onClick={() => void merge()}
      >
        Merge
      </button>
    </div>
  );
}

const TITLES: Record<SheetView, (name: string) => string> = {
  detail: (name) => name,
  merge: (name) => `Merge ${name}`,
  remove: (name) => `Remove ${name}`,
};

/** The contact's sheet, on whichever view the address names. */
export function ContactSheet({ contactId, view, overview, onView, onEdit, onClose }: SheetProps) {
  const query = useContactDetail(contactId);
  const detail = query.data;
  const name = detail?.contact.name ?? overview.contacts.find((c) => c.id === contactId)?.name;
  return (
    <Sheet open={contactId !== null} title={TITLES[view](name ?? "Contact")} onClose={onClose}>
      {query.isError && <p>That contact no longer exists. It may be in Recently deleted.</p>}
      {detail && (
        <Swap id={view} className="stack">
          {view === "detail" && (
            <Details
              detail={detail}
              overview={overview}
              onView={onView}
              onEdit={() => onEdit(detail.contact)}
            />
          )}
          {view === "merge" && <MergeView detail={detail} overview={overview} onDone={onClose} />}
          {view === "remove" && <RemoveView detail={detail} onDone={onClose} />}
        </Swap>
      )}
    </Sheet>
  );
}
