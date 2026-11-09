# Gates: 0.5.4.1 — List-card ergonomics & WebUI/TUI split-pane parity (S-256 / S-263)

OWNS: `package.json`, `src/core/prefs.ts`, `src/web/page.ts`, `docs/app.html`, `src/tui/model.ts`, `src/tui/app.ts`, `src/tui/Views.tsx`, `tests/services.test.ts`, `tests/page-smoke.test.ts`, `tests/tui.test.ts`, `tests/e2e/audit-remediation.e2e.ts`, `CONTEXT.md`, `ROADMAP.md`, `docs/designs/v0.5.4.1-list-card-ergonomics-and-split-pane-parity.md`, `GATES-0.5.4.1.md`.

## Runnable gates

- [x] G1: unit, integration, and browser-smoke suite green on the 0.5.4.1 tree (305 tests, 0 fail)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/polish-0.5.4.1; path=d64569de8964/42 entries

- [x] G2: Playwright E2E suite green across hosted, semantics, and audit-remediation specs (48 passed)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 48 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=53cc8c38a9cafe75ebc8a5f44a04556364de72aa61175fb8e19567354754b09d; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/polish-0.5.4.1; path=d64569de8964/42 entries

- [x] G3: 80x24 PTY smoke suite green on the 0.5.4.1 tree
  CHECK: PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=d5257d8250ffacde8e67d4af67b547a8d54c9c8a2a088af904ac0a3902d8dd62; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/polish-0.5.4.1; path=d64569de8964/42 entries

- [x] G4: synthetic performance budget fully MET (11/11 rows MET)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1 && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=a2bbf46d202c2be1d93eb4e4b010130d54d368d2828bfdc356cdda360beda99a; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/polish-0.5.4.1; path=d64569de8964/42 entries

- [x] G5: hallmark/sloplint clean on the exported `docs/app.html` (0 FAIL, 0 REFLEX, 0 WARN)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node "$HOME/.agents/skills/hallmark/scripts/sloplint.mjs" docs/app.html --genre modern-minimal --scope app 2>&1 | grep -q "sloplint: clean" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=23bb1b0fa91d17f56554fec319f727510eedc5992b7f2fc29967a2947723e632; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/polish-0.5.4.1; path=d64569de8964/42 entries

- [x] G6: binary build + selftest green on the 0.5.4.1 tree
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run build >/dev/null 2>&1 && ./dist/skills-ui-0.5.4.1-darwin-arm64 --selftest 2>&1 | grep -q "SELFTEST PASS" && echo G6-OK
  EXPECT: G6-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=8ea3905e9c26dff04590fc48765da96faf4cdf2b8a80697c0c93eae256e6f0d3; exit=0; EXPECT=matched; output-sha256=6233fa6beb413a3b89a765ac4e145e64251faee409e778323811a8466b872b67; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/polish-0.5.4.1; path=d64569de8964/42 entries
