/**
 * @file The three navigation layouts (spec 7.12): a full sidebar on desktop, a slim rail of icons
 * and labels on a tablet, and a bottom tab bar on a phone.
 *
 * Pressing the page you are already on works the way a phone's tab bar does (spec 7.16, rule 14):
 * from a filtered or deeper view it goes back to the page itself, from partway down it glides to
 * the top, and at the top it refreshes what the page shows.
 *
 * The page you are on is marked three ways, so it never rests on colour alone: a tinted pill sits
 * behind it, its icon draws heavier in the accent colour, and its label turns bold. The pill glides
 * from the old page to the new one (a shared layout move, transform only); with Reduce Motion it
 * simply appears in its new place.
 */
import { useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { usePlatform } from "../api/queries";
import type { StatusLabel } from "../api/types";
import { inNavigation, ROUTES, TAB_PATHS, type PageRoute } from "../routes";
import { useToast } from "../components/Toasts";
import { m } from "../design/motion";
import { scroller, scrollToTop } from "./scroll";
import { StopControl } from "./StopControl";
import { FROM_NAV } from "./trail";

/** A small count or mark beside a navigation label. */
function Badge({ value }: { value: StatusLabel | undefined }) {
  if (!value) return null;
  return <span className={`nav-badge status-${value.status}`}>{value.label}</span>;
}

/** What pressing the current page's own link does: back to the page, then to its top, then refresh. */
function useReselect(path: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  return (event: React.MouseEvent) => {
    if (location.pathname !== path) return;
    event.preventDefault();
    if (location.search) navigate(path, { state: FROM_NAV });
    else if (scroller().scrollTop > 0) scrollToTop();
    else {
      void client.invalidateQueries();
      toast({ message: "Refreshed" });
    }
  };
}

interface NavItemProps {
  page: PageRoute;
  badges: Record<string, StatusLabel>;
  /** Which bar the item is in; the active pill glides only within its own bar. */
  bar: "sidebar" | "tabs";
}

/** One navigation link with its icon, label and badge, and the pill when it is the current page. */
function NavItem({ page, badges, bar }: NavItemProps) {
  const Icon = page.icon;
  const reselect = useReselect(page.path);
  return (
    <NavLink
      to={page.path}
      state={FROM_NAV}
      end={page.path === "/"}
      className="nav-item"
      onClick={reselect}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <m.span
              layoutId={`nav-pill-${bar}`}
              className="nav-pill"
              aria-hidden="true"
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
            />
          )}
          <span className="nav-icon">
            <Icon
              size={bar === "tabs" ? 20 : 18}
              strokeWidth={isActive ? 2.5 : 2}
              aria-hidden="true"
            />
          </span>
          <span className="nav-label">{page.label}</span>
          <Badge value={page.badge ? badges[page.badge] : undefined} />
        </>
      )}
    </NavLink>
  );
}

function useBadges(): Record<string, StatusLabel> {
  return (usePlatform().data?.badges ?? {}) as Record<string, StatusLabel>;
}

/** The pages in the navigation now: optional pages show only while their feature is on. */
export function useNavRoutes(): PageRoute[] {
  const featuresOn = usePlatform().data?.features_on ?? [];
  return ROUTES.filter((page) => inNavigation(page, featuresOn));
}

/** The desktop sidebar, or the tablet rail when `rail` is set. */
export function Sidebar({ rail = false }: { rail?: boolean }) {
  const badges = useBadges();
  const pages = useNavRoutes();
  return (
    <nav className={rail ? "rail" : "sidebar"} aria-label="Main">
      <span className="brand">Brain</span>
      <div className="nav-items">
        {pages.map((page) => (
          <NavItem key={page.path} page={page} badges={badges} bar="sidebar" />
        ))}
      </div>
      <StopControl compact={rail} />
    </nav>
  );
}

/** The phone's bottom bar: Today, Work, Chat, Directory and More. */
export function TabBar() {
  const badges = useBadges();
  const tabs = ROUTES.filter((page) => TAB_PATHS.includes(page.path));
  return (
    <nav className="tab-bar" aria-label="Main">
      {tabs.map((page) =>
        page.path === "/settings" ? (
          <NavItem key={page.path} page={{ ...page, label: "More" }} badges={badges} bar="tabs" />
        ) : (
          <NavItem key={page.path} page={page} badges={badges} bar="tabs" />
        ),
      )}
    </nav>
  );
}
