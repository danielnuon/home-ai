/**
 * @file Entry point: fonts, styles, the service worker, and the app.
 */
import "./styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

/**
 * The service worker caches the app shell so Brain opens instantly on the phone (spec 7.17). It is
 * off in development, where it would serve stale code.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js");
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
