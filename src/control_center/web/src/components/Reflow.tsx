/**
 * @file Lists that change in place (spec 7.14; decision 128). When a filter narrows or widens a
 * list, the cards that go fade and settle back, the cards that come fade in where they will sit,
 * and the cards that stay glide to their new places, instead of the whole list being swapped in
 * one frame. A view that changes wholesale, such as Threads to Boards, crossfades instead.
 *
 * Position and opacity only, so it stays on the compositor (7.17). With Reduce Motion the app's
 * MotionConfig drops the movement and keeps a plain fade.
 */
import type { ReactNode } from "react";
import { AnimatePresence, ARRIVE, ENTER, LEAVE, m, SETTLE } from "../design/motion";

/** A list whose items come, go and move smoothly. Each child must be a `ReflowItem` with a key. */
export function Reflow({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {children}
    </AnimatePresence>
  );
}

/** One item of a `Reflow` list. */
export function ReflowItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div
      className={className ? `reflow-item ${className}` : "reflow-item"}
      layout="position"
      {...ENTER}
      exit={LEAVE}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1], layout: SETTLE }}
    >
      {children}
    </m.div>
  );
}

const FADE_OUT = { opacity: 0, transition: { duration: 0.12 } } as const;

/** Content that is replaced as a whole when `id` changes: the old fades out, the new rises in. */
export function Swap({
  id,
  className = "swap stack",
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <m.div key={id} className={className} {...ARRIVE} exit={FADE_OUT}>
        {children}
      </m.div>
    </AnimatePresence>
  );
}

/**
 * Content shown only `when` something is true, such as an expanded card's transcript or a reason
 * field: it rises in when it opens and fades out when it closes, rather than appearing.
 */
export function Reveal({
  when,
  className,
  id,
  children,
}: {
  when: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {when && (
        <m.div key="reveal" id={id} className={className} {...ARRIVE} exit={FADE_OUT}>
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}
