/**
 * @file The "…" more-actions menu on every card, row, avatar and task (spec 7.15, pattern catalog).
 *
 * One menu, three ways to open it: the visible "…" button, right-click on a computer, and press
 * and hold on a touch screen. Every action a swipe or a shortcut can do is also an item here, so
 * nothing depends on knowing a gesture (7.15, principle 5). The menu fades and settles in where it
 * was opened and closes when anything outside it is pressed, on Escape, or once an item runs.
 *
 * Use `useMoreMenu(actions, label)`: spread `triggerProps` on the item, put `button` where the "…"
 * should sit and render `menu` anywhere (it draws into the document body). See
 * docs/engineering/interaction-patterns.md.
 */
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "../design/motion";

/** One item in a "…" menu. */
export interface MoreAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Clay text, for an action that removes something (7.15, "Destructive action"). */
  destructive?: boolean;
}

const HOLD_MS = 500;
const SLOP_PX = 8;
const MENU_WIDTH = 240;

interface Place {
  x: number;
  y: number;
}

/** Keeps the menu on screen: it opens down and to the left of the point, flipping if it must. */
function clamp({ x, y }: Place, items: number): Place {
  const height = items * 44 + 16;
  const left = Math.min(Math.max(8, x - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
  const top = y + height > window.innerHeight - 8 ? Math.max(8, y - height) : y;
  return { x: Math.max(8, left), y: top };
}

/** Press and hold on a touch screen opens the menu, unless the finger moves first. */
function useHold(open: (at: Place) => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<Place | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse" || event.button !== 0) return;
      const at = { x: event.clientX, y: event.clientY };
      start.current = at;
      timer.current = window.setTimeout(() => {
        cancel();
        swallowNextClick();
        navigator.vibrate?.(8);
        open(at);
      }, HOLD_MS);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const from = start.current;
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}

/** Stops the click a finished hold would otherwise send to the item under the finger. */
export function swallowNextClick() {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 600);
}

/** Arrow keys move between items, Home and End jump, Escape closes (7.15, desktop layout). */
function onMenuKey(event: React.KeyboardEvent<HTMLDivElement>, close: () => void) {
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  const go = (index: number) => items[(index + items.length) % items.length]?.focus();
  if (event.key === "ArrowDown") go(at + 1);
  else if (event.key === "ArrowUp") go(at - 1);
  else if (event.key === "Home") go(0);
  else if (event.key === "End") go(items.length - 1);
  else if (event.key === "Escape" || event.key === "Tab") close();
  else return;
  event.preventDefault();
}

interface MenuProps {
  label: string;
  actions: MoreAction[];
  place: Place | null;
  close: () => void;
}

/** The open menu, drawn into the body so no card or row can clip it. */
function Menu({ label, actions, place, close }: MenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (place) panel.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [place]);
  return createPortal(
    <AnimatePresence>
      {place && (
        <div className="menu-layer" onPointerDown={close} onContextMenu={(e) => e.preventDefault()}>
          <m.div
            ref={panel}
            role="menu"
            aria-label={label}
            className="more-menu"
            style={{ left: place.x, top: place.y }}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => onMenuKey(event, close)}
          >
            {actions.map(({ label: name, icon: Icon, onSelect, destructive }) => (
              <button
                key={name}
                type="button"
                role="menuitem"
                className={`menu-item${destructive ? " destructive" : ""}`}
                onClick={() => {
                  close();
                  onSelect();
                }}
              >
                {Icon && <Icon size={18} aria-hidden="true" />}
                <span>{name}</span>
              </button>
            ))}
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** What `useMoreMenu` gives a card or row. */
export interface MoreMenuParts {
  /** Right-click and press-and-hold handlers for the item itself. */
  triggerProps: {
    onContextMenu: (event: React.MouseEvent) => void;
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
  /** The visible "…" button. */
  button: ReactNode;
  /** The menu itself; render it once, anywhere in the item. */
  menu: ReactNode;
}

/** A menu button that is not a "…", such as Help: its own icon and name. */
interface ButtonLook {
  icon: LucideIcon;
  name: string;
  /** Words on the button beside the icon, for a menu that picks a value, such as a filter. */
  text?: string;
}

/**
 * The "…" menu for one item.
 *
 * @param actions - The items, most common first; the same actions its swipes and buttons do.
 * @param label - What the item is, for the button's name ("More actions for Unit B lease").
 * @param look - Another icon and name for the button, for a menu that is not a "…".
 * @returns The trigger handlers, the "…" button and the menu.
 */
export function useMoreMenu(
  actions: MoreAction[],
  label: string,
  look?: ButtonLook,
): MoreMenuParts {
  const Icon = look?.icon ?? MoreHorizontal;
  const text = look?.text;
  const [place, setPlace] = useState<Place | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = (at: Place) => {
    opener.current = document.activeElement as HTMLElement | null;
    setPlace(clamp(at, actions.length));
  };
  const close = () => {
    setPlace(null);
    opener.current?.focus?.();
  };
  const hold = useHold(open);
  const button = (
    <button
      type="button"
      className={text ? "btn compact filter-button" : "btn ghost icon more-button"}
      aria-label={look?.name ?? `More actions for ${label}`}
      aria-haspopup="menu"
      aria-expanded={place !== null}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const box = event.currentTarget.getBoundingClientRect();
        open({ x: box.right, y: box.bottom + 4 });
      }}
    >
      {text && <span>{text}</span>}
      <Icon size={text ? 16 : 20} aria-hidden="true" />
    </button>
  );
  return {
    triggerProps: {
      ...hold,
      onContextMenu: (event) => {
        event.preventDefault();
        open({ x: event.clientX + MENU_WIDTH, y: event.clientY });
      },
    },
    button,
    menu: <Menu label={`Actions for ${label}`} actions={actions} place={place} close={close} />,
  };
}
