/**
 * @file Entry point of the in-browser preview: the same app on the same mock data as the server,
 * with the mock backend running in the page (`make preview`).
 *
 * Differences from `main.tsx`, and only these: the API is answered in the page, there is no
 * service worker, and routing is in memory, with the page's name mirrored in the address's hash
 * (`#approvals`) so a link or a reload opens the same page, and each page a browser history entry
 * so Back returns to the page before. The preview's host passes only plain hash names, so query
 * strings stay in memory, and Settings is `#more` because the host reserves `#settings`.
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

/** Where the app is, as kept in each browser history entry so Back can find it again. */
interface Entry {
  path: string;
  index: number;
}

const entryOf = (state: unknown): Entry | null =>
  state && typeof state === "object" && "index" in state ? (state as Entry) : null;

/**
 * Mirrors the in-memory history into the browser's, one entry per page, so the browser's or the
 * phone's Back walks the app's own history: each entry keeps the full path, query included, and
 * its position, and going back or forward moves the app by the same number of steps.
 */
function mirrorHistory(router: ReturnType<typeof createMemoryRouter>) {
  // After a reload the browser still holds earlier entries the in-memory history has lost, so
  // the app counts on from where the browser is, and only steps within what it knows.
  let index = entryOf(history.state)?.index ?? 0;
  let low = index;
  let high = index;
  let recorded = false;
  const full = () => router.state.location.pathname + router.state.location.search;
  const hashOf = () => `#${hashFromPath(router.state.location.pathname)}`;
  history.replaceState({ path: full(), index } satisfies Entry, "", hashOf());

  router.subscribe((state) => {
    if (state.historyAction === "POP" || recorded) {
      recorded = false;
      return;
    }
    if (state.historyAction === "PUSH") {
      index += 1;
      high = index;
    }
    const write = state.historyAction === "PUSH" ? history.pushState : history.replaceState;
    write.call(history, { path: full(), index } satisfies Entry, "", hashOf());
  });

  window.addEventListener("popstate", (event) => {
    const entry = entryOf(event.state);
    if (entry && entry.index >= low && entry.index <= high) {
      const delta = entry.index - index;
      index = entry.index;
      if (delta !== 0) void router.navigate(delta);
      return;
    }
    if (entry) {
      // An entry from before a reload: open its page, keeping the browser's entry as it is.
      index = low = high = entry.index;
      recorded = true;
      void router.navigate(entry.path, { replace: true });
      return;
    }
    // A hash typed or linked by hand: the browser made the entry, so take it over.
    index += 1;
    high = index;
    recorded = true;
    const path = pathFromHash(location.hash);
    history.replaceState({ path, index } satisfies Entry, "", location.hash);
    void router.navigate(path);
  });
}

function makeRouter() {
  const router = createMemoryRouter(ROUTE_TREE, {
    initialEntries: [pathFromHash(location.hash)],
  });
  mirrorHistory(router);
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
