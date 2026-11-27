/**
 * @file Where the page is scrolled, kept the way a phone app keeps it (spec 7.16, rule 14).
 *
 * Going to a new page starts at its top. Going back returns to where you were on the page you
 * came back to, once it has drawn far enough to get there. A filter that only changes the query
 * string keeps the place. The scroller is the window, except in the preview on a phone, where the
 * app scrolls inside `#root`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** The element that scrolls the page. */
export function scroller(): HTMLElement {
  const root = document.getElementById("root");
  if (root && getComputedStyle(root).overflowY === "auto") return root;
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Scrolls the page to its top, gliding unless motion is reduced. */
export function scrollToTop() {
  scroller().scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
}

/** Tries for up to half a second to reach `top`, while the page it belongs to draws in. */
function restore(top: number) {
  const until = performance.now() + 500;
  const step = () => {
    const element = scroller();
    element.scrollTop = top;
    if (Math.abs(element.scrollTop - top) > 1 && performance.now() < until) {
      requestAnimationFrame(step);
    }
  };
  step();
}

/** Keeps the latest scroll position of each history entry as the Owner scrolls. */
function useScrollRecorder(saved: Map<string, number>, key: React.RefObject<string>) {
  useEffect(() => {
    const record = () => saved.set(key.current, scroller().scrollTop);
    const root = document.getElementById("root");
    window.addEventListener("scroll", record, { passive: true });
    root?.addEventListener("scroll", record, { passive: true });
    return () => {
      window.removeEventListener("scroll", record);
      root?.removeEventListener("scroll", record);
    };
  }, [saved, key]);
}

/**
 * Starts each new page at the top and puts a page you return to back where you left it.
 *
 * Positions are recorded as the Owner scrolls, not when leaving: by the time a navigation is
 * seen, the old page may already have given way to a shorter one and the browser clamped the
 * position. The entry switches in a layout effect, before the scroll event that clamp sends.
 */
export function useScrollMemory() {
  const location = useLocation();
  const action = useNavigationType();
  const [saved] = useState(() => new Map<string, number>());
  const key = useRef(location.key);
  const pathname = useRef(location.pathname);
  useScrollRecorder(saved, key);

  useLayoutEffect(() => {
    if (key.current === location.key) return;
    const samePage = pathname.current === location.pathname;
    key.current = location.key;
    pathname.current = location.pathname;
    if (action === "POP") restore(saved.get(location.key) ?? 0);
    else if (!samePage) scroller().scrollTop = 0;
  }, [location.key, location.pathname, action, saved]);
}
