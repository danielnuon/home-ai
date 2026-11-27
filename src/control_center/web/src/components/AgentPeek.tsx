/**
 * @file A quick look at an employee from their face (spec 7.13, "A face opens its owner").
 *
 * Every face is a way in: resting the pointer on it for a moment shows a small card beside it, and
 * pressing and holding it, on a phone or with a mouse, fills a ring around it and then opens the
 * same details in the sheet. The ring is the answer to "is holding doing anything": it starts the
 * moment the finger lands and completes as the sheet opens, so letting go early simply cancels.
 * A hold that opens the sheet swallows the click that follows, so a face inside a chip or a card
 * never also presses what it sits on. The details are the employee's live state, what they are
 * doing, their role and model, read from the Directory, with a way on to their Directory entry.
 */
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useDirectory } from "../api/queries";
import type { Employee, EmployeeState } from "../api/types";
import { AnimatePresence, m } from "../design/motion";
import { Sheet } from "./Sheet";

/** How long a pointer rests on a face before its card shows, in ms. */
const HOVER_DELAY = 450;
/** How long a hold takes to open the sheet, in ms. */
export const HOLD_TIME = 500;
/** A finger that moves this far is scrolling, not holding. */
const SLOP = 10;
/** Time to move from the face onto its card before the card closes, in ms. */
const LEAVE_GRACE = 150;

type Mode = "card" | "sheet" | null;

const CARD_WIDTH = 280;

/** Where the hover card goes: below the face if it fits, otherwise above, kept on screen. */
function placeNear(face: HTMLElement | null): React.CSSProperties {
  const rect = face?.getBoundingClientRect();
  if (!rect) return {};
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - CARD_WIDTH - 8);
  const below = rect.bottom + 8;
  return below + 220 < window.innerHeight
    ? { left, top: below }
    : { left, bottom: window.innerHeight - rect.top + 8 };
}

/** Hover and hold handlers for a face, and what they have opened. */
export function usePeek() {
  const anchor = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => window.clearTimeout(timer.current);
  useEffect(() => clear, []);

  const cancelHold = () => {
    clear();
    start.current = null;
    setHolding(false);
  };

  const handlers = {
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse" || mode) return;
      clear();
      timer.current = window.setTimeout(() => {
        setPlace(placeNear(anchor.current));
        setMode("card");
      }, HOVER_DELAY);
    },
    onPointerLeave: () => {
      cancelHold();
      if (mode === "card") timer.current = window.setTimeout(() => setMode(null), LEAVE_GRACE);
    },
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      clear();
      start.current = { x: event.clientX, y: event.clientY };
      setHolding(true);
      timer.current = window.setTimeout(() => {
        setHolding(false);
        setMode("sheet");
        swallowNextClick();
        navigator.vibrate?.(8);
      }, HOLD_TIME);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const from = start.current;
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > SLOP) cancelHold();
    },
    onPointerUp: cancelHold,
    onPointerCancel: cancelHold,
    onContextMenu: (event: React.MouseEvent) => {
      if (holding || mode === "sheet") event.preventDefault();
    },
  };
  /** The card keeps itself open while the pointer is on it. */
  const card = { onPointerEnter: clear, onPointerLeave: () => setMode(null) };
  return { anchor, mode, place, holding, handlers, card, close: () => setMode(null) };
}

/** Stops the click that a finished hold would otherwise send to whatever the face sits in. */
function swallowNextClick() {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 600);
}

/** The details themselves, the same in the card and in the sheet. */
function PeekBody({ name, face }: { name: string; face: (state: EmployeeState) => ReactNode }) {
  const employee = useDirectory().data?.employees.find((item) => item.name === name);
  if (!employee) return <p className="muted small">{name} isn't in the Directory yet.</p>;
  return <EmployeeDetails employee={employee} face={face(employee.state)} />;
}

function EmployeeDetails({ employee, face }: { employee: Employee; face: ReactNode }) {
  return (
    <div className="stack peek-body">
      <div className="row">
        {face}
        <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="row-title">{employee.name}</span>
          <span className="muted small">{employee.title}</span>
        </span>
      </div>
      <p className="small">{employee.now || employee.tagline}</p>
      <dl className="peek-facts small">
        <dt className="muted">Group</dt>
        <dd>{employee.group}</dd>
        <dt className="muted">Model</dt>
        <dd className="mono">{employee.model}</dd>
        <dt className="muted">Done</dt>
        <dd className="mono">{employee.tasks_done} tasks</dd>
      </dl>
      <Link to="/directory" className="chip link-chip">
        Open in Directory
        <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

interface CardHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

function PeekCard({
  place,
  card,
  onClose,
  children,
}: {
  place: React.CSSProperties;
  card: CardHandlers;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("scroll", onClose, { capture: true, once: true });
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("scroll", onClose, { capture: true });
      window.removeEventListener("keydown", escape);
    };
  }, [onClose]);
  return createPortal(
    <m.div
      className="card peek-card"
      role="tooltip"
      style={{ ...place, width: CARD_WIDTH }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      {...card}
    >
      {children}
    </m.div>,
    document.body,
  );
}

/** What a face has opened: the hover card, or the sheet after a hold. */
export function AgentPeek({
  name,
  mode,
  place,
  card,
  onClose,
  face,
}: {
  name: string;
  mode: Mode;
  place: React.CSSProperties;
  card: CardHandlers;
  onClose: () => void;
  face: (state: EmployeeState) => ReactNode;
}) {
  return (
    <>
      <AnimatePresence>
        {mode === "card" && (
          <PeekCard place={place} card={card} onClose={onClose}>
            <PeekBody name={name} face={face} />
          </PeekCard>
        )}
      </AnimatePresence>
      <Sheet open={mode === "sheet"} title={name} onClose={onClose}>
        {mode === "sheet" && <PeekBody name={name} face={face} />}
      </Sheet>
    </>
  );
}
