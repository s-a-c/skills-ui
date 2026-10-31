# Gates: S-164 — 0.5.2 impl D, web semantics (Esc-keeps-text, filter parity, honest sort)

OWNS: src/web/page.ts, tests/filter-parity.test.ts (new), tests/e2e/hosted.e2e.ts, docs/app.html (artifact)

Scope: S-152 items 4 (F5/A7 Esc keeps text — code changed to match the help), 5 (F1 agents in the web haystack, single-source predicate), 7-web-half (S1 honest 3-mode sort, default flipped to checked-first+A→Z matching the TUI), direction-call regression tests (S4 update-all = whole scope, S6 checks clear on scope switch), plus the S-163-flagged hygiene: dead old-checkForUpdates removed from APP_CSS.

- [x] G1: full suite green on phase/ux052 (117 + 15 new parity tests)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G2: e2e green — 11 prior + 5 new S-164 cases (filter-Esc keeps text+filter, search-Esc keeps query+results, sort cycles 3 labeled modes with 3 distinct orders, update-all posts skills:[], scope switch clears checks)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 16 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=230d80bfa02738b86135186cfd2b907a3db72624c33692490549820d95c7a98c; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G3: cross-surface filter parity holds — the same-query fixture suite (both surfaces' predicates, agent-only query included) passes; this is the test the 0.5.2 gate's G3 cites
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/filter-parity.test.ts 2>&1 | grep -q "^ 0 fail" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=680dde02eee9f149cb9e953889eb7079c8e0abcfb233d2f3a95d8177f73750fd; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G4: the dead old-checkForUpdates no longer ships — exactly ONE checkForUpdates definition in the emitted page, and no Escape handler in APP_JS clears an input value
  CHECK: [ "$(grep -c 'function checkForUpdates' docs/app.html)" = "1" ] && ! grep -n "Escape.*value = ''" src/web/page.ts && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=276bf7a48db32bb677b1e89fb216bdac322f1d3d6c5e281305bd5020f318a7d0; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

## Notes

- Parity mechanism: `skillMatches()` exported at page.ts module scope; its transpiled `.toString()` interpolated into APP_JS — one definition, two surfaces. Interpolation hazards are test-enforced, not comment-enforced: page-hardening runs node --check + sha256-pins every emitted script block; the parity drift guard asserts the emitted HTML carries the exact function source; the parity loop runs 12 queries × 3 fixtures through both the module function and the TUI's visibleSkills.
- Review: code-review-and-quality five axes APPROVE, zero Critical/Required/Optional. Reviewer mutation: removing the agents clause from skillMatches fails 4 parity tests (incl. the agent-only F1 case); restored byte-identical. Two Nits recorded, not applied: redundant `items.slice()` before sort (items already fresh from .filter); the constraint comment could name `</script>` as the true inline hazard (today the hash + node --check tests catch it regardless).
- Help table consistent post-change: `/` row now reads "leaves the query as-is" (was "cancels" — contradicted the ratified keep rule), `f` row unchanged and now true, dialog-Esc rows unaffected (document handler checks dialogs before inputs).
- Default sort flipped to checked-first on web: both surfaces now default checked-first with A→Z tiebreak; web additionally offers real A–Z and load-order modes (the old "A–Z" button sorted nothing).
