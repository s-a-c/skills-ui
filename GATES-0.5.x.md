# Gates: 0.5.x — Hosted UI build (map S-130)

OWNS: src/core/hosted-auth.ts, src/core/api.ts, src/web/page.ts, src/main.ts, scripts/export-page.ts, docs/app.html, tests/hosted-auth.test.ts, tests/e2e/hosted.e2e.ts, playwright.config.ts

Scope: the hosted zero-install WebUI shipped and verified — serve gate (preflight/ACAO/Vary, Bearer, Host allowlist), hosted page connect flow (token, LNA UX, capabilities), static export live on GitHub Pages, Playwright e2e from the real hosted origin green.

- [x] G1: unit + API suites green (includes the hosted-auth gate tests through a live server)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -E "^ +[0-9]+ (pass|fail)" ; PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=177b8fb11796cf920604677f65f6f000e816f4d11f557b90873597e89d8286e0; exit=0; EXPECT=matched; output-sha256=20bc802a0d03fd18fa0c0a594f33a39a1651ebb4da758fc19cd4e856470b7ea7; output-bytes=23; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=8f49f3ac95ce/10 entries

- [x] G2: compiled binary builds and selftests
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run build >/dev/null 2>&1 && ./dist/skills-ui-0.5.0-darwin-arm64 --selftest | grep -q "SELFTEST PASS" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=290b64979a40db8aec0bb73679703045f6d52037b79203377e3aa138af997a9e; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=8f49f3ac95ce/10 entries

- [x] G3: TUI pty smoke suite green (no regressions from the serve/page work)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=b49509325a97928a192892dc527a54c6afa29db63f6561e5103ca881de8b4680; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=8f49f3ac95ce/10 entries

- [x] G4: exported hosted page is fresh — regenerating docs/app.html changes nothing
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null && git diff --exit-code docs/app.html && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=32141bf0230dcc80811d9587bd41e93322aabe71998ce1fc715e288af9f2c875; exit=0; EXPECT=matched; output-sha256=f1407337538e855faf7627d55b60d8f9f7f39a48d0eaef29a00ebcc9ae034f97; output-bytes=40; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=8f49f3ac95ce/10 entries

- [x] G5: hosted page is live on GitHub Pages with the connect flow + loopback-only CSP
  CHECK: curl -fsS https://s-a-c.github.io/skills-ui/app.html | grep -q 'id="connectDialog"' && curl -fsS https://s-a-c.github.io/skills-ui/app.html | grep -q 'connect-src http://127.0.0.1:\*' && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=fe52a5b2a9d004ccd45f9900c46e5bc4671684236c6a0088b95a246db8977391; exit=0; EXPECT=matched; output-sha256=e2cbe0bf200ac2272d7e4736f76aaf9041c6d88b7eb8775b832b67c60be7f50f; output-bytes=155; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=8f49f3ac95ce/10 entries

- [x] G6: e2e from the real hosted origin green — LNA grant connects + lists skills + survives reload, wrong token rejected, no-grant context blocked by the LNA gate
  CHECK: PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | tee /tmp/g6-e2e.log | grep -q " 3 passed" && echo G6-OK
  EXPECT: G6-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=bef3d83b348e2685d0374252dbcda8941d254468a8f570992bcc3dcaa75affd7; exit=0; EXPECT=matched; output-sha256=6233fa6beb413a3b89a765ac4e145e64251faee409e778323811a8466b872b67; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=8f49f3ac95ce/10 entries

- [ ] G7: manual smoke — the native LNA prompt itself needs a human click (S-138: only the prompt click is manual; everything else is automated above)
  EVIDENCE: pending — pending first human visit to https://s-a-c.github.io/skills-ui/app.html connecting to a real `skills-ui serve`
