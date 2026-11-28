/**
 * @file Press and hold to confirm, for the few actions that can't be undone (spec 7.15,
 * "Destructive action"; 7.16, rule 11).
 *
 * Everyday actions happen at once with Undo; an action with no undo, such as deleting something
 * for good, says "can't be undone" on the button itself and runs only after a deliberate hold.
 * Light fills the button from the left while it is held, and drains away if it is let go early.
 * It works the same with a finger, a mouse press, or Space or Enter held on the keyboard.
 */
import { useEffect, useRef, useState } from "react";
import { m } from "../design/motion";

const HOLD_MS = 1200;

interface HoldButtonProps {
  /** What it does, such as "Delete forever". The button adds "Hold to" and "can't be undone". */
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}

/**
 * A destructive button that runs `onConfirm` after a 1.2-second hold.
 *
 * @param props - The words, the action and whether it is available.
 * @returns The button.
 */
export function HoldButton({ label, onConfirm, disabled = false }: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const begin = () => {
    if (disabled || timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };
  useEffect(() => stop, []);
  const isKey = (event: React.KeyboardEvent) => event.key === " " || event.key === "Enter";
  return (
    <button
      type="button"
      className="btn destructive hold-button"
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if (!isKey(event)) return;
        event.preventDefault();
        if (!event.repeat) begin();
      }}
      onKeyUp={(event) => isKey(event) && stop()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <m.span
        className="hold-fill"
        aria-hidden="true"
        initial={false}
        animate={{ scaleX: holding ? 1 : 0 }}
        transition={{ duration: holding ? HOLD_MS / 1000 : 0.2, ease: "linear" }}
      />
      <span className="hold-label">
        Hold to {label.charAt(0).toLowerCase() + label.slice(1)}
        <span className="small"> · can't be undone</span>
      </span>
    </button>
  );
}
