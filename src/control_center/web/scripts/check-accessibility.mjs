/**
 * @file Runs axe-core on every page in a real browser, in Day and Night and at phone and desktop
 * widths, and fails on any WCAG 2.2 AA violation, colour contrast included (spec 17.16).
 *
 * jsdom can't compute colour, so the unit tests can't check contrast; this script can. It expects
 * Brain to be serving the built app on mock backends at BRAIN_URL (`make a11y` starts one).
 * Pages come from the sidebar, so a new page is checked as soon as it is in the navigation.
 */
/* global window, document -- the axe.run callback below runs in the page, not in Node */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const BASE = process.env.BRAIN_URL ?? "http://127.0.0.1:8406";
const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve("axe-core"), "utf8");
const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Pages reachable from search or a link rather than the sidebar. */
const UNLISTED = ["/voice", "/search?q=patel"];

const THEMES = /** @type {const} */ (["light", "dark"]);
const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

/** Collects every sidebar link from the desktop layout. */
async function pagePaths(browser) {
  const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const links = await page.$$eval("nav a.nav-item", (anchors) =>
    anchors.map((anchor) => new URL(anchor.href).pathname),
  );
  await page.close();
  return [...new Set([...links, ...UNLISTED])];
}

/** Opens `path` in one theme and width, waits for data, and returns axe's violations. */
async function scan(context, path) {
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  // Lazy pages show a placeholder until their chunk and data arrive.
  await page.waitForSelector("main h1", { timeout: 10_000 });
  await page.addScriptTag({ content: AXE_SOURCE });
  const violations = await page.evaluate(
    (tags) =>
      window.axe
        .run(document, { runOnly: { type: "tag", values: tags } })
        .then((results) => results.violations),
    WCAG_AA,
  );
  await page.close();
  return violations;
}

/** Prints one violation with the elements it found, a few at most. */
function report(where, violation) {
  process.stderr.write(`\n✗ ${where}: ${violation.id} (${violation.impact}) ${violation.help}\n`);
  for (const node of violation.nodes.slice(0, 5)) {
    process.stderr.write(
      `    ${node.target.join(" ")}\n      ${node.failureSummary.split("\n").join("\n      ")}\n`,
    );
  }
}

const browser = await chromium.launch();
let failures = 0;
const paths = await pagePaths(browser);
for (const colorScheme of THEMES) {
  for (const [width, viewport] of Object.entries(VIEWPORTS)) {
    // bypassCSP lets the axe script in; Brain's policy rightly refuses inline scripts.
    const context = await browser.newContext({
      colorScheme,
      viewport,
      reducedMotion: "reduce",
      bypassCSP: true,
    });
    for (const path of paths) {
      const violations = await scan(context, path);
      violations.forEach((violation) => report(`${path} ${colorScheme} ${width}`, violation));
      failures += violations.length;
    }
    await context.close();
  }
}
await browser.close();

process.stdout.write(
  `Checked ${paths.length} pages × ${THEMES.length} themes × ${Object.keys(VIEWPORTS).length} widths: ${failures} violations.\n`,
);
if (failures > 0) process.exit(1);
