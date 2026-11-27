/**
 * @file Where Back goes (spec 7.16, rule 14; decision 127). Every page opened from inside a page,
 * such as Live from Today's Live widget, remembers the page it was opened from, and its header
 * shows a Back button named after that page. A page chosen in the navigation starts a new trail,
 * so it shows none. Changing a filter or opening an item on the same page stays on the same step:
 * Back still names the page before it and skips the in-page steps on the way.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { NavigationType, useLocation, useNavigationType, type Location } from "react-router-dom";
import { ROUTES } from "../routes";

/** The page Back returns to, and how many history entries away it is. */
export interface BackTarget {
  label: string;
  steps: number;
}

const TrailContext = createContext<BackTarget | null>(null);

/** Whether a link came from the navigation itself, which starts a new trail. */
export const FROM_NAV = { fromNav: true };

/** A page's name from its path: the longest route the path sits under. */
function labelOf(pathname: string): string {
  const match = ROUTES.filter(
    (page) => pathname === page.path || (page.path !== "/" && pathname.startsWith(`${page.path}/`)),
  ).sort((a, b) => b.path.length - a.path.length)[0];
  return match?.label ?? "Back";
}

/** Each history entry's Back target, by entry key, and the entry shown last. */
const trail = new Map<string, BackTarget | null>();
const shown: { current: Location | null } = { current: null };

/** The Back target of an entry that was just reached, from the entry shown before it. */
function targetFor(location: Location, type: NavigationType, from: Location | null) {
  if (!from || type === NavigationType.Pop) return null;
  const before = trail.get(from.key) ?? null;
  if (type === NavigationType.Replace) return before;
  if ((location.state as { fromNav?: boolean } | null)?.fromNav) return null;
  if (from.pathname !== location.pathname) return { label: labelOf(from.pathname), steps: 1 };
  return before && { label: before.label, steps: before.steps + 1 };
}

/** Works out each history entry's Back target as it is reached, and keeps it for when it returns. */
export function TrailProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const type = useNavigationType();
  if (!trail.has(location.key)) trail.set(location.key, targetFor(location, type, shown.current));
  useEffect(() => {
    shown.current = location;
  }, [location]);
  return (
    <TrailContext.Provider value={trail.get(location.key) ?? null}>
      {children}
    </TrailContext.Provider>
  );
}

/** Where Back goes from the current page, or null when the page starts its own trail. */
export function useBackTarget(): BackTarget | null {
  return useContext(TrailContext);
}
