# Gates: S-177 — 0.5.3 impl 1, perf harness (budget script + perf-marked tests)

OWNS: scripts/perf/budget.ts, scripts/perf/report-2026-11-01.md (committed baseline artifact), tests/perf/helpers.ts, tests/perf/playwright-probes.ts, tests/perf/spawn-count.test.ts, tests/perf/search-stub.test.ts, tests/perf/filter-dom.test.ts, tests/fixtures/skills-shim.mjs (opt-in SKILLS_SHIM_CALLLOG hook only), package.json (perf:budget script entry only)

Scope: the S-155 harness decision — a committed budget script measuring all 11 ratified budget rows (synthetic default via shim 390+40; `--real` machine-local, CI-refused) plus count-only perf-marked bun tests. BUDGET-MISS rows on current main are the recorded baseline (fixes land in S-178…S-183). No `src/**` changes.

- [x] G1: full suite green — 165 existing + 11 new perf tests, 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green (shim touched) + hosted e2e green (21)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 21 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=1af97efb8529cb98ca90aad94c0031c55d53699d48ebf494ddb264507a2992b1; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: budget script completes the synthetic scenario end-to-end — dated header + all 11 ratified rows emitted, exit 0
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget >/tmp/gates-s177-budget.txt 2>/dev/null && [ "$(grep -c '^| ' /tmp/gates-s177-budget.txt)" -ge 12 ] && grep -q "^- generated: 20" /tmp/gates-s177-budget.txt && grep -q "filter matching alone" /tmp/gates-s177-budget.txt && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=a3d5f5a25eff3d454511e1521a1ec47b78c1a5f5fad7ce07ed46c1fa269e16fb; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: gate-mode behavior — --strict exits 1 on baseline misses; unknown arg exits 2; --real refused under CI exits 2
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1; s=$?; PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --wat >/dev/null 2>&1; u=$?; CI=1 PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --real >/dev/null 2>&1; c=$?; [ "$s" = 1 ] && [ "$u" = 2 ] && [ "$c" = 2 ] && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=94c89f298a97f041bfa486c88a415622796f94440e7c3c06f09b2723a715ef54; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: committed baseline report is the final format — matching-alone budget row present, rebuild row reports the ratio, dated 2026-11-01
  CHECK: grep -q "filter matching alone" scripts/perf/report-2026-11-01.md && grep -q "0/10 rows preserved" scripts/perf/report-2026-11-01.md && grep -q "^- generated: 2026-11-01" scripts/perf/report-2026-11-01.md && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=ed22bcd6f7e3ae86844956bb86456de4178cb4987a970454374c3fdce58ae3f7; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G6: perf tests are count/behavior asserts only — no numeric wall-clock thresholds anywhere in tests/perf (S-155 rule; absence validated by the mutation spot-check in Notes)
  CHECK: [ -z "$(grep -En 'toBeLessThan(OrEqual)?\([0-9]+\)' tests/perf/*.test.ts)" ] && echo G6-OK
  EXPECT: G6-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=721ac441d7695d32c24e1ffc342b42ecd71ae09d795f8dff055a599b57d131d3; exit=0; EXPECT=matched; output-sha256=6233fa6beb413a3b89a765ac4e145e64251faee409e778323811a8466b872b67; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G7: the committed baseline carries the expected verdict profile — 7 MET rows and the 4 recorded baseline BUDGET-MISS rows (in-flight dedup, rebuilds, replays, stale-overwrite)
  CHECK: [ "$(grep -c '| MET |' scripts/perf/report-2026-11-01.md)" -ge 7 ] && [ "$(grep -cE '\| BUDGET-MISS \|$' scripts/perf/report-2026-11-01.md)" -ge 4 ] && echo G7-OK
  EXPECT: G7-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=3ba33e74131e0bcc8da18aa4293ca674f4349489b58a2ae8f08a283c77fd1dcf; exit=0; EXPECT=matched; output-sha256=9ef95329c94722c81ecd21466f88e16a72b83ef3fa9ab721bb0bce99d4b8ff2a; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Reviewer (code-review-and-quality five axes, performance axis evidence-backed): APPROVE, 0 Critical / 0 Required. All 3 Optional + 4 Nit findings fixed before commit: probe timeout path is state-aware (a future no-mutation DOM-reuse render resolves `noMutation` instead of die()ing — the MET state must never be a harness error); rebuild row MET requires ALL rows preserved and reports the ratio; strict arg parser (rejects unknown args, accepts `--reps=N`); per-needle protocol documented in header + report; cold-rep servers stopped per-rep; `--out` refuses same-day overwrite without `--force`; Jenkins env vars added to the --real CI refusal.
- Mutation spot-check (orchestrator-run): inverting the shim's `SKILLS_SHIM_CALLLOG` gate failed exactly the 3 spawn-count baseline pins (the 4th test asserts absence and passes vacuously under that mutation — known, acceptable: it pins opt-in-ness, the count tests pin presence); restored byte-identical (`cmp`-verified), suite green again.
- Baseline numbers (synthetic, 2026-11-01, this machine, median-of-5): cold project 17.2 ms (≤ 500 MET) · warm list 16.6 ms (≤ 100 MET) · detail 16.4 ms (≤ 100 MET) · matching alone 0.1 ms @390 (≤ 5 MET) · filter render 2.8 ms/keystroke (≤ 50 MET) · cold-global perceived first paint 194.0 ms (≤ 300 MET) · search wrapper overhead 2.4 ms (≤ 50 MET) — all against the shim (fast ls); the REAL-corpus numbers are measured at each fix ticket and at the gate via `--real`. Baseline BUDGET-MISS (expected, fixes follow): 3 concurrent identical searches ⇒ 3 in flight; same-result keystroke ⇒ full rebuild (0/10 preserved); 10 animation replays; stale response overwrote newer render.
- `--real` implemented + CI-guarded (GitHub/GitLab/Circle/Travis/Buildkite/Jenkins variants verified refusing, exit 2) but not executed in this ticket: it is a multi-minute live-corpus run; first execution belongs to S-178's before/after.
- Known bun-runtime quirk documented in `closeBrowser()`: `browser.close()` hangs ~10 s under bun; bounded close + SIGKILL fallback.
- Suite time: 176 tests / ~21–26 s (perf subset ~1.5 s — well under the 30 s add limit).
