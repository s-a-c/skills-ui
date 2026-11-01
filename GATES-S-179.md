# Gates: S-179 — 0.5.3 impl 3, /api/skill detail by path

OWNS: src/core/api.ts (/api/skill handler only), src/web/page.ts (detail fetch call site only), tests/api.test.ts, tests/perf/spawn-count.test.ts, scripts/perf/budget.ts (detail-probe form only — harness upkeep riding the ticket that changed the measured surface), docs/app.html (regenerated export artifact)

Scope: the web client passes the skill's `path`; the serve resolves the detail by exact-string membership against the scope's cached rows (S-178 cache) and reads the doc on the matched row — the name form stays as cache-served fallback, never a subprocess. Zero-spawn warm detail clicks. Provenance note: api.ts/page.ts were authored by a quota-interrupted agent and line-reviewed by the retry implementer; the orchestrator re-read the full diff and added the review follow-ups below.

- [x] G1: full suite green — 188 tests (186 + 2 review follow-ups), 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green + hosted e2e green (21)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 21 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=1af97efb8529cb98ca90aad94c0031c55d53699d48ebf494ddb264507a2992b1; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: budget detail row (production name+path form) MET on the synthetic scenario
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget 2>/dev/null | grep "^| detail read" | grep -q "MET" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=0b4fb2044d30dc76104a0320bf6e9984e9d117f96096f73c72a550812f3fe86e; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: security-boundary pins green — exact-match 404s (on-disk non-row path, row-path prefix, row-path+suffix), path-beats-name precedence, byte-identity of the two forms
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/api.test.ts 2>&1 | grep -q "^ 0 fail" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=d44fc7012748f66e60d8e2093b7efd005d15672429bceab05dd11d8186a853a8; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: spawn-count pins green (warm detail-by-path ⇒ 0 spawns; unknown path ⇒ 404 + 0; cold first ⇒ 1 then 0)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/perf/spawn-count.test.ts 2>&1 | grep -q "^ 0 fail" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=3b45157879613ff3292cd2718922ef852c60c4a96be13b327dae620490eadc7a; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G6: page export reproducible — export:page runs and the emitted main script parses
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node -e "const m=require('fs').readFileSync('docs/app.html','utf8').match(/<script>([\s\S]*?)<\/script>/g);require('vm').compileFunction(m[m.length-1].replace(/<\/?script>/g,''))" && echo G6-OK
  EXPECT: G6-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=c063634aea5cfe6218362dc914a8bdf1ec7e563b2a3e58152b970a48c13c2d9d; exit=0; EXPECT=matched; output-sha256=6233fa6beb413a3b89a765ac4e145e64251faee409e778323811a8466b872b67; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Reviewer (five axes + adversarial probes): APPROVE, 0 Critical / 0 Required. 12 hostile probes (traversal, double-encoding, null-byte, fullwidth slash, /etc/passwd, prefix/suffix) all 404 with no file touched; the param is compare-only — never a read target, never echoed, never in argv.
- Review follow-ups applied by the orchestrator (the reviewer's only substantive Optional was empirical): the `===` → `.startsWith(` mutation SURVIVED the original tests (reviewer-verified) — closed with the near-miss 404 pin (row-path parent dir + row-path+"x") and the path-beats-name pin; the orchestrator's spot-check re-ran that exact mutation post-pin and it now fails 2 tests (restored byte-identical). Byte-identity now asserted on raw `res.text()`. Comment states cached-or-in-flight + precedence. budget.ts detail probe now uses the production name+path form.
- Measured: warm detail-by-path 0 spawns (pin); unknown path 404 + 0 spawns; cold first 1 spawn then 0; detail budget row 0.3 ms MET (name+path form); by-path wall clock 0.24 ms median over 25 reps (implementer probe). Real-corpus context: the pre-cache cost was ~54.6 s per click; post-S-178 name-lookup 2.2 ms; this ticket removes even the name-resolution dependency on the cache's find-by-name semantics.
- e2e compatibility: the page sends name+path together — old serves ignore the extra param (URLSearchParams), so the hosted page stays compatible with pre-0.5.3 binaries.
