# Gates: 0.5.2 — UI/UX consistency (web + TUI), map S-143

OWNS: the whole repo at the merge (impl A–G landed on phase/ux052: 96eced5, 6b67bbe, 53e95fb, a37555c, 9563c7c, f63b20a, 3e52e9d + this gate)

Scope: the S-152-ratified full checklist suite — all ten shortlist items + the hallmark amendment (impl G) shipped, the acceptance suite proves the ratified vocabulary and cross-surface parity, v0.5.2 released per docs/release.md, hosted page redeployed and live-checked. Run from `main/` after the ff-merge.

- [ ] G1: all suites green on main after the merge + sloplint clean on the emitted page (impl G acceptance)
  CHECK: cd /Users/s-a-c/Projects/s-a-c/skills-ui/main && PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && PATH="$HOME/.bun/bin:$PATH" bun run pty-smoke 2>&1 | grep -q "SMOKE PASS" && PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -qE " (29|30) passed" && node /Users/s-a-c/.agents/skills/hallmark/scripts/sloplint.mjs docs/app.html --genre modern-minimal --scope app 2>&1 | grep "sloplint:" | grep -q "0 FAIL, 0 WARN" && echo G1-OK
  EXPECT: G1-OK

- [ ] G2: terminology assertions — the ratified vocabulary holds on both surfaces (install list, remove verb, confirm copy matches its keys; banned pre-ratification strings absent)
  CHECK: cd /Users/s-a-c/Projects/s-a-c/skills-ui/main && PATH="$HOME/.bun/bin:$PATH" bun test tests/terminology.test.ts 2>&1 | grep -q "^ 0 fail" && echo G2-OK
  EXPECT: G2-OK

- [ ] G3: same-query parity — the same fixtures through both surfaces' filter code assert identical result sets (agents in both haystacks)
  CHECK: cd /Users/s-a-c/Projects/s-a-c/skills-ui/main && PATH="$HOME/.bun/bin:$PATH" bun test tests/filter-parity.test.ts 2>&1 | grep -q "^ 0 fail" && echo G3-OK
  EXPECT: G3-OK

- [ ] G4: automated live dimensions on the released artifacts — the hosted page carries the 0.5.2 surface (new sort label, meta description, markdown container) and the released binary selftests at 0.5.2
  CHECK: cd /Users/s-a-c/Projects/s-a-c/skills-ui/main && curl -fsS https://s-a-c.github.io/skills-ui/app.html | grep -q "A to Z" && curl -fsS https://s-a-c.github.io/skills-ui/app.html | grep -q 'name="description"' && curl -fsS https://s-a-c.github.io/skills-ui/app.html | grep -q 'id="readme"' && ./dist/skills-ui-0.5.2-darwin-arm64 --selftest >/dev/null 2>&1 && ./dist/skills-ui-0.5.2-darwin-arm64 --version | grep -q 0.5.2 && echo G4-OK
  EXPECT: G4-OK

- [ ] G5: release trust — signed tag verifies, the tag-committed manifest equals the release asset, and the pinned installer URL installs + verifies 0.5.2
  CHECK: cd /Users/s-a-c/Projects/s-a-c/skills-ui/main && git tag -v v0.5.2 >/dev/null 2>&1 && curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/v0.5.2/checksums/checksums-0.5.2.txt | diff -q - checksums/checksums-0.5.2.txt && curl -fsSL https://github.com/s-a-c/skills-ui/releases/download/v0.5.2/checksums-0.5.2.txt | diff -q - checksums/checksums-0.5.2.txt && SKILLS_UI_INSTALL_DIR=/tmp/g5-052 sh -c 'curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/v0.5.2/scripts/install.sh | sh -s v0.5.2' >/dev/null 2>&1 && /tmp/g5-052/skills-ui --version | grep -q 0.5.2 && rm -rf /tmp/g5-052 && echo G5-OK
  EXPECT: G5-OK

- [ ] G6: hosted page redeployed and live-checked — the connect flow + the G7-era regression e2e suite pass from the real hosted origin
  CHECK: cd /Users/s-a-c/Projects/s-a-c/skills-ui/main && PATH="$HOME/.bun/bin:$PATH" bunx playwright test tests/e2e/hosted.e2e.ts -g "hosted page" 2>&1 | grep -qE " 4 passed" && echo G6-OK
  EXPECT: G6-OK

- [ ] G7: manual smoke — one human pass over the G4 checklist on the live page + binary (incl. a Global-scope install through the TUI honoring [g]). NOT the agent's gate: the checklist is handed to the user; evidence is their confirmation.
  EVIDENCE: PENDING HUMAN — checklist delivered in the S-167 resolution comment.

- [ ] G8: deferred-record — every deferred matrix item + the hallmark 24b waiver listed with reasons in this ledger
  CHECK: cd /Users/s-a-c/Projects/s-a-c/skills-ui/main && grep -q "^## Deferred record" GATES-0.5.2.md && [ "$(grep -c '^- \*\*' GATES-0.5.2.md)" -ge 7 ] && echo G8-OK
  EXPECT: G8-OK

## Deferred record

Ratified in S-152 (polish tier, next window) unless noted:

- **Web listbox arrow keys (A4/G13)** — real gap, below this slice's line; the ARIA contract lands with keyboard navigation work.
- **TUI internal mouse parity (A5)** — queue rows and header tabs are not mouse targets while Results rows are; terminal-mouse idiom work.
- **Motion tri-state re-map (V3)** — `reduceMotion: "auto"` means OS-pref on web and always-static on TUI; re-map or per-surface documentation when motion is next opened.
- **TUI sound wiring (V6)** — confirm sound defined but never played; select fires on nearly every mutation. (Toast queueing ST7 and badges-on-load G14 were deferred candidates that SHIPPED in impl B/F.)
- **Busy-model unification (ST1)** — web's lockout is over-broad, TUI's static label under-signals; unify the signal in each medium's idiom.
- **Hallmark gate 24b — the 4px re-space (57 instances)** — WAIVED with reason: a page-wide re-space is a system change (restyle depth), not a consistency fix; scheduled for its own pass when the page CSS is next opened wide (early 0.5.3 candidate). Stamped in the emitted CSS; sloplint reports all 57 as WAIVED.
- **Runtime-string dash sweep** — JS-built toasts still carry em-dashes (S-168 swept static copy); cheap follow-up when strings are next touched.

## Notes

- Per-ticket ledgers with full evidence: GATES-S-161.md … GATES-S-168.md (merged with the branch).
- Known unrelated flake: `spike screen > tree-sitter worker` (image.test.ts) — failed once in ~4 runs during S-161 and S-168 verification, green on rerun every time; a G1 failure naming this test is rerun-once-and-record, not a gate regression.
- G4's automated half covers the live-page surface + binary selftest; the full per-dimension manual walk (Esc-keeps-text on both surfaces, sort default + honest labels, update-all = whole scope, checks clear on scope switch, TUI [g] install, web failure toasts, markdown detail) is the human G7 checklist.
