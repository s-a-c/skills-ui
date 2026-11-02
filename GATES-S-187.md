# Gates: S-187 — 0.5.3 smoke round 2: selection-line merge + TUI parity (+ release 0.5.3.1)

OWNS: src/web/page.ts, src/tui/Views.tsx (pane-title line + checkedTitle export), tests/page-smoke.test.ts, tests/e2e/hosted.e2e.ts, tests/tui.test.ts, docs/app.html; release artifacts per docs/release.md (item 3)

Scope: the human's re-pass — N selected + Clear join the Select-all line (height-stable), TUI↔web parity for the smoke rounds' semantics (checked count surfaced in the TUI pane title; update-seed intersected like the remove-seed), then release 0.5.3.1.

- [x] G1: full suite green — 230 tests, 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

- [x] G2: the new pins green — height-identity line (1280/390/320), TUI checked-count title + ladder table
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/page-smoke.test.ts 2>&1 | grep -q "^ 0 fail" && PATH="$HOME/.bun/bin:$PATH" bun test tests/tui.test.ts -t "checkedTitle" 2>&1 | grep -q "^ 0 fail" && PATH="$HOME/.bun/bin:$PATH" bun test tests/tui.test.ts -t "checked" 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=6f333c8adb613d33817a365105b22af0d8ebfff9d6e9c685456292fa1f1f7324; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

- [x] G3: pty-smoke + hosted e2e green (23)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 23 passed" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=ac4ae962723ebed0092438633c282beed6fc9f07990d0be05a3b3eb79723fb87; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

- [x] G4: page clean — export, parse, zero backticks, sloplint, dash gate, perf budget strict
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node -e "const fs=require('fs');const h=fs.readFileSync('docs/app.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g);require('vm').compileFunction(m[m.length-1].replace(/<\/?script>/g,''));if(h.includes(String.fromCharCode(96)))process.exit(1)" && node /Users/s-a-c/.agents/skills/hallmark/scripts/sloplint.mjs docs/app.html 2>&1 | grep -q "clean. 0 FAIL, 0 REFLEX, 0 WARN" && PATH="$HOME/.bun/bin:$PATH" bun test tests/dash-sweep.test.ts 2>&1 | grep -q "^ 0 fail" && PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1 && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7c7ae317710a3a04d6a0be931791bd98d3e7c7a5e404b1e111d17f6c514654b3; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

- [x] G5: no stale references — #selBar gone from src, tests, and the emitted page
  CHECK: [ -z "$(grep -rn "selBar" src/ tests/ 2>/dev/null)" ] && [ -z "$(grep -c "selBar" docs/app.html | grep -v "^0$")" ] && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=2345693a077cfbd2cf1e5c00c9c159dcf98df527a0f727def9b7c94df721ba01; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/smoke053; path=b4c10f371094/9 entries

## Notes

- **Item 1**: #selBar removed; count + Clear live in the permanent .list-head row (right-aligned inline-flex; the summary toggles display only — the 21px checkbox margin-box drives the row height in both states, so identity is STRUCTURAL, verified by the reviewer's line-box analysis and pinned exact-equality both directions). ≤560px hides the word "selected"; ≤480px additionally zeroes the "Select all" label text (bare master checkbox = the standard affordance; words stay in aria-label/title) — added during review because the orchestrator's 320px pin extension FAILED HONESTLY (Clear poked 12px past the 128px-content pane; F3 was real, now fixed and pinned at 1280/390/320).
- **Item 2 (parity)**: audit table in the ticket resolution. Concrete fixes: TUI pane title surfaces the CHECKED count while checks exist (` 1 checked of 2`, degrading past the 19-char S-162 ladder to ` M checked`; boundary table-tested after reviewer F2 — exactly 19 renders, 20 degrades); web update-seed now intersects seed names with the installed list like the remove-seed's G5 discipline (reviewer F1 — web state.checked was not pruned on load, diverging from the TUI's skills-loaded prune on stale/externally-removed seed names; now both surfaces count only the loaded list, with a not-installed error toast mirroring the remove path). Master-toggle predicates verified identical web↔TUI (all→none / some→all over the filtered set).
- Reviewer APPROVE, zero blockers; F1/F2/F3 all taken (F1 seed intersect + not-installed toast, F2 checkedTitle exported + table test, F3 the 320px pin that then caught the real overflow → the ≤480px label rule). F4 recorded (the "selected" word leaves the a11y tree at ≤560px — count reads as a bare number in context; a visually-hidden pattern is a future refinement). Declared gaps: checked count not visible mid-filter (title priority: agent → filter → checked → count-form; 19-char budget can't carry all); ` M checked` degrade drops the total past 19 chars (4-digit totals with checks — unreachable in practice).
- Suite 227 → **230/0** (height pin + TUI title pin + ladder table test); e2e 23; pty-smoke PASS (28 checks); sloplint clean; dash gate green; perf budget 11/11 strict exit 0. Two consecutive clean full runs post-fixes.
- Item 3 (release 0.5.3.1) executes after this ledger per docs/release.md; its evidence lands in the S-187 resolution.
