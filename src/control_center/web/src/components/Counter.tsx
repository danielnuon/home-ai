/**
 * @file A number that tweens to its new value instead of jumping (spec 7.13, "Counters").
 */
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface CounterProps {
  value: number;
  /** Digits after the decimal point. */
  digits?: number;
  suffix?: string;
}

/** Shows `value`, easing from the previous one over a third of a second. */
export function Counter({ value, digits = 0, suffix = "" }: CounterProps) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduced) {
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.35,
      ease: "easeOut",
      onUpdate: (latest) => {
        from.current = latest;
        setShown(latest);
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span className="mono">
      {(reduced ? value : shown).toFixed(digits)}
      {suffix}
    </span>
  );
}
