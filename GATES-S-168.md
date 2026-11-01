# Gates: S-168 — 0.5.2 impl G, hallmark floor pass on the WebUI (polish depth, sloplint clean)

OWNS: src/web/page.ts, .gitignore, docs/app.html (artifact), .hallmark/ (gitignored)

Scope: the S-152 supplementary resolution's impl G — all Floor FAILs fixed, cheap WARNs taken, gate 24b waived with the ratified reason and stamped in the emitted CSS; layout and token system kept; no restructure.

- [x] G1: sloplint clean on the emitted page — 0 FAIL, 0 WARN, all 24b findings WAIVED via the in-file stamp
  CHECK: node ~/.agents/skills/hallmark/scripts/sloplint.mjs docs/app.html --genre modern-minimal --scope app 2>&1 | grep -q "0 FAIL, 0 WARN" && node ~/.agents/skills/hallmark/scripts/sloplint.mjs docs/app.html --genre modern-minimal --scope app 2>&1 | grep -vq "WAIVED 2[0-9a-c]\b" ; node ~/.agents/skills/hallmark/scripts/sloplint.mjs docs/app.html --genre modern-minimal --scope app 2>&1 | grep "sloplint:" | grep -q "0 FAIL, 0 WARN" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=de018ca0dc17d51522252dbd760ae8dc8de3f255ab8d1408d332c97df83e6829; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G2: the waiver stamp is in the emitted CSS and 24b is the ONLY waived gate
  CHECK: grep -q "Hallmark · waive 24b" docs/app.html && [ "$(node ~/.agents/skills/hallmark/scripts/sloplint.mjs docs/app.html --genre modern-minimal --scope app 2>&1 | grep "WAIVED" | grep -v "sloplint:" | grep -vc "WAIVED 24b")" = "0" ] && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=97d7c0b3ed4d4dcafa2cdd9ccee8c21534310737982a9eee0902c7df749d7735; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G3: full suite + e2e + smoke green after the CSS/DOM pass (CSP hashes recompute; the .js gating breaks nothing)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 21 passed" && PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=8d2fd8ed7318d36c5eedc2a83f40356d2306a4ae631633cf52e2f4a7e3151590; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G4: export deterministic and the audit records are ignored
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && sha1=$(shasum docs/app.html | cut -d" " -f1) && PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && [ "$sha1" = "$(shasum docs/app.html | cut -d" " -f1)" ] && grep -q "^\.hallmark/$" .gitignore && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=40a24db4758812492ad293e67ac8a9327af26d51f35c9a55400eadbbd9cd48a9; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

## Notes

- Fresh findings were regenerated (the ticket's line numbers were 0.5.1-era): 15 FAIL / 58 REFLEX / 6 WARN before the pass — the ticket's 7 groups all present PLUS gate 20 (missing Hallmark stamp) and gate 3 (S-165's .md-quote side-stripe). After: 0 FAIL / 0 WARN / 57 WAIVED (one 24b finding disappeared because the .md-quote restyle put its padding on-scale).
- Iteration cascades (honest fixes forced by the tool): de-gradienting the logo un-masked gate 40 contrast (crust-on-mauve 4.09:1 → mark ink var(--t-bg), AA both themes); the F24 hairline-vs-shadow resolution surfaced the same pairing on #settings/dialog/.toast → resolved as ONE hairline-edges system, soft overlay shadows gone.
- User-visible string change: the sort label "A–Z" → "A to Z" (gate 19 bans en/em dashes in copy unconditionally). e2e assertions use data-sort/aria-pressed — unaffected.
- Render tier NOT run (no puppeteer, same condition as the ratified audit) — lint tier + code read + the 21 Playwright tests driving the real page.
- Review: five axes APPROVE, zero Critical/Required, PLUS a judged-gates walk (gate 63 walked manually: PASS — every remaining dot is the single-dot live-state/caption form the judged clause legalizes; zero glued arrows).
- Known flake (pre-existing, unrelated to this diff): `spike screen > tree-sitter worker` (image.test.ts) failed once in four orchestrator runs and once in the implementer's runs; green on rerun both times. Recorded here so the 0.5.2 gate interprets a recurrence honestly.
- Recorded, not fixed: runtime JS-built toasts still carry em-dashes (static sweep was this pass's scope — follow-up sweep noted); .md-quote restyle added to the ticket record (coherent: the detail pane has no border, the quote box is the first containment layer); test-title comments still say "A–Z" (cosmetic); --t-crust defined-but-unused (kept as a palette token); header backdrop-filter kept (functional readability over scrolling content).
