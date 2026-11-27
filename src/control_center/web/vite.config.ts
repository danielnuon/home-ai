/**
 * @file Vite configuration for Brain's front end.
 *
 * In development Vite serves the app and forwards `/api` to the FastAPI server on 8406, so the
 * browser sees one origin, as it will behind `tailscale serve`. In production FastAPI serves the
 * built files itself (see `control_center/app.py`).
 *
 * `vite build --mode preview` builds the in-browser preview instead: the same app with its mock
 * backend in the page, every asset inlined, in one file (`scripts/build-preview.mjs`).
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const BRAIN_SERVER = process.env.BRAIN_SERVER ?? "http://127.0.0.1:8406";

const PREVIEW_BUILD = {
  outDir: "dist-preview",
  // One self-contained page: fonts and images as data URIs, one script, one style sheet.
  assetsInlineLimit: () => true,
  cssCodeSplit: false,
  sourcemap: false,
  chunkSizeWarningLimit: 2000,
  rollupOptions: { input: "preview.html", output: { inlineDynamicImports: true } },
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  publicDir: mode === "preview" ? false : "public",
  server: {
    port: 5173,
    proxy: { "/api": { target: BRAIN_SERVER, changeOrigin: false } },
  },
  build:
    mode === "preview"
      ? PREVIEW_BUILD
      : {
          // The strict CSP (spec 7.6) forbids inline scripts, so nothing may be inlined as a data URI.
          assetsInlineLimit: 0,
          sourcemap: false,
          // The main chunk (React, the router, Motion) is just over 500 KB before compression.
          chunkSizeWarningLimit: 600,
        },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    css: false,
  },
}));
