# Gates: S-178 — 0.5.3 impl 2, serve list cache + request coalescing + remove() reuse (+ upstream ls report draft)

OWNS: src/core/api.ts, src/core/services/remove.ts, docs/upstream-ls-memoization.md (new), tests/perf/spawn-count.test.ts, tests/serve-hardening.test.ts

Scope: kill the repeated `skills ls --json` subprocess cost in the HTTP API layer (S-153 hot paths 1/3/4) — per-server per-scope list cache with copy-on-read, scope-keyed request coalescing, generation-guarded invalidation on every mutation (failed included), remove() before/after reuse via injectable listers; upstream memoization report drafted for the human to file. TUI untouched; remove() defaults byte-identical to historical behavior.

- [x] G1: full suite green — 181 tests (176 + 5 net-new pins), 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green + hosted e2e green (21)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 21 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=1af97efb8529cb98ca90aad94c0031c55d53699d48ebf494ddb264507a2992b1; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: budget rows this ticket owns — warm list and detail read stay/become MET on the synthetic scenario
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget 2>/dev/null | grep "^| warm list" | grep -q "MET" && PATH="$HOME/.bun/bin:$PATH" bun run perf:budget 2>/dev/null | grep "^| detail read" | grep -q "MET" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=6902baef8edc7f3d1d12fe5456f12090aa9b336f9f98ab07365f97d4dcda16bf; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: inverted + new count pins all green (8 concurrent ⇒ 1 spawn; mixed-scope ⇒ 2; sequential ⇒ 1; detail+list ⇒ 1; cold/warm/failed remove; install/update invalidation)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/perf/spawn-count.test.ts 2>&1 | grep -q "^ 0 fail" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=128d3c76a997947ea7e7b08f9b3140c3845a1d7ee741d373a14aacd97defb918; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: spawn-queue cap semantics still pinned (503 beyond cap for genuinely distinct concurrent spawns)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/serve-hardening.test.ts 2>&1 | grep -q "^ 0 fail" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=bf57df1908206c736b23b2c7e248e040c10259406348f494d53c4ce46fd5263a; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Real-corpus before/after (this machine, 2026-11-01, three independent measurements): cold global `GET /api/skills?scope=global` = one upstream spawn, 48.8 s (orchestrator-run) / 52.0 s (reviewer-run) / 63.5 s (implementer-run) — the accepted-with-reason upstream floor (wrap-don't-fork). Warm global after the fix: **1.0 ms** (was another full ~50–60 s spawn per request). Detail read by name: 54 649 ms → **2.2 ms**. Before-side captures: /tmp/s178-real-before*.txt, /tmp/s178-warm-probe-before.txt; after: /tmp/s178-real-after.txt (implementer artifacts, regenerated numbers in the resolution).
- Synthetic budget after: warm list 0.4 ms MET (main baseline 16.6 ms), detail 0.2 ms (was 16.4), cold project 30.6 ms MET; shim spawns 36 → 14 at identical reps (7 ls + 7 ls -g — one per scope per server lifetime).
- Harness limitation recorded (not this ticket's scope): the official `--real` run on PRE-fix code dies at the stale-search page probe (the first search-tab visit's refreshInstalledAll pays two ~60 s spawns and the 15 s probe window expires — the over-broad busy lockout deferred in 0.5.2). Post-fix code completes the full real run 1/1. Also `--real` requires a cwd with project-scope skills (the worktree has none — run from a skills-project dir or $HOME). Both noted for the S-185 canonical real run.
- Reviewer (five axes): APPROVE, 0 Critical / 0 Required. 1 Nit + 1 Optional (both comment-only) fixed by the orchestrator: the per-server comment no longer cites the module-level descriptionCache that no longer exists; install/update invalidation sites now document why they need no invalidate-on-throw guard (throw paths are pre-spawn only; remove() genuinely throws post-mutation and keeps its try/catch).
- Mutation spot-check (orchestrator-run): inverting the generation guard (`===` → `!==` on the in-flight repopulate check) failed exactly 4 of the 9 count pins (cache never populates; sequential/mixed/detail/remove pins break); restored byte-identical (`cmp`), green again.
- Mid-mutation window (a GET during an in-flight `add`/`rm` serves the pre-mutation cached list) judged within historical race semantics by the reviewer — pre-cache, a concurrent GET's own `ls` could equally race the mutation; invalidation fires on every completed mutation and the generation guard prevents stale repopulation. descriptionCache moved per-server: costs one SKILL.md re-read per server (µs/row), invisible in warm rows, strictly better test isolation.
- Upstream memo `docs/upstream-ls-memoization.md`: reviewer fact-checked every reproducible figure live (279/300 rows, 223 duplicate warnings, spawn walls); bisection + CPU-profile figures carried from the S-153 record. Filing upstream is the human's.
