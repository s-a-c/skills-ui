# Gates: S-186 — 0.5.3 smoke round: live-page refinements + 2 bug fixes

OWNS: src/web/page.ts (APP_JS + APP_CSS + HTML template), tests/page-smoke.test.ts (new), tests/e2e/hosted.e2e.ts (2 assertions), tests/tui-disk-index.test.ts (settle-wait rider, test-only), docs/app.html (regenerated)

Scope: the human's manual-smoke pass on the released 0.5.3 page — icon-only header buttons, 35% list pane, select-all master-checkbox subheading, Update-selected/Remove-selected moved to the top bar, and two failing-test-first bug fixes (Clear leaving checkboxes visually checked; the detail Update button rendered unconditionally).

- [x] G1: full suite green — 227 tests (221 + 6 smoke pins), 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

- [x] G2: the smoke pins green (clear unchecks rows; update button gated; icons accessible + 32px+ targets; 448px/390px widths, no horizontal overflow; master tri-state; buttons in top bar)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/page-smoke.test.ts 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=4545ff67adcb46885d98ff78506bad441cf21a427b549f31685086b02ddbc09e; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

- [x] G3: pty-smoke + hosted e2e green (23)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 23 passed" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=ac4ae962723ebed0092438633c282beed6fc9f07990d0be05a3b3eb79723fb87; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

- [x] G4: hallmark + dash gates still clean on the regenerated page
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node /Users/s-a-c/.agents/skills/hallmark/scripts/sloplint.mjs docs/app.html 2>&1 | grep -q "clean. 0 FAIL, 0 REFLEX, 0 WARN" && PATH="$HOME/.bun/bin:$PATH" bun test tests/dash-sweep.test.ts 2>&1 | grep -q "^ 0 fail" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=041e67bd1de929dcf350a3729f6fff2136c60e8c6504e26b67ff03c5f45b6943; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

- [x] G5: emitted page parses, zero raw backticks, perf budget untouched (strict still fully MET)
  CHECK: PATH="$HOME/.bun/bin:$PATH" node -e "const fs=require('fs');const h=fs.readFileSync('docs/app.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g);require('vm').compileFunction(m[m.length-1].replace(/<\/?script>/g,''));if(h.includes(String.fromCharCode(96)))process.exit(1)" && PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1 && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=168ce857a00f1461becb684b9f8014469cc161b2b1b27d5071a9c98a95a5adbc; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

## Notes

- **Bug 4 (Clear) root cause**: S-180's delegated change handler mutated `state.checked` without refreshing the row's stored `__sig`, so the reconcile's "nothing changed" check skipped the content refresh after clear — checkboxes stayed visually checked while the count reset. Fix at the mutation point (recompute `li.__sig` after the toggle). Reviewer walked EVERY state.checked/state.updates mutation path (6 writers) — all now refresh or re-render; fix placement judged right (render-time recompute cannot detect a stale value that equals the new one; nulling the sig would rebuild and flicker focus; full renderList per click would reorder rows per click under checked-first sort).
- **Bug 5 (detail Update)**: markup AND listener gated on the existing `detailOutdated`; check-for-updates re-invokes showDetail, so the button appears exactly when a check ran and found an update (showDetail rebuilds the pane wholesale — no duplicate-listener path).
- Layout: pane `minmax(min(320px,40%),35%)` (448px @1280 pinned; 156px floor @390, detail unclipped); header gains max-width wrap; .list-head subheading with a native tri-state master checkbox (label for + focus-visible covered); Update/Remove selected sit after Update all, shown only with a selection.
- Reviewer APPROVE, zero blockers; visual pass at 1280/390 + light theme + intermediate widths, own harness. Recorded follow-ups (not this round): sort-seg crush at the 390 floor (pre-existing class, improved at 1280); header-wrap vertical scroll ≤720px (desktop-first; fix = header-height CSS var); connected-dot glyph variant unpinned behaviorally (static ternary, attribute-pinned).
- **Rider (test-only)**: the S-183 swap-reconcile settle now waits for the fresh detail BODY, not just the busy label — under the heavier 19-file suite the tokened body read landed a beat late ~2-in-3 runs (frame = beta header + gamma body), a pre-existing flake S-186's added load exposed; four consecutive clean full-suite runs post-fix (plus one clean reviewer run).
- Mutation spot-check (orchestrator-run): removing the `__sig` refresh fails exactly the 3 dependent pins (clear, master tri-state, top-bar buttons); restored byte-identical; green.
- sloplint note: the implementer's first icon pass failed gate 30a on text glyphs (☀/⚙) — replaced with static inline SVG constants before review; no interpolation into SVG (security walk clean), all content paths still esc()-escaped.
