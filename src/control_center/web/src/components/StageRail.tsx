/**
 * @file A pipeline's stages as a rail of marks (spec 7.12; 7.13, "Stage rails").
 *
 * Done stages carry a check, the current one breathes, the rest are open circles: the same
 * ✓ ● ○ the Discord embeds use, so the two front ends read alike.
 */
import type { Stage } from "../api/types";

const MARK: Record<Stage["state"], string> = { done: "✓", current: "●", todo: "○" };
const WORD: Record<Stage["state"], string> = { done: "done", current: "now", todo: "to do" };

/** Stage codes with their state, left to right. */
export function StageRail({ stages }: { stages: Stage[] }) {
  return (
    <ol className="stage-rail" aria-label="Stages">
      {stages.map((stage) => (
        <li key={stage.code} className={`stage stage-${stage.state}`}>
          <span aria-hidden="true">{MARK[stage.state]}</span> {stage.code}
          <span className="visually-hidden">, {WORD[stage.state]}</span>
        </li>
      ))}
    </ol>
  );
}
