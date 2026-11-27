/**
 * @file Turns the preview build (`vite build --mode preview`) into one page with nothing to fetch:
 * the style sheet and the script go inline, and the document's own tags are dropped, because the
 * host that shows the preview wraps the page in its own document.
 *
 * Usage: node scripts/build-preview.mjs <output.html>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist-preview/", import.meta.url).pathname;
const html = readFileSync(join(DIST, "preview.html"), "utf8");

const asset = (pattern) => {
  const found = html.match(pattern);
  if (!found) throw new Error(`The preview build has no ${pattern}`);
  return readFileSync(join(DIST, found[1].replace(/^\.?\//, "")), "utf8");
};
const script = asset(/<script type="module" crossorigin src="([^"]+)"/);
const style = asset(/<link rel="stylesheet" crossorigin href="([^"]+)"/);

// A literal "</script" or "</style" inside the code would end its element early.
const safe = (text, tag) => text.replaceAll(`</${tag}`, `<\\/${tag}`);

const page = [
  "<title>Brain preview</title>",
  `<style>${safe(style, "style")}</style>`,
  '<div id="root"></div>',
  `<script type="module">${safe(script, "script")}</script>`,
  "",
].join("\n");

const output = process.argv[2];
if (!output) throw new Error("Give the output path.");
writeFileSync(output, page);
process.stdout.write(`${(page.length / 1024).toFixed(0)} KB  ${output}\n`);
