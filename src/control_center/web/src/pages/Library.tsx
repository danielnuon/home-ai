/**
 * @file Library: the offline library and its librarian (spec 7.2, 12.8). Only in the navigation
 * while `offline_library` is on.
 *
 * One search box and six category buttons over the reviewed quick cards; an ask box whose answers
 * carry numbered citations, with open-edit sources marked unreviewed; which tiers are installed,
 * the last safety test, off-grid state and battery. Red-flag questions open a quick card at once.
 * Quick cards print on their own, and an Ark drive is written to a chosen volume with a passkey.
 */
import { HardDriveDownload, Printer } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import { useLibrary, useLibrarySearch, useSettings } from "../api/queries";
import type { ArkDriveStarted, LibraryAnswer, LibraryOverview, QuickCard } from "../api/types";
import { Segmented } from "../components/Controls";
import { Page, Section } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { SettingRow } from "../components/SettingControl";
import { Sheet } from "../components/Sheet";
import { AnimatePresence, ARRIVE, ENTER, LEAVE, m } from "../design/motion";
import { StatusText } from "../design/status";

/** A quick card: its title, then its steps when pressed, opening in place. */
function QuickCardView({ card, open = false }: { card: QuickCard; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return (
    <article className="card stack">
      <button
        type="button"
        className="expand-bar"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="row-title grow">{card.title}</span>
        <span className="muted small">{card.category}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div className="stack" {...ARRIVE} exit={{ opacity: 0 }}>
            <ol>
              {card.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="muted small">From {card.source}</p>
          </m.div>
        )}
      </AnimatePresence>
    </article>
  );
}

/** The librarian's answer, or the quick card a red-flag question opens. */
function AnswerView({ answer }: { answer: LibraryAnswer }) {
  return (
    <m.div className="stack" {...ARRIVE}>
      {answer.quick_card && <QuickCardView card={answer.quick_card} open />}
      {answer.answer && (
        <article className="card stack">
          <p>{answer.answer}</p>
          <ol className="small">
            {answer.citations.map((c) => (
              <li key={c.number}>
                {c.title} · {c.publisher}
                {!c.reviewed && (
                  <span className="status-attention"> ▲ Unreviewed, open-edit source</span>
                )}
              </li>
            ))}
          </ol>
        </article>
      )}
      {answer.note && <p className="muted small">{answer.note}</p>}
    </m.div>
  );
}

/** The ask box. */
function Ask() {
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<LibraryAnswer | null>(null);
  const { run, busy } = useAction<LibraryAnswer>();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = await run(() => send<LibraryAnswer>("POST", "/library/ask", { question: text }));
    if (found) setAnswer(found);
  };
  return (
    <Section title="Ask the librarian">
      <form className="row" onSubmit={(event) => void submit(event)}>
        <input
          className="field grow"
          aria-label="Your question"
          placeholder="How do I make water safe to drink?"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !text.trim()}>
          Ask
        </button>
      </form>
      {answer && <AnswerView key={answer.question} answer={answer} />}
    </Section>
  );
}

/** Search and the six category buttons over the quick cards. */
function QuickCards({ library }: { library: LibraryOverview }) {
  const [words, setWords] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const search = useLibrarySearch(words);
  const hits = new Set(search.data?.results.map((r) => r.id));
  const shown = library.quick_cards.filter(
    (card) => (!category || card.category === category) && (!words.trim() || hits.has(card.id)),
  );
  return (
    <Section title="Quick cards" aside="Reviewed, quoted from their sources">
      <input
        className="field"
        type="search"
        aria-label="Search the library"
        placeholder="Search the library"
        value={words}
        onChange={(event) => setWords(event.target.value)}
      />
      <div className="row wrap no-print" style={{ ["--gap" as string]: "var(--space-2)" }}>
        {library.categories.map((name) => (
          <button
            key={name}
            type="button"
            className="chip"
            aria-pressed={category === name}
            onClick={() => setCategory(category === name ? null : name)}
          >
            {name}
          </button>
        ))}
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((card) => (
          <m.div key={card.id} layout="position" {...ENTER} exit={LEAVE}>
            <QuickCardView card={card} />
          </m.div>
        ))}
      </AnimatePresence>
      {shown.length === 0 && (
        <p className="list empty">No quick card matches. Try asking instead.</p>
      )}
    </Section>
  );
}

/** Writing an Ark drive: pick a connected volume, then the passkey. */
function ArkDrive({ volumes }: { volumes: string[] }) {
  const [open, setOpen] = useState(false);
  const [volume, setVolume] = useState(volumes[0] ?? "");
  const { run, busy } = useAction<ArkDriveStarted>({ done: (started) => started.message });
  const write = async () => {
    const started = await run((proof) =>
      send<ArkDriveStarted>("POST", "/library/ark-drive", { volume }, proof),
    );
    if (started) setOpen(false);
  };
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <HardDriveDownload size={18} aria-hidden="true" />
        Write an Ark drive
      </button>
      <Sheet open={open} title="Write an Ark drive" onClose={() => setOpen(false)}>
        <p>
          The installed tiers, the index, the quick cards and Ark's laptop software. Nothing else on
          the drive is touched.
        </p>
        <Segmented
          label="Drive"
          value={volume}
          options={volumes.map((v) => ({ value: v, label: v }))}
          onChange={setVolume}
        />
        <button
          type="button"
          className="btn primary"
          disabled={busy || !volume}
          onClick={() => void write()}
        >
          Write to {volume}
        </button>
      </Sheet>
    </>
  );
}

/** Tiers, the safety test, off-grid state and battery. */
function State({ library }: { library: LibraryOverview }) {
  return (
    <Section title="Library state">
      <dl className="list facts">
        {library.tiers.map((tier) => (
          <div key={tier.name} className="list-row">
            <dt className="grow">
              {tier.name} <span className="muted small">{tier.size}</span>
            </dt>
            <dd className={tier.installed ? "status-healthy" : "muted"}>
              {tier.installed ? "● Installed" : "Not installed"}
            </dd>
          </div>
        ))}
        <div className="list-row">
          <dt className="grow">Safety test</dt>
          <dd>
            <StatusText value={library.safety_test} />
          </dd>
        </div>
        <div className="list-row">
          <dt className="grow">Off-grid mode</dt>
          <dd className="muted">{library.offgrid ? "On" : "Off"}</dd>
        </div>
        <div className="list-row">
          <dt className="grow">Battery</dt>
          <dd className="muted">{library.battery ?? "Not reported"}</dd>
        </div>
      </dl>
    </Section>
  );
}

/** The Library page. */
export default function Library() {
  const settings = useSettings();
  const setting = settings.data?.settings.find((s) => s.key === "offline_library");
  const on = setting?.value === "on";
  const query = useLibrary(on);
  return (
    <Page
      title="Library"
      subtitle="Survival and medical references that work without the internet."
      actions={
        on && (
          <button type="button" className="btn no-print" onClick={() => window.print()}>
            <Printer size={18} aria-hidden="true" />
            Print quick cards
          </button>
        )
      }
    >
      {setting && (
        <div className="list no-print">
          <SettingRow setting={setting} />
        </div>
      )}
      {setting && !on && (
        <p className="list empty">
          Off. Turn it on to download the Survive tier and ask the librarian, even off grid.
        </p>
      )}
      {on && (
        <QueryState query={query}>
          {(library) => (
            <>
              <Ask />
              <QuickCards library={library} />
              <State library={library} />
              <div className="no-print">
                <ArkDrive volumes={library.volumes} />
              </div>
            </>
          )}
        </QueryState>
      )}
    </Page>
  );
}
