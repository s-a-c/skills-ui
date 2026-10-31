# Gates: S-163 — 0.5.2 impl C, web honesty (res.ok checks, update-check feedback, seed pre-check)

OWNS: src/web/page.ts, tests/fixtures/skills-shim.mjs, tests/e2e/hosted.e2e.ts, docs/app.html (regenerated artifact)

Scope: S-152 items 2 (G2/ST3 body-ok honesty on /api/update + /api/remove), 3 (G3 update-check zero/failure toasts; manual button force), 6 (G5 remove-seed pre-check), A6 (stale install button re-render). Ride-along: "Delete selected" → "Remove selected" (T2 vocabulary, asserted by the 0.5.2 gate's terminology check).

- [x] G1: full suite green on phase/ux052
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G2: e2e green — 4 pre-existing hosted tests + 7 S-163 honesty cases (failed remove ×2 paths, failed update, check-failure toast, forced-zero toast, remove-seed pre-check, install-button flip)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 11 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=10ca84521a3f12ca63386e9b36b52b0e51890cb4f0abfc6b9a5edb6688591548; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G3: honesty mutations stay dead — the deleteChecked guard has dedicated coverage (reviewer proved the original gap by mutation: `if (false)` passed the whole suite before this test existed)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bunx playwright test -g "deleteChecked" 2>&1 | grep -q " 1 passed" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=83dbd4d2f102c6c103d5d1ff648c9d4d7dc6628eb798e3322f4627856c11e62e; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G4: emitted page is valid and current — export succeeds, node --check accepts the emitted main script, no dishonest success-toast handler remains (every /api/remove and /api/update .then in APP_JS checks body ok)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && node ~/.agents/skills/unlazy/scripts/gate-check.mjs --version >/dev/null 2>&1; grep -c "if (!res.ok)" src/web/page.ts | grep -q "^[1-9]" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=b04267e6fd7cc024500ee8686c5f4cbf6b7503331a7d24f90911ecb0a3bc6724; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

## Notes

- Review: code-review-and-quality five axes — REQUEST CHANGES on a proven coverage gap (deleteChecked guard untested; reviewer mutation `if (false)` passed 117 bun + 10 playwright), resolved by the bulk-remove e2e (mutation now fails 1 test, reverted byte-exact). All other axes APPROVE; the reviewer audited all 13 `api('/api/…')` sites — no remaining success-toast-without-body-check.
- Mutation spot-checks across both passes: openRemove guard covered via the rmKeep single-remove test; updateSkills guard via the update-fail test; both fail under their respective inversions.
- Recorded, not fixed (pre-existing or out-of-scope, flagged by the reviewer/implementer): (a) dead duplicate of the OLD checkForUpdates sits inside the APP_CSS template literal (page.ts:203-216) and ships as inert text inside `<style>` — S-164 owns page.ts semantics next and should delete it; (b) dead-backend remove-seed can toast "not installed" when status is unverifiable (loadSkills swallows its error) — not a regression; (c) single-install HTTP-500 path drops the CLI `output` field (`.catch` shows only body.error) — pre-existing.
- E2e harness fix folded in (necessary, not drive-by): per-serve SKILLS_SHIM_STATE dirs — all e2e serves previously shared /tmp/skills-shim-state and could leak state across tests.
