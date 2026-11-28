/**
 * @file Contacts: the household's principals and every outside contact with its trust level, the
 * home page of both (design: Contacts; spec 7.2, 7.16 rules 1, 3, 5, 10 and 11).
 *
 * Pressing a contact opens its sheet in place; the address names it (`?contact=C-02`), so Back
 * closes it. Swipe a contact right to allowlist it and left to block it; its "…" menu has every
 * action. Lowering trust takes one tap; raising it asks for the passkey.
 */
import { Ban, Check, GitMerge, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useContacts } from "../api/queries";
import type { Contact, ContactsOverview, Trust } from "../api/types";
import { ActionRow } from "../components/ActionRow";
import { FilterChips, useFilters } from "../components/FilterChips";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { AnimatePresence, LEAVE, m } from "../design/motion";
import { ContactForm } from "./contacts/ContactForm";
import { ContactSheet, type SheetView } from "./contacts/ContactSheet";
import { Household } from "./contacts/Household";
import { TRUST_LEVELS, trustLabel } from "./contacts/words";

const VIEWS: SheetView[] = ["detail", "merge", "remove"];

/** Opens and closes the contact sheet through the address, so Back closes it. */
function useContactSheet() {
  const [params, setParams] = useSearchParams();
  const contactId = params.get("contact");
  const asked = params.get("view") as SheetView | null;
  const view = asked && VIEWS.includes(asked) ? asked : "detail";
  const open = (id: string, next: SheetView = "detail") => {
    const after = new URLSearchParams(params);
    after.set("contact", id);
    if (next === "detail") after.delete("view");
    else after.set("view", next);
    setParams(after, { replace: contactId !== null });
  };
  const close = () => {
    const after = new URLSearchParams(params);
    after.delete("contact");
    after.delete("view");
    setParams(after, { replace: true });
  };
  return { contactId, view, open, close };
}

/** One contact: its trust and line, the two swipes, and everything else in its menu. */
function ContactRow({
  contact,
  onOpen,
  onEdit,
}: {
  contact: Contact;
  onOpen: (view?: SheetView) => void;
  onEdit: () => void;
}) {
  const change = useAction({ refresh: ["contacts"], done: () => "Trust updated" });
  const setTrust = (trust: Trust) =>
    void change.run((proof) => send("PUT", `/contacts/${contact.id}/trust`, { trust }, proof));
  const allowlist = { label: "Allowlist", icon: Check, onSelect: () => setTrust("allowlisted") };
  const block = {
    label: "Block",
    icon: Ban,
    tone: "clay" as const,
    onSelect: () => setTrust("blocked"),
  };
  const known = { label: "Make known", icon: UserRound, onSelect: () => setTrust("known") };
  const trustActions = [
    contact.trust !== "allowlisted" && allowlist,
    contact.trust !== "known" && known,
    contact.trust !== "blocked" && block,
  ].filter((a) => a !== false);
  return (
    <ActionRow
      title={contact.name}
      meta={[trustLabel(contact.trust), contact.meta].filter(Boolean).join(" · ")}
      href={`?contact=${encodeURIComponent(contact.id)}`}
      start={contact.trust !== "allowlisted" ? allowlist : undefined}
      end={contact.trust !== "blocked" ? block : undefined}
      more={[
        ...trustActions,
        { label: "Edit", icon: Pencil, onSelect: onEdit },
        { label: "Merge into another contact", icon: GitMerge, onSelect: () => onOpen("merge") },
        { label: "Remove", icon: Trash2, destructive: true, onSelect: () => onOpen("remove") },
      ]}
    />
  );
}

/** The outside contacts, filtered by trust. */
function ContactList({
  overview,
  onOpen,
  onEdit,
}: {
  overview: ContactsOverview;
  onOpen: (id: string, view?: SheetView) => void;
  onEdit: (contact: Contact | "new") => void;
}) {
  const { trust } = useFilters(["trust"]);
  const shown = overview.contacts.filter((c) => trust === null || c.trust === trust);
  return (
    <Section
      title="Contacts"
      aside={
        <button type="button" className="btn compact" onClick={() => onEdit("new")}>
          <Plus size={16} aria-hidden="true" /> Add a contact
        </button>
      }
    >
      <FilterChips
        groups={[
          {
            key: "trust",
            label: "Trust",
            options: TRUST_LEVELS.filter((level) =>
              overview.contacts.some((c) => c.trust === level.value),
            ).map((level) => ({ value: level.value, label: level.label })),
          },
        ]}
      />
      <p className="muted small">
        {TRUST_LEVELS.map((level) => `${level.label}: ${level.meaning}`).join(" · ")}
      </p>
      {shown.length === 0 ? (
        <p className="list empty">
          No {trust ? trustLabel(trust as Trust).toLowerCase() : ""} contacts. Choose All to see
          everyone, or add one.
        </p>
      ) : (
        <div className="list">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((contact) => (
              <m.div key={contact.id} layout="position" exit={LEAVE}>
                <ContactRow
                  contact={contact}
                  onOpen={(view) => onOpen(contact.id, view)}
                  onEdit={() => onEdit(contact)}
                />
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Section>
  );
}

/** The Contacts page. */
export default function Contacts() {
  const query = useContacts();
  const sheet = useContactSheet();
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  return (
    <Page
      title="Contacts"
      subtitle="Who Brain may write to, and how much it needs you to check first."
    >
      <QueryState query={query}>
        {(overview) => (
          <>
            <Household overview={overview} />
            <ContactList overview={overview} onOpen={sheet.open} onEdit={setEditing} />
            <ContactSheet
              contactId={sheet.contactId}
              view={sheet.view}
              overview={overview}
              onView={(view) => sheet.contactId && sheet.open(sheet.contactId, view)}
              onEdit={(contact) => {
                sheet.close();
                setEditing(contact);
              }}
              onClose={sheet.close}
            />
            <ContactForm
              editing={editing}
              household={overview.household.filter((member) => !member.removal)}
              onClose={() => setEditing(null)}
            />
          </>
        )}
      </QueryState>
    </Page>
  );
}
