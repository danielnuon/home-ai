/**
 * @file Swipe actions on rows and cards, as in Mail (spec 7.14 "Gestures", 7.15 pattern catalog).
 *
 * Swipe right for the main action and left for the secondary one: on a row that is its main and
 * secondary action; on an alert card it is acknowledge and snooze. Past the threshold the action's
 * colour shows behind the item and letting go runs it; short of it the item glides back. With a
 * pointer the same actions sit on the item as small labelled buttons that fade in while the
 * pointer rests on it or focus is inside it, so a mouse or keyboard never needs the gesture
 * (7.15, principle 5). Put the same actions in the item's "…" menu too.
 *
 * Only transform and opacity move (7.17). A drag that ends a swipe never also counts as a press
 * on whatever the item links to.
 */
import type { LucideIcon } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { m, useMotionValue, useTransform, type PanInfo } from "../design/motion";

/** One side of a swipe. */
export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** The colour behind the item as it is swiped: accent for the main action, sand to put off. */
  tone?: "accent" | "sand" | "clay";
}

interface SwipeableProps {
  /** Swipe right: the main action. */
  start?: SwipeAction;
  /** Swipe left: the secondary action. */
  end?: SwipeAction;
  /** "row" inside a list, "card" for a card on its own. */
  variant?: "row" | "card";
  className?: string;
  children: ReactNode;
}

const THRESHOLD = 88;
const REACH = 140;

/** The action's colour and words behind the item, growing clearer as the swipe nears the line. */
function Behind({
  action,
  side,
  x,
}: {
  action: SwipeAction;
  side: "start" | "end";
  x: ReturnType<typeof useMotionValue<number>>;
}) {
  const sign = side === "start" ? 1 : -1;
  const opacity = useTransform(x, [0, sign * THRESHOLD], [0, 1]);
  const Icon = action.icon;
  return (
    <m.div
      className={`swipe-behind swipe-${side} tone-${action.tone ?? "accent"}`}
      style={{ opacity }}
      aria-hidden="true"
    >
      <Icon size={18} />
      <span>{action.label}</span>
    </m.div>
  );
}

/** The labelled buttons a pointer or keyboard uses in place of the swipe. */
function PointerButtons({ start, end }: Pick<SwipeableProps, "start" | "end">) {
  const actions = [start, end].filter((a): a is SwipeAction => Boolean(a));
  if (actions.length === 0) return null;
  return (
    <span className="swipe-buttons">
      {actions.map(({ label, icon: Icon, onSelect }) => (
        <button
          key={label}
          type="button"
          className="btn compact swipe-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect();
          }}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </button>
      ))}
    </span>
  );
}

/**
 * A row or card that can be swiped right for `start` and left for `end`.
 *
 * @param props - The two actions, the look and the item itself.
 * @returns The swipeable item.
 */
export function Swipeable({
  start,
  end,
  variant = "row",
  className = "",
  children,
}: SwipeableProps) {
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (info.offset.x > THRESHOLD) start?.onSelect();
    else if (info.offset.x < -THRESHOLD) end?.onSelect();
    window.setTimeout(() => (dragged.current = false), 0);
  };
  return (
    <div className={`swipe swipe-${variant} ${className}`}>
      {start && <Behind action={start} side="start" x={x} />}
      {end && <Behind action={end} side="end" x={x} />}
      <m.div
        className="swipe-face"
        style={{ x }}
        drag={start || end ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: end ? -REACH : 0, right: start ? REACH : 0 }}
        dragElastic={0.12}
        dragSnapToOrigin
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
        <PointerButtons start={start} end={end} />
      </m.div>
    </div>
  );
}
