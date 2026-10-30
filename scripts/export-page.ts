import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderPage } from "../src/web/page.ts";
import { APP_VERSION } from "../src/core/version.ts";

/**
 * Emits the hosted copy of the WebUI as one static HTML file (S-139).
 * Default target docs/app.html: GitHub Pages serves main/docs, and
 * no-frontmatter HTML passes through Jekyll verbatim. The embedded copy
 * served by `--web` stays live-rendered — both come from this one source.
 */
const out = resolve(process.argv[2] ?? "docs/app.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, renderPage(APP_VERSION, undefined, undefined, undefined, { hosted: true }) + "\n");
console.log(`exported hosted page (${APP_VERSION}) → ${out}`);
