/**
 * @file Fails the build when the JavaScript loaded on first paint exceeds the budget in spec 7.17
 * (250 KB compressed). Lazy page chunks and three.js are not counted: they load on demand.
 *
 * Reads Vite's manifest-free output by following `index.html`'s module script and its static
 * `modulepreload` links, which is exactly what the browser fetches before first paint.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url).pathname;
const BUDGET_BYTES = 250 * 1024;

const html = readFileSync(join(DIST, "index.html"), "utf8");
// Pulls the asset path out of each script or preload tag, for example
//   <script type="module" crossorigin src="/assets/index-5AnqfCoA.js">  ->  assets/index-5AnqfCoA.js
//   <link rel="modulepreload" href="/assets/vendor-B2x9.js">            ->  assets/vendor-B2x9.js
// Stylesheets (.css) and fonts don't match because the path must end in ".js".
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
  (match) => match[1],
);
const sizes = initial.map((file) => [file, gzipSync(readFileSync(join(DIST, file))).length]);
const total = sizes.reduce((sum, [, size]) => sum + size, 0);

for (const [file, size] of sizes) {
  process.stdout.write(`${(size / 1024).toFixed(1).padStart(7)} KB  ${file}\n`);
}
process.stdout.write(
  `${(total / 1024).toFixed(1).padStart(7)} KB  initial JavaScript, gzipped (budget 250 KB)\n`,
);
if (total > BUDGET_BYTES) {
  process.stderr.write("Initial JavaScript is over budget (spec 7.17).\n");
  process.exit(1);
}
