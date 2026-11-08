# Gates: 0.5.4 — WebUI unified split-pane & ergonomic controls (S-234 / S-240)

OWNS: `src/core/prefs.ts`, `src/web/page.ts`, `docs/app.html`, `tests/services.test.ts`, `tests/page-smoke.test.ts`, `tests/e2e/audit-remediation.e2e.ts`, `GATES-0.5.4.md`, `ROADMAP.md`.

## Runnable gates

- [x] G1: unit, integration, and browser-smoke suite green on the 0.5.4 tree (303 tests, 0 fail)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=6c11752ea03a/42 entries

- [x] G2: Playwright E2E suite green across hosted, semantics, and audit-remediation specs (47 passed)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 47 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=b25db06188dfed663ac5d9d634aeafe28e2ec4100c297464e1643b778c9901de; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=6c11752ea03a/42 entries

- [x] G3: synthetic performance budget fully MET (11/11 rows MET)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1 && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=38f7de6f32b36c9caa32c8b1a7c50bfc02cfd1e3da21463f845191e34d95c380; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=6c11752ea03a/42 entries

- [x] G4: hallmark/sloplint clean on the exported `docs/app.html` (0 FAIL, 0 REFLEX, 0 WARN)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node "$HOME/.agents/skills/hallmark/scripts/sloplint.mjs" docs/app.html --genre modern-minimal --scope app 2>&1 | grep -q "sloplint: clean" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=2a3c5745e4152018711a27bb71aa17db2848fc41b0370b7456d8c90f3406a020; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=6c11752ea03a/42 entries

- [x] G5: binary build + selftest green on the 0.5.4 tree
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run build >/dev/null 2>&1 && ./dist/skills-ui-0.5.4-darwin-arm64 --selftest 2>&1 | grep -q "SELFTEST PASS" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=c63af152ec7457f9c80e04c80b18001f4f1488bdb9156e4a01c2458b9b883964; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=6c11752ea03a/42 entries
