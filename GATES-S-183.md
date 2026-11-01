# Gates: S-183 — 0.5.3 impl 7, TUI cold-global stale-while-revalidate + visibleSkills compute-once

OWNS: src/core/disk-index.ts (new), src/tui/app.ts, src/tui/model.ts, src/tui/Views.tsx, tests/tui-disk-index.test.ts (new), tests/tui.test.ts (cache-dir env guard), scripts/pty-smoke/runner.py (cache-dir default)

Scope: the TUI's first scope load paints a persisted per-scope index immediately (~0.13 ms load) while the real `skills ls` subprocess refreshes behind the existing busy label, swapping to truth with selection/checked reconciliation; the visibleSkills rider computes the filter+sort once per dispatch (model.visible memo) instead of twice. Budget row: cold global perceived first paint ≤ 300 ms — synthetic instruments here (count/behavior + in-process timing); the REAL-corpus number is measured at the gate (S-185).

- [x] G1: full suite green — 217 tests (199 + 18 new), 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green (cold + pre-seeded cache paths)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=e95d32160ca58c2b42cc5ccee90bb7eadb4a99df5d9debfffadf171a81073b69; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: the SWR + rider test file green — stale paint before any subprocess resolves, reconciliation (name-follow, seen-set prune, seeded checks survive), hostile-index resilience, mutation-rewrites-index, loadSeq race, rider pin
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/tui-disk-index.test.ts 2>&1 | grep -q "^ 0 fail" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=274c2be3ecd8d5448ee242897baf0ec5d4b4c8c306d09b007d5121a238af4903; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: synthetic strict budget still fully MET (no web-side regression)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1 && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=a2bbf46d202c2be1d93eb4e4b010130d54d368d2828bfdc356cdda360beda99a; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: cache hygiene — tests and smoke never touch the real ~/.cache/skills-ui (env override honored; the dir does not exist after a full run)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/tui-disk-index.test.ts >/dev/null 2>&1 && [ ! -d "$HOME/.cache/skills-ui" ] && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=a7c101a456a04505d34fbe18450449f273a7894ef927addd83900931a701628a; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Measured: persisted-index load median **0.13 ms** (300 entries, 50 reps; 0.133 after the statSync guard); full stale-paint apply path median 0.175 ms / p95 0.280 ms vs the ≤ 300 ms budget (implementer scratch harness; in-repo timing test logs the load median). Rider: one filter+sort per dispatch — keystroke model cost −53% (move 17.1→8.0 µs, filter-text 104.1→52.4 µs, scratch harness over 500 keystrokes @390 skills); structural pin: model.visible is the only render input (Views + app.ts read it; render-side visibleSkills calls gone).
- Review round 1: REQUEST-CHANGES, 2 Required. **R1 (behavioral)**: the stale paint's checked-prune dropped SEEDED checks (`skills ui update/remove` pre-checked names) that fresh truth still had — contradicted the ticket's no-lost-checks promise; reproduced by the reviewer, fixed with the seen-set rule (prune only names the model has actually shown in a loaded list), pinned by a seed→stale-paint→fresh-settle survivor test that also asserts the `d` gate lists the name. **R2 (test gap)**: the toggle-family forget()s were unpinned (deleting toggle-check's failed zero tests) — pinned with the same-dispatch checked-first re-sort assertion (["c","a","b"]). Cheap hardening taken: statSync size guard before readFileSync (multi-GB hostile file never read), opportunistic *.tmp sweep (idle > 60 s only, per-scope prefix) in saveDiskIndex, .catch on the stale-body promise.
- Reviewer mutation battery: loadSeq guard removal ⇒ 1 test fails; name-following removal ⇒ 1 test fails; both new pins fail on their target mutations (implementer-verified both directions, orchestrator re-ran the forget removal — 1 fail, restored byte-identical). Recorded-not-acted (with reasons): loadDetail body tokening (pre-existing untokened pattern, µs window, self-healing); busy single-slot semantics (pre-existing; S-182 fixed the search-owned case; broader unification is the 0.5.2-deferred ST1).
- Cache-dir resolution mirrors prefs.ts (env SKILLS_UI_CACHE_DIR beats explicit arg beats ~/.cache/skills-ui — the same precedence the sibling module uses and both test files rely on). Index writes atomic (same-dir per-pid tmp+rename); INVARIANT: the index is only ever WRITTEN from fresh subprocess truth (saveDiskIndex has exactly one call site, on the fresh-list path) — mutations never read it (walked by the reviewer).
- Ticket-body note: the body said "keyed by path+mtime"; the ratified design-guidance schema ({version, savedAt, skills}) has no mtime and staleness is handled by always-refresh SWR — implemented per the ratified schema (implementer gap disclosure, accepted).
