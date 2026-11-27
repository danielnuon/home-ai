/**
 * @file Each employee's own mark, drawn on the lower half of their face (spec 7.12, "Avatars").
 *
 * The antenna says the department; the mark says the job, so no two employees share a face. Each
 * mark is a small line drawing of the thing the employee works with: Chrono's clock, Ledger's pie
 * chart, Redline's wavy red-pen line, Gremlin's teeth. Marks live in the face's 48-unit grid,
 * inside the band below the eyes (x 16 to 32, y 32.5 to 41.5), and are stroked in the eye color,
 * so they read in both themes and move with the head in every state. An employee with no mark
 * here, such as one hired later, keeps the plain face.
 */
import type { ReactNode } from "react";

const dot = (cx: number, cy: number, r = 1.2) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

/** Each employee's mark, by name. */
export const EMBLEMS: Record<string, ReactNode> = {
  // Personal operations
  /** Chief of Staff: a globe, the whole household in view. */
  Atlas: (
    <path d="M20 37a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M20 37h8M24 33c-1.8 2.2-1.8 5.8 0 8M24 33c1.8 2.2 1.8 5.8 0 8" />
  ),
  /** Scheduler: a clock. */
  Chrono: <path d="M19.5 37a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0M24 37v-2.6M24 37h2.2" />,
  /** Inbox triage: a funnel. */
  Sieve: <path d="M18 33.5h12l-4.5 4.5v3h-3v-3z" />,
  /** Household manager: a house. */
  Hearth: <path d="M19 41v-4.5l5-4 5 4v4.5zM23 41v-2.5h2v2.5" />,
  /** Career coach: a briefcase. */
  Mentor: <path d="M18.5 35.5h11v5.5h-11zM22 35.5v-1.6h4v1.6M18.5 38h11" />,
  /** Client project manager: a milestone flag. */
  Milestone: <path d="M20 41v-8M20 33.5h8l-2 2 2 2h-8" />,
  /** Sales: a megaphone. */
  Pitch: <path d="M18.5 35.5h3l6-2.5v8l-6-2.5h-3zM29.8 35.6l1.4-.8M29.8 38.4l1.4.8" />,
  /** Health and benefits: a heartbeat. */
  Pulse: <path d="M16.5 37.5h4l1.5-3.5 2.5 7 2-5 1 1.5h4" />,
  /** Budget analyst: a pie chart. */
  Ledger: <path d="M19.5 37a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0M24 37v-4.5M24 37l3.8 2.4" />,
  /** Investment research: a bar chart. */
  Quant: <path d="M19 41v-3M22.3 41v-5M25.6 41v-7.5M28.9 41v-4.5" />,
  /** Tax organizer: a percent sign. */
  Taxonomy: (
    <>
      <path d="M19.5 40.5l9-7" />
      {dot(20.5, 34.5, 1.4)}
      {dot(27.5, 39.5, 1.4)}
    </>
  ),
  /** Property manager: a key. */
  Keystone: (
    <path d="M17.5 37a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M22.5 37h8M28 37v2.4M30.5 37v2" />
  ),
  /** Bookkeeper: tally marks. */
  Tally: <path d="M19 33.5v7.5M21.5 33.5v7.5M24 33.5v7.5M26.5 33.5v7.5M17.5 40l11-5.5" />,
  /** Marketing and content: a speech bubble. */
  Zeldenrust: <path d="M18 33.5h12v5.5h-7l-3 2.5v-2.5h-2zM20.5 36.2h7" />,

  // Governance
  /** Development lead: a clipboard with a tick. */
  Foreman: <path d="M19.5 34h9v7h-9zM22.5 33h3v2h-3zM21.5 38l1.5 1.5 3-3" />,
  /** People and process: a metronome. */
  Cadence: <path d="M20 41l2.5-8h3l2.5 8zM24 40l3-5.5" />,
  /** Agent evaluator: a dial. */
  Gauge: <path d="M18.5 40.5a5.5 5.5 0 0 1 11 0M24 40.5l2.5-3.5M18.5 40.5h11" />,
  /** Platform guide: a compass. */
  Wayfinder: (
    <>
      <path d="M19.5 37a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0" />
      <path d="M24 33.8l1.4 3.2-1.4 3.2-1.4-3.2z" fill="currentColor" />
    </>
  ),

  // Product
  /** Product manager: a signpost. */
  Roadmap: <path d="M24 41v-8M20 33.8h8l1.5 1.3-1.5 1.3h-8zM28 38.2h-8l-1.5 1.1 1.5 1.1" />,
  /** Business analyst: crop marks, the edges of a case. */
  Edgecase: <path d="M18.5 37.5v-4h4M29.5 37v4h-4" />,
  /** Program manager: Gantt bars. */
  Gantt: <path d="M18 34h6M21.5 37.3h6M25.5 40.6h5" />,
  /** UX designer: pixels. */
  Pixel: (
    <path
      d="M19.5 33.5h3v3h-3zM25.5 33.5h3v3h-3zM22.5 36.5h3v3h-3zM19.5 39.5h3v1.5h-3zM25.5 39.5h3v1.5h-3z"
      fill="currentColor"
      stroke="none"
    />
  ),
  /** Research analyst: a magnifier. */
  Scout: <path d="M19.5 36.5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M24.7 38.7l3.3 2.8" />,

  // Architecture
  /** Software architect: a set square. */
  Blueprint: <path d="M18.5 41v-8l8 8zM20.5 38.5v1h1" />,
  /** Data architect: a database. */
  Schema: (
    <path d="M19 34.5a5 1.5 0 1 0 10 0a5 1.5 0 1 0 -10 0M19 34.5v5a5 1.5 0 0 0 10 0v-5M19 37a5 1.5 0 0 0 10 0" />
  ),
  /** Security architect: a shield. */
  Bastion: <path d="M24 33l5 1.8v2.4c0 2.2-2 3.6-5 4.3-3-.7-5-2.1-5-4.3v-2.4z" />,

  // Engineering
  /** Software engineer: a lightning bolt. */
  Bolt: <path d="M25.5 32.8l-4.8 5h3l-1.2 3.6 4.8-5h-3z" fill="currentColor" />,
  /** Platform engineer: a shipping container. */
  Rigger: <path d="M18 34.5h12v6h-12zM21 34.5v6M24 34.5v6M27 34.5v6" />,
  /** SRE: an arrow pointing up, staying up. */
  Uptime: (
    <path d="M19.5 37a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0M24 39.5v-5M21.8 36.6l2.2-2.2 2.2 2.2" />
  ),
  /** Data and ML engineer: a small network. */
  Tensor: (
    <>
      <path d="M19.5 34.5h9M19.5 40.5h9M19.5 34.5l9 6M19.5 40.5l9-6" />
      {dot(19.5, 34.5, 1.6)}
      {dot(19.5, 40.5, 1.6)}
      {dot(28.5, 34.5, 1.6)}
      {dot(28.5, 40.5, 1.6)}
    </>
  ),
  /** Maintenance engineer: a spanner. */
  Wrench: (
    <path
      transform="translate(19.6 32.6) scale(0.375)"
      strokeWidth="4.8"
      d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
    />
  ),

  // Quality
  /** QA lead: a checklist. */
  Checkpoint: <path d="M19 34.5l1 1 2-2M24.5 34.5h5M19 39l1 1 2-2M24.5 39h5" />,
  /** Test author: a test tube. */
  Probe: <path d="M21.8 33h4.4M22.5 33v6.5a1.5 1.5 0 0 0 3 0v-6.5M22.5 37h3" />,
  /** Code reviewer: lines of code with a wavy red-pen mark. */
  Redline: <path d="M18 34h12M18 36.8h8M17.5 40c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 2.5-1.4 4 0" />,
  /** Validation engineer: a check. */
  Verity: <path d="M19 37.2l3.2 3.2 6.5-6.5" strokeWidth="2.4" />,
  /** Exploratory tester: binoculars. */
  Rover: (
    <path d="M18.5 38.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M24.5 38.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M21 36v-2.5h6v2.5" />
  ),
  /** Triage engineer: sorting arrows. */
  Sorter: <path d="M20.5 33.5v7M18.5 38.5l2 2 2-2M27.5 40.5v-7M25.5 35.5l2-2 2 2" />,
  /** Load tests: fast-forward chevrons. */
  Throttle: <path d="M18 34l3 3-3 3M23 34l3 3-3 3M28 34l2.5 3-2.5 3" />,
  /** Accessibility scans: the accessibility figure. */
  Ramp: (
    <>
      {dot(24, 33.6)}
      <path d="M19.5 35.8h9M24 35.8v2.7M24 38.5l-2.2 2.7M24 38.5l2.2 2.7" />
    </>
  ),

  // Security
  /** Adversarial tester: teeth. */
  Gremlin: <path d="M17.5 35l2.2 4.5 2.2-4.5 2.1 4.5 2.1-4.5 2.2 4.5 2.2-4.5" />,
  /** Privacy reviewer: an eye, struck through. */
  Veil: <path d="M17.5 37c3-4 10-4 13 0-3 4-10 4-13 0zM19.5 41l9-8" />,
  /** Secret and dependency scans: a padlock. */
  Sentry: <path d="M19.5 37.3h9v4h-9zM21.5 37.3v-1.6a2.5 2.5 0 0 1 5 0v1.6" />,
  /** Bill of materials: a manifest. */
  Manifest: <path d="M20 33.2h8v8h-8zM21.8 35.3h4.4M21.8 37.2h4.4M21.8 39.1h2.6" />,

  // Release and operations
  /** Release manager: a rocket. */
  Liftoff: (
    <path d="M24 32.8c2 1.6 2.6 4.2 2 6.7h-4c-.6-2.5 0-5.1 2-6.7zM22 37.8l-1.8 2.8h1.8M26 37.8l1.8 2.8h-1.8M24 41.3v0" />
  ),
  /** Incident responder: a siren light. */
  Siren: <path d="M20.5 40.5v-3a3.5 3.5 0 0 1 7 0v3M19 40.8h10M17.5 34.6l1.5.9M30.5 34.6l-1.5.9" />,
  /** FinOps: a cost trend. */
  Penny: <path d="M17.5 40.5l4-3.5 3 2 5.5-5M27 33.8h3v3" />,

  // Knowledge
  /** Technical writer: a quill. */
  Quill: <path d="M19 41c1-5 5-8 10-8-.5 4.5-4 8-9 8zM19 41l5.5-5.5" />,
  /** Knowledge librarian: an archive box. */
  Archive: <path d="M18.5 33.5h11v2.3h-11zM19.5 35.8v5.2h9v-5.2M22.5 38h3" />,
  /** Documentation auditor: a page with a margin. */
  Margin: <path d="M19.5 33.2h9v8h-9zM22.5 33.2v8M24.5 35.6h2.5M24.5 37.6h2.5" />,

  // Ideation
  /** Ideation lead: a light bulb. */
  Spark: <path d="M21.5 38.8a3.6 3.6 0 1 1 5 0v1.2h-5zM22.5 41.4h3" />,
  /** Market analyst: a radar sweep. */
  Radar: (
    <>
      <path d="M18.5 41a5.5 5.5 0 0 1 11 0M21.5 41a2.5 2.5 0 0 1 5 0M24 41l3.5-5" />
      {dot(21, 36.8, 1)}
    </>
  ),
  /** Feasibility engineer: a flask. */
  Tinker: <path d="M22.3 33h3.4M23 33v3l-3.6 5h9.2l-3.6-5v-3M21 38.8h6" />,
  /** Cost analyst: an abacus. */
  Abacus: (
    <>
      <path d="M18.5 33.5v7.5M29.5 33.5v7.5M18.5 35.5h11M18.5 39h11" />
      {dot(21, 35.5)}
      {dot(23.5, 35.5)}
      {dot(26.5, 39)}
    </>
  ),
  /** Devil's advocate: a question mark. */
  Skeptic: (
    <>
      <path d="M21.5 35.2a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1 1-1.1 1.7" />
      {dot(24, 41.2, 1.1)}
    </>
  ),
  /** Operations and logistics: a truck. */
  Logistix: (
    <>
      <path d="M17.5 34.5h8v5h-8zM25.5 36.5h3l1.8 1.8v1.2h-4.8" />
      {dot(20, 40.5, 1.3)}
      {dot(27.5, 40.5, 1.3)}
    </>
  ),
  /** Legal flagger: scales. */
  Clause: <path d="M24 33.5v7M20.5 41h7M19 35h10M19 35l-1.6 3h3.2zM29 35l-1.6 3h3.2z" />,
  /** User researcher: a person. */
  Persona: <path d="M22 35a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M19.5 41.2a4.5 3.6 0 0 1 9 0" />,

  // Maintenance
  /** Maintenance lead: a broom. */
  Custodian: (
    <path d="M24 32.8v4.2M20.8 37h6.4l1.6 4.3h-9.6zM22.4 41.3l.4-2M24 41.3v-2M25.6 41.3l-.4-2" />
  ),
  /** Bug hunter: a beetle. */
  Beetle: (
    <path d="M21 38a3 3.3 0 1 0 6 0a3 3.3 0 1 0 -6 0M24 34.7v6.6M21 37h-2M27 37h2M21.3 39.6l-1.8 1M26.7 39.6l1.8 1M22.6 35l-1-1.6M25.4 35l1-1.6" />
  ),
  /** Patch updates: a bandage. */
  Patch: (
    <>
      <path
        d="M18.6 39.4l7.8-6.8a2 2 0 0 1 2.6 3l-7.8 6.8a2 2 0 0 1-2.6-3z"
        transform="translate(0 -1)"
      />
      {dot(24, 37, 0.8)}
    </>
  ),
  /** Profiling: a turning arrow. */
  Torque: <path d="M27.8 35.3a4 4 0 1 0 .6 3.5M28 32.8v2.6h-2.6" />,
  /** Code health trends: a thermometer. */
  Vitals: <path d="M23 34v4.3a2.2 2.2 0 1 0 2 0v-4.3a1 1 0 0 0-2 0zM24 38.6v-2.4" />,
};

/** The mark on an employee's face, or nothing for a face without one. */
export function Emblem({ name }: { name: string }) {
  const mark = EMBLEMS[name];
  if (!mark) return null;
  return (
    <svg className="avatar-emblem" viewBox="0 0 48 48" aria-hidden="true">
      {mark}
    </svg>
  );
}
