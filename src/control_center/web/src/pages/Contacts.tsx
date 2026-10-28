/**
 * @file Contacts: the household's principals and every outside contact with its trust level
 * (design: Contacts; spec 7.16, rules 3 and 10).
 *
 * Lowering trust takes one tap. Raising it (to Known or Allowlisted) loosens what can be sent
 * without a full approval, so the gate asks for the passkey.
 */
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useContacts } from "../api/queries";
import type { Contact, Trust } from "../api/types";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";

const TRUST_LEVELS: { value: Trust; label: string; meaning: string }[] = [
  { value: "allowlisted", label: "Allowlisted", meaning: "One-tap approvals" },
  { value: "known", label: "Known", meaning: "Full approvals" },
  { value: "unknown", label: "Unknown", meaning: "Triage only" },
  { value: "blocked", label: "Blocked", meaning: "Filed, never drafted" },
];

/** One contact with its trust level. */
function ContactRow({ contact }: { contact: Contact }) {
  const change = useAction({ refresh: ["contacts"], done: () => "Trust updated" });
  const setTrust = (trust: string) =>
    change.run((proof) => send("PUT", `/contacts/${contact.id}/trust`, { trust }, proof));
  return (
    <li className="list-row">
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{contact.name}</span>
        <span className="muted small">{contact.meta}</span>
      </span>
      <select
        className="field select"
        aria-label={`Trust for ${contact.name}`}
        value={contact.trust}
        disabled={change.busy}
        onChange={(event) => void setTrust(event.target.value)}
      >
        {TRUST_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </select>
    </li>
  );
}

/** The Contacts page. */
export default function Contacts() {
  const query = useContacts();
  return (
    <Page
      title="Contacts"
      subtitle="Who Brain may write to, and how much it needs you to check first."
    >
      <QueryState query={query}>
        {(overview) => (
          <>
            <Section title="Household">
              <ul className="list">
                {overview.household.map((member) => (
                  <li key={member.id} className="list-row">
                    <span className="grow row-title">{member.name}</span>
                    <span className="muted small">{member.meta}</span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section
              title="Contacts"
              aside={TRUST_LEVELS.map((t) => `${t.label}: ${t.meaning}`).join(" · ")}
            >
              <ul className="list">
                {overview.contacts.map((contact) => (
                  <ContactRow key={contact.id} contact={contact} />
                ))}
              </ul>
            </Section>
          </>
        )}
      </QueryState>
    </Page>
  );
}
