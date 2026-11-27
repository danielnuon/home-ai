/**
 * @file The frame around every page: navigation for the current layout, global banners, the
 * search field, and the page itself.
 */
import { Search } from "lucide-react";
import { Suspense, useState, type FormEvent } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ARRIVE, m } from "../design/motion";
import { useLayout } from "../design/useLayout";
import { Banners } from "./Banners";
import { Sidebar, TabBar } from "./Navigation";
import { useScrollMemory } from "./scroll";

/** "Search or ask Wayfinder": opens Search with the words typed. */
function SearchField() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) navigate(`/search?q=${encodeURIComponent(text.trim())}`);
  };
  return (
    <form role="search" className="search-field" onSubmit={submit}>
      <Search size={16} className="muted" aria-hidden="true" />
      <input
        className="grow"
        type="search"
        aria-label="Search or ask Wayfinder"
        placeholder="Search or ask Wayfinder"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </form>
  );
}

/**
 * Each page rises in when you arrive (spec 7.14, "nothing pops in"). Keyed by the path only, so a
 * filter or a chosen lead in the query string updates in place rather than replaying it. Opacity
 * and transform only, so it never costs a layout per frame.
 */
function PageArrival() {
  const { pathname } = useLocation();
  return (
    <m.div key={pathname} className="page-arrival" {...ARRIVE}>
      <Outlet />
    </m.div>
  );
}

/** The app frame for the current layout. */
export function AppShell() {
  const layout = useLayout();
  useScrollMemory();
  return (
    <div className={`shell shell-${layout}`}>
      {layout === "desktop" && <Sidebar />}
      {layout === "tablet" && <Sidebar rail />}
      <main className="content">
        <Banners />
        <SearchField />
        <Suspense fallback={<div className="loading" aria-busy="true" />}>
          <PageArrival />
        </Suspense>
      </main>
      {layout === "phone" && <TabBar />}
    </div>
  );
}
