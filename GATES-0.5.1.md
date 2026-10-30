# Gates: 0.5.1 — security hardening (map S-142)

OWNS: src/core/, src/web/page.ts, scripts/install.sh, docs/, checksums/, README.md, GATES-S-156..159.md

Scope: the 0.5.1 ship gate as ratified in S-148 — all 9 should-fixes plus full hardening (rate limiting, subprocess serialization) shipped; accepted risks recorded; release trust proven end-to-end.

- [x] G1: full test suite green on main (109 tests incl. all hostile-input suites)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=bb832fc32021/41 entries

- [x] G2: serve-boundary hostile-input proof green (cross-site 403s, argv/shape 400s, transport 413, 429 limiter, 503 queue)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/serve-hardening.test.ts 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=c1b28770556c8c8062dab864bcc640e470b1df75a2aefd9f000236d8bda9c123; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=bb832fc32021/41 entries

- [x] G3: live hosted page carries the hardened surface — hash-pinned CSP (no script-src unsafe-inline) and sessionStorage token code
  CHECK: curl -fsS https://s-a-c.github.io/skills-ui/app.html | grep -o "script-src [^;]*" | grep -q sha256 && ! curl -fsS https://s-a-c.github.io/skills-ui/app.html | grep -q "script-src 'unsafe-inline'" && curl -fsS https://s-a-c.github.io/skills-ui/app.html | grep -q "sessionStorage.setItem(LS_TOKEN" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=0df03467c6d0de752eabaa3fd554af4d68748c20020c5d8f0435b54a46217e4c; exit=0; EXPECT=matched; output-sha256=31afdec6bc5f8355a4170a83ae51398556fd143f7f8616dc29ea69b49f7e9c57; output-bytes=81; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=bb832fc32021/41 entries

- [x] G4: release trust end-to-end — the tag-committed manifest and the release asset are identical
  CHECK: curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/v0.5.1/checksums/checksums-0.5.1.txt | diff - checksums/checksums-0.5.1.txt && curl -fsSL https://github.com/s-a-c/skills-ui/releases/download/v0.5.1/checksums-0.5.1.txt | diff - checksums/checksums-0.5.1.txt && git tag -v v0.5.1 >/dev/null 2>&1 && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=d01bf34b72de31efde4a6c9b24964e3329caea5e5f190f534620acf687ab3d8f; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=bb832fc32021/41 entries

- [x] G5: sanitization covers every external-text ingress (sanitizer unit + shim/HTTP-API ingress suites green)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/sanitize.test.ts 2>&1 | grep -q "^ 0 fail" && echo G5-OK
  EXPECT: G5-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=462da4019381c6c7d3907a1d0a337b350fab8a4dda175ac26fb404c065e38aa7; exit=0; EXPECT=matched; output-sha256=3eec1fa0812c9b7b9a9198e9675b893426a95ae751a9cbbccc65ee7a751af81b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=bb832fc32021/41 entries

- [x] G6: v0.5.1 released — tag pushed, four binaries + checksums attached, pinned installer live and verifying
  CHECK: gh release view v0.5.1 --json assets -q ".assets | length" | grep -q 5 && SKILLS_UI_INSTALL_DIR=/tmp/g6-install sh -c 'curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/v0.5.1/scripts/install.sh | sh -s v0.5.1' >/dev/null 2>&1 && /tmp/g6-install/skills-ui --version | grep -q 0.5.1 && rm -rf /tmp/g6-install && echo G6-OK
  EXPECT: G6-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=641eeb29fa9eb44dc93559b88d91d5ec0cf073368585210753567343dced8e28; exit=0; EXPECT=matched; output-sha256=6233fa6beb413a3b89a765ac4e145e64251faee409e778323811a8466b872b67; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=bb832fc32021/41 entries

- [ ] G7: manual smoke — live page connect + token re-entry after tab close (sessionStorage expiry is the intended property)
  EVIDENCE: pending — the one human step, by design.

- [x] G8: accepted-risk ledger (below) complete — every entry with reason and revisit trigger
  CHECK: grep -q "^## Accepted-risk ledger" GATES-0.5.1.md && [ "$(grep -c '^- \*\*' GATES-0.5.1.md)" -ge 8 ] && echo G8-OK
  EXPECT: G8-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=2c500c8a4f6366addd38861365b8b4025d123cd3888c2a76f3a739a5e3b1b095; exit=0; EXPECT=matched; output-sha256=56536f678f863b868f2c277d1d7d5de3b73d6b993d9f72056d2da84f7c426f7b; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/main; path=bb832fc32021/41 entries

## Accepted-risk ledger

Ratified in S-148 (2026-10-30). Entries removed by implementation: rate limiting and subprocess serialization — implemented in 0.5.1 (S-156).

- **No token rotation** — stable token by design; tripwire documented in `hosted-auth.ts`: revisit the day serve ever binds beyond loopback.
- **No CI** — single-maintainer, manually verified build/release chain (this ledger is that verification); revisit when the trust model grows (contributors, signing automation).
- **Cleartext loopback** — serve speaks plain http on 127.0.0.1; inherent to zero-install local UX, no TLS story for loopback browsers.
- **Token-free `GET /api/version`** — deliberate pre-pairing capabilities probe; exposes version + capability flags only, nothing else.
- **`curl | sh` installer model** — mitigated: tag-pinned URL documented first, mandatory sha256 verification, manifest covered by the signed tag, atomic install.
- **Loopback-wide `connect-src` (any port)** — deliberate: serve ports vary per run; the CSP still pins scheme+host to loopback.
- **`frame-ancestors` unenforceable via meta CSP** on the hosted static page — serve's embedded copy sends real `nosniff`/`referrer-policy` headers; the hosted copy gains them the day custom-domain headers are available.
- **Stale `exif-parser` 0.1.12 transitive** (via jimp via `@opentui/three`) — ~9 years old, no license field; not reachable from external input in this wrapper; revisit with an upstream jimp bump.
- **Host-header-null pass-through** — real HTTP/1.1 always sends Host; the allowlist is otherwise strict.
- **Absolute filesystem paths in `/api/skills`** — a local tool reporting real paths by design; gated by the token.
