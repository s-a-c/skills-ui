# Gates: S-166 — 0.5.2 impl F, core gaps (search-failure signal, check-status rendering, ride-alongs)

OWNS: src/core/services/search.ts, src/core/services/installed.ts, src/core/api.ts, src/tui/app.ts, src/tui/model.ts, src/tui/Views.tsx, src/web/page.ts, tests/services.test.ts, tests/api.test.ts, tests/tui.test.ts, tests/e2e/hosted.e2e.ts, docs/app.html (artifact)

Scope: S-152 item 10 (F4 search failure ≠ zero results on both surfaces; G4 error/not-checkable statuses rendered on both surfaces) + the recorded ride-alongs (ls timeout 120→300 s; GET / passes the real bound port so the settings hint stops saying "a random port").

- [x] G1: full suite green on phase/ux052 (148 + 10 new)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green + e2e green (18 + 3 new: search-failure render, updates-error detail, port hint)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 21 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=1af97efb8529cb98ca90aad94c0031c55d53699d48ebf494ddb264507a2992b1; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G3: the search-failure signal is provable at every layer — dead-port unit (fetch throw), HTTP-500 unit (the !res.ok branch), API flag, both surfaces' render
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/services.test.ts tests/api.test.ts 2>&1 | grep -q "^ 0 fail" && PATH="$HOME/.bun/bin:$PATH" bun test tests/tui.test.ts -t "S-166" 2>&1 | grep -q "^ 0 fail" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=fdc60c936fcf263fa8d68bcda245e20d2655948d14ad889948da4af877308e41; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G4: ride-alongs in place — ls timeout 300s with comment; the served page carries the real bound port
  CHECK: grep -q "timeoutMs: 300_000" src/core/services/installed.ts && grep -q "boundPort" src/core/api.ts && PATH="$HOME/.bun/bin:$PATH" bun test tests/api.test.ts -t "port" 2>&1 | grep -q "^ 0 fail" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=2110b26235f6091f787bda30e76c7253271083f2141f830c62538ab93aff1233; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

## Notes

- Review: code-review-and-quality five axes APPROVE, zero Critical/Required. Reviewer mutation (failed flag neutralized in the fallback) failed exactly the 3 claimed tests, restored byte-identical. Reviewer Optional closed by the orchestrator: an HTTP-500 registry test now pins the !res.ok branch (previously only the fetch-throw path was exercised — a `failed:false` mutation there survived; +1 test, suite 157→158).
- Design decisions: `failed` is discriminated-absent on success (success JSON byte-identical to 0.5.1); only the PRIMARY query sets failed — secondary/shortened-query failures stay per-silence (documented in search.ts); SKILLS_UI_API_URL read lazily (bun shares the module registry across test files); the exact string "search failed — skills.sh unreachable" is rendered verbatim on both surfaces and asserted literally.
- G4 render: web detail pane gains an Updates line (esc'd) + row title tooltip; TUI detail gains a muted "check: <error>" line and the `c` toast says "no updates available · N not checkable" when applicable. updateErrors replaced wholesale on re-check; FYI recorded: not cleared on scope switch (mirrors the pre-existing updatesAvailable badge lifecycle — consistent by design).
- Port race assessed: Bun.serve returns synchronously after bind and boundPort is assigned in the same synchronous block before any request can be dispatched; hash parity (renderPage + pageCspFor share the value) proven by export byte-identity + the e2e CSP run.
- ls timeout nit recorded: the comment's "serialization makes ls exceed" phrasing is loose (queue wait is never timed; the scan itself is what grows) — 300s is right regardless.
