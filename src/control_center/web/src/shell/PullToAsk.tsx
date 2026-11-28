/**
 * @file Pull down from the top of any screen to ask Wayfinder (spec 7.14 "Gestures", 7.15 "Search
 * and ask"), as pulling down opens search on an iPhone.
 *
 * Only on a touch screen, and only when the page is already at its top, so it never fights a
 * scroll. A hint follows the finger down and says "Release to ask Wayfinder" once the pull is far
 * enough; letting go there opens the Guide panel. The Guide button and the "." key do the same.
 */
import { Compass } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { m, useMotionValue, useTransform } from "../design/motion";
import { useGuide } from "./Guide";
import { scroller } from "./scroll";

const PULL_PX = 72;

/** The hint at the top edge, and the touch listeners that drive it. */
export function PullToAsk() {
  const { open } = useGuide();
  const pull = useMotionValue(0);
  const [ready, setReady] = useState(false);
  const from = useRef<number | null>(null);
  const y = useTransform(pull, [0, PULL_PX], [-40, 12]);
  const opacity = useTransform(pull, [0, PULL_PX / 2, PULL_PX], [0, 0.6, 1]);

  useEffect(() => {
    const reset = () => {
      from.current = null;
      pull.set(0);
      setReady(false);
    };
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      from.current =
        touch && scroller().scrollTop <= 0 && event.touches.length === 1 ? touch.clientY : null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (from.current === null || !touch) return;
      const distance = Math.max(0, (touch.clientY - from.current) * 0.5);
      if (scroller().scrollTop > 0) return reset();
      pull.set(Math.min(distance, PULL_PX * 1.4));
      setReady(distance >= PULL_PX);
    };
    const onEnd = () => {
      if (from.current !== null && pull.get() >= PULL_PX) open();
      reset();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, [open, pull]);

  return (
    <m.div className="pull-hint" style={{ y, opacity }} aria-hidden="true">
      <Compass size={16} />
      {ready ? "Release to ask Wayfinder" : "Pull to ask Wayfinder"}
    </m.div>
  );
}
