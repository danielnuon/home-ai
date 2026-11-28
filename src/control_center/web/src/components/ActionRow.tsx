/**
 * @file The list row and the card every managed list is built from (spec 7.15, pattern catalog;
 * 7.16, rule 1).
 *
 * `ActionRow` is a row with a title, a muted line, a status and a chevron when it opens something.
 * Swipe it right for its main action and left for the secondary one; with a pointer the same two
 * sit on the row as labelled buttons. Its "…" button, right-click and press-and-hold open the
 * menu, which lists every action including the two swipes. `ActionCard` is the same for a card,
 * where right is acknowledge and left is snooze (7.14, "Gestures").
 *
 * Areas building a list use these rather than a bare `.list-row`, so every list behaves the same.
 * See docs/engineering/interaction-patterns.md.
 */
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { StatusLabel } from "../api/types";
import { StatusText } from "../design/status";
import { useMoreMenu, type MoreAction } from "./MoreMenu";
import { Swipeable, type SwipeAction } from "./Swipe";

interface Actions {
  /** Swipe right, or the first labelled button: the main action. */
  start?: SwipeAction;
  /** Swipe left, or the second labelled button: the secondary action. */
  end?: SwipeAction;
  /** Everything the item offers, in the "…" menu. Include the swipe actions here too. */
  more?: MoreAction[];
}

interface ActionRowProps extends Actions {
  title: string;
  meta?: string;
  status?: StatusLabel | null;
  /** Where pressing the row goes; it then shows a chevron. */
  href?: string | null;
  /** What pressing the row opens in place, such as its sheet; it then shows a chevron too. */
  onOpen?: () => void;
  /** Something before the title, such as an avatar or icon. */
  leading?: ReactNode;
}

/** The "…" menu, its button and its right-click and hold handlers, when the item has a menu. */
function useItemMenu(actions: MoreAction[] | undefined, label: string) {
  const { triggerProps, button, menu } = useMoreMenu(actions ?? [], label);
  const has = Boolean(actions?.length);
  return {
    trigger: has ? triggerProps : {},
    control: has ? (
      <>
        {button}
        {menu}
      </>
    ) : null,
  };
}

/**
 * A managed list row.
 *
 * @param props - What it says, where it goes, and its actions.
 * @returns The row.
 */
export function ActionRow({
  title,
  meta,
  status,
  href,
  onOpen,
  leading,
  start,
  end,
  more,
}: ActionRowProps) {
  const { trigger, control } = useItemMenu(more, title);
  const body = (
    <>
      {leading}
      <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="row-title">{title}</span>
        {meta && <span className="muted small">{meta}</span>}
      </span>
      {status && <StatusText value={status} className="small" />}
      {(href || onOpen) && <ChevronRight size={16} className="muted" aria-hidden="true" />}
    </>
  );
  return (
    <Swipeable start={start} end={end}>
      <div className="action-row" {...trigger}>
        {href ? (
          <Link to={href} className="list-row">
            {body}
          </Link>
        ) : onOpen ? (
          <button type="button" className="list-row" onClick={onOpen}>
            {body}
          </button>
        ) : (
          <div className="list-row">{body}</div>
        )}
        {control}
      </div>
    </Swipeable>
  );
}

interface ActionCardProps extends Actions {
  /** What the card is, for the "…" button's name. */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * A card that can be swiped right to acknowledge and left to snooze, with a "…" menu.
 *
 * @param props - The card's name, its actions and what it shows.
 * @returns The card.
 */
export function ActionCard({ label, start, end, more, className = "", children }: ActionCardProps) {
  const { trigger, control } = useItemMenu(more, label);
  return (
    <Swipeable start={start} end={end} variant="card" className={`card action-card ${className}`}>
      <div className="action-card-body" {...trigger}>
        <div className="grow">{children}</div>
        {control}
      </div>
    </Swipeable>
  );
}
