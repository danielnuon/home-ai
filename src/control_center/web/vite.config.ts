/**
 * @file Vite configuration for Brain's front end.
 *
 * In development Vite serves the app and forwards `/api` to the FastAPI server on 8406, so the
 * browser sees one origin, as it will behind `tailscale serve`. In production FastAPI serves the
 * built files itself (see `control_center/app.py`).
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const BRAIN_SERVER = process.env.BRAIN_SERVER ?? "http://127.0.0.1:8406";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: BRAIN_SERVER, changeOrigin: false } },
  },
  build: {
    // The strict CSP (spec 7.6) forbids inline scripts, so nothing may be inlined as a data URI.
    assetsInlineLimit: 0,
    sourcemap: false,
    // three.js alone is about 520 KB before compression; it is lazy and loads only on Today and Live.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    css: false,
  },
});
