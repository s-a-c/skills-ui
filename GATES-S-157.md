# Gates: 0.5.1 impl B — hosted page hardening (S-157)

OWNS: src/web/page.ts, src/core/api.ts, docs/app.html, tests/page-hardening.test.ts

Scope: hash-pinned CSP on both page variants (no `script-src 'unsafe-inline'`, `base-uri`/`form-action 'none'`), sessionStorage token with one-time legacy migration, `</script>`-safe JSON embeds, and nosniff/referrer headers from serve on `GET /`.

- [x] G1: full test suite green
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G2: page-hardening suite present and green (CSP hashes verified against emitted script contents, escape, sessionStorage, node --check of the emitted APP_JS, serve headers)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/page-hardening.test.ts 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=06de8b1e6187fff6502f948c0ef5f2ec77a923aa14fa1e0386c40cf2d29b453a; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G3: hosted page export is byte-stable — regenerating docs/app.html changes nothing
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null && git diff --exit-code docs/app.html && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=8d31d54510d187d4a7faf9f53440a97fc51d7b5348e801f8a8cbe5f4e44b1759; exit=0; EXPECT=matched; output-sha256=136d973b3bc45760e3e321686701866c635a274a561a1202eecf594f6d29b292; output-bytes=40; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G4: TUI pty smoke green (page changes must not ripple into the TUI)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=01d9500cb776a3b69758f8531513080421afc4a588f85d57dc337a53826901a0; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G5: compiled binary builds and selftests
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run build >/dev/null 2>&1 && ./dist/skills-ui-0.5.0-darwin-arm64 --selftest | grep -q "SELFTEST PASS" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=417bfe02e1c0cb8a83d4bc08be945b114ed006f0ddcfb12bb1154c35db09605f; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G6: mutation spot-check — removing the </script> escape fails the protecting test
  EVIDENCE: 2026-10-30 — with safeJsonEmbed's `<`-escape disabled, `bun test tests/page-hardening.test.ts` = 1 fail (the hostile-seed breakout test: raw `</script>` appears in the bootstrap); restored = 10 pass, 0 fail.
