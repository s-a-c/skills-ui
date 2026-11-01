# Gates: S-180 — 0.5.3 impl 4, web filter: debounce + DOM reuse + no animation replay

OWNS: src/web/page.ts (APP_JS + APP_CSS), tests/perf/filter-dom.test.ts, tests/perf/playwright-probes.ts (probe upkeep riding the ticket that changed the measured surface), scripts/perf/budget.ts (filter-row instrumentation + paint-row median hardening, same riding rule), docs/app.html (regenerated export artifact)

Scope: the web installed-filter's per-keystroke full rebuild (~390 li ≈ 4k nodes + ~1.6k listeners + an ~11 s rise cascade per keystroke) replaced by a 150 ms trailing debounce + keyed reconcile + first-paint-only entrance animation. UX semantics unchanged apart from the ratified debounce. Review round blocked the first cut (dead first-paint cascade, hidden O(N) row churn) — both fixed and pinned.

- [x] G1: full suite green — 190 tests (188 + 2 first-paint cascade pins), 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green + hosted e2e green (21)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 21 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=1af97efb8529cb98ca90aad94c0031c55d53699d48ebf494ddb264507a2992b1; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: the three filter budget rows MET on the synthetic scenario (render work, rebuilds, replays)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget 2>/dev/null | grep "^| filter render work" | grep -q "MET" && PATH="$HOME/.bun/bin:$PATH" bun run perf:budget 2>/dev/null | grep "^| filter full rebuilds" | grep -q "MET" && PATH="$HOME/.bun/bin:$PATH" bun run perf:budget 2>/dev/null | grep "^| filter animation replays" | grep -q "MET" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=6f39be1bf81e4bf67be41a484d668a1d51698f958002f8f8addd6aaffe643f94; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: first-paint cascade provable — the pins exist and pass (cascade plays on page load; never re-cascades after)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/perf/filter-dom.test.ts 2>&1 | grep -q "^ 0 fail" && grep -q "first-paint cascade" tests/perf/filter-dom.test.ts && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=23a94f0f53575edc562465553fb1537c531fddd94174403beda15e687e80da33; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: gate behavior intact — strict run exits 1 on the remaining (later-ticket) search misses
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict --reps 1 >/dev/null 2>&1; s=$?; [ "$s" = 1 ] && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=d784bb85a2c0690fa9a31a65e872bb5212273dd9c9752e0295bd23e0b87db54a; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G6: page export reproducible + clean — export runs, emitted main script parses, zero raw backticks in the emitted page
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node -e "const fs=require('fs');const m=fs.readFileSync('docs/app.html','utf8').match(/<script>([\s\S]*?)<\/script>/g);require('vm').compileFunction(m[m.length-1].replace(/<\/?script>/g,''));if(fs.readFileSync('docs/app.html','utf8').includes(String.fromCharCode(96)))process.exit(1)" && echo G6-OK
  EXPECT: G6-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=5035cec655c6adc1b2125b11fc4ff81bf51a4cd75671b384b16a0f12feb092a4; exit=0; EXPECT=matched; output-sha256=6233fa6beb413a3b89a765ac4e145e64251faee409e778323811a8466b872b67; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Baseline → after (synthetic, this machine): filter rebuilds 1 (0/10 preserved) MISS → **0 (no list mutation, 10/10 preserved) MET**; animation replays 10 MISS → **0 MET**; filter render work (new instrumentation) **0.9–1.0 ms median** vs ≤ 50 ms (identical-result needles are true no-ops measuring 0.5–0.6 ms; row-changing needles 1.0–2.4 ms); cold-global paint 52.3 ms MET (median of 5 fresh-serve reps). Remaining BUDGET-MISS rows: search in-flight dedup + stale overwrite (S-182).
- Review round 1: REQUEST-CHANGES, 1 Critical + 1 Required, both real. **C1**: the `.rise-in` strip ran on brand-new rows (cursor null on an empty list ⇒ every first-population row stripped before insertion) — the entrance cascade was fully dead, a UX regression wearing the fix's clothes, and the "0 replays" evidence was vacuous. Fixed: strip only already-connected nodes; new rows carry the class into insertion; stamped exactly once per page load. Two new pins prove the cascade plays on first paint (60/60 rows, animationName "rise") and never re-cascades on scope switches. **R1**: a leftover `needleChanged ||` clause forced innerHTML replacement of every kept row per keystroke (O(N) child churn — the exact waste class of the ticket) although rowHtml is needle-independent and rowSignature covers every content source. Clause deleted; changed needles over identical result sets now mutate nothing.
- Orchestrator harness upkeep riding this ticket (documented, reviewer-covered): the ≤ 50 ms row now charges the page's own `skills-ui:filter-render` User Timing measure (marks around every debounced pass — measures the render execution, excludes the ratified debounce wait AND browser frame pacing; perceived dispatch→render reported as context at ~154 ms); the cold-paint row is median-of-REPS with a fresh serve + page per rep (single samples swung ±100 ms); User Timing buffers cleared per pass (bounded); probe reports the true no-op cost on noMutation passes; budget's changed-needle no-op path samples the measure instead of dying (die retained for genuinely-never-rendered).
- Review round 2 (post-fix): the reviewer's verified-good list — debounce cancel paths (keystroke + immediate scope switch cannot render the wrong scope), delegation parity (checkbox/Enter/Space/aria), empty-match branch, esc-keeps-text, key collisions impossible, marks paired on throw, row focus survives renders (a11y improvement). Mutation spot-check (orchestrator-run): reintroducing C1 (unconditional strip) fails exactly the two cascade pins; restored byte-identical; suite green.
- Known timing note: the two no-op needles pay the 400 ms probe window each (~1.2 s per budget run) — cosmetic, recorded here so it is not "fixed" away later without thought.
