/**
 * @file The Guide panel on every page: ask Wayfinder about whatever is on screen (spec 7.2, 14.8).
 *
 * It opens from the Guide button beside the search field, from the help menu, by pulling down from
 * the top of the screen on a touch device (7.14, "Gestures") and with the "." key. A page names
 * the object in view with `useGuideContext("INFRASTRUCTURE.md")`, so the question carries it.
 * Wayfinder is read-only: it explains and links to where things are, and never changes anything.
 */
import { Compass } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { useAction } from "../api/actions";
import { send } from "../api/client";
import type { GuideAnswer } from "../api/types";
import { Sheet } from "../components/Sheet";
import { AnimatePresence, ARRIVE, m } from "../design/motion";
import { ROUTES } from "../routes";

interface GuideControls {
  /** Opens the panel, about `about` when given (a row's title) or else the page's own object. */
  open: (about?: string) => void;
  /** Names the object a page shows, or clears it with null. */
  setContext: (context: string | null) => void;
}

const GuideContext = createContext<GuideControls>({
  open: () => undefined,
  setContext: () => undefined,
});

/** Opens the Guide panel from anywhere in the app. */
export const useGuide = () => useContext(GuideContext);

/** Names what the current page is showing, so Wayfinder answers about it. */
export function useGuideContext(context: string | null) {
  const { setContext } = useGuide();
  useEffect(() => {
    setContext(context);
    return () => setContext(null);
  }, [context, setContext]);
}

const SUGGESTIONS = ["What is this page for?", "What needs me here?", "Who handles this?"];

/** The page's name from its path, as Back names it. */
function pageName(pathname: string): string {
  const match = ROUTES.filter(
    (page) => pathname === page.path || (page.path !== "/" && pathname.startsWith(`${page.path}/`)),
  ).sort((a, b) => b.path.length - a.path.length)[0];
  return match?.label ?? "This page";
}

/** One answer, with the pages it came from as chips. */
function AnswerCard({ answer, onFollow }: { answer: GuideAnswer; onFollow: () => void }) {
  return (
    <m.article className="card stack guide-answer" {...ARRIVE}>
      <p className="muted small">{answer.question}</p>
      <p>{answer.answer}</p>
      {answer.sources.length > 0 && (
        <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
          {answer.sources.map((source) => (
            <Link key={source.href} to={source.href} className="chip link-chip" onClick={onFollow}>
              {source.title}
            </Link>
          ))}
        </div>
      )}
    </m.article>
  );
}

interface PanelProps {
  open: boolean;
  context: string | null;
  onClose: () => void;
}

/** The panel itself: what it is about, suggested questions, the field, and the answers. */
function GuidePanel({ open, context, onClose }: PanelProps) {
  const { pathname } = useLocation();
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<GuideAnswer[]>([]);
  const { run, busy } = useAction<GuideAnswer>();
  const about = context ?? pageName(pathname);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    const answer = await run(() =>
      send<GuideAnswer>("POST", "/guide/ask", { question, page: pathname, context }),
    );
    if (answer) {
      setAnswers((before) => [answer, ...before]);
      setText("");
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(text);
  };
  return (
    <Sheet open={open} title="Ask Wayfinder" onClose={onClose}>
      <p className="muted">About {about}. Wayfinder explains; it never changes anything.</p>
      <div className="row wrap" style={{ ["--gap" as string]: "var(--space-2)" }}>
        {SUGGESTIONS.map((question) => (
          <button key={question} type="button" className="chip" onClick={() => void ask(question)}>
            {question}
          </button>
        ))}
      </div>
      <form className="row" onSubmit={submit}>
        <input
          className="field grow"
          aria-label="Your question"
          placeholder="Ask about this page"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !text.trim()}>
          Ask
        </button>
      </form>
      <AnimatePresence initial={false}>
        {answers.map((answer) => (
          <AnswerCard key={answer.id} answer={answer} onFollow={onClose} />
        ))}
      </AnimatePresence>
    </Sheet>
  );
}

/** Holds the panel for the whole app, so any page, gesture or key can open it. */
export function GuideProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const controls = useMemo<GuideControls>(
    () => ({
      open: (about) => {
        if (typeof about === "string") setContext(about);
        setOpen(true);
      },
      setContext,
    }),
    [],
  );
  return (
    <GuideContext.Provider value={controls}>
      {children}
      <GuidePanel open={open} context={context} onClose={() => setOpen(false)} />
    </GuideContext.Provider>
  );
}

/** The Guide button beside the search field. */
export function GuideButton() {
  const { open } = useGuide();
  return (
    <button type="button" className="btn compact guide-button" onClick={() => open()}>
      <Compass size={18} aria-hidden="true" />
      <span className="guide-button-label">Guide</span>
    </button>
  );
}
