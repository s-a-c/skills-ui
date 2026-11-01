# Gates: S-182 — 0.5.3 impl 6, search: in-flight dedup + stale-response guard (both UIs)

OWNS: src/core/services/search.ts, src/tui/app.ts (search scheduling only), src/web/page.ts (runSearch guard only), tests/perf/search-stub.test.ts, tests/perf/helpers.ts (per-query stub payloads), tests/perf/playwright-probes.ts (detector context), scripts/perf/budget.ts (stub config + one prose line — review-directed), tests/services.test.ts, tests/tui.test.ts, tests/e2e/hosted.e2e.ts, docs/app.html (regenerated)

Scope: identical concurrent upstream searches share one request (service-layer in-flight map — both consumers converge on searchRegistryFuzzy); a monotonic sequence token at BOTH consumers so a slow older query can never overwrite a newer query's results, toasts, or busy state. Fan-out/shortening semantics preserved byte-for-byte (pinned). With this ticket every ratified synthetic budget row is MET.

- [x] G1: full suite green — 199 tests, 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green + hosted e2e green (23, incl. both S-182 ordering pins)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 23 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=11c1eb84b1723c9c448eb8f1a090151b09285702cec7653c8ff5b6438cb09bf2; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: the whole synthetic budget is MET — strict run exits 0 with zero BUDGET-MISS rows
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1; s=$?; PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict 2>/dev/null | grep -cE "\| MET \|$" | grep -q "^11$" && [ "$s" = 0 ] && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=40363de4d6e06dc7b4f54323c6ad1786f790038cbd2b728696c8d6ed334e6f7b; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: dedup + semantics pins green (3 concurrent ⇒ exactly 1 upstream; failure not memoized; byte-identical outcomes + call sequences for the fixed query set)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/perf/search-stub.test.ts tests/services.test.ts 2>&1 | grep -q "^ 0 fail" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=fef984c36908f4fd44273c346571d3328a05cccfa741a5e9009f3a0593cddbb1; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: page export reproducible + guards embedded — emitted main script parses, zero raw backticks, the seq guard present in the emitted bytes
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node -e "const fs=require('fs');const h=fs.readFileSync('docs/app.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g);const s=m[m.length-1].replace(/<\/?script>/g,'');require('vm').compileFunction(s);if(h.includes(String.fromCharCode(96)))process.exit(1);if(!s.includes('searchSeq'))process.exit(1)" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=eb234577afea33b6140e0a5cccfab45ed1f84ce33e3cd0fcc4cc2eca3d324558; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Budget after this ticket (synthetic, strict, exit 0): **11/11 MET** — in-flight identical search `1 concurrent (of 11)` MET (was 3-of-13); stale overwrite `held — the fresh render survived the late stale response` MET (was overwrote). Baseline row values at S-177: 3 concurrent / overwrote.
- Review round 1: REQUEST-CHANGES on one Required — the probe's new detector (`staleMarker && !freshMarker`) was MEASURED INERT under the committed stub (every query answered with the same payload ⇒ a real full swap renders identical content; the reviewer proved a guard-stripped page swaps physically while the detector reads held), and deleting the web resolve-guard failed zero bun tests. Fixed with per-query stub payloads (helpers `perQuerySkills` + budget config: `stale-aaaa` answers stale-only rows, the default answers fresh rows without the stale marker — `stub`'s row set unchanged so the overhead/dedup rows stay comparable) + two new e2e ordering pins (resolve + catch guard, port 8404). A/B on a guard-stripped in-memory page copy: detector FIRES (staleOverwrote:true); guarded tree: false. The implementer also self-caught an inert first catch pin (toast auto-removal raced `toHaveCount(0)`'s retry) — rebuilt with non-retrying sampled counts inside the toast window.
- Review files-whole audit (the implementer's disclosed truncation incident): all four affected files WHOLE at line granularity — zero unintended deletions; corroborated by byte-identical page regeneration.
- Reviewer mutation battery: dedup disabled ⇒ 3 pins fail; TUI results guard removed ⇒ TUI pin fails; web resolve guard removed ⇒ e2e resolve pin fails (orchestrator re-ran this one — 1 failed as expected, restored byte-identical). No unpinned guard remains; TUI catch guard pinned by the new deferred-rejection test (199th).
- Optional taken: the clear-query busy-clear is now search-owned-only (TUI `startsWith("searching ")`, web busy text prefix) — backspacing to empty can no longer erase an in-flight install's busy label.
- Semantics preserved (pinned byte-identical vs HEAD, outcomes AND call sequences): direct hit `beta`; miss→shorten `alpha-xyz` (3 calls, adjustedQuery); hyphenated gated `alpha-`; fan-out miss `gamma-` (all 37 calls, uncapped). Dedup collapses only identical CONCURRENT calls (keyed by full effective query + owner; cleared on settle; failures never memoized).
- Dedup layer: inside searchRegistryFuzzy at the fetch level — both consumers (serve /api/search and the TUI's direct searchWithFallback) converge there; also collapses identical sub-calls when different composite queries' shortening chains intersect (count-only change, judged within the ticket's "results unchanged, no cap").
