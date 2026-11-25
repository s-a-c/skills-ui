# Gates: 0.5.5 — Hub integration, provenance guardrails & read-only health strip (S-312 / S-314–S-319)

OWNS: `package.json`, `AGENTS.md`, `CONTEXT.md`, `ROADMAP.md`, `docs/designs/v0.5.5-hub-integration-provenance-and-health-strip.md`, `src/core/services/locks.ts`, `src/core/services/installed.ts`, `src/core/services/types.ts`, `src/core/services/hooks.ts`, `src/core/skills-client.ts`, `src/core/api.ts`, `src/core/index.ts`, `src/web/page.ts`, `docs/app.html`, `src/tui/model.ts`, `src/tui/app.ts`, `src/tui/Views.tsx`, `tests/services.test.ts`, `tests/page-smoke.test.ts`, `tests/tui.test.ts`, `tests/e2e/`, `GATES-0.5.5.md`.

## Runnable gates

- [x] G1: unit, integration, and browser-smoke suite green on the 0.5.5 tree (0 fail)
  CHECK: PATH="$HOME/.local/share/bun/bin:$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=f775f9b9b950f1232665105beeba38cdf1b98e3bdd28be7a681d1b3ccb822337; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/hub-integration-0.5.5; path=140fb8f9efd1/46 entries

- [x] G2: Playwright E2E suite green across hosted, semantics, audit-remediation, and 0.5.5 provenance/health specs
  CHECK: PATH="$HOME/.local/share/bun/bin:$HOME/.bun/bin:$PATH" bunx playwright test >/dev/null 2>&1 && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=c18c0c26854cb930a533a709abf8b9312c91fc817cb97d5b1efa21a9b2a0ca3b; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/hub-integration-0.5.5; path=140fb8f9efd1/46 entries

- [x] G3: 80x24 PTY smoke suite green on the 0.5.5 tree
  CHECK: PATH="$HOME/.local/share/bun/bin:$HOME/.bun/bin:$HOME/.local/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=94c5c311313ca811a638d095dac2c069cabecc13174088e8521ac9630c03e41f; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/hub-integration-0.5.5; path=140fb8f9efd1/46 entries

- [x] G4: synthetic performance budget fully MET (11/11 rows MET)
  CHECK: PATH="$HOME/.local/share/bun/bin:$HOME/.bun/bin:$PATH" bun run perf:budget -- --strict >/dev/null 2>&1 && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=00306ccf4f87b3d8b52fb19f533c4e2e26cf660c47255896caa8002e528fe6a4; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/hub-integration-0.5.5; path=140fb8f9efd1/46 entries

- [x] G5: hallmark/sloplint clean on the exported `docs/app.html` (0 FAIL, 0 REFLEX, 0 WARN)
  CHECK: PATH="$HOME/.local/share/bun/bin:$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node "$HOME/.agents/skills/hallmark/scripts/sloplint.mjs" docs/app.html --genre modern-minimal --scope app 2>&1 | grep -q "sloplint: clean" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=fe014af3fbbf9835969f6a72aeea2b8744c7b8b3a8faa9945d550c21a4c03b62; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/hub-integration-0.5.5; path=140fb8f9efd1/46 entries

- [x] G6: binary build + selftest green on the 0.5.5 tree
  CHECK: PATH="$HOME/.local/share/bun/bin:$HOME/.bun/bin:$PATH" bun run build >/dev/null 2>&1 && ./dist/skills-ui-0.5.5-darwin-arm64 --selftest 2>&1 | grep -q "SELFTEST PASS" && echo G6-OK
  EXPECT: G6-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=091e907353b7fb378201bd2dac5ed4d00304cfba9649ea6d2f02f6291d28d3a6; exit=0; EXPECT=matched; output-sha256=6233fa6beb413a3b89a765ac4e145e64251faee409e778323811a8466b872b67; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/hub-integration-0.5.5; path=140fb8f9efd1/46 entries

- [x] G7: companion home-hub bridge live check green via built 0.5.5 binary (`113/113` skills across `8` hosts, `0` broken symlinks, hook dry-run clean)
  CHECK: test -x "$HOME/.config/agents/bin/skills-ui-post-hook.sh" && test -x "$HOME/.config/agents/bin/skills-ui-health-check.sh" && "$HOME/.local/bin/skills-ui" --version | grep -q "0.5.5" && "$HOME/.config/agents/bin/skills-ui-health-check.sh" | /opt/homebrew/bin/python3 -c "import json,sys; d=json.load(sys.stdin); assert d['ok'] is True and '113/113' in d['summary']" && SKILLS_UI_HOOK_DRY_RUN=1 SKILLS_UI_EVENT=update SKILLS_UI_SCOPE=global SKILLS_UI_SKILLS=tdd "$HOME/.config/agents/bin/skills-ui-post-hook.sh" >/dev/null && echo G7-OK
  EXPECT: G7-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=4429130932bad70e259d3a8ab15ff8eb07b4f44b0dda7369396b356fec72a937; exit=0; EXPECT=matched; output-sha256=9ef95329c94722c81ecd21466f88e16a72b83ef3fa9ab721bb0bce99d4b8ff2a; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/hub-integration-0.5.5; path=140fb8f9efd1/46 entries
