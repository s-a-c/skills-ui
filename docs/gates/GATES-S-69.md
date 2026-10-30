# Gates: S-69 — 0.2.x B1 list ops (phase/tui)

Scope: batch modifiers (I/A), sort toggle on s with settings moved to comma, PgUp/PgDn fast scroll

- [x] G0: this ledger states outcomes that can fail
  CHECK: node /Users/s-a-c/.agents/skills/unlazy/scripts/gate-lint.mjs GATES-S-69.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=6a2a5c958f9a6d2b2e68b8048ad137c70c8d28353b923e8cd805b1263dc50c34; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G1: the full test suite passes on the phase/tui worktree, including the new S-69 tests
  CHECK: sh -c 'cd tui && bun test 2>&1 | tail -4'
  EXPECT: 0 fail
  EVIDENCE: automatic-evidence=v1; definition-sha256=b3eddf0ade2781f123ecea787da37d727a36b0ec821c5029dd0fe50b284b3219; exit=0; EXPECT=matched; output-sha256=fdaf566b8f4b6dc3dd7bf93d497acc3481ee4a766805ae89fc9264d09d9a07ba; output-bytes=74; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G2: the S-69 keymap handlers are wired in the app layer
  CHECK: sh -c 'grep -q "toggle-all-checks" tui/src/tui/app.ts && grep -q "invert-checks" tui/src/tui/app.ts && grep -q "sort-toggle" tui/src/tui/app.ts && grep -q "pageup" tui/src/tui/app.ts && grep -q "comma" tui/src/tui/app.ts && echo s69-keymap-wired'
  EXPECT: s69-keymap-wired
  EVIDENCE: automatic-evidence=v1; definition-sha256=247aeb406b9369a05c1c883a571d0133a235d88854c87bd416f7880090afc9e3; exit=0; EXPECT=matched; output-sha256=b875c06f4b994bdddb277d16bf4ee5ddd4c85b72a278e82537f6274ff614efc5; output-bytes=17; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries
