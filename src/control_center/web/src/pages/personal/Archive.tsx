/**
 * @file Personal's other sections: the onboarding checklist, the domains, the brief archive,
 * connector sync status and the changes Brain made on its own (spec 7.2, Personal; 20.12; 20.13).
 */
import { ChevronDown, ChevronRight, Circle, CircleCheck, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { ChecklistItem, PersonalOverview } from "../../api/types";
import { ActionRow } from "../../components/ActionRow";
import { Section } from "../../components/Page";
import { Reveal } from "../../components/Reflow";

/** One checklist step: swipe right, or press its button, to tick it or untick it. */
function ChecklistRow({ item }: { item: ChecklistItem }) {
  const { run } = useAction<ChecklistItem>({ refresh: ["personal"] });
  const toggle = {
    label: item.done ? "Not done" : "Done",
    icon: item.done ? RotateCcw : CircleCheck,
    onSelect: () => void run(() => send("PUT", `/checklist/${item.id}`, { done: !item.done })),
  };
  const Mark = item.done ? CircleCheck : Circle;
  return (
    <ActionRow
      title={item.title}
      meta={item.detail}
      leading={
        <Mark size={20} aria-hidden="true" className={item.done ? "status-healthy" : "muted"} />
      }
      status={item.done ? { status: "healthy", label: "Done" } : null}
      start={toggle}
      more={[toggle]}
    />
  );
}

/**
 * The onboarding checklist, until every step is done.
 *
 * @param props - The steps.
 * @returns The section, or nothing once it is finished.
 */
export function ChecklistSection({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  if (items.length === 0 || done === items.length) return null;
  return (
    <Section title="Getting started" aside={`${done} of ${items.length} done`}>
      <div className="list">
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} />
        ))}
      </div>
    </Section>
  );
}

/**
 * The domains, each a card that opens its records.
 *
 * @param props - The Personal page's data.
 * @returns The section.
 */
export function DomainsSection({ overview }: { overview: PersonalOverview }) {
  return (
    <Section title="Domains">
      <div className="grid-tiles">
        {overview.domains.map((domain) => (
          <Link key={domain.id} to={`/personal/${domain.id}`} className="card tile domain-tile">
            <span className="row">
              <span className="grow row-title">{domain.name}</span>
              <ChevronRight size={16} className="muted" aria-hidden="true" />
            </span>
            <span className="muted small">{domain.open_cases}</span>
            <span className="tag">{domain.data_class}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

/**
 * Past briefs and reviews, each opening in place to its full text.
 *
 * @param props - The Personal page's data.
 * @returns The section.
 */
export function BriefsSection({ overview }: { overview: PersonalOverview }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section title="Briefs and reviews">
      <div className="stack" style={{ ["--gap" as string]: "var(--space-2)" }}>
        {overview.briefs.map((brief) => (
          <article key={brief.id} className="card stack brief-card" aria-label={brief.title}>
            <button
              type="button"
              className="expand-bar"
              aria-expanded={open === brief.id}
              aria-controls={`brief-${brief.id}`}
              onClick={() => setOpen(open === brief.id ? null : brief.id)}
            >
              <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                <span className="row-title">{brief.title}</span>
                <span className="muted small">{brief.summary}</span>
              </span>
              <ChevronDown size={18} aria-hidden="true" className="expand-chevron" />
            </button>
            <Reveal when={open === brief.id} id={`brief-${brief.id}`}>
              <ul className="plain small stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
                {brief.items.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Reveal>
          </article>
        ))}
      </div>
    </Section>
  );
}

/**
 * When each connector last synced.
 *
 * @param props - The Personal page's data.
 * @returns The section.
 */
export function SyncSection({ overview }: { overview: PersonalOverview }) {
  return (
    <Section title="Connector sync" to={{ path: "/connections", label: "Connections" }}>
      <div className="list">
        {overview.sync.map((row) => (
          <ActionRow key={row.id} title={row.name} meta={row.meta} status={row.status} />
        ))}
      </div>
    </Section>
  );
}

/**
 * Changes Brain made without asking, each with Undo.
 *
 * @param props - The Personal page's data.
 * @returns The section.
 */
export function ChangesSection({ overview }: { overview: PersonalOverview }) {
  const undo = useAction<PersonalOverview>({ refresh: ["personal"], done: () => "Undone" });
  return (
    <Section title="Changed automatically">
      <div className="list">
        {overview.recent_changes.map((change) => {
          const action = {
            label: "Undo",
            icon: Undo2,
            onSelect: () => void undo.run(() => send("POST", `/changes/${change.id}/undo`)),
          };
          return (
            <ActionRow
              key={change.id}
              title={change.text}
              status={change.undone ? { status: "neutral", label: "Undone" } : null}
              start={change.undone ? undefined : action}
              more={change.undone ? undefined : [action]}
            />
          );
        })}
      </div>
    </Section>
  );
}
