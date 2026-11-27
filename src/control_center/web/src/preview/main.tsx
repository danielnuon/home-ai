/**
 * @file Entry point of the in-browser preview: the same app on the same mock data as the server,
 * with the mock backend running in the page (`make preview`).
 *
 * Differences from `main.tsx`, and only these: the API is answered in the page, there is no
 * service worker, and routing is in memory, with the page's name mirrored in the address's hash
 * (`#approvals`) so a link or a reload opens the same page. The preview's host passes only plain
 * hash names, so query strings stay in memory, and Settings is `#more` because the host reserves
 * `#settings`.
 */
import "../styles";
import "./preview.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter } from "react-router-dom";
import { App, ROUTE_TREE } from "../App";
import { installMockServer } from "./install";

const HASH_FOR: Record<string, string> = { "/": "today", "/settings": "more" };
const PATH_FOR: Record<string, string> = { today: "/", more: "/settings" };

const pathFromHash = (hash: string) => {
  const name = hash.replace(/^#/, "");
  return name ? (PATH_FOR[name] ?? `/${name}`) : "/";
};

const hashFromPath = (path: string) => HASH_FOR[path] ?? path.replace(/^\//, "").split("/")[0];

function makeRouter() {
  const router = createMemoryRouter(ROUTE_TREE, {
    initialEntries: [pathFromHash(location.hash)],
  });
  router.subscribe(({ location: at }) => {
    const hash = `#${hashFromPath(at.pathname) ?? ""}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  });
  window.addEventListener("hashchange", () => {
    const path = pathFromHash(location.hash);
    if (router.state.location.pathname !== path) void router.navigate(path);
  });
  return router;
}

installMockServer();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App makeRouter={makeRouter} />
    </StrictMode>,
  );
}
