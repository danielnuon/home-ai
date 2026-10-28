/**
 * @file The one panel every object opens in (spec 7.16, rule 2).
 *
 * On a phone it rises from the bottom; on a tablet or desktop it slides in from the right, so the
 * list stays visible beside it (7.12, "list beside detail"). It is a modal dialog: focus moves into
 * it, Escape or the backdrop closes it, and focus returns to whatever opened it.
 */
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useLayout } from "../design/useLayout";

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A spring that settles without bounce (7.14). */
const SETTLE = { type: "spring", stiffness: 380, damping: 40 } as const;

/** Moves focus into the panel while it is open and puts it back afterwards. */
function useFocusReturn(open: boolean, panel: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => opener?.focus();
  }, [open, panel]);
}

/** A modal sheet with a title and a close button. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const layout = useLayout();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusReturn(open, panel);

  const offscreen = layout === "phone" ? { y: "100%" } : { x: "100%" };
  return (
    <AnimatePresence>
      {open && (
        <div className="sheet-layer">
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            className={`sheet sheet-${layout === "phone" ? "bottom" : "side"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={offscreen}
            animate={{ x: 0, y: 0 }}
            exit={offscreen}
            transition={SETTLE}
            onKeyDown={(event) => event.key === "Escape" && onClose()}
          >
            <div className="sheet-head">
              <h2 id={titleId}>{title}</h2>
              <button type="button" className="btn ghost icon" aria-label="Close" onClick={onClose}>
                <X size={20} />
              </button>
            </div>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
