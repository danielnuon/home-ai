/**
 * @file A number that tweens to its new value instead of jumping (spec 7.13, "Counters").
 *
 * The tween is a few lines of `requestAnimationFrame` rather than Motion, so counters on the first
 * screen don't pull the animation library into the initial bundle (spec 7.17).
 */
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../design/motion";

interface CounterProps {
  value: number;
  /** Digits after the decimal point. */
  digits?: number;
  suffix?: string;
}

const DURATION_MS = 350;

/** Cubic ease-out: fast at first, settling into the new value. */
const easeOut = (progress: number) => 1 - (1 - progress) ** 3;

/** Shows `value`, easing from the previous one over a third of a second. */
export function Counter({ value, digits = 0, suffix = "" }: CounterProps) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduced) {
      from.current = value;
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min((now - began) / DURATION_MS, 1);
      from.current = start + (value - start) * easeOut(progress);
      setShown(from.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return (
    <span className="mono">
      {(reduced ? value : shown).toFixed(digits)}
      {suffix}
    </span>
  );
}
