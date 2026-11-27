/**
 * @file Moves the scroll light (spec 7.12, "Light"; styled in `light.css`).
 *
 * The light sits on the right edge at the height a scrollbar's thumb would be: at the top of the
 * screen when the page is at its top, at the bottom when it is at its end. Scroll events only
 * ask for a frame; each frame writes one custom property on the root, and marks the page as
 * scrolling until it has been still for a moment. Nothing runs when motion or transparency is
 * reduced.
 */

const SETTLE_MS = 600;
/** Keeps the light's centre this far inside the top and bottom of the screen, in px. */
const MARGIN = 48;

function scrollerOf(target: EventTarget | null): HTMLElement {
  if (target instanceof HTMLElement) return target;
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Starts the light; returns a function that stops it. */
export function startScrollLight(): () => void {
  const quiet = window.matchMedia?.(
    "(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce)",
  );
  if (!quiet || quiet.matches) return () => undefined;
  const root = document.documentElement;
  let frame = 0;
  let settle = 0;
  let source: EventTarget | null = null;

  const draw = () => {
    frame = 0;
    const element = scrollerOf(source);
    const range = element.scrollHeight - element.clientHeight;
    const progress = range > 0 ? element.scrollTop / range : 0;
    const height = window.innerHeight;
    root.style.setProperty(
      "--light-y",
      `${Math.round(MARGIN + progress * (height - 2 * MARGIN))}px`,
    );
  };
  const onScroll = (event: Event) => {
    source = event.target === document ? null : event.target;
    if (!frame) frame = requestAnimationFrame(draw);
    root.toggleAttribute("data-scrolling", true);
    window.clearTimeout(settle);
    settle = window.setTimeout(() => root.removeAttribute("data-scrolling"), SETTLE_MS);
  };

  draw();
  document.addEventListener("scroll", onScroll, { passive: true, capture: true });
  return () => {
    document.removeEventListener("scroll", onScroll, { capture: true });
    cancelAnimationFrame(frame);
    window.clearTimeout(settle);
    root.removeAttribute("data-scrolling");
  };
}
