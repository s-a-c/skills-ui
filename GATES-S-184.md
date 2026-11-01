# Gates: S-184 — 0.5.3 impl 8, runtime-dash sweep (JS-built strings)

OWNS: src/web/page.ts (string literals only), src/tui/Views.tsx, src/tui/app.ts (string literals), tests/dash-sweep.test.ts (new), tests/tui.test.ts + tests/e2e/hosted.e2e.ts (swept-string assertion updates), docs/app.html (regenerated)

Scope: the 0.5.2-deferred runtime-string dash sweep — 17 user-facing runtime strings (12 web APP_JS, 3 Views.tsx, 2 app.ts) moved off en/em dashes to worded/punctuation forms per hallmark gate 19's convention; extraction-based committed check (no line numbers) with a vacuous-pass guard. Strings only, zero behavior change (reviewer-verified: 33+/33− symmetric single-line edits).

- [x] G1: full suite green — 221 tests (217 + 4 dash-sweep), 0 fail
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G2: the dash-sweep check passes AND reaches real copy (extraction + vacuous-pass guard)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/dash-sweep.test.ts 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=5d230f3e1608c65a62baac3cbb1daea63dc5980cd4f84655ad8cc744080fd217; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G3: negative control — the check fails on a reintroduced dash (em-dash and entity forms)
  CHECK: cp src/tui/Views.tsx /tmp/gates-s184-views.bak && sed -i '' "s/search failed: skills.sh unreachable/search failed $(printf '\342\200\224') skills.sh unreachable/" src/tui/Views.tsx && PATH="$HOME/.bun/bin:$PATH" bun test tests/dash-sweep.test.ts 2>&1 | grep -q "(fail)"; rc=$?; cp /tmp/gates-s184-views.bak src/tui/Views.tsx; [ "$rc" = 0 ] && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=ca90d9b132b6e707cf5577d154391eb69f511bad5feb8dd297dfd886c0451660; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G4: pty-smoke green (TUI strings changed) + hosted e2e green (23, swept-string assertions updated)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 23 passed" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=178f84cf14d44f2898ae21837fafd383261b0e2c1588eebcccefb5402761679f; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

- [x] G5: budget untouched — strict still fully MET; export clean
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1 && PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node -e "const fs=require('fs');const h=fs.readFileSync('docs/app.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g);require('vm').compileFunction(m[m.length-1].replace(/<\/?script>/g,''));if(h.includes(String.fromCharCode(96)))process.exit(1)" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=58d542bb7b22a6cf61f357920edb7e523aa30c7030e23f624d459ffcdb17cc68; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/perf053; path=b4c10f371094/9 entries

## Notes

- Swept (17): web — hosted-connect errors/status (Not connected / Backend reachable / old-binary / Token rejected / Safari / unreachable), removal toast (parenthetical "(not installed: …)" form), seedStatus, adjustedQuery toast, search-error empty state, both port toasts; TUI — 3D-graph unavailable, search-failed (both surfaces, the S-166-ratified string, assertions updated), empty-queue hint, no-TTY selftest line, search-failed toast. Replacements are clause punctuation (colon/comma/semicolon/period/split sentences) — no hyphen substitutions; reviewer read all 17 in context: meaning preserved, voice consistent, the parenthetical an improvement.
- The check: single-pass lexer (comments, regex-vs-division, quote escapes, template ${} recursion, Views JSX text) extracts literals from APP_JS + the three TUI files; flags U+2013/U+2014 AND (review-hardened) the evasion forms \\u201[34], &mdash;/&ndash;, &#821[23]/&#x201[34]; 4th test pins known copy into the extracted corpus against a vacuous pass. Reviewer blind-spot battery (17 synthetic evasions): the latent classes (escape forms, entities, fromCharCode, nested-backtick interpolation truncation) are ALL absent from the tree; caught classes cover concatenation, multiline, JSX attrs, nested templates. The hardening closed the escape/entity class — negative control re-proven post-hardening (entity form fails 1 test; orchestrator-run, plus the em-dash form run independently by implementer, reviewer, and orchestrator).
- Assertions updated (3, complete — reviewer grepped old forms across tests/scripts/docs, zero remaining pins): tests/tui.test.ts:493, tests/e2e/hosted.e2e.ts:285 + :394.
- **Recorded follow-up (not this ticket's scope — the ratified sweep surface was APP_JS + the three TUI files)**: adjacent user-facing runtime strings still carry em dashes and the gate does not watch them — src/main.ts selftest/port copy (:45/:49/:68), src/core/api.ts 503 body "server busy — try again shortly" (:460) + install error text (:418), src/core/skills-client.ts error text (:124). A future sweep ticket should extend the copy set + add main.ts/core error strings to the gate. Also FYI: one em dash lives in an APP_CSS comment (not user-facing; zero content: strings — probed).
- Deferred to author taste (Nits, ignored): page.ts:1596 "retry, and check" serial comma; page.ts:1144 comma splice consistent with the conversational voice.
