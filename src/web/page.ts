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
import type { UiSeed } from '../core/seed.ts';

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

/**
 * Single source of truth for the installed-skill filter predicate (F1
 * filter parity, S-164): BOTH surfaces run this match set — name, source,
 * each agent, then description as the secondary match. The web embeds
 * SKILL_MATCHES_SRC (this function's transpiled source) inside APP_JS and
 * calls it from filteredSkills(); the TUI applies the identical match order
 * inside visibleSkills (src/tui/model.ts). tests/filter-parity.test.ts runs
 * the same fixtures through both surfaces and asserts identical results.
 *
 * Constraints: no backticks, no template literals, no regex literals in the
 * body — the toString() output is interpolated verbatim into the APP_JS
 * template literal, and node --check (page-hardening) must accept the page.
 */
export function skillMatches(
  skill: { name: string; description?: string | null; source?: string | null; agents: string[] },
  needle: string
): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (
    skill.name.toLowerCase().includes(q) ||
    (skill.source != null && skill.source.toLowerCase().includes(q)) ||
    skill.agents.some((a) => a.toLowerCase().includes(q)) ||
    (skill.description != null && skill.description.toLowerCase().includes(q))
  );
}

/** skillMatches' transpiled source, interpolated into APP_JS (S-164) — one
 *  definition, two surfaces; the parity test asserts the emitted page still
 *  carries this exact text. */
const SKILL_MATCHES_SRC = skillMatches.toString();

const APP_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%;overflow-x:clip}
body{
  background:var(--t-bg);color:var(--t-text);
  font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  transition:background .35s ease,color .35s ease;
  display:flex;flex-direction:column;height:100vh;overflow:hidden;
}
@media (max-width:720px){
  body{height:auto;min-height:100vh;overflow-y:auto}
}
button,input,select{font:inherit;color:inherit}
:root{
  --motion-scale:1;--ease:cubic-bezier(.2,.8,.2,1);
  --t-scrim:rgba(0,0,0,.4);--t-backdrop:rgba(0,0,0,.45);
}
[data-motion="off"]{--motion-scale:.001}
@media (prefers-reduced-motion:reduce){[data-motion="auto"]{--motion-scale:.001}}
/* Reduced motion must also stop infinite loops: iteration-count 1 turns them
   into a single 0.01ms frame instead of a machine-speed flicker. */
[data-motion="off"] *,[data-motion="off"] *::before,[data-motion="off"] *::after{
  animation-duration:.01ms !important;animation-iteration-count:1 !important;
  transition-duration:.01ms !important;
}
@media (prefers-reduced-motion:reduce){
  [data-motion="auto"] *,[data-motion="auto"] *::before,[data-motion="auto"] *::after{
    animation-duration:.01ms !important;animation-iteration-count:1 !important;
    transition-duration:.01ms !important;
  }
}
a{color:var(--t-primary)}

/* ---------- top bar ---------- */
header{
  display:flex;align-items:center;gap:16px;padding:12px 20px;
  background:var(--t-surface);border-bottom:1px solid var(--t-border);
  position:sticky;top:0;z-index:20;backdrop-filter:blur(6px);
}
.logo{display:flex;align-items:center;gap:12px;font-weight:700;letter-spacing:.2px}
.logo .mark{
  width:26px;height:26px;border-radius:8px;display:grid;place-items:center;
  background:var(--a-mauve);color:var(--t-bg);
  font-size:14px;font-weight:800;
}
.logo .ver{color:var(--t-textMuted);font-size:12px;font-weight:400}

nav.tabs{display:flex;gap:4px;margin-left:8px;position:relative}
.tab{
  border:0;background:transparent;font-size:13px;line-height:1.2;padding:4px 12px;min-height:28px;border-radius:6px;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;gap:4px;
  color:var(--t-textMuted);transition:background calc(.18s * var(--motion-scale)) var(--ease),color .18s var(--ease),transform .18s var(--ease);
}
.tab:hover{background:var(--t-surfaceAlt);color:var(--t-text);transform:translateY(-1px)}
.tab[aria-selected="true"]{background:var(--t-selectionBg);color:var(--t-selectionText);font-weight:600}
.tab:focus-visible,button:focus-visible,input:focus-visible,[tabindex]:focus-visible{
  outline:2px solid var(--t-focusRing);outline-offset:2px;border-radius:6px;
}

.top-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
/* S-186: below tablet width the top bar wraps instead of clipping the
   actions (icon-only buttons made the row shorter but not short enough for
   a 390px viewport once a selection adds two buttons). */
@media (max-width:720px){
  header{flex-wrap:wrap;row-gap:8px}
  .top-actions{flex-wrap:wrap;row-gap:8px}
}
.scope-toggle{
  display:inline-flex;border:1px solid var(--t-border);border-radius:6px;overflow:hidden;
}
.scope-toggle button{
  border:0;background:transparent;font-size:12.5px;line-height:1.2;padding:4px 8px;min-height:28px;cursor:pointer;color:var(--t-textMuted);
  display:inline-flex;align-items:center;justify-content:center;
  transition:background calc(.18s * var(--motion-scale)) var(--ease),color calc(.18s * var(--motion-scale)) var(--ease);
}
.scope-toggle button[aria-pressed="true"]{
  background:var(--t-primary);color:var(--t-primaryText);font-weight:600;
}
.scope-toggle button:hover:not([aria-pressed="true"]){background:var(--t-surfaceAlt);color:var(--t-text)}

/* ---------- buttons ---------- */
.btn{
  border:1px solid var(--t-border);background:var(--t-surfaceAlt);border-radius:6px;
  font-size:13px;line-height:1.2;padding:4px 12px;min-height:28px;cursor:pointer;color:var(--t-text);font-weight:500;position:relative;overflow:hidden;
  display:inline-flex;align-items:center;justify-content:center;gap:4px;
  transition:transform calc(.16s * var(--motion-scale)) var(--ease),box-shadow .16s var(--ease),background .16s var(--ease),border-color .16s var(--ease);
}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px color-mix(in srgb,var(--t-primary) 30%,transparent);border-color:var(--t-primary)}
.btn:active{transform:translateY(0) scale(.98)}
.btn.btn-sm{padding:4px 8px;font-size:12px;line-height:1.2;min-height:24px}
.btn.primary{background:var(--t-primary);border-color:var(--t-primary);color:var(--t-primaryText)}
.btn.primary:hover{box-shadow:0 6px 18px color-mix(in srgb,var(--t-primary) 45%,transparent);filter:brightness(1.06)}
.btn.danger{background:var(--t-danger);border-color:var(--t-danger);color:var(--t-dangerText)}
.btn.danger:hover{box-shadow:0 6px 18px color-mix(in srgb,var(--t-danger) 45%,transparent);filter:brightness(1.06)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
.btn .ripple{
  position:absolute;border-radius:50%;transform:scale(0);pointer-events:none;
  background:currentColor;opacity:.25;animation:ripple calc(.5s * var(--motion-scale)) ease-out forwards;
}
@keyframes ripple{to{transform:scale(2.6);opacity:0}}
/* S-186: icon-only header buttons. The glyph carries the state (filled/
   empty connect dot, sun/moon); aria-label + title carry the words; the
   square frame keeps a 32px hit target on the 4px grid. */
.btn.btn-icon{padding:4px;min-width:32px;min-height:32px;line-height:1;text-align:center}
.btn.btn-icon svg{display:block}

/* ---------- layout ---------- */
main{
  flex:1;min-height:0;display:grid;
  grid-template-columns:var(--list-col,minmax(min(320px,40%),35%)) 0px 1fr;
  gap:0;position:relative;
}
@media (max-width:720px){
  main{grid-template-columns:minmax(min(320px,40%),35%) 1fr !important}
  #listSplitter{display:none}
}
#listPane{border-right:1px solid var(--t-border);display:flex;flex-direction:column;min-height:0;min-width:0}
#listSplitter{
  width:8px;margin-left:-4px;height:100%;cursor:col-resize;position:relative;z-index:15;
  touch-action:none;user-select:none;
}
#listSplitter::after{
  content:"";position:absolute;top:0;bottom:0;left:3px;width:2px;
  background:transparent;transition:background .16s var(--ease);
}
#listSplitter:hover::after,#listSplitter:focus-visible::after,#listSplitter.dragging::after{
  background:var(--t-primary);
}
#detailPane{overflow:auto;overflow-x:hidden;padding:24px 28px;min-height:0;min-width:0}
.filter-row{padding:8px 16px 4px;display:flex;gap:8px;align-items:center}
.sort-row{padding:4px 16px;border-bottom:1px solid var(--t-border);display:flex;align-items:center;gap:8px}
#filter,#searchInput{
  width:100%;flex:1;min-width:0;padding:4px 12px;min-height:28px;font-size:13px;border-radius:6px;border:1px solid var(--t-border);
  background:var(--t-surfaceAlt);color:var(--t-text);
  transition:border-color .18s var(--ease),box-shadow .18s var(--ease);
}
#filter::placeholder,#searchInput::placeholder{color:var(--t-textMuted)}
#filter:focus,#searchInput:focus{outline:none;border-color:var(--t-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--t-primary) 25%,transparent)}

/* S-186: the Select all subheading, a quiet label row above the list;
   its checkbox is the tri-state master for the FILTERED set. S-187: the
   selection summary (count + Clear) joined this line, right-aligned; the
   row is permanent and the summary shows or hides as inline content sized
   inside the text line the label already sets, so the row height never
   changes when a selection appears or clears. */
.list-head{display:flex;align-items:center;gap:8px;padding:4px 16px;color:var(--t-textMuted);font-size:12px;white-space:nowrap}
.list-head input{width:15px;height:15px;accent-color:var(--t-primary);cursor:pointer;flex:none}
.list-head label{cursor:pointer;flex:none}
.sel-summary{margin-left:auto;display:none;align-items:center;gap:8px;flex:none}
.sel-summary.on{display:inline-flex}
.sel-summary .count{color:var(--t-textMuted)}
/* the inline Clear must fit the line the master checkbox already sizes:
   12px text on a 1.2 leading stays under the label line box, so showing
   it can never grow the row */
.sel-summary .btn{font-size:12px;line-height:1.2;padding:0 8px;min-height:0;border-radius:6px}
@media (max-width:560px){
  .list-head{gap:4px;padding:4px 8px}
  .sel-summary{gap:4px}
  .sel-summary .sel-word{display:none}
  .sel-summary .btn{padding:0 4px}
}
/* S-187 review F3: at the 320px floor the pane track bottoms out at 156px
   (128px content) and the full line (checkbox + "Select all" + count +
   Clear) overflows it by ~12px. Below 480px the master's text hides — a
   bare header checkbox is the standard select-all affordance; the words
   stay on the input's aria-label + title, and the label keeps its hit
   area around the checkbox. */
@media (max-width:480px){
  .list-head label[for="selectAllMaster"]{font-size:0}
}
.skill-check{width:15px;height:15px;accent-color:var(--t-primary);cursor:pointer;flex:none}
#agentsWrap{position:relative}
#agentsPop{
  position:absolute;top:calc(100% + 6px);left:0;z-index:26;width:280px;max-height:320px;overflow:auto;
  background:var(--t-surface);border:1px solid var(--t-border);border-radius:12px;padding:8px 12px;
  display:none;
}
#agentsPop.open{display:block}
#agentsPop label{display:flex;gap:12px;align-items:center;padding:4px 8px;border-radius:8px;cursor:pointer}
#agentsPop label:hover{background:var(--t-surfaceAlt)}
#agentsPop input{accent-color:var(--t-primary);width:15px;height:15px}
#agentsPop .row-actions{display:flex;gap:8px;margin-top:8px}
kbd{background:var(--t-surfaceAlt);border:1px solid var(--t-border);border-radius:5px;padding:0 4px;font-size:12px}
#helpDialog kbd{display:inline-block;min-width:42px;text-align:center;margin-right:8px}
#helpDialog table{border-collapse:collapse;font-size:13.5px}
#helpDialog td{padding:4px 8px 4px 0}
.seed-list{display:grid;gap:8px;margin:16px 0;max-height:45vh;overflow:auto}
.seed-row{display:flex;gap:12px;align-items:center;padding:8px 12px;border:1px solid var(--t-border);border-radius:8px;cursor:pointer}
.seed-row:hover{background:var(--t-surfaceAlt)}
.seed-row input{accent-color:var(--t-primary);width:15px;height:15px}
#skillList{list-style:none;margin:0;padding:8px 12px 20px;overflow:auto;flex:1}
#skillList li{
  padding:12px;border-radius:10px;cursor:pointer;position:relative;margin-bottom:4px;
  border:1px solid transparent;
  transition:background .18s var(--ease),transform calc(.18s * var(--motion-scale)) var(--ease),border-color .18s var(--ease);
}
/* S-180: the entrance stagger is opt-in per row (.rise-in, stamped only on
   the first population per page load) so filter re-renders, reorders and
   selection flips can never replay it. */
#skillList li.rise-in{
  animation:rise calc(.35s * var(--motion-scale)) var(--ease) backwards;
  animation-delay:calc(var(--i) * 28ms * var(--motion-scale));
}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
#skillList li::before{
  content:"";position:absolute;left:0;top:18%;bottom:18%;width:3px;border-radius:3px;
  background:var(--t-primary);transform:scaleY(0);transform-origin:center;
  transition:transform calc(.2s * var(--motion-scale)) var(--ease);
}
#skillList li:hover{background:var(--t-surfaceAlt);transform:translateX(3px)}
#skillList li:hover::before{transform:scaleY(1)}
#skillList li[aria-selected="true"]{
  background:var(--t-selectionBg);color:var(--t-selectionText);border-color:var(--t-primary);
}
#skillList li[aria-selected="true"]::before{transform:scaleY(1)}
/* Descendants keep their own colors otherwise; on the mauve selection fill
   they must switch to the selection text color to stay readable. */
#skillList li[aria-selected="true"] .skill-desc{color:var(--t-selectionText)}
#skillList li[aria-selected="true"] .chip{
  color:var(--t-selectionText);
  border-color:color-mix(in srgb,var(--t-selectionText) 45%,transparent);
  background:color-mix(in srgb,var(--t-selectionText) 14%,transparent);
}
.skill-name{font-weight:600;display:flex;align-items:center;gap:8px}
.skill-desc{color:var(--t-textMuted);font-size:13px;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dot{width:7px;height:7px;border-radius:50%;background:var(--a-green);flex:none}
.dot.unlinked{background:var(--t-textMuted)}

.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.chip{
  font-size:11px;font-weight:600;padding:4px 8px;border-radius:999px;
  background:color-mix(in srgb,var(--chip,var(--a-blue)) 18%,transparent);
  color:var(--t-text);border:1px solid color-mix(in srgb,var(--chip,var(--a-blue)) 45%,transparent);
}

.empty{color:var(--t-textMuted);padding:24px 16px;text-align:center;animation:rise .35s var(--ease)}
.empty.search-error{color:var(--t-danger)}

/* ---------- detail ---------- */
.detail-title{font-size:24px;font-weight:700;margin:0 0 4px;animation:rise .3s var(--ease)}
.detail-source{color:var(--t-textMuted);margin:0 0 20px}
.detail-actions{display:flex;gap:12px;margin:0 0 24px;flex-wrap:wrap}
.detail-meta{display:grid;gap:8px;margin-bottom:24px;font-size:13px}
.detail-meta dt{color:var(--t-textMuted);font-weight:600}
.detail-meta dd{margin:0;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;overflow-wrap:anywhere}
.readme{
  border:1px solid var(--t-border);border-radius:12px;background:var(--t-surface);
  padding:20px;font-size:13.5px;line-height:1.65;max-height:52vh;overflow:auto;
  overflow-wrap:break-word;
}
/* Rendered SKILL.md (S-165). The pane is a sidebar, not a landing page, so
   headings scale modestly under the pane's h1; every color rides the theme
   tokens, code keeps the existing monospace stack distinct from prose. */
.readme .md-h{font-weight:700;line-height:1.3;margin:1.15em 0 .4em}
.readme .md-h:first-child{margin-top:0}
.readme h2.md-h{font-size:16.5px;text-wrap:balance}
.readme h3.md-h{font-size:15px}
.readme h4.md-h{font-size:14px}
.readme h5.md-h{font-size:13.5px}
.readme .md-p{margin:.55em 0}
.readme .md-list{margin:.55em 0;padding-left:1.5em}
.readme ol.md-list{padding-left:1.7em}
.readme .md-li{margin:.28em 0}
.readme .md-li::marker{color:var(--t-textMuted)}
.readme .md-pre{
  background:var(--t-surfaceAlt);border:1px solid var(--t-border);border-radius:9px;
  padding:12px;margin:.7em 0;overflow:auto;white-space:pre;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.6;
}
.readme .md-codeblock{font-family:inherit}
.readme .md-lang{
  display:block;color:var(--t-textMuted);font-size:11px;margin:0 0 8px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
}
.readme .md-code{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;
  background:var(--t-surfaceAlt);border:1px solid var(--t-border);border-radius:5px;padding:0 4px;
}
.readme .md-quote{
  margin:.6em 0;padding:8px 12px;border:1px solid var(--t-border);border-radius:8px;color:var(--t-textMuted);
}
.readme .md-link{color:var(--t-primary);font-weight:500}
.readme .md-link-url{
  color:var(--t-textMuted);font-size:.82em;overflow-wrap:anywhere;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
}
.readme .md-hr{border:0;border-top:1px solid var(--t-border);margin:1.1em 0}
.readme .md-table{border-collapse:collapse;margin:.7em 0;font-size:12.5px;display:block;overflow:auto;max-width:100%}
.readme .md-table th,.readme .md-table td{border:1px solid var(--t-border);padding:4px 8px;text-align:left;vertical-align:top}
.readme .md-table th{background:var(--t-surfaceAlt);font-weight:600}

/* ---------- search (unified inside #listPane + #detailPane) ---------- */
.add-btn.added{background:color-mix(in srgb,var(--a-green) 18%,transparent);border-color:var(--a-green);color:var(--t-text);cursor:default}
.add-btn.added:hover{transform:none;box-shadow:none}
#results{list-style:none;margin:0;padding:8px 12px 20px;overflow:auto;flex:1}
#results li{
  padding:12px;border-radius:10px;cursor:pointer;position:relative;margin-bottom:4px;
  border:1px solid var(--t-border);background:var(--t-surface);
  display:flex;flex-direction:column;gap:8px;
  transition:background .18s var(--ease),transform calc(.18s * var(--motion-scale)) var(--ease),border-color .18s var(--ease);
  animation:rise calc(.35s * var(--motion-scale)) var(--ease) backwards;
  animation-delay:calc(var(--i) * 28ms * var(--motion-scale));
}
#results li:hover{background:var(--t-surfaceAlt);border-color:var(--t-primary)}
#results li[aria-selected="true"]{
  background:var(--t-selectionBg);color:var(--t-selectionText);border-color:var(--t-primary);
}
#results li[aria-selected="true"] .result-source,
#results li[aria-selected="true"] .result-installs{color:var(--t-selectionText)}
#results li[aria-selected="true"] .result-chip{
  color:var(--t-selectionText);
  border-color:color-mix(in srgb,var(--t-selectionText) 45%,transparent);
  background:color-mix(in srgb,var(--t-selectionText) 14%,transparent);
}
.result-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.result-name{font-weight:700}
.result-installs{color:var(--t-textMuted);font-size:12px;white-space:nowrap;margin-left:auto}
.result-source{color:var(--t-textMuted);font-size:12.5px;font-family:ui-monospace,Menlo,monospace;overflow-wrap:anywhere}
.result-actions{display:flex;gap:8px;flex-wrap:wrap}

/* ---------- settings drawer ---------- */
#settings{
  position:fixed;top:0;right:0;bottom:0;width:340px;z-index:40;
  background:var(--t-surface);border-left:1px solid var(--t-border);
  padding:20px 24px;overflow:auto;
}
/* The closed state (off-screen + hidden) is scoped to .js, which the page
   script adds before first paint: with scripting off the drawer's content
   is visible in place instead of script-dependent. JS-on behavior is
   unchanged; --open 0 -> 100%, 1 -> 0%. */
.js #settings{
  transform:translateX(calc((1 - var(--open,0)) * 100%));
  transition:transform calc(.28s * var(--motion-scale)) var(--ease);
  visibility:hidden;
}
#settings.open{--open:1;visibility:visible;transition:transform calc(.28s * var(--motion-scale)) var(--ease),visibility 0s}
#settings h2{margin:0 0 20px;font-size:17px;text-wrap:balance}
.setting{margin-bottom:20px}
.setting label{display:block;font-weight:600;margin-bottom:8px}
.setting .hint{color:var(--t-textMuted);font-size:12px;margin-top:8px}
.setting-inline{display:flex;align-items:center;gap:8px}
#listWidthRange{flex:1;accent-color:var(--t-primary)}
.hint-lines span{display:block}
.seg{display:inline-flex;border:1px solid var(--t-border);border-radius:6px;overflow:hidden;width:100%}
.seg button{
  flex:1;border:0;background:transparent;font-size:12.5px;line-height:1.2;padding:4px 8px;min-height:28px;cursor:pointer;color:var(--t-textMuted);
  display:inline-flex;align-items:center;justify-content:center;
  transition:background .16s var(--ease),color .16s var(--ease);
}
.seg button[aria-pressed="true"]{background:var(--t-primary);color:var(--t-primaryText);font-weight:600}
.seg button:hover:not([aria-pressed="true"]){background:var(--t-surfaceAlt);color:var(--t-text)}
#settingsClose{position:absolute;top:16px;right:16px}
#scrim{
  position:fixed;inset:0;background:var(--t-scrim);z-index:30;opacity:0;pointer-events:none;
  transition:opacity .25s var(--ease);
}
#scrim.open{opacity:1;pointer-events:auto}

/* ---------- modal ---------- */
dialog{
  border:1px solid var(--t-border);border-radius:16px;background:var(--t-surface);color:var(--t-text);
  padding:24px;max-width:440px;
}
/* Solid scrim behind the modal (no glass): elevation by lightness. */
dialog::backdrop{background:var(--t-backdrop)}
dialog h3{margin:0 0 8px}
dialog p{color:var(--t-textMuted);margin:0 0 20px}
dialog .row{display:flex;gap:12px;justify-content:flex-end}
#connectDialog{max-width:480px}
#connectDialog label{display:block;font-size:12.5px;color:var(--t-textMuted);margin:0 0 4px}
#connectDialog input{
  width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--t-border);
  background:var(--t-surfaceAlt);color:var(--t-text);margin-bottom:12px;
}
#connectStatus{min-height:20px;font-size:13.5px;white-space:pre-wrap}
#connectDialog .connect-help{font-size:12.5px;margin-top:16px}

/* ---------- toasts ---------- */
#toasts{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:50}
.toast{
  padding:8px 16px;border-radius:11px;font-weight:500;
  background:var(--t-surfaceAlt);color:var(--t-text);border:1px solid var(--t-border);
  animation:toast-in calc(.3s * var(--motion-scale)) var(--ease),toast-out .4s ease 3.4s forwards;
}
/* Tone rides the border + dot (non-text, >=3:1); text stays var(--t-text),
   which is AA-verified on surfaceAlt — accent text there is not. */
.toast.success{border-color:var(--t-success)}
.toast.success::before{background:var(--t-success)}
.toast.error{border-color:var(--t-danger)}
.toast.error::before{background:var(--t-danger)}
.toast::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;background:var(--t-textMuted);vertical-align:middle}
@keyframes toast-in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
@keyframes toast-out{to{opacity:0;transform:translateY(8px)}}

.update-badge{
  font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:auto;flex:none;
  background:color-mix(in srgb,var(--a-peach) 22%,transparent);
  border:1px solid color-mix(in srgb,var(--a-peach) 55%,transparent);
}
.result-chip{
  font-size:11px;font-weight:700;padding:4px 8px;border-radius:999px;
  background:color-mix(in srgb,var(--a-green) 20%,transparent);
  border:1px solid color-mix(in srgb,var(--a-green) 50%,transparent);
}
.busy-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--t-primary);
  animation:pulse calc(1s * var(--motion-scale)) ease-in-out infinite;margin-right:8px}
@keyframes pulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}

kbd{background:var(--t-surfaceAlt);border:1px solid var(--t-border);border-radius:5px;padding:0 4px;font-size:12px}
footer.tip{color:var(--t-textMuted);font-size:12px;padding:8px 16px 12px;border-top:1px solid var(--t-border)}
`;

const APP_JS = `
(function(){
'use strict';
/* Before first paint: gates the script-dependent hidden state (.js, gate 62). */
document.documentElement.classList.add('js');
var state = {
  prefs: window.__PREFS__,
  tab: 'installed',
  scope: 'project',
  skills: [],
  selected: null,
  selectedPath: null,
  checked: new Set(),
  query: '',
  results: [],
  searchFailed: false,
  busy: false,
  sortBy: 'checked',
  /* UI-07: update-check results are scope-keyed — same-name project/global
     rows are different rows, so each scope caches its own record and the
     render readers always see state.updates[state.scope]. */
  updates: { project: {}, global: {} },
  updateCheckDone: { project: false, global: false },
  updateCheckSeq: { project: 0, global: 0 },
  seedHold: false,
  queue: [],
  selectedSearchKey: null,
  sourceSkillsCache: {},
  agentFilter: null,
  backend: '',
  token: ''
};

function $(sel){ return document.querySelector(sel); }
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
/* Hosted mode: the page was NOT served by skills-ui itself (GitHub Pages),
   so every call goes to a user-supplied loopback backend with the Bearer token. */
var HOSTED = !/^(127\\.0\\.0\\.1|localhost|\\[::1\\]|::1)$/.test(location.hostname);
var LS_BACKEND = 'skills-ui.backend';
var LS_TOKEN = 'skills-ui.token';
/* Session storage only (0.5.1 impl B): this page lives on a shared origin
   (s-a-c.github.io) — any sibling page could read a localStorage token and
   drive the local serve. sessionStorage is per-tab and clears on close. */
function storageGet(k){ try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v){ try { sessionStorage.setItem(k, v); } catch (e) {} }
function migrateLegacyStorage(){
  try {
    var b = localStorage.getItem(LS_BACKEND), t = localStorage.getItem(LS_TOKEN);
    if (b === null && t === null) return;
    if (b !== null && sessionStorage.getItem(LS_BACKEND) === null) sessionStorage.setItem(LS_BACKEND, b);
    if (t !== null && sessionStorage.getItem(LS_TOKEN) === null) sessionStorage.setItem(LS_TOKEN, t);
    localStorage.removeItem(LS_BACKEND);
    localStorage.removeItem(LS_TOKEN);
  } catch (e) {}
}

function api(path, opts){
  opts = opts || {};
  var url = path;
  if (HOSTED) {
    if (!state.backend) {
      return Promise.reject(new Error('Not connected: connect your local skills-ui serve first (Connect button, top right).'));
    }
    url = state.backend + path;
    opts.headers = Object.assign({}, opts.headers, { authorization: 'Bearer ' + state.token });
  }
  return fetch(url, opts).then(function(r){
    return r.json().then(function(body){
      if (!r.ok) throw new Error(body && body.error || ('HTTP ' + r.status));
      return body;
    });
  });
}

/* ---------- sounds (WebAudio synth; no audio assets) ---------- */
var audioCtx = null;
function tone(freq, start, dur, type, gainPeak){
  var ctx = audioCtx;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(gainPeak || 0.06, ctx.currentTime + start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.05);
}
function play(kind){
  if (!state.prefs.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (kind === 'select') tone(660, 0, 0.06, 'sine', 0.04);
    else if (kind === 'confirm') { tone(523, 0, 0.09); tone(784, 0.07, 0.12); }
    else if (kind === 'success') { tone(523, 0, 0.1); tone(659, 0.08, 0.1); tone(784, 0.16, 0.16); }
    else if (kind === 'error') { tone(170, 0, 0.14, 'square', 0.05); tone(140, 0.12, 0.14, 'square', 0.05); }
  } catch (e) { /* audio unavailable */ }
}

/* ---------- prefs ---------- */
var LIST_W_MIN = ${LIST_WIDTH_MIN}, LIST_W_MAX = ${LIST_WIDTH_MAX};
function clampListWidth(v){
  var n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(LIST_W_MIN, Math.min(LIST_W_MAX, Math.round(n)));
}
function applyListWidth(raw){
  var w = raw == null ? null : clampListWidth(raw);
  var mainEl = document.querySelector('main');
  var splitter = $('#listSplitter');
  var range = $('#listWidthRange');
  var valEl = $('#listWidthValue');
  if (mainEl) {
    if (w === null) mainEl.style.removeProperty('--list-col');
    else mainEl.style.setProperty('--list-col', 'min(' + w + 'px, 60vw)');
  }
  var measured = w !== null ? w : Math.round(($('#listPane') && $('#listPane').getBoundingClientRect().width) || 448);
  var clamped = clampListWidth(measured) || 448;
  if (splitter) splitter.setAttribute('aria-valuenow', String(clamped));
  if (range) range.value = String(clamped);
  if (valEl) valEl.textContent = w === null ? 'Auto (35%)' : (w + ' px');
}
function setPrefs(patch){
  state.prefs = Object.assign({}, state.prefs, patch);
  applyPrefs();
  api('/api/prefs', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(patch) })
    .catch(function(){ toast('Could not save preferences', 'error'); });
}
function applyPrefs(){
  document.documentElement.setAttribute('data-theme', state.prefs.theme);
  document.documentElement.setAttribute('data-motion', String(state.prefs.reduceMotion));
  ['auto','true','false'].forEach(function(v){
    var b = document.querySelector('[data-motion-choice="' + v + '"]');
    if (b) b.setAttribute('aria-pressed', String(String(state.prefs.reduceMotion) === v));
  });
  [['on', true], ['off', false]].forEach(function(pair){
    var b = document.querySelector('[data-sound-choice="' + pair[0] + '"]');
    if (b) b.setAttribute('aria-pressed', String(state.prefs.sound === pair[1]));
  });
  var themeToggle = $('#themeToggle');
  if (themeToggle) {
    var light = state.prefs.theme === 'latte';
    themeToggle.innerHTML = light ? ICONS.sun : ICONS.moon;
    themeToggle.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    themeToggle.setAttribute('title', light ? 'Switch to dark theme' : 'Switch to light theme');
  }
  var themeBtns = document.querySelectorAll('[data-theme-choice]');
  themeBtns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === state.prefs.theme)); });
  applyListWidth(state.prefs.listWidth);
}

/* ---------- toasts ---------- */
function toast(text, tone){
  var el = document.createElement('div');
  el.className = 'toast' + (tone ? ' ' + tone : '');
  el.setAttribute('role', 'status');
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(function(){ el.remove(); }, 3900);
}
/* CLI output headed for a toast can be long — carry a clipped summary so the
   failed names up front stay readable. */
function clip(s, max){
  s = String(s == null ? '' : s);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/* ---------- hosted connect (S-137) ---------- */
function probeBackend(base, token, onStatus){
  var url = base.replace(/\\/+$/, '');
  onStatus('Reaching ' + url + ' …');
  return fetch(url + '/api/version').then(function(r){
    if (r.status === 403) throw new Error('origin-not-allowed');
    if (!r.ok) throw new Error('unreachable');
    return r.json();
  }).then(function(v){
    if (!v.capabilities || !v.capabilities.hosted) throw new Error('old-binary');
    onStatus('Backend reachable, checking token …');
    return fetch(url + '/api/prefs', { headers: { authorization: 'Bearer ' + token } }).then(function(r2){
      if (r2.status === 401) throw new Error('bad-token');
      if (!r2.ok) throw new Error('unreachable');
      return r2.json().catch(function(){ return null; }).then(function(p){
        if (p && typeof p === 'object') {
          if (p.theme === 'mocha' || p.theme === 'latte') state.prefs.theme = p.theme;
          if (typeof p.sound === 'boolean') state.prefs.sound = p.sound;
          if (p.reduceMotion === 'auto' || typeof p.reduceMotion === 'boolean') state.prefs.reduceMotion = p.reduceMotion;
          if (p.listWidth === null || typeof p.listWidth === 'number') {
            state.prefs.listWidth = p.listWidth === null ? null : clampListWidth(p.listWidth);
          }
          applyPrefs();
        }
        return v;
      });
    });
  }).catch(function(e){
    var msg = e && e.message;
    if (msg === 'origin-not-allowed') {
      throw new Error("This page's origin is not in serve's allowlist. Restart serve with SKILLS_UI_ALLOWED_ORIGINS including " + location.origin + ".");
    }
    if (msg === 'old-binary') {
      throw new Error('Connected, but your skills-ui binary predates the hosted UI. Update the binary and restart serve.');
    }
    if (msg === 'bad-token') {
      throw new Error('Token rejected: re-copy the Hosted-UI token line from the serve startup output.');
    }
    var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
      throw new Error('Safari blocks pages from reaching your local network. Use Chrome, Edge, or Firefox 153+.');
    }
    throw new Error('Cannot reach the backend. If the browser showed a local-network access prompt, choose Allow, then retry, and check the URL/port and that serve is running.');
  });
}
/* S-186: inline SVG icon set for the icon-only header buttons. The glyph
   carries the state (filled vs hollow connect dot, sun vs moon), the
   accessible label + title carry the words, and everything inherits
   currentColor so both themes read. Strings only: no backticks, no emoji
   glyphs (sloplint 30a). */
var ICONS = {
  dotOn: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4" fill="currentColor"/></svg>',
  dotOff: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.25v2.25M8 12.5v2.25M1.25 8h2.25M12.5 8h2.25M3.35 3.35l1.6 1.6M11.05 11.05l1.6 1.6M12.65 3.35l-1.6 1.6M4.95 11.05l-1.6 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M14 9.5A6 6 0 1 1 6.5 2a4.5 4.5 0 0 0 7.5 7.5z" fill="currentColor"/></svg>'
};
function connectedDot(ok){
  var b = $('#connectState');
  if (!b) return;
  b.innerHTML = ok ? ICONS.dotOn : ICONS.dotOff;
  b.setAttribute('aria-pressed', String(ok));
}
function tryConnect(base, token){
  if (!base || !token) { $('#connectStatus').textContent = 'Both the backend URL and the token are needed.'; return; }
  setSemanticDisabled($('#connectBtn'), true);
  probeBackend(base, token, function(s){ $('#connectStatus').textContent = s; })
    .then(function(v){
      state.backend = base.replace(/\\/+$/, '');
      state.token = token;
      storageSet(LS_BACKEND, state.backend);
      storageSet(LS_TOKEN, token);
      $('#connectStatus').textContent = 'Connected to skills-ui ' + v.version + '.';
      $('#connectDialog').close();
      connectedDot(true);
      boot();
    })
    .catch(function(e){ $('#connectStatus').textContent = e.message || String(e); connectedDot(false); })
    .finally(function(){ setSemanticDisabled($('#connectBtn'), false); });
}
function openConnect(){
  var savedBase = state.backend, savedToken = state.token;
  savedBase = savedBase || storageGet(LS_BACKEND) || '';
  savedToken = savedToken || storageGet(LS_TOKEN) || '';
  $('#backendInput').value = savedBase;
  $('#tokenInput').value = savedToken;
  $('#connectStatus').textContent = '';
  $('#connectDialog').showModal();
}

/* ---------- busy ---------- */
/* UI-05 (S-206): ONE writer owns every .btn disabled state. state.busy is
   transient; data-semantic-disabled records independent reasons (already
   installed in this scope, already in the install list, connection probe in
   flight). Syncing recomputes disabled = busy OR semantic, so a busy reset
   can never re-enable a semantically disabled control, and every .btn
   created mid-flight (results, detail actions, seed actions) is reconciled
   by syncing after it is attached. Busy itself is never stored as a
   semantic reason — the attribute only ever describes an independent one. */
function syncButtonDisabled(button){
  button.disabled = state.busy ||
    button.getAttribute('data-semantic-disabled') === 'true';
}
function setSemanticDisabled(button, disabled){
  button.setAttribute('data-semantic-disabled', String(!!disabled));
  syncButtonDisabled(button);
}
function syncButtons(root){
  root.querySelectorAll('.btn').forEach(syncButtonDisabled);
}
function setBusy(label){
  state.busy = !!label;
  syncButtons(document);
  var bar = $('#busyBar');
  bar.style.display = label ? 'block' : 'none';
  $('#busyText').textContent = label || '';
}

/* ---------- accent chips per agent (high color) ---------- */
var ACCENTS = ['--a-mauve','--a-blue','--a-teal','--a-green','--a-peach','--a-red','--a-pink','--a-sapphire','--a-yellow','--a-flamingo'];
function chipColor(name){
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

/* ---------- installed list ---------- */
var skillsLoadSeq=0;
function loadSkills(){
  var scope=state.scope,seq=++skillsLoadSeq;
  function owns(){return seq===skillsLoadSeq&&scope===state.scope;}
  setBusy('Loading skills…');
  return api('/api/skills?scope='+scope).then(function(data){
    if(!owns())return;
    state.skills=data.skills;renderList();
    if(state.tab!=='installed')return;
    if(!data.skills.length){
      detailSeq++; /* S-204: the empty pane replaces any detail still in flight */
      $('#detailPane').innerHTML='<div class="empty">No '+scope+' skills installed.<br>Open the <b>Search</b> tab to install one.</div>';
    }else if(!state.seedHold&&(state.selected==null||!data.skills.some(function(s){return s.name===state.selected;}))){
      selectSkill(data.skills[0].name);
    }else if(!state.seedHold){showDetail(state.selected);}
  }).catch(function(e){if(owns())toast(e.message,'error');})
    .finally(function(){if(owns())setBusy(null);});
}

/* Filter predicate: the transpiled source of skillMatches() from
   src/web/page.ts — the SAME match set the TUI runs (name, source,
   agents, description). One definition, two surfaces; the parity test
   in tests/filter-parity.test.ts proves it. */
${SKILL_MATCHES_SRC}
function filteredSkills(){
  var needle = ($('#filter').value || '').trim().toLowerCase();
  var items = state.skills.filter(function(s){
    var agentOk = !state.agentFilter || state.agentFilter.size === 0 ||
      s.agents.some(function(a){ return state.agentFilter.has(a); });
    if (!agentOk) return false;
    return skillMatches(s, needle);
  });
  if (state.sortBy === 'checked') {
    items = items.slice().sort(function(a, b){
      var ca = state.checked.has(a.name) ? 0 : 1;
      var cb = state.checked.has(b.name) ? 0 : 1;
      return ca - cb || a.name.localeCompare(b.name);
    });
  } else if (state.sortBy === 'name') {
    items = items.slice().sort(function(a, b){ return a.name.localeCompare(b.name); });
  }
  /* 'load' deliberately sorts nothing — CLI load order = state.skills order */
  return items;
}
/* ---------- S-180 DOM-reuse render ----------
   Rows are keyed (scope + '/' + skill name) and persist across renders: a
   keystroke reconciles — create missing rows, remove gone ones, refresh
   changed content in place — instead of innerHTML='' rebuilding ~390 li
   plus ~1.6k listeners per keystroke. The entrance stagger (.rise-in) is
   stamped on the first population that actually paints rows per page load
   and never re-stamped: later populations — scope switches, filter
   renders, reorders, selection flips — replay nothing. Row-node identity
   holds within a non-empty result set; rows filtered all the way out are
   discarded, so widening the needle again recreates them (by design, and
   without animation). Content refreshes are keyed off rowSignature only:
   a needle change over the same result set touches no DOM at all. */
var rowByKey = {};
var listIntroPending = true;
var filterTimer = null;
var FILTER_DEBOUNCE_MS = 150;
function cancelFilterRender(){
  if (filterTimer) { clearTimeout(filterTimer); filterTimer = null; }
}
function scheduleFilterRender(){
  cancelFilterRender();
  filterTimer = setTimeout(function(){
    filterTimer = null;
    /* Bound the User Timing buffers: each pass emits 2 marks + 1 measure
       and nothing else clears them, so a long session would fill the
       finite entry buffers and silently kill instrumentation. Probes only
       read entries with startTime >= their own t0, so clearing the three
       names at the top of every pass is safe. */
    performance.clearMarks('skills-ui:filter-render-start');
    performance.clearMarks('skills-ui:filter-render-end');
    performance.clearMeasures('skills-ui:filter-render');
    /* S-180 perf instrumentation: standard User Timing marks around every
       debounced render pass — the budget harness (scripts/perf) reads the
       skills-ui:filter-render measure entry to charge the RENDER WORK,
       excluding this debounce wait and the browser's frame pacing. Zero
       behavioral impact; inert unless something reads the entries. */
    performance.mark('skills-ui:filter-render-start');
    try {
      renderList();
    } finally {
      performance.mark('skills-ui:filter-render-end');
      performance.measure('skills-ui:filter-render', 'skills-ui:filter-render-start', 'skills-ui:filter-render-end');
    }
  }, FILTER_DEBOUNCE_MS);
}
function rowKeyFor(name){ return state.scope + '/' + name; }
function rowNameOf(li){
  var key = li.getAttribute('data-key') || '';
  return key.slice(state.scope.length + 1);
}
/* UI-07: every update-status reader sees ONLY the current scope's record —
   the same name in the other scope is a different row with different state. */
function scopeUpdates(){ return state.updates[state.scope] || {}; }
function rowSignature(s){
  var upd = scopeUpdates()[s.name] || {};
  return (s.description || '') + '|' + (s.agents || []).join(',') + '|' +
    (upd.updateAvailable ? 'u' : '') + (upd.error ? 'e' : '') +
    (state.checked.has(s.name) ? 'c' : '');
}
function rowHtml(s){
  var outdated = scopeUpdates()[s.name] && scopeUpdates()[s.name].updateAvailable;
  return '<div class="skill-name">' +
    '<input type="checkbox" class="skill-check" aria-label="Select ' + esc(s.name) + ' for update"' +
    (state.checked.has(s.name) ? ' checked' : '') + '>' +
    '<span class="dot' + (s.agents.length ? '' : ' unlinked') + '"></span>' +
    esc(s.name) +
    (outdated ? '<span class="update-badge">update</span>' : '') +
    '</div>' +
    '<div class="skill-desc">' + esc(s.description || '') + '</div>' +
    '<div class="chips">' + s.agents.slice(0, 4).map(function(a){
      return '<span class="chip" style="--chip:var(' + chipColor(a) + ')">' + esc(a) + '</span>';
    }).join('') + (s.agents.length > 4 ? '<span class="chip">+' + (s.agents.length - 4) + '</span>' : '') + '</div>';
}
function renderList(){
  var list = $('#skillList');
  var items = filteredSkills();
  var intro = listIntroPending && items.length > 0;
  if (intro) listIntroPending = false;
  var wanted = {};
  items.forEach(function(s){ wanted[rowKeyFor(s.name)] = s; });
  /* pass 1: drop rows the new result set does not contain (and any stray
     non-row nodes) — removal, not display-hiding, so the li count is
     exactly the match set */
  Array.prototype.slice.call(list.children).forEach(function(node){
    var key = node.tagName === 'LI' ? node.getAttribute('data-key') : null;
    if (key !== null && wanted[key]) return;
    if (key !== null) delete rowByKey[key];
    node.remove();
  });
  /* pass 2: create missing rows, refresh changed content in place, keep
     order with the fewest moves */
  var cursor = list.firstChild;
  items.forEach(function(s, i){
    var key = rowKeyFor(s.name);
    var li = rowByKey[key];
    if (!li) {
      li = document.createElement('li');
      li.setAttribute('data-key', key);
      li.style.setProperty('--i', i);
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '0');
      if (intro) li.classList.add('rise-in');
      li.__sig = null;
      rowByKey[key] = li;
    }
    var sig = rowSignature(s);
    /* Content is needle-independent — rowHtml builds no match markup and
       rowSignature covers every content source — so a changed needle over
       an identical result set reconciles to zero DOM work. When match
       highlighting ever lands, fold the needle into rowSignature instead
       of re-rendering row content per keystroke. */
    if (li.__sig !== sig) {
      li.innerHTML = rowHtml(s);
      var updError = scopeUpdates()[s.name] && scopeUpdates()[s.name].error;
      // G4: not-checkable/check-failed skills stop being silently badge-less —
      // the status rides the row as a tooltip (the detail pane carries the full line)
      if (updError) li.title = 'update check: ' + updError;
      else if (li.title) li.removeAttribute('title');
      li.__sig = sig;
    }
    var selState = String(s.name === state.selected);
    if (li.getAttribute('aria-selected') !== selState) li.setAttribute('aria-selected', selState);
    if (li === cursor) {
      cursor = li.nextSibling;
    } else {
      /* A moved node restarts CSS animations — strip the entrance class
         before re-inserting so a reorder can never replay the stagger.
         Only ALREADY-CONNECTED rows strip here: brand-new rows must carry
         the class into their insertion (the first-paint cascade). cursor
         is null on a still-empty list, so every first-population row walks
         this branch and must keep the class. */
      if (li.parentNode && li.classList.contains('rise-in')) li.classList.remove('rise-in');
      list.insertBefore(li, cursor);
    }
  });
  if (!items.length) {
    // needle lives in filteredSkills scope — read the filter here instead
    // (0.5.1 hotfix: the old out-of-scope reference threw 'needle is not
    // defined' on every empty render, blanking the list)
    var filterText = (($('#filter').value || '').trim());
    var emptyHtml = filterText ? 'No matches for “' + esc(filterText) + '”' : 'Nothing here yet';
    var empty = list.querySelector('.empty');
    if (!empty) {
      var div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = emptyHtml;
      div.__sig = emptyHtml;
      list.appendChild(div);
    } else if (empty.__sig !== emptyHtml) {
      empty.innerHTML = emptyHtml;
      empty.__sig = emptyHtml;
    }
  }
  syncSelectAll();
}

function selectSkill(name){
  state.selected = name;
  var selected = state.skills.filter(function(s){ return s.name === name; })[0];
  state.selectedPath = selected ? selected.path : null;
  renderList();
  showDetail(name);
}

/* ---------- markdown detail (S-165) ----------
   Zero-dep renderer for the SKILL.md subset the corpus uses: ATX headings
   (# to ####), flat unordered + ordered lists, fenced code blocks (info
   string echoed as a label), inline code, bold, italic, links, blockquotes,
   horizontal rules, and a cheap GFM table. Escape-FIRST: every text token
   goes through esc() before any tag is built, so the only tags in the
   output are the ones this function emits — no innerHTML of unescaped
   external text anywhere.
   Links never navigate: the ratified CSP posture is no navigation
   (default-src 'none'), so no href attribute is emitted and
   rel="noopener noreferrer" would be moot — the URL stays visible as
   muted text instead.
   Backticks are written as \\u0060 escapes throughout: this whole function
   lives inside the APP_JS template literal, which must stay free of raw
   backtick characters (a raw one would terminate the template). */
function renderMarkdown(md){
  var lines = String(md == null ? '' : md).split(/\\r?\\n/);
  var out = [];
  var para = [];
  function flushPara(){
    if (!para.length) return;
    out.push('<p class="md-p">' + inline(esc(para.join(' '))) + '</p>');
    para = [];
  }
  /* s arrives PRE-ESCAPED — esc() ran before inline() is ever called, so
     every captured group below is already-inert text and the only tags
     added are the renderer's own. */
  var RX_INLINE_FULL = /(\\u0060+(\\u0060?[^\\u0060]+)\\u0060+)|(\\*\\*([^*]+)\\*\\*)|(\\*([^*\\s][^*]*?)\\*)|(\\[([^\\]]+)\\]\\(([^)\\s][^)]*)\\))/g;
  var RX_INLINE_NOLINK = /(\\u0060+(\\u0060?[^\\u0060]+)\\u0060+)|(\\*\\*([^*]+)\\*\\*)|(\\*([^*\\s][^*]*?)\\*)/g;
  function inline(s){
    /* guard (S-165 review): a run of unmatched '[' makes the link
       alternative rescan to end-of-line per start — O(n^2) on
       pathological input. No '](' means no link can ever match, so drop
       the link alternative from the scan (code/bold/em still run). */
    var canLink = s.indexOf('](') >= 0;
    return s.replace(canLink ? RX_INLINE_FULL : RX_INLINE_NOLINK,
      function(m, codeAll, codeBody, boldAll, boldBody, emAll, emBody, linkAll, linkText, linkUrl){
        if (codeAll != null) return '<code class="md-code">' + codeBody + '</code>';
        if (boldAll != null) return '<strong class="md-strong">' + boldBody + '</strong>';
        if (emAll != null) return '<em class="md-em">' + emBody + '</em>';
        /* link branch: no href ever (see block comment) — the URL is shown
           as visible muted text. linkText/linkUrl are re-inlined so bold or
           italic inside them still renders. */
        if (linkAll != null) {
          return '<span class="md-link">' + inline(linkText) + '</span>' +
            '<span class="md-link-url"> (' + inline(linkUrl) + ')</span>';
        }
        return m;
      }
    );
  }
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    /* fenced code block: open fence (info string echoed as a label) */
    var fence = /^\\s{0,3}\\u0060{3,}\\s*([^\\u0060]*?)\\s*$/.exec(line);
    if (fence) {
      flushPara();
      var lang = fence[1];
      var buf = [];
      i++;
      while (i < lines.length && !/^\\s{0,3}\\u0060{3,}\\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; /* swallow the closing fence (or stop at EOF) */
      out.push(
        '<pre class="md-pre">' +
        (lang ? '<span class="md-lang">' + esc(lang) + '</span>' : '') +
        '<code class="md-codeblock">' + esc(buf.join('\\n')) + '</code></pre>'
      );
      continue;
    }
    /* ATX heading #..#### -> h2..h5 (the pane's h1 is the skill name) */
    var h = /^\\s{0,3}(#{1,4})\\s+(.*?)\\s*#*\\s*$/.exec(line);
    if (h) {
      flushPara();
      var lvl = h[1].length + 1;
      out.push('<h' + lvl + ' class="md-h md-h' + lvl + '">' + inline(esc(h[2])) + '</h' + lvl + '>');
      i++;
      continue;
    }
    /* horizontal rule --- *** ___ */
    if (/^\\s{0,3}((-\\s*){3,}|(\\*\\s*){3,}|(_\\s*){3,})$/.test(line)) {
      flushPara();
      out.push('<hr class="md-hr">');
      i++;
      continue;
    }
    /* blockquote: consecutive > lines flatten into one quote */
    if (/^\\s{0,3}>/.test(line)) {
      flushPara();
      var q = [];
      while (i < lines.length && /^\\s{0,3}>/.test(lines[i])) {
        q.push(lines[i].replace(/^\\s{0,3}>\\s?/, ''));
        i++;
      }
      out.push('<blockquote class="md-quote">' + inline(esc(q.join(' '))) + '</blockquote>');
      continue;
    }
    /* lists: flat (nesting stays a TUI-canonical concern, the corpus is flat) */
    var ul = /^\\s{0,3}[-*+]\\s+(.*)$/.exec(line);
    var ol = /^\\s{0,3}(\\d{1,9})[.)]\\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      var ordered = !!ol;
      var marker = ordered ? /^\\s{0,3}\\d{1,9}[.)]\\s+(.*)$/ : /^\\s{0,3}[-*+]\\s+(.*)$/;
      var cont = /^\\s{0,3}([-*+]|\\d{1,9}[.)])\\s+/;
      var items = [];
      while (i < lines.length) {
        var item = marker.exec(lines[i]);
        if (!item) break;
        items.push(item[1]);
        i++;
        /* lazy continuation: a plain follow-on line joins the open item */
        while (i < lines.length && lines[i].trim() !== '' && !cont.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      var tag = ordered ? 'ol' : 'ul';
      var listHtml = '<' + tag + ' class="md-list">';
      for (var j = 0; j < items.length; j++) {
        listHtml += '<li class="md-li">' + inline(esc(items[j])) + '</li>';
      }
      out.push(listHtml + '</' + tag + '>');
      continue;
    }
    /* cheap GFM table: a row containing a pipe over a dashed separator row */
    var sep = /^\\s{0,3}\\|?\\s*:?-{3,}[\\s:|-]*$/;
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && sep.test(lines[i + 1])) {
      flushPara();
      var cells = function(row){
        return row.replace(/^\\s*\\|/, '').replace(/\\|\\s*$/, '').split('|').map(function(c){
          return inline(esc(c.trim()));
        });
      };
      var head = cells(lines[i]);
      i++; /* header row consumed */
      if (i < lines.length && sep.test(lines[i])) i++; /* separator row skipped */
      var tbl = '<table class="md-table"><thead><tr>';
      for (var th = 0; th < head.length; th++) tbl += '<th>' + head[th] + '</th>';
      tbl += '</tr></thead><tbody>';
      while (i < lines.length && lines[i].indexOf('|') >= 0 && !sep.test(lines[i])) {
        var bodyCells = cells(lines[i]);
        tbl += '<tr>';
        for (var td = 0; td < bodyCells.length; td++) tbl += '<td>' + bodyCells[td] + '</td>';
        tbl += '</tr>';
        i++;
      }
      out.push(tbl + '</tbody></table>');
      continue;
    }
    if (line.trim() === '') { flushPara(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flushPara();
  return out.join('\\n');
}

var detailSeq=0; /* S-204: generation counter — the detail that started last owns the pane */
function showDetail(name){
  /* Bump FIRST (even when no skill matches): superseding a selection — or
     landing on a selection that no longer exists — must orphan any detail
     response already in flight. */
  var seq = ++detailSeq, scope = state.scope;
  if (state.tab !== 'installed') return;
  var skill = state.skills.filter(function(s){ return s.name === name; })[0];
  if (!skill) return;
  var pane = $('#detailPane');
  var upd = scopeUpdates()[skill.name];
  var detailOutdated = upd && upd.updateAvailable;
  var updateError = upd && upd.error ? upd.error : null;
  pane.innerHTML =
    '<h1 class="detail-title">' + esc(skill.name) + '</h1>' +
    '<p class="detail-source">' + esc(skill.source || 'local skill') +
    (detailOutdated ? ' · <span class="update-badge">update available</span>' : '') + '</p>' +
    '<div class="detail-actions">' +
      '<button class="btn danger" id="removeBtn">Remove…</button>' +
      // S-186: Update exists only once a check ran AND this skill has an
      // update available; before that it rendered unconditionally.
      (detailOutdated ? '<button class="btn" id="updateBtn">Update</button>' : '') +
    '</div>' +
    '<dl class="detail-meta">' +
      '<dt>Scope</dt><dd>' + esc(skill.scope) + '</dd>' +
      '<dt>Agents</dt><dd>' + (skill.agents.length ? skill.agents.map(esc).join(', ') : 'not linked') + '</dd>' +
      '<dt>Path</dt><dd>' + esc(skill.path) + '</dd>' +
      (updateError ? '<dt>Updates</dt><dd>' + esc(updateError) + '</dd>' : '') +
    '</dl>' +
    '<div class="readme" id="readme">Loading…</div>';
  /* S-204: capture THIS pane's readme node and the row's identity — a late
     response may only paint when it still belongs to the current selection.
     Record the rendered row's path here too: loadSkills re-invokes showDetail
     for a KEPT name whose row (and path) the fresh list may have replaced,
     and selectSkill alone would leave state.selectedPath pointing at the
     old row. */
  var readme = $('#readme'), capturedPath = skill.path;
  state.selectedPath = skill.path;
  function ownsDetail(){
    return seq === detailSeq && state.tab === 'installed' && scope === state.scope &&
      state.selected === skill.name && readme && readme.isConnected &&
      capturedPath === state.selectedPath;
  }
  $('#removeBtn').addEventListener('click', function(){ openRemove(skill); });
  if (detailOutdated) $('#updateBtn').addEventListener('click', function(){ updateSkills([skill.name], skill.scope === 'global'); });
  syncButtons(pane); /* UI-05: detail actions created mid-busy must not miss the busy disable */
  /* S-179: the row's own path rides along — the serve validates it as an exact cached-list row (name stays for older serves). */
  api('/api/skill?scope=' + skill.scope + '&name=' + encodeURIComponent(skill.name) + '&path=' + encodeURIComponent(skill.path))
    .then(function(d){
      if (!ownsDetail()) return;
      /* renderMarkdown escapes every token before any tag is built, so this
         innerHTML carries renderer-made tags around inert text only */
      readme.innerHTML = renderMarkdown(d.body || '(empty SKILL.md)');
    })
    .catch(function(){
      if (!ownsDetail()) return;
      readme.innerHTML = renderMarkdown('(SKILL.md unavailable)');
    });
}

function deleteChecked(){
  var names = Array.from(state.checked);
  if (!names.length) return;
  var dlg = $('#confirmDialog');
  $('#confirmText').textContent =
    'Remove ' + names.length + ' skill' + (names.length === 1 ? '' : 's') +
    ' (' + names.join(', ') + ') from ' + state.scope + ' scope?';
  dlg.showModal();
  $('#confirmYes').onclick = function(){
    dlg.close();
    setBusy('Removing ' + names.length + ' skill' + (names.length === 1 ? '' : 's') + '…');
    api('/api/remove', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ skills: names, global: state.scope === 'global' }) })
      .then(function(res){
        if (!res.ok) {
          // /api/remove answers HTTP 200 + ok:false when names survive the
          // list-diff; the body's output names the failures (G2/ST3).
          play('error');
          toast(clip(res.output, 240) || 'Remove failed', 'error');
          return loadSkills();
        }
        play('success');
        toast('Removed ' + names.length + ' skill' + (names.length === 1 ? '' : 's'), 'success');
        state.checked.clear();
        renderSelSummary();
        state.selected = null;
        state.selectedPath = null;
        return loadSkills();
      })
      .catch(function(e){ play('error'); toast(e.message, 'error'); })
      .finally(function(){ setBusy(null); });
  };
}

function openRemove(skill){
  var dlg = $('#confirmDialog');
  $('#confirmText').textContent = 'Remove “' + skill.name + '” from ' + skill.scope + ' scope? Agent links will be cleaned up.';
  dlg.showModal();
  $('#confirmYes').onclick = function(){
    dlg.close();
    setBusy('Removing ' + skill.name + '…');
    api('/api/remove', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ skills:[skill.name], global: skill.scope === 'global' }) })
      .then(function(res){
        if (!res.ok) {
          play('error');
          toast(clip(res.output, 240) || ('Remove failed for ' + skill.name), 'error');
          return loadSkills();
        }
        play('success'); toast('Removed ' + skill.name, 'success'); state.selected = null; state.selectedPath = null; return loadSkills();
      })
      .catch(function(e){ play('error'); toast(e.message, 'error'); })
      .finally(function(){ setBusy(null); });
  };
}

function applySeed(){
  var seed = window.__SEED__ || { kind: 'none' };
  if (seed.kind === 'add' && seed.source) showInstallSeed(seed);
  else if (seed.kind === 'update' && seed.skills && seed.skills.length) {
    // S-187 parity (review F1): intersect the seed names with the real
    // installed list — same G5 discipline as the remove seed below. The
    // TUI prunes model.checked on every skills-loaded (model.ts), so an
    // unfiltered web set diverged on stale/externally-removed names.
    loadSkills().then(function(){
      var found = [], notInstalled = [];
      seed.skills.forEach(function(n){
        if (state.skills.some(function(s){ return s.name === n; })) found.push(n);
        else notInstalled.push(n);
      });
      state.checked = new Set(found);
      renderList(); renderSelSummary();
      var msg = found.length + ' skill' + (found.length === 1 ? '' : 's') + ' selected for update';
      if (notInstalled.length) {
        play('error');
        toast(msg + ' (not installed: ' + notInstalled.join(', ') + ')', 'error');
      } else {
        toast(msg, 'success');
      }
    });
  } else if (seed.kind === 'remove' && seed.skills && seed.skills.length) {
    // G5: pre-check the seed names against the real installed list — the old
    // branch success-toasted and dead-ended. The checked set feeds the remove
    // bar, so the user lands one click from the destructive action, same as
    // the update seed above.
    loadSkills().then(function(){
      var found = [], notInstalled = [];
      seed.skills.forEach(function(n){
        if (state.skills.some(function(s){ return s.name === n; })) found.push(n);
        else notInstalled.push(n);
      });
      state.checked = new Set(found);
      renderList(); renderSelSummary();
      var msg = found.length + ' skill' + (found.length === 1 ? '' : 's') + ' selected for removal';
      if (notInstalled.length) {
        play('error');
        toast(msg + ' (not installed: ' + notInstalled.join(', ') + ')', 'error');
      } else {
        toast(msg, 'success');
      }
    });
  }
}

function showInstallSeed(seed){
  state.seedHold = true;
  detailSeq++; /* S-204: the seed pane replaces any detail still in flight */
  var pane = $('#detailPane');
  pane.innerHTML =
    '<h1 class="detail-title">Install from ' + esc(seed.source) + '</h1>' +
    '<p class="detail-source" id="seedStatus">Loading skill list…</p>' +
    '<div id="seedList" class="seed-list"></div>' +
    '<div class="detail-actions" style="margin-top:16px">' +
      '<button class="btn primary" id="seedInstall">Install selected</button>' +
      '<button class="btn" id="seedInstallAll">Install all</button>' +
      '<button class="btn" id="seedCancel">Cancel</button>' +
    '</div>';
  syncButtons(pane); /* UI-05: seed actions created mid-busy must not miss the busy disable */
  var closeSeed = function(){ state.seedHold = false; loadSkills(); };
  $('#seedCancel').addEventListener('click', closeSeed);
  var preSelected = seed.skills || [];
  api('/api/source-skills?source=' + encodeURIComponent(seed.source))
    .then(function(d){
      if (state.seedHold === false) return;
      var names = d.skills.map(function(x){ return x.name; });
      if (!names.length) { $('#seedStatus').textContent = 'No skills found in this source.'; return; }
      var chosen = new Set(preSelected.length ? names.filter(function(n){ return preSelected.indexOf(n) >= 0; }) : names);
      if (!chosen.size) chosen = new Set(names);
      $('#seedStatus').textContent = names.length + ' skills available, pick what to install:';
      var box = $('#seedList');
      box.innerHTML = '';
      names.forEach(function(n){
        var row = document.createElement('label');
        row.className = 'seed-row';
        row.innerHTML = '<input type="checkbox" data-skill="' + esc(n) + '"' +
          (chosen.has(n) ? ' checked' : '') + '> <span>' + esc(n) + '</span>';
        box.appendChild(row);
      });
      $('#seedInstall').addEventListener('click', function(){
        var picked = Array.prototype.map.call(box.querySelectorAll('input:checked'), function(i){ return i.getAttribute('data-skill'); });
        if (!picked.length) { play('error'); toast('Select at least one skill', 'error'); return; }
        runSeedInstall(seed.source, picked);
      });
      $('#seedInstallAll').addEventListener('click', function(){ runSeedInstall(seed.source, ['*']); });
    })
    .catch(function(e){ $('#seedStatus').textContent = 'Could not list skills: ' + e.message; });
}

function runSeedInstall(source, skills){
  setBusy('Installing from ' + source + '…');
  api('/api/install', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: source, skills: skills, global: state.scope === 'global' }) })
    .then(function(res){
      if (res.ok) { play('success'); toast('Installed from ' + source, 'success'); }
      else { play('error'); toast('Install failed for some skills', 'error'); }
      state.seedHold = false;
      return loadSkills();
    })
    .catch(function(e){ play('error'); toast(e.message, 'error'); })
    .finally(function(){ setBusy(null); });
}

function updateSkills(skills, global){
  var all = !skills || !skills.length;
  setBusy(all ? 'Updating all skills…' : 'Updating ' + skills.join(', ') + '…');
  api('/api/update', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ skills: skills, global: global }) })
    .then(function(res){
      if (!res.ok) {
        // /api/update answers HTTP 200 + ok:false when the CLI exits non-zero;
        // surface the sanitized output instead of a success-tone lie (G2/ST3).
        play('error');
        toast(clip(res.output, 240) || 'Update failed', 'error');
        if (state.tab === 'search') refreshInstalledAll().then(renderResults);
        return loadSkills();
      }
      play('success');
      toast(all ? 'Update finished' : 'Updated ' + skills.join(', '), 'success');
      state.checked.clear();
      renderSelSummary();
      if (state.tab === 'search') refreshInstalledAll().then(renderResults);
      return loadSkills();
    })
    .catch(function(e){ play('error'); toast(e.message, 'error'); })
    .finally(function(){ setBusy(null); });
}

function checkForUpdates(force){
  var scope = state.scope;
  if (!force && state.updateCheckDone[scope]) return Promise.resolve();
  /* UI-07: the token is captured (and bumped) per scope at dispatch — only
     the LATEST request for that scope may store, and a response that lands
     after the view moved on may only fill its own scope's cache. */
  var seq = ++state.updateCheckSeq[scope];
  return api('/api/updates?scope=' + scope)
    .then(function(d){
      if (seq !== state.updateCheckSeq[scope]) return; // a newer check for this scope owns the record
      state.updates[scope] = d.updates || {};
      state.updateCheckDone[scope] = true;
      if (state.scope !== scope) return; // cache without visible effects
      var updates = state.updates[scope];
      var n = Object.keys(updates).filter(function(k){ return updates[k].updateAvailable; }).length;
      renderList();
      if (state.tab === 'installed' && state.selected) showDetail(state.selected);
      if (state.tab === 'search') {
        renderResults();
        if (state.selectedSearchKey) showSearchDetail(selectedSearchResult());
      }
      if (n > 0) toast(n + ' update' + (n === 1 ? '' : 's') + ' available', 'success');
      else if (force) toast('no updates available', 'success');
    })
    .catch(function(e){
      // ST4: the silent no-op catch hid check failures (and left the manual
      // button dead after the once-per-scope auto-check) — say so instead.
      // UI-07: but only for the CURRENT owner — a stale or post-switch
      // failure says nothing about the view now on screen.
      if (seq !== state.updateCheckSeq[scope] || state.scope !== scope) return;
      play('error');
      toast('update check failed: ' + (e && e.message ? e.message : String(e)), 'error');
    });
}

/* ---------- search ---------- */
var searchTimer = null;
var searchSeq = 0; /* S-182: monotonic token — a slow older response must never overwrite a newer render */
function searchKeyOf(r){ return (r.source || r.slug || '') + '#' + (r.name || ''); }
function inQueueKey(qk){ return state.queue.some(function(q){ return q.key === qk; }); }
function selectedSearchResult(){
  if (!state.selectedSearchKey) return null;
  for (var i = 0; i < state.results.length; i++) {
    if (searchKeyOf(state.results[i]) === state.selectedSearchKey) return state.results[i];
  }
  return null;
}
function sortedResults(){
  var items = (state.results || []).slice();
  if (state.sortBy === 'name') {
    items.sort(function(a, b){ return (a.name || '').localeCompare(b.name || ''); });
  } else if (state.sortBy === 'load') {
    items.sort(function(a, b){ return (Number(b.installs) || 0) - (Number(a.installs) || 0); });
  } else if (state.searchSortChecked) {
    items.sort(function(a, b){
      var ac = inQueueKey(searchKeyOf(a)) ? 0 : 1;
      var bc = inQueueKey(searchKeyOf(b)) ? 0 : 1;
      return ac - bc;
    });
  }
  return items;
}
function runSearch(){
  var q = $('#searchInput').value.trim();
  if (searchTimer) clearTimeout(searchTimer);
  if (!q) {
    searchSeq++; /* clearing the input is newer state — any in-flight search is now stale */
    state.results = []; state.searchFailed = false; state.selectedSearchKey = null;
    renderResults(); renderSelSummary();
    if (state.tab === 'search') showSearchDetail(null);
    /* clear only a search-owned busy slot — a non-search label (install etc.)
       in flight must survive clearing the input (S-182 review OPTIONAL 1) */
    if (($('#busyText').textContent || '').indexOf('Searching') === 0) setBusy(null);
    return;
  }
  searchTimer = setTimeout(function(){
    var seq = ++searchSeq; /* captured at dispatch… */
    if (!state.installedAll) refreshInstalledAll();
    setBusy('Searching skills.sh…');
    api('/api/search?q=' + encodeURIComponent(q))
      .then(function(d){
        if (seq !== searchSeq) return; /* …checked at resolve: stale, drop */
        state.results = d.results || [];
        state.searchFailed = !!d.failed;
        if (!selectedSearchResult()) {
          state.selectedSearchKey = state.results[0] ? searchKeyOf(state.results[0]) : null;
        }
        renderResults();
        renderSelSummary();
        if (state.tab === 'search') showSearchDetail(selectedSearchResult());
        if (d.adjustedQuery) toast('No exact matches, showing results for “' + d.adjustedQuery + '”', 'success');
      })
      .catch(function(e){ if (seq !== searchSeq) return; play('error'); toast(e.message, 'error'); })
      .finally(function(){ if (seq === searchSeq) setBusy(null); });
  }, 300);
}

function installedKey(source, name){ return (source || '') + '#' + (name || ''); }
function installedEntry(source, name){
  var pool = state.installedAll || state.skills;
  var key = installedKey(source, name);
  var hits = pool.filter(function(s){ return s.source && installedKey(s.source, s.name) === key; });
  return hits[0] || null;
}
function refreshInstalledAll(){
  return Promise.all([api('/api/skills?scope=project'), api('/api/skills?scope=global')])
    .then(function(rs){ state.installedAll = rs[0].skills.concat(rs[1].skills); })
    .catch(function(){ state.installedAll = state.skills; });
}
function installSingleSkill(source, name){
  play('confirm');
  setBusy('Installing ' + name + '…');
  var scopeBtn = document.querySelector('.scope-toggle button[aria-pressed="true"]');
  var installGlobal = scopeBtn ? scopeBtn.getAttribute('data-scope') === 'global' : false;
  return api('/api/install', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: source, skill: name, global: installGlobal }) })
    .then(function(res){
      if (res.ok) {
        play('success');
        toast('Installed ' + name, 'success');
        // A6: refresh the installed pools and re-render in place — the
        // installed chip and disabled button appear without a tab re-entry.
        return refreshInstalledAll().then(function(){
          renderResults();
          if (state.tab === 'search' && state.selectedSearchKey) showSearchDetail(selectedSearchResult());
        });
      }
      play('error');
      toast('Install failed for ' + name, 'error');
    })
    .catch(function(e){ play('error'); toast(e.message, 'error'); })
    .finally(function(){ setBusy(null); });
}
function addToQueue(source, name){
  var qk = source + '#' + name;
  if (inQueueKey(qk)) return;
  state.queue.push({ key: qk, source: source, name: name });
  play('confirm');
  toast('Added ' + name + ' to install list (' + state.queue.length + ')', 'success');
  renderResults(); renderSelSummary(); updateSearchTabBadge();
  if (state.tab === 'search' && state.selectedSearchKey) showSearchDetail(selectedSearchResult());
}
function removeFromQueue(qk){
  state.queue = state.queue.filter(function(x){ return x.key !== qk; });
  renderResults(); renderSelSummary(); updateSearchTabBadge();
  if (state.tab === 'search' && state.selectedSearchKey) showSearchDetail(selectedSearchResult());
}
function renderResults(){
  var list = $('#results');
  if (!list) return;
  list.innerHTML = '';
  var items = sortedResults();
  if (!items.length) {
    if (state.searchFailed) {
      list.innerHTML = '<div class="empty search-error">search failed: skills.sh unreachable</div>';
      return;
    }
    list.innerHTML = '<div class="empty">' + ($('#searchInput').value.trim() ? 'No results' : 'Type to search the skills.sh registry') + '</div>';
    return;
  }
  var scopeUpdates = state.updates[state.scope] || {};
  items.forEach(function(r, i){
    var li = document.createElement('li');
    var src = r.source || r.slug;
    var qk = searchKeyOf(r);
    li.style.setProperty('--i', i);
    li.setAttribute('data-key', qk);
    li.setAttribute('role', 'option');
    li.tabIndex = 0;
    var isSel = state.selectedSearchKey === qk;
    li.setAttribute('aria-selected', String(isSel));
    if (isSel) li.classList.add('selected');
    var installed = installedEntry(r.source, r.name);
    var sameScope = installed && installed.scope === state.scope;
    var up = sameScope ? scopeUpdates[r.name] : null;
    var inQueue = inQueueKey(qk);
    li.innerHTML =
      '<input type="checkbox" class="result-check" aria-label="Select ' + esc(r.name) + '"' + (inQueue ? ' checked' : '') + '>' +
      '<div class="skill-main">' +
      '<div class="result-head"><span class="result-name">' + esc(r.name) + '</span>' +
      (installed ? '<span class="result-chip">' + (up && up.updateAvailable ? 'update available' : 'installed') + (sameScope ? ' · ' + esc(installed.scope) : '') + '</span>' : '') +
      '<span class="result-installs">' + esc(String(r.installs)) + ' installs</span></div>' +
      '<span class="result-source">' + esc(src) + '</span>' +
      '<div class="result-actions">' +
      /* UI-05: inQueue/sameScope are independent reasons recorded as
         semantic markers; the writer reconciles busy on top at append. */
      '<button class="btn btn-sm add-btn' + (inQueue ? ' added' : '') + '"' + (inQueue ? ' data-semantic-disabled="true" title="Already in your install list"' : '') + '>' +
      (inQueue ? '✓ In list' : '+ Add to list') + '</button>' +
      '<button class="btn btn-sm primary install-btn"' + (sameScope ? ' data-semantic-disabled="true" title="Already installed in ' + esc(state.scope) + ' scope"' : '') + '>' +
      (sameScope ? 'Installed' : 'Install') + '</button></div></div>';
    li.querySelector('.add-btn').addEventListener('click', function(ev){
      ev.stopPropagation();
      addToQueue(src, r.name);
    });
    li.querySelector('.install-btn').addEventListener('click', function(ev){
      ev.stopPropagation();
      installSingleSkill(src, r.name);
    });
    list.appendChild(li);
    syncButtons(li); /* UI-05: newly attached .btn nodes inherit busy/semantic state */
  });
}

function showSearchDetail(r){
  if (state.tab !== 'search') return;
  var pane = $('#detailPane');
  if (!pane) return;
  if (!r) {
    pane.innerHTML = '<div class="empty">Select a search result to inspect its source and install options.</div>';
    return;
  }
  var src = r.source || r.slug || '';
  var qk = searchKeyOf(r);
  var installed = installedEntry(r.source, r.name);
  var sameScope = installed && installed.scope === state.scope;
  var scopeUpdates = state.updates[state.scope] || {};
  var up = sameScope ? scopeUpdates[r.name] : null;
  var inQueue = inQueueKey(qk);
  var cachedSiblings = state.sourceSkillsCache[src];
  var siblingsHtml = '';
  if (Array.isArray(cachedSiblings)) {
    if (!cachedSiblings.length) {
      siblingsHtml = '<p class="hint">No sibling skills reported for ' + esc(src) + '.</p>';
    } else {
      siblingsHtml = '<div class="row" style="margin-bottom:8px;justify-content:space-between;align-items:center">' +
        '<strong>Skills in ' + esc(src) + ' (' + cachedSiblings.length + ')</strong>' +
        '<button class="btn btn-sm primary" id="installAllSourceBtn">Install all from source</button></div>' +
        '<div style="display:grid;gap:4px">' +
        cachedSiblings.map(function(sk){
          var sqk = src + '#' + sk.name;
          var sQueued = inQueueKey(sqk);
          var sInst = installedEntry(src, sk.name);
          var sSame = sInst && sInst.scope === state.scope;
          return '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--t-surface);border:1px solid var(--t-border);border-radius:6px">' +
            '<span style="font-weight:600;color:var(--t-text);font-size:13px">' + esc(sk.name) + '</span>' +
            (sInst ? '<span class="chip">installed' + (sSame ? ' · ' + esc(sInst.scope) : '') + '</span>' : '') +
            '<span style="flex:1;font-size:12px;color:var(--t-textMuted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sk.description || '') + '</span>' +
            '<button class="btn btn-sm sibling-queue-btn" data-sibling="' + esc(sk.name) + '"' + (sQueued ? ' data-semantic-disabled="true"' : '') + '>' + (sQueued ? '✓ In list' : '+ Add to list') + '</button>' +
            '</div>';
        }).join('') + '</div>';
    }
  } else if (src) {
    siblingsHtml = '<button class="btn" id="browseSourceBtn">Browse skills in ' + esc(src) + '</button>';
  }
  pane.innerHTML =
    '<div class="detail-head">' +
      '<div>' +
        '<h2 class="detail-title">' + esc(r.name) + '</h2>' +
        '<div class="detail-meta">' +
          '<span class="chip accent">' + esc(src) + '</span>' +
          '<span class="chip">' + esc(String(r.installs)) + ' installs</span>' +
          '<span class="chip">target: ' + esc(state.scope) + '</span>' +
          (installed ? '<span class="chip">installed (' + esc(installed.scope) + ')</span>' : '') +
          (up && up.updateAvailable ? '<span class="chip update" title="' + esc((up.installedHash || '').slice(0, 7) + ' → ' + (up.upstreamHash || '').slice(0, 7)) + '">update available</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="btn" id="detailQueueToggleBtn">' + (inQueue ? 'Remove from list' : '+ Add to list') + '</button>' +
        '<button class="btn primary" id="detailInstallBtn"' + (sameScope ? ' data-semantic-disabled="true" title="Already installed in ' + esc(state.scope) + ' scope"' : '') + '>' + (sameScope ? 'Installed' : 'Install') + '</button>' +
        (sameScope ? '<button class="btn' + (up && up.updateAvailable ? ' primary' : '') + '" id="detailUpdateBtn">Update</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="md">' +
      '<p>Registry skill <code>' + esc(r.name) + '</code> from <code>' + esc(src) + '</code> (' + esc(String(r.installs)) + ' recorded installs on skills.sh).</p>' +
      '<div id="sourceSkillsBox" style="margin-top:16px">' + siblingsHtml + '</div>' +
    '</div>';
  syncButtons(pane);
  var qBtn = $('#detailQueueToggleBtn');
  if (qBtn) {
    qBtn.addEventListener('click', function(){
      if (inQueueKey(qk)) removeFromQueue(qk);
      else addToQueue(src, r.name);
    });
  }
  var iBtn = $('#detailInstallBtn');
  if (iBtn) {
    iBtn.addEventListener('click', function(){ installSingleSkill(src, r.name); });
  }
  var uBtn = $('#detailUpdateBtn');
  if (uBtn) {
    uBtn.addEventListener('click', function(){ updateSkills([r.name], state.scope === 'global'); });
  }
  var bBtn = $('#browseSourceBtn');
  if (bBtn) {
    bBtn.addEventListener('click', function(){
      setBusy('Discovering skills in ' + src + '…');
      api('/api/source-skills?source=' + encodeURIComponent(src))
        .then(function(d){
          state.sourceSkillsCache[src] = d.skills || [];
          if (state.tab === 'search' && state.selectedSearchKey === qk) showSearchDetail(r);
        })
        .catch(function(e){ play('error'); toast(e.message, 'error'); })
        .finally(function(){ setBusy(null); });
    });
  }
  var allSrcBtn = $('#installAllSourceBtn');
  if (allSrcBtn) {
    allSrcBtn.addEventListener('click', function(){
      setBusy('Installing all skills from ' + src + '…');
      api('/api/install', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: src, skills: ['*'], global: state.scope === 'global' }) })
        .then(function(res){
          if (res.ok) {
            play('success');
            toast('Installed skills from ' + src, 'success');
            refreshInstalledAll().then(function(){
              renderResults();
              if (state.tab === 'search' && state.selectedSearchKey === qk) showSearchDetail(r);
            });
          } else {
            play('error');
            toast(clip(res.output, 240) || 'Install failed', 'error');
          }
        })
        .catch(function(e){ play('error'); toast(e.message, 'error'); })
        .finally(function(){ setBusy(null); });
    });
  }
  pane.querySelectorAll('.sibling-queue-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sName = btn.getAttribute('data-sibling');
      if (sName) addToQueue(src, sName);
    });
  });
}

/* ---------- install queue ---------- */
function updateSearchTabBadge(){
  var searchTab = document.querySelector('[data-tab="search"]');
  if (searchTab) searchTab.textContent = 'Search' + (state.queue.length ? ' (' + state.queue.length + ')' : '');
  var iqBtn = $('#installQueueBtn');
  if (iqBtn) {
    iqBtn.style.display = state.queue.length ? '' : 'none';
    iqBtn.textContent = 'Install selected (' + state.queue.length + ')';
  }
}
function installQueue(){
  var groups = new Map();
  state.queue.forEach(function(q){
    var names = groups.get(q.source) || [];
    names.push(q.name);
    groups.set(q.source, names);
  });
  var entries = Array.from(groups.entries());
  var total = state.queue.length;
  var done = 0, failed = 0;
  /* S-202: capture the scope ONCE before the next() recursion — the scope
     toggle stays usable while the list installs, so every request body must
     carry the start-of-batch scope, never the live state.scope. */
  var installGlobally = state.scope === 'global';
  var next = function(){
    if (!entries.length) {
      state.queue = [];
      renderResults(); renderSelSummary(); updateSearchTabBadge();
      if (failed) { play('error'); toast('Installed ' + (total - failed) + ', failed ' + failed, 'error'); }
      else { play('success'); toast('Installed ' + total + ' skill' + (total === 1 ? '' : 's'), 'success'); }
      refreshInstalledAll().then(function(){
        renderResults();
        if (state.tab === 'search' && state.selectedSearchKey) showSearchDetail(selectedSearchResult());
      });
      loadSkills();
      return;
    }
    var entry = entries.shift();
    setBusy('Installing ' + entry[1].join(', ') + '…');
    api('/api/install', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: entry[0], skills: entry[1], global: installGlobally }) })
      .then(function(res){ if (res.ok) done += entry[1].length; else failed += entry[1].length; })
      .catch(function(){ failed += entry[1].length; })
      .finally(function(){ setBusy(null); next(); });
  };
  play('confirm');
  next();
}

/* ---------- tabs, scope, settings ---------- */
function setTab(tab){
  cancelFilterRender(); // S-180: a pending filter render must not fire into another view
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(function(t){ t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === tab)); });
  updateSearchTabBadge();
  document.body.classList.toggle('view-search', tab === 'search');
  var isSearch = tab === 'search';
  $('#listPane').setAttribute('aria-label', isSearch ? 'Registry search' : 'Installed skills');
  $('#filter').style.display = isSearch ? 'none' : '';
  $('#agentsWrap').style.display = isSearch ? 'none' : '';
  $('#searchInput').style.display = isSearch ? '' : 'none';
  $('#skillList').style.display = isSearch ? 'none' : '';
  $('#results').style.display = isSearch ? '' : 'none';
  var loadSortBtn = document.querySelector('[data-sort="load"]');
  if (loadSortBtn) loadSortBtn.textContent = isSearch ? 'Installs' : 'Load order';
  renderSelSummary();
  if (isSearch) {
    $('#searchInput').focus();
    showSearchDetail(selectedSearchResult());
    refreshInstalledAll().then(function(){
      if (state.results.length) {
        renderResults();
        if (state.tab === 'search') showSearchDetail(selectedSearchResult());
      }
    });
  } else if (tab === 'installed') {
    loadSkills().then(function(){ return checkForUpdates(false); });
  }
}

function uniqueAgents(){
  var set = new Set();
  state.skills.forEach(function(s){ (s.agents || []).forEach(function(a){ set.add(a); }); });
  return Array.from(set).sort();
}
function agentsActive(){ return state.agentFilter && state.agentFilter.size > 0; }
function renderAgentsPop(){
  var list = $('#agentsList');
  list.innerHTML = '';
  var agents = uniqueAgents();
  agents.forEach(function(a){
    var row = document.createElement('label');
    var checked = state.agentFilter ? state.agentFilter.has(a) : true;
    row.innerHTML = '<input type="checkbox" value="' + esc(a) + '"' + (checked ? ' checked' : '') + '><span>' + esc(a) + '</span>';
    row.querySelector('input').addEventListener('change', function(ev){
      if (!state.agentFilter) state.agentFilter = new Set(uniqueAgents());
      if (ev.target.checked) state.agentFilter.add(a); else state.agentFilter.delete(a);
      if (state.agentFilter.size === uniqueAgents().length) state.agentFilter = null;
      renderList(); renderSelSummary();
    });
    list.appendChild(row);
  });
  if (!agents.length) list.innerHTML = '<div class="empty">No agents in installed skills.</div>';
  var btn = $('#agentsBtn');
  btn.textContent = agentsActive() ? 'Agents (' + state.agentFilter.size + ')' : 'Agents';
}
function toggleAgentsPop(){
  var pop = $('#agentsPop');
  if (pop.classList.contains('open')) { closeAgentsPop(); return; }
  renderAgentsPop();
  pop.classList.add('open');
}
function closeAgentsPop(){ $('#agentsPop').classList.remove('open'); }

function renderSelSummary(){
  var isSearch = state.tab === 'search';
  var n = isSearch ? state.queue.length : state.checked.size;
  /* S-187: count + Clear ride the Select all line (right-aligned); the row
     itself is permanent, so only the summary shows or hides. */
  $('#selSummary').classList.toggle('on', n > 0);
  $('#selCount').textContent = n;
  /* S-186: the selected-scope actions live in the top bar; they show only
     while a selection exists. */
  $('#updateCheckedBtn').style.display = (!isSearch && n) ? '' : 'none';
  $('#deleteCheckedBtn').style.display = (!isSearch && n) ? '' : 'none';
  updateSearchTabBadge();
  syncSelectAll();
}
/* S-186: the Select all master mirrors the active mode's visible set. Checked
   when every row is checked, indeterminate when some are, unchecked when none
   are. Runs on every render pass and every selection change. */
function syncSelectAll(){
  var box = $('#selectAllMaster');
  if (!box) return;
  if (state.tab === 'search') {
    var rItems = state.results || [];
    var rn = 0;
    rItems.forEach(function(r){ if (inQueueKey(searchKeyOf(r))) rn++; });
    var rAll = rItems.length > 0 && rn === rItems.length;
    box.checked = rAll;
    box.indeterminate = rn > 0 && !rAll;
    return;
  }
  var items = filteredSkills();
  var n = 0;
  items.forEach(function(s){ if (state.checked.has(s.name)) n++; });
  var all = items.length > 0 && n === items.length;
  box.checked = all;
  box.indeterminate = n > 0 && !all;
}
function setScope(scope){
  cancelFilterRender(); // S-180: a pending filter render must not fire into the other scope
  state.checked.clear();
  detailSeq++; /* S-204: a scope switch orphans any detail still in flight */
  state.scope = scope;
  document.querySelectorAll('[data-scope]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-scope') === scope)); });
  renderSelSummary();
  play('select');
  if (state.tab === 'search') {
    renderResults();
    if (state.selectedSearchKey) showSearchDetail(selectedSearchResult());
  }
  loadSkills();
}

function openSettings(open){
  $('#settings').classList.toggle('open', open);
  $('#scrim').classList.toggle('open', open);
}

/* ---------- wire up ---------- */
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click', function(){ setTab(t.getAttribute('data-tab')); play('select'); });
  });
  $('#installQueueBtn').addEventListener('click', installQueue);
  document.querySelectorAll('[data-scope]').forEach(function(b){
    b.addEventListener('click', function(){ setScope(b.getAttribute('data-scope')); });
  });
  $('#settingsBtn').addEventListener('click', function(){ openSettings(true); play('select'); });
  $('#settingsClose').addEventListener('click', function(){ openSettings(false); });
  $('#scrim').addEventListener('click', function(){ openSettings(false); });
  $('#updateCheckedBtn').addEventListener('click', function(){
    updateSkills(Array.from(state.checked), state.scope === 'global');
  });
  $('#deleteCheckedBtn').addEventListener('click', deleteChecked);
  $('#clearCheckedBtn').addEventListener('click', function(){
    if (state.tab === 'search') {
      state.queue = [];
      renderResults();
      renderSelSummary();
      updateSearchTabBadge();
      if (state.selectedSearchKey) showSearchDetail(selectedSearchResult());
      return;
    }
    state.checked.clear(); renderList(); renderSelSummary();
  });
  $('#agentsBtn').addEventListener('click', function(){ toggleAgentsPop(); });
  $('#agentsAll').addEventListener('click', function(){
    state.agentFilter = null; renderAgentsPop(); renderList(); renderSelSummary();
  });
  $('#agentsClear').addEventListener('click', function(){
    state.agentFilter = new Set(); renderAgentsPop(); renderList(); renderSelSummary();
  });
  $('#agentsDone').addEventListener('click', function(){ closeAgentsPop(); });
  $('#helpBtn').addEventListener('click', function(){ $('#helpDialog').showModal(); });
  $('#helpClose').addEventListener('click', function(){ $('#helpDialog').close(); });
  $('#connectBtn').addEventListener('click', function(){
    tryConnect($('#backendInput').value.trim(), $('#tokenInput').value.trim());
  });
  $('#connectState').addEventListener('click', openConnect);
  /* S-186: the master checkbox replaces the Select all button. Semantics
     preserved from the button for the add direction (every visible row,
     render + selection bar refreshed); all-checked now toggles off. */
  $('#selectAllMaster').addEventListener('change', function(){
    if (state.tab === 'search') {
      var rItems = state.results || [];
      var rAll = rItems.length > 0 && rItems.every(function(r){ return inQueueKey(searchKeyOf(r)); });
      rItems.forEach(function(r){
        var qk = searchKeyOf(r);
        if (rAll) {
          state.queue = state.queue.filter(function(q){ return q.key !== qk; });
        } else if (!inQueueKey(qk)) {
          state.queue.push({ key: qk, source: r.source || r.slug, name: r.name });
        }
      });
      play('confirm');
      renderResults(); renderSelSummary(); updateSearchTabBadge();
      if (state.selectedSearchKey) showSearchDetail(selectedSearchResult());
      return;
    }
    var items = filteredSkills();
    var all = items.length > 0 && items.every(function(s){ return state.checked.has(s.name); });
    items.forEach(function(s){
      if (all) state.checked.delete(s.name); else state.checked.add(s.name);
    });
    play('confirm');
    renderList(); renderSelSummary();
  });
  document.querySelectorAll('[data-sort]').forEach(function(b){
    b.addEventListener('click', function(){
      state.sortBy = b.getAttribute('data-sort');
      state.searchSortChecked = (state.sortBy === 'checked');
      document.querySelectorAll('[data-sort]').forEach(function(x){
        x.setAttribute('aria-pressed', String(x.getAttribute('data-sort') === state.sortBy));
      });
      play('select');
      if (state.tab === 'search') renderResults();
      else renderList();
    });
  });
  /* S-180: row events are delegated on the persistent list — row nodes are
     reused across renders, so per-row listeners would be re-attached (or
     dropped) on every reconcile. Semantics match the old per-row handlers:
     a checkbox click never selects the row; its change updates the checked
     set; Enter/Space on a row selects it. */
  var skillListEl = $('#skillList');
  skillListEl.addEventListener('click', function(ev){
    if (ev.target.closest && ev.target.closest('.skill-check')) { ev.stopPropagation(); return; }
    var li = ev.target.closest ? ev.target.closest('li[data-key]') : null;
    if (li) { selectSkill(rowNameOf(li)); play('select'); }
  });
  skillListEl.addEventListener('change', function(ev){
    var box = ev.target;
    if (!box.classList || !box.classList.contains('skill-check')) return;
    var li = box.closest ? box.closest('li[data-key]') : null;
    if (!li) return;
    var name = rowNameOf(li);
    if (box.checked) state.checked.add(name); else state.checked.delete(name);
    /* S-186: this handler mutates the checked set OUTSIDE renderList, so the
       row's stored signature must follow it: rowSignature includes 'c' for a
       checked row. A stale __sig made the next reconcile (Clear, and the
       update/remove flows) diff two equal signatures and skip the refresh,
       leaving boxes visually checked after state.checked.clear(). */
    for (var si = 0; si < state.skills.length; si++) {
      if (state.skills[si].name === name) { li.__sig = rowSignature(state.skills[si]); break; }
    }
    renderSelSummary();
    play('select');
  });
  skillListEl.addEventListener('keydown', function(ev){
    /* UI-06 (S-207): an interactive descendant (the row checkbox) owns its own
       keys — Space must reach the NATIVE checkbox toggle, so the delegated
       row handler returns before its preventDefault and the existing change
       handler above keeps owning the checked summary. */
    if (ev.target instanceof Element &&
        ev.target.closest('input,button,a,select,textarea,[contenteditable]')) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var li = ev.target.closest ? ev.target.closest('li[data-key]') : null;
    if (!li) return;
    ev.preventDefault();
    selectSkill(rowNameOf(li));
    play('select');
  });

  var resultsEl = $('#results');
  resultsEl.addEventListener('click', function(ev){
    if (ev.target.closest && ev.target.closest('input,button,a')) return;
    var li = ev.target.closest ? ev.target.closest('li[data-key]') : null;
    if (!li) return;
    var qk = li.getAttribute('data-key');
    state.selectedSearchKey = qk;
    resultsEl.querySelectorAll('li[data-key]').forEach(function(node){
      var isSel = node.getAttribute('data-key') === qk;
      node.classList.toggle('selected', isSel);
      node.setAttribute('aria-selected', String(isSel));
    });
    showSearchDetail(selectedSearchResult());
    play('select');
  });
  resultsEl.addEventListener('change', function(ev){
    var box = ev.target;
    if (!box.classList || !box.classList.contains('result-check')) return;
    var li = box.closest ? box.closest('li[data-key]') : null;
    if (!li) return;
    var qk = li.getAttribute('data-key');
    var hit = null;
    for (var i = 0; i < state.results.length; i++) {
      if (searchKeyOf(state.results[i]) === qk) { hit = state.results[i]; break; }
    }
    if (!hit) return;
    if (box.checked) addToQueue(hit.source || hit.slug, hit.name);
    else { removeFromQueue(qk); play('select'); }
  });
  resultsEl.addEventListener('keydown', function(ev){
    if (ev.target instanceof Element &&
        ev.target.closest('input,button,a,select,textarea,[contenteditable]')) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var li = ev.target.closest ? ev.target.closest('li[data-key]') : null;
    if (!li) return;
    ev.preventDefault();
    var qk = li.getAttribute('data-key');
    state.selectedSearchKey = qk;
    resultsEl.querySelectorAll('li[data-key]').forEach(function(node){
      var isSel = node.getAttribute('data-key') === qk;
      node.classList.toggle('selected', isSel);
      node.setAttribute('aria-selected', String(isSel));
    });
    showSearchDetail(selectedSearchResult());
    play('select');
  });

  /* S-238: user-adjustable #listPane width via #listSplitter + #settings */
  var listWidthSaveTimer = null;
  function persistListWidthDebounced(px){
    if (listWidthSaveTimer) clearTimeout(listWidthSaveTimer);
    listWidthSaveTimer = setTimeout(function(){
      listWidthSaveTimer = null;
      setPrefs({ listWidth: px });
    }, 150);
  }
  var splitter = $('#listSplitter');
  var mainEl = document.querySelector('main');
  if (splitter && mainEl) {
    var dragging = false;
    splitter.addEventListener('pointerdown', function(ev){
      if (ev.button && ev.button !== 0) return;
      ev.preventDefault();
      dragging = true;
      splitter.classList.add('dragging');
      if (splitter.setPointerCapture && ev.pointerId != null) {
        try { splitter.setPointerCapture(ev.pointerId); } catch (_) {}
      }
    });
    splitter.addEventListener('pointermove', function(ev){
      if (!dragging) return;
      var rect = mainEl.getBoundingClientRect();
      var w = clampListWidth(ev.clientX - rect.left);
      if (w != null) {
        state.prefs.listWidth = w;
        applyListWidth(w);
      }
    });
    var endDrag = function(ev){
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('dragging');
      if (splitter.releasePointerCapture && ev && ev.pointerId != null) {
        try { splitter.releasePointerCapture(ev.pointerId); } catch (_) {}
      }
      setPrefs({ listWidth: state.prefs.listWidth });
    };
    splitter.addEventListener('pointerup', endDrag);
    splitter.addEventListener('pointercancel', endDrag);
    splitter.addEventListener('dblclick', function(){
      if (listWidthSaveTimer) clearTimeout(listWidthSaveTimer);
      setPrefs({ listWidth: null });
      play('confirm');
    });
    splitter.addEventListener('keydown', function(ev){
      var step = ev.shiftKey ? 32 : 16;
      var cur = state.prefs.listWidth != null
        ? state.prefs.listWidth
        : Math.round($('#listPane').getBoundingClientRect().width || 360);
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        var nextW = clampListWidth(cur + (ev.key === 'ArrowRight' ? step : -step));
        state.prefs.listWidth = nextW;
        applyListWidth(nextW);
        persistListWidthDebounced(nextW);
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        state.prefs.listWidth = LIST_W_MIN;
        applyListWidth(LIST_W_MIN);
        persistListWidthDebounced(LIST_W_MIN);
      } else if (ev.key === 'End') {
        ev.preventDefault();
        state.prefs.listWidth = LIST_W_MAX;
        applyListWidth(LIST_W_MAX);
        persistListWidthDebounced(LIST_W_MAX);
      } else if (ev.key === '0' || ev.key === 'Backspace' || ev.key === 'Delete') {
        ev.preventDefault();
        if (listWidthSaveTimer) clearTimeout(listWidthSaveTimer);
        setPrefs({ listWidth: null });
      }
    });
  }
  var listWidthRange = $('#listWidthRange');
  if (listWidthRange) {
    listWidthRange.addEventListener('input', function(ev){
      var w = clampListWidth(Number(ev.target.value));
      if (w != null) {
        state.prefs.listWidth = w;
        applyListWidth(w);
        persistListWidthDebounced(w);
      }
    });
  }
  var listWidthReset = $('#listWidthReset');
  if (listWidthReset) {
    listWidthReset.addEventListener('click', function(){
      if (listWidthSaveTimer) clearTimeout(listWidthSaveTimer);
      setPrefs({ listWidth: null });
      play('confirm');
    });
  }

  /* S-180: the filter render is debounced (trailing edge) — the listener
     only arms the timer; no filtering happens until it fires. */
  $('#filter').addEventListener('input', scheduleFilterRender);
  $('#filter').addEventListener('keydown', function(ev){ if (ev.key === 'Escape') { ev.preventDefault(); ev.target.blur(); } }); // Esc keeps the text + the applied filter
  $('#searchInput').addEventListener('input', runSearch);
  $('#updateAllBtn').addEventListener('click', function(){ updateSkills([], state.scope === 'global'); });
  $('#checkUpdatesBtn').addEventListener('click', function(){ checkForUpdates(true); });

  document.querySelectorAll('[data-theme-choice]').forEach(function(b){
    b.addEventListener('click', function(){ setPrefs({ theme: b.getAttribute('data-theme-choice') }); play('confirm'); });
  });
  $('#themeToggle').addEventListener('click', function(){
    setPrefs({ theme: state.prefs.theme === 'mocha' ? 'latte' : 'mocha' });
    play('confirm');
  });
  document.querySelectorAll('[data-sound-choice]').forEach(function(b){
    b.addEventListener('click', function(){
      var on = b.getAttribute('data-sound-choice') === 'on';
      setPrefs({ sound: on });
      if (on) play('confirm');
    });
  });
  document.querySelectorAll('[data-motion-choice]').forEach(function(b){
    b.addEventListener('click', function(){
      var v = b.getAttribute('data-motion-choice');
      setPrefs({ reduceMotion: v === 'auto' ? 'auto' : v === 'true' });
      play('confirm');
    });
  });

  var portInput = $('#portInput');
  if (portInput) {
    // Default to the port actually serving this session.
    portInput.value = window.__PORT__ || '';
    $('#portNow').textContent = window.__PORT__ ? 'port ' + window.__PORT__ : 'a random port';
    portInput.addEventListener('change', function(){
      var raw = portInput.value.trim();
      if (!raw) {
        setPrefs({ port: null });
        play('confirm');
        toast('Port cleared: next launch picks a random unused port', 'success');
        return;
      }
      var n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        play('error');
        toast('Port must be a whole number from 1 to 65535', 'error');
        portInput.value = window.__PORT__ || '';
        return;
      }
      setPrefs({ port: n });
      play('confirm');
      toast('Port ' + n + ' saved, applies on next launch', 'success');
    });
  }

  $('#confirmNo').addEventListener('click', function(){ $('#confirmDialog').close(); });

  // click ripple
  document.addEventListener('click', function(ev){
    var btn = ev.target.closest ? ev.target.closest('.btn') : null;
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var rip = document.createElement('span');
    rip.className = 'ripple';
    var size = Math.max(rect.width, rect.height);
    rip.style.width = rip.style.height = size + 'px';
    rip.style.left = (ev.clientX - rect.left - size / 2) + 'px';
    rip.style.top = (ev.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(rip);
    setTimeout(function(){ rip.remove(); }, 550);
  });

  renderSelSummary();
  document.addEventListener('keydown', function(ev){
    var key = ev.key;
    var typing = /^(input|textarea|select)$/i.test((ev.target.tagName || ''));
    if (key === 'Escape') {
      if ($('#helpDialog').open) { $('#helpDialog').close(); return; }
      if ($('#agentsPop').classList.contains('open')) { closeAgentsPop(); return; }
      if ($('#settings').classList.contains('open')) { openSettings(false); return; }
      if (ev.target === $('#filter')) { ev.target.blur(); return; } // keep applied filter
      if (ev.target === $('#searchInput')) { ev.preventDefault(); ev.target.blur(); return; } // Esc keeps the query + the rendered results
      return;
    }
    if (typing) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (key === '/') {
      ev.preventDefault();
      document.querySelector('[data-tab="search"]').click();
      $('#searchInput').focus();
    } else if (key === 'f') {
      ev.preventDefault();
      if (state.tab !== 'installed') setTab('installed');
      $('#filter').focus();
    } else if (key === '?') {
      ev.preventDefault();
      $('#helpDialog').showModal();
    } else if (key === 'g' || key === 'p') {
      var scope = key === 'g' ? 'global' : 'project';
      var btn = document.querySelector('[data-scope="' + scope + '"]');
      if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click();
    } else if (key === 'a') {
      ev.preventDefault();
      if (state.tab !== 'installed') setTab('installed');
      toggleAgentsPop();
    } else if (key === 'i') {
      ev.preventDefault();
      if (state.tab !== 'installed') setTab('installed');
    } else if (key === 'x') {
      ev.preventDefault();
      openSettings(true);
    }
  });
  document.addEventListener('click', function(ev){
    var wrap = document.querySelector('#agentsWrap');
    if (wrap && !wrap.contains(ev.target)) closeAgentsPop();
  });

  applyPrefs();
  if (HOSTED) {
    $('#connectState').style.display = '';
    migrateLegacyStorage();
    var savedBase = storageGet(LS_BACKEND), savedToken = storageGet(LS_TOKEN);
    if (savedBase && savedToken) {
      probeBackend(savedBase, savedToken, function(){})
        .then(function(){
          state.backend = savedBase; state.token = savedToken;
          connectedDot(true);
          boot();
        })
        .catch(function(){ connectedDot(false); openConnect(); });
    } else {
      connectedDot(false);
      openConnect();
    }
  } else {
    boot();
  }
});

function boot(){
  setTab('installed');
  applySeed();
}
})();
`;

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
  <div id="listSplitter" role="separator" aria-orientation="vertical" aria-label="Resize skill list pane" tabindex="0" aria-valuemin="${LIST_WIDTH_MIN}" aria-valuemax="${LIST_WIDTH_MAX}" aria-valuenow="${initialPrefs.listWidth ?? 360}" title="Drag to resize list pane (double-click to reset)"></div>
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
      <input id="listWidthRange" type="range" min="${LIST_WIDTH_MIN}" max="${LIST_WIDTH_MAX}" step="4" value="${initialPrefs.listWidth ?? 360}">
      <span class="val" id="listWidthValue">${initialPrefs.listWidth != null ? `${initialPrefs.listWidth} px` : "Auto (35%)"}</span>
      <button class="btn btn-sm" id="listWidthReset" type="button">Reset</button>
    </div>
    <p class="hint">Drag the divider between panes or adjust here (${LIST_WIDTH_MIN} to ${LIST_WIDTH_MAX} px).</p>
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
