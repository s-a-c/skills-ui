# Gates: 0.5.3 — budget ledger + release (S-185)

OWNS: GATES-0.5.3.md, scripts/perf/report-2026-11-01-real.md (committed real-scenario artifact), scripts/perf/budget.ts (report-name suffix + real-probe fixes made during the gate run, documented below), release artifacts (version bump, checksums manifest, ROADMAP) — the latter land on main with the release commits.

Acceptance rule (ratified in S-155): per hot path — budget (ratified number) / measured (harness output, dated, machine noted) / verdict (`MET` or `ACCEPTED-WITH-REASON` + reason). Count-based paths cite bun-test evidence; wall-clock paths cite the committed script reports (synthetic + real). No third state.

## The table

| # | Hot path | Budget | Measured — synthetic (2026-11-01, shim 390+40) | Measured — real (2026-11-01, this machine: 1 project + 300 global skills, canonical skills-project cwd) | Verdict |
|---|---|---|---|---|---|
| 1 | Warm list, any scope | ≤ 100 ms | 0.4 ms | **0.1 ms** (was 50–60 s per request pre-S-178) | **MET** |
| 2 | Cold list, project scope | ≤ 500 ms | 30.6 ms | 181.9 ms (one subprocess; the audit's 90 ms floor was the 0-skill worktree — a real 1-skill project pays the fuller scan) | **MET** |
| 3 | Cold global, perceived first paint — TUI SWR (the ratified ≤ 300 ms line is conditioned on SWR, which is the TUI fix) | ≤ 300 ms | 0.175 ms apply-path median / 0.280 p95 (60-row corpus) | **real index load 0.504 ms median / 2.279 ms p95** (300 real entries, 50 reps) + model apply — the stale paint lands in single-digit ms | **MET** |
| 4 | Cold global, truth-settle (web first global paint rides the same spawn) | — | shim-fast (not the binding scenario) | **62 471 ms paint-row median / 78 439 ms API median / 103.4 s standalone** (three same-day runs; S-153 audit recorded 62 s — corpus drift the map anticipated) | **ACCEPTED-WITH-REASON**: upstream `skills ls --json -g` floor — wrap-don't-fork; caching hides it (rows 1, 3, 5), memoizing the CLI is out of scope (upstream memo drafted in docs/upstream-ls-memoization.md, filing is the human's) |
| 5 | Detail read (name+path, exact-path resolution) | ≤ 100 ms | 0.3 ms | 0.2 ms (was ~54.6 s per click pre-S-178) | **MET** |
| 6 | Filter matching alone | ≤ 5 ms @390 | 0.1 ms | 0.0 ms @1 (linear in corpus; the 390-row synthetic is the binding measurement) | **MET** |
| 7 | Filter render work per debounced render | ≤ 50 ms | 0.9–1.0 ms median | 0.2 ms | **MET** |
| 8 | Filter full rebuilds per same-result keystroke | 0 | 0 (no list mutation, rows preserved) — bun-pinned | 0 (1/1 preserved) — bun-pinned | **MET** |
| 9 | Filter animation replays | 0 | 0 — pinned incl. first-paint cascade pins | 0 | **MET** |
| 10 | In-flight identical upstream searches | ≤ 1 | 1 (of 11 calls) — pinned | 1 (of 11) — pinned | **MET** |
| 11 | Stale search response overwrites newer | never | held — pinned in e2e + TUI | held | **MET** |
| 12 | Search wall-clock | — | wrapper overhead 0.9–2.4 ms over fixed 40 ms RTT | network-bound | **ACCEPTED-WITH-REASON** (ratified: skills.sh's RTT is not ours; the wrapper's own overhead IS budgeted and met — row 12's overhead figures) |
| 13 | TUI whole-tree re-render | — | model work µs/keystroke, paint viewport-culled, bounded @300 (S-154); the visibleSkills rider cut keystroke model cost −53% | — | **ACCEPTED-WITH-REASON** (ratified; recorded as future work) |

## Runnable gates

- [x] G1: full suite green on the release tree — 221 tests, 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: pty-smoke + hosted e2e green (23)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 23 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=11c1eb84b1723c9c448eb8f1a090151b09285702cec7653c8ff5b6438cb09bf2; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: synthetic budget fully MET under the strict gate — 11/11, exit 0
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1 && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=38f7de6f32b36c9caa32c8b1a7c50bfc02cfd1e3da21463f845191e34d95c380; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: hallmark/sloplint clean on the emitted page (24b paid off in S-181)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node /Users/s-a-c/.agents/skills/unlazy/scripts/gate-check.mjs --status GATES-S-181.md >/dev/null 2>&1; node /Users/s-a-c/.agents/skills/unlazy/scripts/gate-check.mjs GATES-S-181.md 2>&1 | grep -q "ALL MET" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=e12e279893620a4bbc30785c044fa039213884cdbfea3fb2d4f7bfa8bf01ccc5; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: the committed real-scenario report exists, is dated/branded real, and records the honest numbers — the MET wins AND the accepted upstream-floor miss
  CHECK: head -5 scripts/perf/report-2026-11-01-real.md | grep -q "scenario: real" && grep -q "| warm list" scripts/perf/report-2026-11-01-real.md && grep -qE "\| cold global perceived first paint.*BUDGET-MISS" scripts/perf/report-2026-11-01-real.md && grep -q "1 concurrent" scripts/perf/report-2026-11-01-real.md && grep -q "held" scripts/perf/report-2026-11-01-real.md && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=e3fde777503241cfd47878a3923b062a5375bfe7b220b02f930a66d570a10b87; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G6: build matrix green + binary selftest at the release tree
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run build --all 2>&1 | grep -q "(4 binaries)" && ./dist/skills-ui-0.5.2-darwin-arm64 --selftest 2>&1 | grep -q "SELFTEST PASS" && echo G6-OK
  EXPECT: G6-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=63f203389acb0ef849b2384c05470cc8c5004b98a1011167ce262e3210346990; exit=0; EXPECT=matched; output-sha256=6233fa6beb413a3b89a765ac4e145e64251faee409e778323811a8466b872b67; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G7: harness reproducibility — the committed budget script runs BOTH scenarios' verdict logic (synthetic end-to-end now; real documented + artifact committed; --real CI-refused)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget 2>/dev/null | grep -q "scenario: synthetic" && CI=1 PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --real >/dev/null 2>&1; c=$?; [ "$c" = 2 ] && echo G7-OK
  EXPECT: G7-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=2d05dbef61dcb9dd8380431d3627f767f3c6319e707a413114c6a92040c5f159; exit=0; EXPECT=matched; output-sha256=9ef95329c94722c81ecd21466f88e16a72b83ef3fa9ab721bb0bce99d4b8ff2a; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Release sequence after this ledger (docs/release.md, v0.5.2 flow): merge main first, ff-merge perf053 into main, bump 0.5.3, bun install, full verify on main, export:page, build --all (4 binaries), cp dist/checksums-0.5.3.txt checksums/ + commit manifest, `git tag -s v0.5.3` ON THAT COMMIT, push main+tag, gh release create, Pages poll by a distinctive new string, hosted e2e, ROADMAP flip (repo + Linear), close S-185 + map S-144. Manual smoke over the live page + binary is the human's — checklist handed over, gate waits.
- Harness fixes made during this gate run (documented, synthetic strict re-verified green after each): (1) a REAL 0.0 ms render measure on a no-op pass is a valid sample — only a MISSING measure is fatal (the first real run died treating 0.0 as never-fired on the 1-skill corpus); (2) the real scenario's filter needles alternate match/no-match so set-changing renders exercise on tiny corpora; (3) real reports carry a `-real` filename suffix so a same-day real run can never collide with the committed synthetic baseline (the first real run completed all measurements, then its --out refused to overwrite report-2026-11-01.md — the table was captured from stdout, which is the committed artifact).
- Real-run environment: canonical skills-project cwd (1 project skill fixture + the machine's real global corpus), Bun 1.4.4, arm64, 2026-11-01; corpus counts in the report header (1 project + 300 global, 301 SKILL.md, 5 agent dirs — the ls scan also walks the home dirs, hence the 62–103 s spawns). Three independent same-day upstream-spawn measurements recorded for drift honesty.
- The TUI SWR real evidence chain: the product path wrote the real index (300 entries) from a fresh subprocess listing; `loadDiskIndex("global")` measured 0.504 ms median / 2.279 ms p95 over 50 loads; the synthetic apply-path instruments (tests/tui-disk-index.test.ts: 0.13 ms index-load median, 0.175 ms full apply median) bound the rest of the paint path. Total real TUI cold-global perceived paint: single-digit ms against ≤ 300 ms.
- Count-based rows cite: tests/perf/spawn-count.test.ts (warm 0 spawns, 8-concurrent 1, remove ≤ 2), tests/perf/search-stub.test.ts + tests/services.test.ts (dedup 1-of-N, semantics byte-identical), tests/perf/filter-dom.test.ts (0 rebuilds, 0 replays, cascade-once pins), tests/e2e/hosted.e2e.ts S-182 ordering pins (stale held), tests/tui-disk-index.test.ts (SWR ordering proof, reconciliation).
- **Manual smoke: PASSED (2026-11-02, the human).** First pass returned six refinements (S-186) and the re-pass three more (S-187, incl. the binaries call) — both rounds shipped, each with its own GATES ledger (5/5, 5/5) and the 0.5.3.1 release (tag `v0.5.3.1`, `268c54a`). Final pass over the live page: clean. 0.5.3 + 0.5.3.1 complete.
