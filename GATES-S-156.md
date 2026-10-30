# Gates: 0.5.1 impl A — serve request hardening (S-156)

OWNS: src/core/api.ts, src/core/hosted-auth.ts, src/core/skills-client.ts, src/core/spawn-queue.ts, src/core/services/updates-check.ts, src/core/services/search.ts, tests/serve-hardening.test.ts, tests/fixtures/slow-skills-shim.mjs

Scope: the 0.5.1 impl A hardening slice — no-Origin cross-site fetch-metadata rejection, source/name shape validation at the API boundary, transport-level 1 MiB body cap, global token-bucket rate limiter, serialized capped spawn queue, timing-safe Bearer compare, 400 for bad JSON, generic 500 bodies, outbound fetch timeouts + segment-encoded GitHub trees URL.

- [x] G1: full test suite green
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G2: hostile-input suite present and green (cross-site 403s, argv/shape 400s, transport 413, 429 limiter, 503 queue, timing-safe unit, URL encoding)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/serve-hardening.test.ts 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=c1b28770556c8c8062dab864bcc640e470b1df75a2aefd9f000236d8bda9c123; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G3: TUI pty smoke green (spawn queue is TUI-shared; no regressions)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=b49509325a97928a192892dc527a54c6afa29db63f6561e5103ca881de8b4680; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G4: compiled binary builds and selftests
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run build >/dev/null 2>&1 && ./dist/skills-ui-0.5.0-darwin-arm64 --selftest | grep -q "SELFTEST PASS" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=597fef91568a73baef09b2061a1568beba538781b352835525e09838f0e87ab9; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G5: mutation spot-check — the cross-site gate has a test that fails when it is removed
  EVIDENCE: 2026-10-30 — with the isCrossSiteFetch call in api.ts disabled, `bun test tests/serve-hardening.test.ts` = 1 fail (14 pass); restored = 15 pass, 0 fail. Caught by the "no-Origin + sec-fetch-site: cross-site → 403 on every endpoint" test.
