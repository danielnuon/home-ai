/**
 * @file The frame around each widget on Today, and its editing controls (spec 7.2, Today).
 *
 * Outside edit mode the frame is invisible. In edit mode each widget shows a drag handle, its
 * size, arrows that do what the drag does for keyboard and switch users, and Remove. Moving and
 * resizing animate by position only (Motion's `layout="position"`), which stays on the
 * compositor, so the grid reflows without dropping frames (spec 7.14).
 */
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { LEAVE, m, SETTLE } from "../../design/motion";
import { WIDGETS, type WidgetId, type WidgetSize } from "./homeLayout";

const SIZE_WORDS: Record<WidgetSize, string> = { s: "Small", m: "Medium", l: "Large" };

interface ControlsProps {
  id: WidgetId;
  size: WidgetSize;
  first: boolean;
  last: boolean;
  onMove: (step: -1 | 1) => void;
  onDrop: (target: WidgetId) => void;
  onResize: (size: WidgetSize) => void;
  onRemove: () => void;
}

interface WidgetFrameProps extends ControlsProps {
  editing: boolean;
  children: ReactNode;
}

/** Drag by the handle: whichever widget the pointer passes over takes this widget's place. */
function dragFrom(event: ReactPointerEvent, onDrop: (target: WidgetId) => void) {
  event.preventDefault();
  const own = event.currentTarget.closest<HTMLElement>("[data-widget]");
  if (!own) return;
  own.classList.add("dragging");
  let lastCheck = 0;
  let lastTarget: string | undefined;
  const move = (moveEvent: PointerEvent) => {
    const edge = 64;
    if (moveEvent.clientY < edge) window.scrollBy(0, -12);
    else if (moveEvent.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
    // Hit-test at most every 60 ms: each test forces layout.
    if (moveEvent.timeStamp - lastCheck < 60) return;
    lastCheck = moveEvent.timeStamp;
    const under = document
      .elementsFromPoint(moveEvent.clientX, moveEvent.clientY)
      .map((element) => element.closest<HTMLElement>("[data-widget]"))
      .find((element) => element && element !== own);
    const target = under?.dataset.widget as WidgetId | undefined;
    if (target && target !== lastTarget) onDrop(target);
    lastTarget = target;
  };
  const end = () => {
    own.classList.remove("dragging");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

/** S, M and L, for the sizes this widget supports. */
function SizePicker({ id, size, onResize }: Pick<ControlsProps, "id" | "size" | "onResize">) {
  const info = WIDGETS[id];
  if (info.sizes.length < 2) return null;
  return (
    <div className="segmented widget-sizes" role="group" aria-label={`Size of ${info.name}`}>
      {info.sizes.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === size}
          aria-label={SIZE_WORDS[option]}
          onClick={() => onResize(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Earlier and later: what the drag does, for keyboard and switch users. */
function MoveButtons({
  id,
  first,
  last,
  onMove,
}: Pick<ControlsProps, "id" | "first" | "last" | "onMove">) {
  const name = WIDGETS[id].name;
  return (
    <>
      <button
        type="button"
        className="btn ghost icon"
        aria-label={`Move ${name} earlier`}
        disabled={first}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={18} />
      </button>
      <button
        type="button"
        className="btn ghost icon"
        aria-label={`Move ${name} later`}
        disabled={last}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={18} />
      </button>
    </>
  );
}

/** The bar above a widget while Today is being customized. */
function WidgetControls({
  id,
  size,
  first,
  last,
  onMove,
  onDrop,
  onResize,
  onRemove,
}: ControlsProps) {
  const info = WIDGETS[id];
  return (
    <div className="widget-bar">
      <span
        className="widget-handle"
        onPointerDown={(event) => dragFrom(event, onDrop)}
        aria-hidden="true"
      >
        <GripVertical size={18} />
      </span>
      <span className="grow row-title widget-name">{info.name}</span>
      <span className="row widget-tools" style={{ ["--gap" as string]: "var(--space-1)" }}>
        <SizePicker id={id} size={size} onResize={onResize} />
        <MoveButtons id={id} first={first} last={last} onMove={onMove} />
      </span>
      {info.pinned ? (
        <span className="tag" title="Needs you always stays on Today">
          Pinned
        </span>
      ) : (
        <button
          type="button"
          className="btn ghost icon"
          aria-label={`Remove ${info.name}`}
          onClick={onRemove}
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}

/** One widget, with its controls while Today is being customized. */
export function WidgetFrame({ editing, children, ...controls }: WidgetFrameProps) {
  return (
    <m.section
      layout="position"
      transition={SETTLE}
      exit={LEAVE}
      className={`widget widget-${controls.size}${editing ? " editing" : ""}`}
      data-widget={controls.id}
      aria-label={WIDGETS[controls.id].name}
    >
      {editing && <WidgetControls {...controls} />}
      <div className="widget-body stack" inert={editing}>
        {children}
      </div>
    </m.section>
  );
}
