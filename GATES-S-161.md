# Gates: S-161 — 0.5.2 impl A, TUI correctness (install scope + q-guard)

OWNS: src/tui/app.ts, src/tui/Views.tsx (help entry only), tests/tui.test.ts

Scope: S-152 item 1 (G1 install-scope threading, the worst parity bug) + the A2 q-guard — install paths honor the `[g]`/`[p]` scope toggle via `svcInstall({global})`, and no single bare keystroke reaches the destructive quit.

- [x] G1: full suite green on phase/ux052 (baseline 110 + 4 new S-161 tests)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green (real-terminal contract intact)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=e95d32160ca58c2b42cc5ccee90bb7eadb4a99df5d9debfffadf171a81073b69; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G3: the S-161 acceptance cases pass as a group — scope threading (fake deps, both call sites × both scopes), shim snapshot asserting the real `--global` argv, q-types-in-filter, double-press quit + disarm
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/tui.test.ts -t "S-161" 2>&1 | grep -q "^ 0 fail" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7092a71ca2d2a1c8d2fb5f3434fb7a84432e64bb26bc28b9a8d4da9a1c5a2e86; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G4: core install semantics untouched (the ticket threads scope through the TUI layer only)
  CHECK: git diff --exit-code main -- src/core/services/install.ts && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=ccf1f3d31436b9bc2f87cb31b9be442c754ca08930fed7cd27d36f9ee5115c20; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

## Notes

- Mutation spot-checks (reviewer, both killed then restored): `global: scope === "global"` → `"project"` fails G3's shim-snapshot case; collapsing `if (quitArmed)` → `if (true)` fails G3's double-press case.
- Known accepted edges (recorded, not fixed): `q` in the 3D graph view still quits in one press (deliberate modal view, out of the A2 type-to-filter scope); the 1500 ms timer-disarm path is exercised only indirectly (key-driven disarm is tested; a timer that never fires degrades to "armed until another key", which is benign).
- Review verdict: APPROVE (code-review-and-quality, five axes; zero Critical/Required). Optional #1 (help-overlay entry now reads "quit (press twice)") folded in; footer legend left terse — adding "×2" there overflows the legend line and wraps toasts (hit and reverted during verification).
