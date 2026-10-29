/**
 * @file Short confirmations at the bottom of the screen, with Undo where the action allows it.
 *
 * Instant actions show their effect at once (7.13); the toast says what happened and, for actions
 * with an undo window such as an approval (8 seconds, spec 7.4), offers the way back for exactly
 * that long.
 */
import { AnimatePresence, m } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "problem";
  undo?: () => void;
}

/** What a caller passes to `show`. */
export interface ToastRequest {
  message: string;
  tone?: Toast["tone"];
  /** Offered as an Undo button until the toast leaves. */
  undo?: () => void;
  /** How long the toast stays, in milliseconds. Defaults to 4 seconds, or 8 with an undo. */
  duration?: number;
}

const ToastContext = createContext<(request: ToastRequest) => void>(() => undefined);

/** Shows a toast. */
export const useToast = () => useContext(ToastContext);

let nextId = 1;

/** Holds the toasts for the whole app and renders them above everything else. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    ({ message, tone = "info", undo, duration }: ToastRequest) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-2), { id, message, tone, undo }]);
      window.setTimeout(() => dismiss(id), duration ?? (undo ? 8000 : 4000));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={useMemo(() => show, [show])}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map((toast) => (
            <m.div
              key={toast.id}
              layout
              className={`toast ${toast.tone}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span className="grow">{toast.message}</span>
              {toast.undo && (
                <button
                  type="button"
                  className="btn ghost compact"
                  onClick={() => {
                    toast.undo?.();
                    dismiss(toast.id);
                  }}
                >
                  Undo
                </button>
              )}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
