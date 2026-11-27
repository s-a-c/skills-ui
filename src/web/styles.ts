export const APP_CSS = `
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
  grid-template-columns:var(--list-col,35%) 0px 1fr;
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
.filter-row{padding:8px 16px 4px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}
.sort-row,.prov-row{padding:4px 16px;border-bottom:1px solid var(--t-border);display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.sort-row .seg,.prov-row .seg{flex-wrap:wrap;min-width:0}
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
.list-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 16px;color:var(--t-textMuted);font-size:12px;white-space:nowrap;min-width:0}
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
.skill-check,.result-check{width:15px;height:15px;accent-color:var(--t-primary);cursor:pointer;flex:none}
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
#healthWrap{position:relative}
.health-pill{display:inline-flex;align-items:center;gap:8px;font-size:12px;padding:4px 12px;border-radius:999px}
.health-dot{width:8px;height:8px;border-radius:50%;background:var(--t-textMuted);flex:none}
.health-pill[data-ok="true"]{border-color:var(--t-success)}
.health-pill[data-ok="true"] .health-dot{background:var(--t-success)}
.health-pill[data-ok="false"]{border-color:var(--t-danger)}
.health-pill[data-ok="false"] .health-dot{background:var(--t-danger)}
#healthPop{
  position:absolute;top:calc(100% + 8px);right:0;z-index:26;width:320px;max-height:320px;overflow:auto;
  background:var(--t-surface);border:1px solid var(--t-border);border-radius:12px;padding:12px;
  display:none;flex-direction:column;gap:8px;font-size:12.5px;
}
#healthPop.open{display:flex}
#healthPopStatus{font-weight:600;color:var(--t-text)}
#healthDetails{margin:0;padding-left:16px;color:var(--t-textMuted);display:flex;flex-direction:column;gap:4px}
#healthPop .row-actions{display:flex;gap:8px;justify-content:flex-end}
.prov-badge{
  font-size:11px;font-weight:600;padding:0 8px;border-radius:999px;flex:none;
  border:1px solid var(--t-border);color:var(--t-textMuted);background:var(--t-surfaceAlt);
}
.prov-badge.prov-locked{border-color:color-mix(in srgb,var(--a-blue) 45%,transparent);color:var(--t-text)}
.prov-badge.prov-linked{border-color:color-mix(in srgb,var(--a-peach) 55%,transparent);color:var(--t-text)}
.prov-badge.prov-local{border-color:color-mix(in srgb,var(--a-yellow) 55%,transparent);color:var(--t-text)}
#skillList li[aria-selected="true"] .prov-badge{
  color:var(--t-selectionText);border-color:color-mix(in srgb,var(--t-selectionText) 45%,transparent);
  background:color-mix(in srgb,var(--t-selectionText) 14%,transparent);
}
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
.skill-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.skill-name{font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;flex:1 1 auto}
.skill-title-unit,.result-title-unit{display:inline-flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0;max-width:100%;flex:1 1 auto}
.skill-name-text,.result-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.skill-desc{color:var(--t-textMuted);font-size:13px;margin-top:2px;text-align:left;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
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
.skill-main{display:flex;flex-direction:column;gap:8px;min-width:0}
.result-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.result-name{font-weight:700}
.result-installs{color:var(--t-textMuted);font-size:12px;white-space:nowrap;margin-left:auto}
.result-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.result-source{color:var(--t-textMuted);font-size:12.5px;font-family:ui-monospace,Menlo,monospace;overflow-wrap:anywhere;text-align:left;margin-right:auto;min-width:0}
.result-actions{display:inline-flex;flex-wrap:nowrap;gap:8px;margin-left:auto;flex-shrink:0}

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
