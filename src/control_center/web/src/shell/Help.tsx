/**
 * @file The help menu and the keyboard shortcuts (spec 7.15, "Desktop layout").
 *
 * Shortcuts are optional accelerators: each one is also a visible button or menu item, and the
 * full list sits in the help menu. "/" goes to the search field, "." opens the Guide panel and
 * "?" shows this list. Tab, Enter, Escape and the arrow keys work as everywhere else.
 */
import { BookOpen, CircleHelp, Compass, Keyboard } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMoreMenu } from "../components/MoreMenu";
import { Sheet } from "../components/Sheet";
import { useGuide } from "./Guide";

/** Every shortcut, as the help menu lists it. */
export const SHORTCUTS: [keys: string, does: string][] = [
  ["/", "Go to the search field"],
  [".", "Ask Wayfinder about this page"],
  ["?", "Show these shortcuts"],
  ["Tab", "Move to the next control"],
  ["Enter", "Press the control in focus"],
  ["Esc", "Close a panel or menu"],
  ["↑ ↓", "Move through a menu"],
];

/** Whether a key press is someone typing, which shortcuts must leave alone. */
function typing(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return Boolean(target?.closest("input, textarea, select, [contenteditable=true]"));
}

/** Listens for the app-wide shortcuts. */
function useShortcuts(showList: () => void) {
  const { open } = useGuide();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".search-field input")?.focus();
      } else if (event.key === ".") {
        event.preventDefault();
        open();
      } else if (event.key === "?") {
        event.preventDefault();
        showList();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, showList]);
}

/** The "?" button beside the search field: Guide, shortcuts and Docs. */
export function HelpMenu() {
  const navigate = useNavigate();
  const { open } = useGuide();
  const [listOpen, setListOpen] = useState(false);
  const showList = useCallback(() => setListOpen(true), []);
  useShortcuts(showList);
  const { button, menu } = useMoreMenu(
    [
      { label: "Ask Wayfinder about this page", icon: Compass, onSelect: () => open() },
      { label: "Keyboard shortcuts", icon: Keyboard, onSelect: () => setListOpen(true) },
      { label: "Docs", icon: BookOpen, onSelect: () => navigate("/docs") },
    ],
    "Help",
    { icon: CircleHelp, name: "Help" },
  );
  return (
    <span className="help-menu">
      {button}
      {menu}
      <Sheet open={listOpen} title="Keyboard shortcuts" onClose={() => setListOpen(false)}>
        <p className="muted">Every shortcut is also a button or a menu item.</p>
        <dl className="list facts">
          {SHORTCUTS.map(([keys, does]) => (
            <div key={keys} className="list-row">
              <dt className="grow">{does}</dt>
              <dd>
                <kbd>{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </span>
  );
}
