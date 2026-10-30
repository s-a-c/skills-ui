# Gates: 0.5.1 impl D — metadata sanitization on all ingress (S-159)

OWNS: src/core/services/sanitize.ts, src/core/services/installed.ts, src/core/services/source.ts, src/core/services/skill-doc.ts, src/core/services/install.ts, src/core/services/update.ts, src/core/services/search.ts, src/core/api.ts, tests/sanitize.test.ts, tests/fixtures/contract/ls-hostile.json, tests/fixtures/contract/add-hostile.json, tests/fixtures/contract/hostile-skill/, tests/fixtures/skills-shim.mjs

Scope: centralized escape/control scrubbing applied at every external-text ingress (ls --json fields, cyan-parsed source names, add --json entries, update output, frontmatter descriptions, SKILL.md bodies), with hostile-input coverage end-to-end.

- [x] G1: full test suite green
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G2: hostile-input suite green (sanitizers unit + every ingress through the shim and the HTTP API; fixtures carry real CSI/OSC/DCS/C1 bytes)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/sanitize.test.ts 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=05b3e35526932f697b0dae418726c1afb9295a71e888ea705fb623d9018238d4; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G3: TUI pty smoke green (sanitization feeds the TUI; no regressions)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=b49509325a97928a192892dc527a54c6afa29db63f6561e5103ca881de8b4680; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G4: compiled binary builds and selftests
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run build >/dev/null 2>&1 && ./dist/skills-ui-0.5.0-darwin-arm64 --selftest | grep -q "SELFTEST PASS" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=597fef91568a73baef09b2061a1568beba538781b352835525e09838f0e87ab9; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G5: mutation spot-check — removing the skillBody sanitizer fails the protecting ingress test
  EVIDENCE: 2026-10-30 — with skillBody's sanitizeBody call removed, `bun test tests/sanitize.test.ts` = 1 fail (the API body-cleanliness assertion trips on the fixture's escape bytes); restored = 8 pass, 0 fail.
