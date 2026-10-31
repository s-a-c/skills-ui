# Gates: S-162 — 0.5.2 impl B, TUI polish (sort indicator, naming, confirm-n, toast queue)

OWNS: src/tui/app.ts, src/tui/Views.tsx, tests/tui.test.ts, scripts/pty-smoke/smoke.py

Scope: S-152 items 7-TUI-half (sort mode visible in the list border title), 8 (T1/T2/A3 naming + confirm vocabulary: "install list", "remove" verb, live n/N cancel), ST7 (toast FIFO — single slot, queued not clobbered).

- [x] G1: full suite green on phase/ux052 (114 at S-161 close + 3 new S-162 tests)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G2: pty-smoke green with the renamed queue pane (asserts "install list (2)" and the sort-indicator title at startup)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=e95d32160ca58c2b42cc5ccee90bb7eadb4a99df5d9debfffadf171a81073b69; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G3: the S-162 acceptance cases pass as a group — n and N cancel a remove-confirm (dialog closes, remove never called), sort indicator visible in BOTH modes at 80 cols, queue header string asserted, toast FIFO ordering
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/tui.test.ts -t "S-162" 2>&1 | grep -q "^ 0 fail" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=49023c0c30e7b27bef35e8c216a3970e56ef9070fd82361e434df36ca1f844e1; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G4: naming sweep — no user-visible "queue"/"Selected"/"Delete" string literals remain on the TUI surfaces (internal ids exempt)
  CHECK: ! grep -nE '"[^"]*(Selected|Delete selected|queues from|install queued)[^"]*"' src/tui/Views.tsx src/tui/app.ts && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=3960182d9056c9951d256dc59bc9fc10af924004950bef8d88eb8931d6ece602; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

## Notes

- Mutation spot-check (reviewer, killed then restored byte-identical): reverting the FIFO guard (`if (!toastTimer) showNextToast()` → unconditional `showNextToast()`) fails the S-162 toast-FIFO test exactly.
- Review verdict: APPROVE (five axes; zero Critical/Required). Optional #2 folded in by the orchestrator (`toastTimer = null` at teardown — stale non-null id could marginally delay process exit). Optional #1 recorded, not fixed: the border title drops entirely at n ≥ 1000 installed skills in checked mode (19-char title budget at 80 cols; `·order` mode survives to 99999) — 1000+ local installs is out of realistic range; revisit if the list ever pages.
- Sort indicator is idle-state only: the agent-filter and text-filter branches replace the idle title (S-88 discipline — the filter title is itself the live state).
- Sort-indicator strings are the measured-fit compact forms `N skills·checked` / `N skills·order` (exactly 19 chars at 3-digit counts; ladder-measured 19 renders / 20 drops at 80 cols).
