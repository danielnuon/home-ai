/**
 * @file The employee bot face (spec 7.12, "Avatars"; 7.13, "What alive looks like").
 *
 * Drawn locally as SVG: a rounded head, two-dot eyes, an antenna whose shape says the
 * department, and below the eyes a mark of the employee's own job (`emblems.tsx`), so every face
 * is recognisable, and tells you what it does, without color. Each state has its own motion,
 * styled in `components.css` (spec 7.13): idle sleeps (eyes shut, a slow breath, drifting z's),
 * thinking glances side to side, writing nods in time with its token rate, a tool's eyes follow
 * the orbiting dot, waiting on you hops for attention, and blocked gives a small shake. The head
 * and eyes are separate HTML layers so every motion is a transform on its own layer, which keeps
 * it on the compositor. With reduced motion each state holds a still pose that still tells it
 * apart: closed eyes and one z for idle, raised eyes for waiting, squinting for blocked. The state
 * is always also given as words in the label for screen readers.
 */
import type { Department, EmployeeState } from "../api/types";
import { AgentPeek, HOLD_TIME, usePeek } from "./AgentPeek";
import { Emblem } from "./emblems";

interface AvatarProps {
  department: Department;
  state: EmployeeState;
  name: string;
  size?: number;
  /** Tokens per second; the ripple pulses faster as it rises. */
  rate?: number | null;
  /** Whether hovering or holding the face opens its details; off for the face inside them. */
  peek?: boolean;
}

/** The state in words, for labels and for the line under a contact circle. */
export const STATE_WORDS: Record<EmployeeState, string> = {
  idle: "idle",
  thinking: "thinking",
  generating: "writing",
  tool: "using a tool",
  waiting: "waiting on you",
  blocked: "blocked",
};

/** The antenna for each department, drawn above a head centred at (24, 28). */
function Antenna({ department }: { department: Department }) {
  switch (department) {
    case "personal":
      return <circle cx="24" cy="6" r="3" />;
    case "engineering":
      return (
        <>
          <rect x="16" y="4" width="2.5" height="9" rx="1.25" />
          <rect x="29.5" y="4" width="2.5" height="9" rx="1.25" />
        </>
      );
    case "quality":
      return <circle cx="24" cy="7" r="4" fill="none" strokeWidth="2.5" stroke="currentColor" />;
    case "ideation":
      return <rect x="20.5" y="3" width="7" height="7" transform="rotate(45 24 6.5)" />;
    case "governance":
      return <rect x="15" y="5" width="18" height="3" rx="1.5" />;
  }
}

/** Ripple period in seconds: 2.4s at rest, down to 0.8s at 80 tokens per second and above. */
function ripplePeriod(rate: number | null | undefined): string {
  const speed = Math.min(Math.max(rate ?? 0, 0), 80) / 80;
  return `${(2.4 - speed * 1.6).toFixed(2)}s`;
}

/** An employee's face with its live state; hover or hold it for their details. */
export function Avatar(props: AvatarProps) {
  const { peek = true, ...face } = props;
  const { anchor, mode, place, holding, handlers, card, close } = usePeek();
  if (!peek) return <Face {...face} />;
  return (
    <>
      <span
        ref={anchor}
        className={`avatar-peek${holding ? " holding" : ""}`}
        style={{ ["--hold" as string]: `${HOLD_TIME}ms` }}
        {...handlers}
      >
        <Face {...face} />
        {holding && (
          <svg className="avatar-hold-ring" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" pathLength="100" />
          </svg>
        )}
      </span>
      <AgentPeek
        name={face.name}
        mode={mode}
        place={place}
        card={card}
        onClose={close}
        face={(live) => <Face {...face} state={live} size={48} />}
      />
    </>
  );
}

/** The face itself. */
function Face({ department, state, name, size = 40, rate }: Omit<AvatarProps, "peek">) {
  return (
    <span
      className={`avatar avatar-${state}`}
      style={{
        width: size,
        height: size,
        color: `var(--dept-${department})`,
        ["--ripple" as string]: ripplePeriod(rate),
        ["--avatar-size" as string]: `${size}px`,
      }}
      role="img"
      aria-label={`${name}, ${STATE_WORDS[state]}`}
    >
      <span className="avatar-face" aria-hidden="true">
        <svg viewBox="0 0 48 48" width={size} height={size} fill="currentColor">
          <Antenna department={department} />
          <rect x="8" y="13" width="32" height="30" rx="11" />
        </svg>
        <span className="avatar-eyes">
          <span className="avatar-eye" />
          <span className="avatar-eye" />
        </span>
        <Emblem name={name} />
      </span>
      {state === "tool" && <span className="avatar-orbit" aria-hidden="true" />}
      {state === "idle" && (
        <span className="avatar-sleep" aria-hidden="true">
          <span>z</span>
          <span>z</span>
        </span>
      )}
    </span>
  );
}
