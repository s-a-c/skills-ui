/**
 * Ported from vercel-labs/skills `src/web/page.ts` (MIT, branch dev/tui-webui)
 * — the web UI over the /api contract; import paths adjusted for skills-ui.
 */
import { createHash } from "node:crypto";
import {
  THEME_TOKENS,
  CATPPUCCIN_MOCHA,
  CATPPUCCIN_LATTE,
  type CatppuccinPalette,
  type ThemeTokens,
} from '../core/theme.ts';
import {
  DEFAULT_UI_PREFERENCES,
  LIST_WIDTH_MIN,
  LIST_WIDTH_MAX,
  type UiPreferences,
} from '../core/prefs.ts';
import { skillMatches } from '../core/index.ts';
import type { UiSeed } from '../core/seed.ts';
import { APP_CSS } from './styles.ts';
import { CLIENT_CORE_JS } from './client/core.ts';
import { buildClientInstalledJs } from './client/installed.ts';
import { CLIENT_SEARCH_AND_BOOT_JS } from './client/search-and-boot.ts';

export { skillMatches };

function cssVarsFor(tokens: ThemeTokens, palette: CatppuccinPalette): string {
  // Custom properties keep the token's camelCase: APP_CSS references
  // var(--t-primaryText) etc., and a kebab-mismatch would silently fall back
  // to inherited colors (the dark-mode contrast bug).
  const entries = Object.entries(tokens).map(([key, value]) => `  --t-${key}:${value};`);
  const accents = Object.entries(palette as unknown as Record<string, string>).map(
    ([key, value]) => `  --a-${key}:${value};`
  );
  return [...entries, ...accents].join('\n');
}

/** skillMatches' transpiled source, interpolated into APP_JS (S-164) — one
 *  definition, two surfaces; the parity test asserts the emitted page still
 *  carries this exact text. */
const SKILL_MATCHES_SRC = skillMatches.toString();

export const APP_JS = CLIENT_CORE_JS + buildClientInstalledJs(SKILL_MATCHES_SRC) + CLIENT_SEARCH_AND_BOOT_JS;

/** JSON for an inline <script> embed — `</script>` must never appear raw. */
function safeJsonEmbed(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** The deterministic bootstrap <script> body — one definition so the CSP
 *  hash and the emitted markup can never drift apart. */
function bootstrapScript(
  prefs?: UiPreferences,
  serverPort?: number,
  seed?: UiSeed
): string {
  return `window.__PREFS__ = ${safeJsonEmbed(prefs ?? DEFAULT_UI_PREFERENCES)};window.__PORT__ = ${serverPort ?? 0};window.__SEED__ = ${safeJsonEmbed(seed ?? { kind: "none" })};`;
}

/**
 * Content-Security-Policy for the rendered page (0.5.1 impl B): both inline
 * scripts are deterministic, so they are pinned by sha256 hash instead of
 * `unsafe-inline`. `frame-ancestors`/`nosniff` cannot be expressed in a
 * meta CSP — the embedded page gets them as real headers from serve; for
 * the hosted static page they are recorded accepted-risk.
 */
export function pageCspFor(
  prefs?: UiPreferences,
  serverPort?: number,
  seed?: UiSeed,
  hosted = false
): string {
  const hashes = [
    createHash("sha256").update(bootstrapScript(prefs, serverPort, seed)).digest("base64"),
    createHash("sha256").update(`\n${APP_JS}\n`).digest("base64"),
  ].map((h) => `'sha256-${h}'`);
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src ${hashes.join(" ")}`,
    "img-src data:",
    hosted ? "connect-src http://127.0.0.1:* http://localhost:*" : "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function renderPage(
  version: string,
  prefs?: UiPreferences,
  serverPort?: number,
  seed?: UiSeed,
  opts?: { hosted?: boolean }
): string {
  const initialPrefs: UiPreferences = prefs ?? DEFAULT_UI_PREFERENCES;
  const csp = pageCspFor(initialPrefs, serverPort, seed, !!opts?.hosted);
  const bootstrap = bootstrapScript(initialPrefs, serverPort, seed);
  return `<!doctype html>
<html lang="en" data-theme="${initialPrefs.theme}" data-motion="${String(initialPrefs.reduceMotion)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="description" content="skills-ui: browse, install, and update agent skills for coding agents from one dashboard.">
${opts?.hosted ? `<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
` : ""}<title>skills (${version})</title>
<style>
/* Hallmark · skills-ui web page · built: the project · depth: polish · genre: modern-minimal · theme: the project's own catppuccin tokens */
/* Hallmark · pre-emit critique: P3 H4 E4 S3 R4 V3 · weakest: S, a settings and registry dashboard could be any tool; this pass keeps the project's tokens and spacing instead of a re-theme */
/* Hallmark · re-space 24b: the 0.5.2 page-wide waiver is paid off · every padding/margin/gap sits on the 4px scale (S-181) · spacing values only; no color, type, or motion changes */
[data-theme="mocha"]{
${cssVarsFor(THEME_TOKENS.mocha, CATPPUCCIN_MOCHA)}
  --t-crust:${CATPPUCCIN_MOCHA.crust};
}
[data-theme="latte"]{
${cssVarsFor(THEME_TOKENS.latte, CATPPUCCIN_LATTE)}
  --t-crust:${CATPPUCCIN_LATTE.crust};
}
${APP_CSS}
</style>
</head>
<body>
<header>
  <div class="logo"><span class="mark">S</span> skills <span class="ver">${version}</span></div>
  <nav class="tabs" role="tablist">
    <button class="tab" role="tab" data-tab="installed" aria-selected="true">Installed</button>
    <button class="tab" role="tab" data-tab="search" aria-selected="false">Search</button>
  </nav>
  <div class="top-actions">
    <div class="scope-toggle" role="group" aria-label="Scope">
      <button data-scope="project" aria-pressed="true">Project</button>
      <button data-scope="global" aria-pressed="false">Global</button>
    </div>
    <button class="btn" id="checkUpdatesBtn">Check for updates</button>
    <button class="btn" id="updateAllBtn">Update all</button>
    <button class="btn primary" id="installQueueBtn" style="display:none">Install selected</button>
    <button class="btn primary" id="updateCheckedBtn" style="display:none">Update selected</button>
    <button class="btn danger" id="deleteCheckedBtn" style="display:none">Remove selected</button>
    <div id="healthWrap" style="display:none">
      <button class="btn btn-sm health-pill" id="healthPill" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="healthPop"><span class="health-dot"></span><span id="healthSummary">Health</span></button>
      <div id="healthPop" role="dialog" aria-label="Hub health details">
        <div id="healthPopStatus"></div>
        <ul id="healthDetails"></ul>
        <div class="row-actions">
          <button class="btn btn-sm" id="healthRefreshBtn" type="button">Refresh</button>
          <button class="btn btn-sm" id="healthCloseBtn" type="button">Close</button>
        </div>
      </div>
    </div>
    <button class="btn btn-icon" id="connectState" style="display:none" aria-pressed="false" title="Connect to your local skills-ui serve" aria-label="Connect to your local skills-ui serve"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
    <button class="btn btn-icon" id="themeToggle" aria-label="Switch theme" title="Switch theme"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.25v2.25M8 12.5v2.25M1.25 8h2.25M12.5 8h2.25M3.35 3.35l1.6 1.6M11.05 11.05l1.6 1.6M12.65 3.35l-1.6 1.6M4.95 11.05l-1.6 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button>
    <button class="btn btn-icon" id="settingsBtn" aria-haspopup="dialog" aria-label="Settings" title="Settings"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/><circle cx="10.5" cy="4" r="1.6" fill="currentColor" stroke="none"/><circle cx="5.5" cy="8" r="1.6" fill="currentColor" stroke="none"/><circle cx="8.5" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg></button>
  </div>
</header>

<div id="busyBar" style="display:none;padding:8px 20px;background:var(--t-surface);border-bottom:1px solid var(--t-border)">
  <span class="busy-dot"></span><span id="busyText"></span>
</div>

<main>
  <section id="listPane" aria-label="Installed skills">
    <div class="filter-row">
      <input id="filter" type="search" placeholder="Filter skills (name, description, or repo)…" aria-label="Filter skills by name, description, or repo">
      <input id="searchInput" type="search" placeholder="Search skills.sh: try “typescript”, “react”, “testing”…" aria-label="Search the skill registry" style="display:none">
      <div id="agentsWrap">
        <button class="btn" id="agentsBtn" aria-haspopup="true" title="Filter by agent (a)">Agents</button>
        <div id="agentsPop" role="dialog" aria-label="Filter by agent">
          <div id="agentsList"></div>
          <div class="row-actions">
            <button class="btn" id="agentsAll">All</button>
            <button class="btn" id="agentsClear">Clear</button>
            <button class="btn primary" id="agentsDone">Done</button>
          </div>
        </div>
      </div>
      <button class="btn" id="helpBtn" title="Keyboard shortcuts (?)">?</button>
    </div>
    <div class="sort-row">
      <span class="sort-label">Sort</span>
      <div class="seg" role="group" aria-label="Sort order">
        <button data-sort="checked" aria-pressed="true">Checked first</button>
        <button data-sort="name" aria-pressed="false">A to Z</button>
        <button data-sort="load" aria-pressed="false">Load order</button>
      </div>
    </div>
    <div class="prov-row" id="provRow">
      <span class="sort-label">Origin</span>
      <div class="seg" role="group" aria-label="Skill provenance filter">
        <button data-prov="all" aria-pressed="true">All</button>
        <button data-prov="locked" aria-pressed="false">Locked</button>
        <button data-prov="linked" aria-pressed="false">Linked</button>
        <button data-prov="local" aria-pressed="false">Local</button>
      </div>
    </div>
    <div class="list-head">
      <input type="checkbox" id="selectAllMaster" aria-label="Select all" title="Check every skill in the filtered list">
      <label for="selectAllMaster">Select all</label>
      <span id="selSummary" class="sel-summary">
        <span class="count"><b id="selCount">0</b> <span class="sel-word">selected</span></span>
        <button class="btn" id="clearCheckedBtn">Clear</button>
      </span>
    </div>
    <ul id="skillList" role="listbox" aria-label="Skills"></ul>
    <ul id="results" role="listbox" aria-label="Registry search results" style="display:none"></ul>
    <footer class="tip"><kbd>click</kbd> a skill for details · <kbd>Search</kbd> tab installs from skills.sh</footer>
  </section>
  <div id="listSplitter" role="separator" aria-orientation="vertical" aria-label="Resize skill list pane" tabindex="0" aria-valuemin="${LIST_WIDTH_MIN}" aria-valuemax="${LIST_WIDTH_MAX}" aria-valuenow="${initialPrefs.listWidth ?? 35}" title="Drag to resize list pane (double-click to reset)"></div>
  <section id="detailPane" aria-label="Skill details"></section>
</main>

<div id="scrim"></div>
<aside id="settings" role="dialog" aria-modal="true" aria-label="Settings">
  <button class="btn" id="settingsClose" aria-label="Close settings">✕</button>
  <h2>Settings</h2>
  <div class="setting">
    <label>Theme</label>
    <div class="seg" role="group" aria-label="Theme">
      <button data-theme-choice="mocha">Mocha (dark)</button>
      <button data-theme-choice="latte">Latte (light)</button>
    </div>
    <p class="hint hint-lines">
      <span>catppuccin mocha &amp; latte</span>
      <span>WCAG AA contrast</span>
      <span>light-theme accents darkened just enough to pass</span>
    </p>
  </div>
  <div class="setting">
    <label>Sound effects</label>
    <div class="seg" role="group" aria-label="Sound">
      <button data-sound-choice="on">On</button>
      <button data-sound-choice="off">Off</button>
    </div>
    <p class="hint">Subtle synthesized feedback. Preference is retained across sessions.</p>
  </div>
  <div class="setting">
    <label>Reduce motion</label>
    <div class="seg" role="group" aria-label="Reduce motion">
      <button data-motion-choice="auto">Auto</button>
      <button data-motion-choice="true">Reduced</button>
      <button data-motion-choice="false">Full</button>
    </div>
    <p class="hint">Auto follows your system “reduce motion” setting.</p>
  </div>
  <div class="setting">
    <label for="listWidthRange">List pane width</label>
    <div class="setting-inline">
      <input id="listWidthRange" type="range" min="${LIST_WIDTH_MIN}" max="${LIST_WIDTH_MAX}" step="1" value="${initialPrefs.listWidth ?? 35}">
      <span class="val" id="listWidthValue">${initialPrefs.listWidth != null ? `${initialPrefs.listWidth}%` : "Auto (35%)"}</span>
      <button class="btn btn-sm" id="listWidthReset" type="button">Reset</button>
    </div>
    <p class="hint">Drag the divider between panes or adjust here (${LIST_WIDTH_MIN}% to ${LIST_WIDTH_MAX}%).</p>
  </div>
  <div class="setting">
    <label for="portInput">Server port</label>
    <input id="portInput" type="number" min="1" max="65535" step="1" inputmode="numeric"
      placeholder="random unused port" autocomplete="off">
    <p class="hint">
      Fixed port for future launches: empty picks a random unused one.
      This session is serving on <strong id="portNow"></strong>; changes apply next launch
      (a busy port falls back to random).
    </p>
  </div>
</aside>

<dialog id="confirmDialog">
  <h3>Remove skill</h3>
  <p id="confirmText"></p>
  <div class="row">
    <button class="btn" id="confirmNo">Cancel</button>
    <button class="btn danger" id="confirmYes">Yes, remove</button>
  </div>
</dialog>

<div id="toasts" aria-live="polite"></div>

<dialog id="helpDialog">
  <h3>Keyboard shortcuts</h3>
  <table>
    <tr><td><kbd>/</kbd></td><td>search (<kbd>esc</kbd> leaves the query as-is)</td></tr>
    <tr><td><kbd>f</kbd></td><td>filter box (<kbd>esc</kbd> leaves it as-is, does not clear)</td></tr>
    <tr><td><kbd>g</kbd> / <kbd>p</kbd></td><td>global / project scope</td></tr>
    <tr><td><kbd>a</kbd></td><td>select agents (multi-select)</td></tr>
    <tr><td><kbd>i</kbd> / <kbd>x</kbd></td><td>installed tab / settings drawer</td></tr>
    <tr><td><kbd>?</kbd></td><td>this help (<kbd>esc</kbd> closes)</td></tr>
  </table>
  <div class="row" style="margin-top:16px"><button class="btn" id="helpClose">Close</button></div>
</dialog>

<dialog id="connectDialog" aria-label="Connect to your local skills-ui serve">
  <h3>Connect your backend</h3>
  <p>This is the hosted skills-ui: it talks to a <code>skills-ui serve</code> running on <b>your</b> machine. Start one in a terminal (<code>skills-ui serve --port 8123</code>) and copy the URL and <code>Hosted-UI token</code> lines it prints.</p>
  <label for="backendInput">Backend URL</label>
  <input id="backendInput" type="url" placeholder="http://127.0.0.1:8123" autocomplete="off" spellcheck="false">
  <label for="tokenInput">Hosted-UI token</label>
  <input id="tokenInput" type="password" placeholder="paste the Hosted-UI token" autocomplete="off">
  <p id="connectStatus" role="status"></p>
  <div class="row">
    <button class="btn primary" id="connectBtn">Connect</button>
  </div>
  <p class="connect-help">Chrome, Edge, and Firefox 153+ will ask once for <b>local network access</b> (choose Allow). Safari currently blocks local network access entirely. Wrong token? Re-copy it from serve’s startup output.</p>
</dialog>

<script>${bootstrap}</script>
<script>
${APP_JS}
</script>
</body>
</html>
`;
}

export const webPageRenderer = { renderPage, pageCspFor };
