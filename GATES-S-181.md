# Gates: S-181 — 0.5.3 impl 5, hallmark 24b 4px re-space (57 waived → 0)

OWNS: src/web/page.ts (APP_CSS spacing values + waiver/stamp lines + the main-height offset + two inline spacing styles), docs/app.html (regenerated export artifact)

Scope: the 0.5.2 page-wide 24b waiver paid off — all 57 waived off-scale paddings/margins/gaps moved onto the project's 4px scale, zero kept nudges; the consequential main-height offset corrected (header height changed in this pass; the old constant was already stale at HEAD); waiver line replaced with the re-space note. Spacing only — no color/type/motion/selector/APP_JS changes (reviewer-audited).

- [x] G1: sloplint clean on the emitted page — 0 FAIL, 0 REFLEX, 0 WARN (the 57 waived instances gone, waiver removed)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node /Users/s-a-c/.agents/skills/hallmark/scripts/sloplint.mjs docs/app.html 2>&1 | grep -q "clean. 0 FAIL, 0 REFLEX, 0 WARN" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=5a2cba437ee0cbcdd02757ceeac7e1d017b6cfaf3ff05b033e9dc5841e47507b; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: full suite green (190, 0 fail)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=fffff2682d80d9574da0874065bf0ade029eba941642d2b52b4c5dfc86280f06; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: pty-smoke green + hosted e2e green (21)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 21 passed" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=17ef6509eb2eb888c93e4c69da4c2fe457aa37f1069ba454dafeed412f82824e; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: the emitted page carries the re-space note (waiver retired) and no off-scale inline spacing remains (node parses every style attribute's padding/margin values; >2px and not divisible by 4 fails — the first grep formulation was replaced after it failed honestly: its exclusion alternation could not match JS-built on-grid strings like margin-top:16px)
  CHECK: grep -q "re-space 24b" docs/app.html && node -e 'const s=require("fs").readFileSync("docs/app.html","utf8");const bad=[];for(const m of s.matchAll(/style="([^"]*)"/g)){for(const d of m[1].matchAll(/(?:padding|margin)[a-z-]*:\s*([^;"]+)/g)){for(const n of d[1].matchAll(/(\d+(?:\.\d+)?)px/g)){const v=parseFloat(n[1]);if(v>2&&v%4!==0)bad.push(m[1]+" -> "+v+"px")}}}if(bad.length){console.error(bad.join("\n"));process.exit(1)}' && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=3954bda3859c112dc29c6b72c8fea88a2002977099254474a6e3385d6977e80b; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: emitted main script parses; zero raw backticks in the emitted page
  CHECK: node -e "const fs=require('fs');const m=fs.readFileSync('docs/app.html','utf8').match(/<script>([\s\S]*?)<\/script>/g);require('vm').compileFunction(m[m.length-1].replace(/<\/?script>/g,''));if(fs.readFileSync('docs/app.html','utf8').includes(String.fromCharCode(96)))process.exit(1)" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=31853c205276d97b8c94fc9c98e4500ce88c25233ff8f7f9c06c3c5caa8806b7; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Re-space policy (implementer, reviewer-audited consistent): nearest 4px multiple; ties round DOWN inside components, UP between components; three deliberate deviations, all defensible (.btn vertical 7→8 for header accounting/target size; .chip/.result-chip and .q-remove 2→4 for pill legibility). Two pre-existing ≤2px micro-spacings left untouched (within sloplint 24b's own v>2 tolerance) — "zero kept nudges" holds under the tool's definition.
- **Height compensation (loud, measured)**: `main{height:calc(100vh - 61px)}` → `calc(100vh - 66px)`. The header height changed in this pass (66.25px measured); the reviewer ALSO confirmed the old 61px was stale at HEAD (header measured 68.25px, 7px bottom overflow — the footer tip was visibly cut). After: scrollHeight−clientHeight = 0 at 1280x800 and 1440x900 (was +7); no horizontal overflow at any tested width.
- Reviewer (five axes + formal visual pass, HEAD-vs-respaced measurements both directions): REQUEST-CHANGES on one Required — the new stamp line claimed "every padding/margin/gap" on-grid while two INLINE styles (invisible to sloplint, which parses only the stylesheet) were off-scale: busyBar `padding:8px 22px` (:1779) and the help-dialog row `margin-top:14px` (:1899). Fixed to 20px/16px by the orchestrator (fixing the values beats weakening the claim). Optionals recorded: mobile 390px wrapped-header under-compensation is pre-existing and IMPROVED by the pass (+31 → +24 vertical); scope-toggle effective height 31.3px sits just under the 32px comfort line (WCAG 2.2 24px minimum met; desktop-first acceptable). Visual pass per screen: 7/7 PASS (rows/chips/detail-markdown/search/settings/toast/empty), mobile PASS-with-notes.
- Mutation spot-check (orchestrator-run): reintroducing one 9px margin → sloplint REFLEX 24b flags it (2 findings); restored → clean. The gate sees what it claims to see.
- Census: reviewer verified the substantive claim (zero >2px off-scale padding/margin/gap remains in APP_CSS) by systematic scan; the "57" count is the implementer's from the waiver list (sloplint's own before-line: `0 FAIL, 0 WARN, 57 WAIVED`).
