/**
 * @file The three navigation layouts (spec 7.12): a full sidebar on desktop, a slim rail of icons
 * and labels on a tablet, and a bottom tab bar on a phone.
 *
 * Pressing the page you are already on works the way a phone's tab bar does (spec 7.16, rule 14):
 * from a filtered or deeper view it goes back to the page itself, from partway down it glides to
 * the top, and at the top it refreshes what the page shows.
 */
import { useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { usePlatform } from "../api/queries";
import type { StatusLabel } from "../api/types";
import { ROUTES, TAB_PATHS, type PageRoute } from "../routes";
import { useToast } from "../components/Toasts";
import { scroller, scrollToTop } from "./scroll";
import { StopControl } from "./StopControl";

const NAV_ROUTES = ROUTES.filter((page) => page.inNav);

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
    if (location.search) navigate(path);
    else if (scroller().scrollTop > 0) scrollToTop();
    else {
      void client.invalidateQueries();
      toast({ message: "Refreshed" });
    }
  };
}

/** One navigation link with its icon, label and badge. */
function NavItem({ page, badges }: { page: PageRoute; badges: Record<string, StatusLabel> }) {
  const Icon = page.icon;
  const reselect = useReselect(page.path);
  return (
    <NavLink to={page.path} end={page.path === "/"} className="nav-item" onClick={reselect}>
      <Icon size={18} aria-hidden="true" />
      <span className="nav-label">{page.label}</span>
      <Badge value={page.badge ? badges[page.badge] : undefined} />
    </NavLink>
  );
}

function useBadges(): Record<string, StatusLabel> {
  return (usePlatform().data?.badges ?? {}) as Record<string, StatusLabel>;
}

/** The desktop sidebar, or the tablet rail when `rail` is set. */
export function Sidebar({ rail = false }: { rail?: boolean }) {
  const badges = useBadges();
  return (
    <nav className={rail ? "rail" : "sidebar"} aria-label="Main">
      <span className="brand">Brain</span>
      <div className="nav-items">
        {NAV_ROUTES.map((page) => (
          <NavItem key={page.path} page={page} badges={badges} />
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
          <NavItem key={page.path} page={{ ...page, label: "More" }} badges={badges} />
        ) : (
          <NavItem key={page.path} page={page} badges={badges} />
        ),
      )}
    </nav>
  );
}
