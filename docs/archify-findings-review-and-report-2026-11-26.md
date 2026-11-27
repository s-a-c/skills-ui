# Archify Findings Review, Assessment, and Remediation Transcript (2026-11-26)

- **Conversation ID:** `b196b55f-66e1-4eeb-a951-7627689c2464`
- **Workspace:** `/Users/s-a-c/Projects/s-a-c/skills-ui` (worktree: `archify-remediation`, branch: `phase/archify-remediation`)
- **Date:** 2026-11-26 (UTC)
- **Scope:** Complete session transcript covering Archify findings collection, source-backed assessment, Option A execution plan, 3-wave remediation, full verification, and Archify baseline refresh.

---

<details>
<summary>Expand for Table of Contents</summary>

- [1. User (Turn 1 · `2026-11-26T06:00:42Z`)](#1-user-turn-1--2026-11-26t060042z)
- [2. Assistant (`2026-11-26T06:06:08Z` · Step 53)](#2-assistant-2026-11-26t060608z--step-53)
  - [2.1. Executive Summary](#21-executive-summary)
  - [2.2. Collected Artifacts & Run Integrity](#22-collected-artifacts--run-integrity)
  - [2.3. Complete Findings Register (18 / 18)](#23-complete-findings-register-18--18)
  - [2.4. Deep Assessment & Concrete Recommendations](#24-deep-assessment--concrete-recommendations)
    - [2.4.1. Workstream 1 — Break `src/core ↔ src/web` & Unify `skillMatches` *(3-for-1 Payoff)*](#241-workstream-1--break-srccore--srcweb--unify-skillmatches-3-for-1-payoff)
    - [2.4.2. Workstream 2 — Decompose the 5 Production Complexity Hotspots](#242-workstream-2--decompose-the-5-production-complexity-hotspots)
    - [2.4.3. Workstream 3 — Modularize `src/web/page.ts` Safely](#243-workstream-3--modularize-srcwebpagets-safely)
    - [2.4.4. Workstream 4 — `src/core` Boundary, Dead Spike, & Benchmark Script](#244-workstream-4--srccore-boundary-dead-spike--benchmark-script)
    - [2.4.5. Workstream 5 — Baseline Intentional Signals (Do Not Over-Refactor)](#245-workstream-5--baseline-intentional-signals-do-not-over-refactor)
  - [2.5. Recommended Strategy Options](#25-recommended-strategy-options)
- [3. User (Turn 2 · `2026-11-26T06:48:57Z`)](#3-user-turn-2--2026-11-26t064857z)
  - [3.1. Execution Plan Handoff (`2026-11-26T06:52:21Z` · Step 85)](#31-execution-plan-handoff-2026-11-26t065221z--step-85)
  - [3.2. Step 0: Create Phase Worktree & Install Dependencies](#32-step-0-create-phase-worktree--install-dependencies)
  - [3.3. Step 1 (Wave 1): Break `src/core ↔ src/web` Coupling, Unify `skillMatches`, Fix Deep Leaks, Remove Dead Spike](#33-step-1-wave-1-break-srccore--srcweb-coupling-unify-skillmatches-fix-deep-leaks-remove-dead-spike)
  - [3.4. Step 2 (Wave 2): Decompose the 6 High-Complexity Functions](#34-step-2-wave-2-decompose-the-6-high-complexity-functions)
  - [3.5. Step 3 (Wave 3): Modularize `src/web/page.ts` Byte-for-Byte Identically](#35-step-3-wave-3-modularize-srcwebpagets-byte-for-byte-identically)
  - [3.6. Step 4: Archify Config, Baseline Update, & Full Verification](#36-step-4-archify-config-baseline-update--full-verification)
  - [3.7. Re-Plan If](#37-re-plan-if)
- [4. Assistant (`2026-11-26T06:57:40Z` · Step 125)](#4-assistant-2026-11-26t065740z--step-125)
- [5. Assistant (`2026-11-26T07:06:15Z` · Step 178)](#5-assistant-2026-11-26t070615z--step-178)
- [6. Assistant (`2026-11-26T07:07:10Z` · Step 186)](#6-assistant-2026-11-26t070710z--step-186)
- [7. Assistant (`2026-11-26T07:13:30Z` · Step 213)](#7-assistant-2026-11-26t071330z--step-213)
- [8. Assistant (`2026-11-26T07:17:46Z` · Step 225)](#8-assistant-2026-11-26t071746z--step-225)
  - [8.1. Plan Review Checkpoint (`2026-11-26T07:20:45Z` · Step 228)](#81-plan-review-checkpoint-2026-11-26t072045z--step-228)
  - [8.2. Execution Plan Handoff (`2026-11-26T07:21:02Z` · Step 231)](#82-execution-plan-handoff-2026-11-26t072102z--step-231)
- [9. Assistant (`2026-11-26T07:22:01Z` · Step 238)](#9-assistant-2026-11-26t072201z--step-238)
- [10. Assistant (`2026-11-26T07:22:22Z` · Step 242)](#10-assistant-2026-11-26t072222z--step-242)
  - [10.1. Before Vs. After (Archify)](#101-before-vs-after-archify)
  - [10.2. Changes Implemented](#102-changes-implemented)
  - [10.3. Verification Evidence (All Run After Final Source Edit)](#103-verification-evidence-all-run-after-final-source-edit)
  - [10.4. Next Step](#104-next-step)

</details>

## 1. User (Turn 1 · `2026-11-26T06:00:42Z`)

collect , review and assess archify findings, making a report which also shows your recommendation for addressing, and/or resolving

---

<details>
<summary>Tool activity (42 calls)</summary>

- \[step 1\] `update_focus` — Locating archify findings and workspace context
- \[step 1\] `run_command` — Locate archify files and worktrees
- \[step 1\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/AGENTS.md`
- \[step 5\] `run_command` — Inspect archify files and git state
- \[step 5\] `read_file` — `/Users/s-a-c/.config/agents/rules/communication-style.md`
- \[step 8\] `update_focus` — Reading archify findings, overview, review, and module graph
- \[step 8\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/analysis/findings.json`
- \[step 8\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/analysis/overview.json`
- \[step 8\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/live/analysis/review.json`
- \[step 8\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/analysis/review.json`
- \[step 8\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/analysis/module-graph.json`
- \[step 8\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/baseline.json`
- \[step 8\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/prepare-stdout.txt`
- \[step 17\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/analysis/findings.json` (L801–1351)
- \[step 17\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/analysis/overview.json` (L801–877)
- \[step 17\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/architecture-skills-ui-20261125-211159/skills-ui.delivery.json`
- \[step 17\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/architecture-skills-ui-20261125-211159/review-2/visual-check-summary.json`
- \[step 17\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/ROADMAP.md`
- \[step 23\] `update_focus` — Inspecting high-complexity TUI and API source files
- \[step 23\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/tui/app.ts` (L530–950)
- \[step 23\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/tui/model.ts` (L155–570)
- \[step 23\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/core/api.ts` (L1–620)
- \[step 23\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/core/index.ts`
- \[step 23\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/main.ts`
- \[step 23\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/tui/Views.tsx` (L220–610)
- \[step 31\] `update_focus` — Inspecting remaining flagged files and web page structure
- \[step 31\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/core/disk-index.ts` (L125–205)
- \[step 31\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/core/services/hooks.ts` (L135–210)
- \[step 31\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/core/services/updates-check.ts` (L80–165)
- \[step 31\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/scripts/perf/budget.ts` (L285–675)
- \[step 31\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/scripts/react-spike/spike.tsx`
- \[step 31\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/web/page.ts` (L1–160)
- \[step 31\] `run_command` — Inspect page.ts structure and raw-facts unresolved imports
- \[step 41\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/web/page.ts` (L2350–2713)
- \[step 41\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/package.json`
- \[step 41\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/tsconfig.json`
- \[step 41\] `run_command` — Check unresolved imports, spikes, and page.ts invariants
- \[step 46\] `update_focus` — Verifying test invariants and unresolved imports
- \[step 46\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/tests/dash-sweep.test.ts` (L120–190)
- \[step 46\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/tests/filter-parity.test.ts`
- \[step 46\] `run_command` — Check createSkillsUiServer callers and unknown imports
- \[step 51\] `run_command` — Inspect unknown imports, react-spike refs, and core layout

</details>

## 2. Assistant (`2026-11-26T06:06:08Z` · Step 53)

### 2.1. Executive Summary

**Next action:** Pick an execution option below (**Option A** recommended) to turn these findings into a clean refactor + baseline pass on a new phase worktree.

The latest Archify run (`@archify/code-analysis@0.1.0-dev.1`, base commit `58247eb` on `main`, 39 analyzed TS/TSX files) produced **18 findings**: **1 accepted error**, **9 open warnings**, and **8 open info**.

After reading the source code and tests behind every finding, the real signal breaks down as follows:

- **Fix (10 findings):** 1 accepted cycle (`COUP-e41598564701`) that silently drives a second open warning (`COUP-8b42059fbd40`), 6 genuine high-complexity / concentration hotspots (`onKey`, `update`, `route`, `SearchBody`, `InstalledBody`, `page.ts`), 1 duplicated filter predicate (`visibleSkills`), 1 partial barrel leak into `src/core/services/*`, and 1 obsolete spike (`scripts/react-spike/`).
- **Optional cleanup (1 finding):** `scripts/perf/budget.ts` `main` (dev/CI benchmark harness, `fanIn: 0`).
- **Accept in baseline — do not refactor (7 findings):** `src/core` reach concentration (intended shared kernel) plus 5 short, shallow guard-clause functions (`CC 16–18`, 24–70 LOC, nesting 1–2) where splitting would hurt readability or security auditability.

---

### 2.2. Collected Artifacts & Run Integrity

All five `findings.json` snapshots under `.archify/` are byte-identical (`md5: 21a329e327f7655b5a33ec4571b28f7f`).

| Artifact | Path | Status / Notes |
| --- | --- | --- |
| Primary findings | [findings.json](../../.archify/code-analysis-skills-ui-20261125-211159/analysis/findings.json) | 18 findings across 6 rules (`coupling/import-cycle` = 0, `coupling/hub` = 0) |
| Overview & hotspots | [overview.json](../../.archify/code-analysis-skills-ui-20261125-211159/analysis/overview.json) | Verdict `attention`, 8 modules, 9 edges, 0 parse errors |
| Module graph | [module-graph.json](../../.archify/code-analysis-skills-ui-20261125-211159/analysis/module-graph.json) | Exact file-to-module edges and weights |
| Active baseline | [baseline.json](../../.archify/code-analysis-skills-ui-20261125-211159/baseline.json) | 1 accepted entry (`COUP-e41598564701`) |
| Live review state | [review.json](../../.archify/code-analysis-skills-ui-20261125-211159/live/analysis/review.json) | All 18 findings `unchanged` vs previous snapshot |
| Architecture diagram | [visual-check-summary.json](../../.archify/architecture-skills-ui-20261125-211159/review-2/visual-check-summary.json) | Automated browser checks `pass`, 0 diagnostics (`visualReview: "pending"`) |

**Coverage notes:**

- 39 source files analyzed, 36 excluded (`test`, `generated`). Two Python PTY smoke scripts (`scripts/pty-smoke/smoke.py`, `scripts/pty-smoke/runner.py`) sit outside the TS adapter.
- `overview.json` reports 7 `ambiguousModules` in diagram mapping because `src/core` maps to 13 diagram components and `scripts/*` map to `binary` + `hosted`. That is a diagram-mapping granularity artifact, not a code defect.

---

### 2.3. Complete Findings Register (18 / 18)

| # | ID | Rule | Sev / Status | Location | Metric | Assessment | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `COUP-e41598564701` | `coupling/cycle` | error · accepted | [api.ts](../../main/src/core/api.ts#L1) ↔ [page.ts](../../main/src/web/page.ts#L6-L19) | 2 modules, 4 imports | Real coupling leak that also triggers #2 | **Refactor** (Workstream 1) |
| 2 | `COUP-8b42059fbd40` | `coupling/concentration` | warning · open | `src/web` ([page.ts](../../main/src/web/page.ts)) | 5/7 modules (71% reach), `fanIn: 3` | Secondary effect of #1 + `skillMatches` in `page.ts` | **Resolves via #1** (Workstream 1) |
| 3 | `COUP-ef47d5bb12bf` | `coupling/concentration` | warning · open | `src/core` (22 files) | 5/7 modules (71% reach), `I: 0.167` | Healthy shared kernel (Stable Dependencies Principle) | **Accept in baseline** |
| 4 | `COUP-241f7ffd9b73` | `coupling/concentration` | warning · open | [page.ts](../../main/src/web/page.ts) | 2,713 LOC (limit 1,500) | Real debt (CSS + JS + HTML monolith, touched every minor) | **Refactor** (Workstream 3) |
| 5 | `COMP-ae16d139cc2c` | `complexity/function` | warning · open | [app.ts](../../main/src/tui/app.ts#L538-L938) `onKey` | CC 190 · 401 LOC · depth 5 | **Top complexity hotspot** — 6 modals + text mode + async flows | **Refactor** (Workstream 2) |
| 6 | `COMP-879a4456c823` | `complexity/function` | warning · open | [model.ts](../../main/src/tui/model.ts#L264-L557) `update` | CC 90 · 294 LOC · depth 4 | Large flat Elm reducer (39 action arms across 5 slices) | **Refactor** (Workstream 2) |
| 7 | `COMP-ac091708c066` | `complexity/function` | warning · open | [api.ts](../../main/src/core/api.ts#L272-L549) `route` | CC 85 · 278 LOC · depth 4 | All 13 HTTP endpoints inline with validation + hooks | **Refactor** (Workstream 2) |
| 8 | `COMP-36d369b34b91` | `complexity/function` | warning · open | [Views.tsx](../../main/src/tui/Views.tsx#L409-L596) `SearchBody` | CC 77 · 188 LOC · depth 1 | 3 panes + ~35 JSX ternaries + duplicated scroll effect | **Refactor** (Workstream 2) |
| 9 | `COMP-73633f919afd` | `complexity/function` | warning · open | [Views.tsx](../../main/src/tui/Views.tsx#L230-L379) `InstalledBody` | CC 51 · 150 LOC · depth 2 | Nested title logic + list/detail panes + duplicated scroll effect | **Refactor** (Workstream 2) |
| 10 | `COMP-7e48ec72fc72` | `complexity/function` | warning · open | [budget.ts](../../main/scripts/perf/budget.ts#L292-L665) `main` | CC 46 · 374 LOC · depth 5 | Real length, low impact (benchmark script, `fanIn: 0`) | **Optional refactor** (Workstream 4) |
| 11 | `COUP-5a8cbd5368ab` | `coupling/internal-leak` | info · open | [index.ts](../../main/src/core/index.ts) (27 imports / 9 files) | 9 internal files bypassed | Mix of real `services/*` leaks and intentional lazy seams | **Fix deep leaks + declare entries** (Workstream 4) |
| 12 | `COMP-c71250190536` | `complexity/function` | info · open | [spike.tsx](../../main/scripts/react-spike/spike.tsx#L32-L103) `App` | CC 19 · 72 LOC · depth 1 | Dead S-92 spike (zero references, writes `/tmp/react-spike.log`) | **Delete or exclude** (Workstream 4) |
| 13 | `COMP-84c5e376d642` | `complexity/function` | info · open | [model.ts](../../main/src/tui/model.ts#L167-L193) `visibleSkills` | CC 17 · 27 LOC · depth 1 | Duplicates `skillMatches` from `src/web/page.ts` | **Resolves via Workstream 1** |
| 14 | `COMP-bc66a816f58a` | `complexity/function` | info · open | [disk-index.ts](../../main/src/core/disk-index.ts#L160-L196) `normalizeDiskIndex` | CC 18 · 37 LOC · depth 2 | Flat untrusted-JSON schema guards — clean as written | **Accept in baseline** |
| 15 | `COMP-d596a054f898` | `complexity/function` | info · open | [disk-index.ts](../../main/src/core/disk-index.ts#L133-L156) `normalizeEntry` | CC 18 · 24 LOC · depth 1 | Flat 9-field validation guards — splitting hurts clarity | **Accept in baseline** |
| 16 | `COMP-835aa3d4f44f` | `complexity/function` | info · open | [hooks.ts](../../main/src/core/services/hooks.ts#L145-L200) `runOnce` | CC 18 · 56 LOC · depth 2 | Clear 4-branch subprocess outcome parser | **Accept in baseline** (or extract `parseHealthOutput`) |
| 17 | `COMP-e884381444d2` | `complexity/function` | info · open | [updates-check.ts](../../main/src/core/services/updates-check.ts#L89-L158) `checkForUpdates` | CC 18 · 70 LOC · depth 2 | Clear 2-stage lock-group + concurrent tree check | **Accept in baseline** (or extract `checkGithubGroup`) |
| 18 | `COMP-4a36ff194ac7` | `complexity/function` | info · open | [api.ts](../../main/src/core/api.ts#L572-L601) `handler` | CC 16 · 30 LOC · depth 2 | Crisp linear security gate (Host/Origin/Rate/Bearer) | **Accept in baseline** |

---

### 2.4. Deep Assessment & Concrete Recommendations

#### 2.4.1. Workstream 1 — Break `src/core ↔ src/web` & Unify `skillMatches` *(3-for-1 Payoff)*

**Targets:** `COUP-e41598564701`, `COUP-8b42059fbd40`, `COMP-84c5e376d642`

> **Key finding:** Accepting `COUP-e41598564701` in `baseline.json` hid its downstream cost. Because [api.ts](../../main/src/core/api.ts#L1) eagerly imports [page.ts](../../main/src/web/page.ts), **both `src/tui` and `src/main.ts` transitively depend on `src/web`**, inflating `src/web` reach to 5/7 modules (71%) and triggering `COUP-8b42059fbd40`. Meanwhile, [budget.ts](../../main/scripts/perf/budget.ts#L73) imports `src/web/page.ts` solely for `skillMatches`, while [model.ts](../../main/src/tui/model.ts#L167-L177) duplicates that 4-field match expression inline.

**Recommended changes:**

1. Move `skillMatches` into `src/core/filter.ts` (preserving its no-backtick/no-regex constraint so `.toString()` remains embeddable) and re-export it from [src/core/index.ts](../../main/src/core/index.ts) and [src/web/page.ts](../../main/src/web/page.ts) (for backwards compatibility with [tests/filter-parity.test.ts](../../main/tests/filter-parity.test.ts)).
2. Call `skillMatches(s, q)` inside `visibleSkills` ([model.ts](../../main/src/tui/model.ts#L167-L193)) and import `skillMatches` from `src/core` in [budget.ts](../../main/scripts/perf/budget.ts#L73). This deletes duplicated filter logic and drops `visibleSkills` CC below 15.
3. Inject page rendering into `createSkillsUiServer` via `ApiOptions.pageRenderer?: { renderPage; pageCspFor }` instead of importing `../web/page.ts` at [api.ts:1](../../main/src/core/api.ts#L1). In [src/main.ts](../../main/src/main.ts#L55-L64), lazily `await import("./web/page.ts")` only when `!headless`. For the 9 test files + `budget.ts` passing `{ withPage: true }`, add a small `webPageRenderer` helper or pass `{ renderPage, pageCspFor }`.
4. **Result:** `src/core → src/web` edge disappears, `src/web` reach drops from **71% (5/7)** to **29% (2/7)** (`src` and `scripts` only), and `baseline.json` no longer needs an accepted error.

---

#### 2.4.2. Workstream 2 — Decompose the 5 Production Complexity Hotspots

**Targets:** `COMP-ae16d139cc2c`, `COMP-879a4456c823`, `COMP-ac091708c066`, `COMP-36d369b34b91`, `COMP-73633f919afd`

1. **`onKey` in [src/tui/app.ts](../../main/src/tui/app.ts#L538-L938) (CC 190 → target < 20):**
   - Extract modal key handlers (`handleOverlayKey` dispatching confirm/help/health/agentSelect/graph/detailScroll).
   - Extract text-entry handler (`handleTextEntryKey` for `inFilter` / `inSearch`).
   - Pull the two inline async IIFEs out of the `switch`: `runUpdateCheck()` (`case "c"`, 48 lines) and `installSelectedSearchSkill()` (`case "return"`, 16 lines).
   - Add a `saveAndApplyPrefs(patch)` helper to collapse the 5 repeated prefs blocks (`t`, `[`/`]`, `0`, `,`, `m`).
   - Extract `handleCommandKey(k)` for command-mode dispatch.
2. **`route` in [src/core/api.ts](../../main/src/core/api.ts#L272-L549) (CC 85 → target < 15):**
   - Extract each endpoint into a focused local handler (`handleGetPage`, `handleGetVersion`, `handleGetSkills`, `handleGetSkill`, `handleSearch`, `handleInstall`, `handleRemove`, `handleUpdate`, `handleUpdates`, `handlePrefs`) and dispatch via a `"${method} ${path}"` lookup table.
   - Extract a small `finalizeMutation(event, scope, skills, ok)` helper for cache invalidation + `healthChecker.invalidate()` + `runPostMutationHook`.
3. **`update` in [src/tui/model.ts](../../main/src/tui/model.ts#L264-L557) (CC 90 → target < 25):**
   - Keep `update()` as the shallow-clone + `visibleOf`/`visibleSearchOf` memo shell (preserving the S-183 single-sort-per-dispatch invariant).
   - Delegate non-trivial slices to pure helpers: `reduceNavigation`, `reduceChecks`, `reduceAgentSelect`, `reduceSearchQueue`, `applySkillsLoaded`.
4. **`SearchBody` & `InstalledBody` in [src/tui/Views.tsx](../../main/src/tui/Views.tsx#L230-L596) (CC 77 & 51 → target < 20):**
   - Extract a shared `useSelectionScrollFollow(...)` hook (removes duplicated viewport math at L280–298 and L427–440).
   - Extract pure title formatters `installedListTitle(model)` and `searchListTitle(model)` (makes the 19-char 80-col truncation contract directly unit-testable).
   - Split row and detail panes into `InstalledSkillRow`, `InstalledDetailPane`, `SearchResultRow`, `SearchQueueList`, and `SearchDetailPane`.

---

#### 2.4.3. Workstream 3 — Modularize `src/web/page.ts` Safely

**Target:** `COUP-241f7ffd9b73` (2,713 LOC vs 1,500 threshold)

`page.ts` packs three distinct responsibilities into one file: `APP_CSS` (L64–507, ~445 LOC), `APP_JS` (L509–2445, ~1,935 LOC), and HTML/CSP assembly (L2447–2713, ~266 LOC). Every recent minor release (`0.5.2` through `0.5.5`) edited this file heavily.

> **Critical invariants to preserve when splitting `src/web/page.ts`:**
>
> 1. **CSP SHA-256 hash parity:** `pageCspFor()` hashes `bootstrapScript(...)` and `` `\n${APP_JS}\n` ``. Keep `APP_JS` assembled into one deterministic string and re-run `bun run export:page` so `docs/app.html` and [tests/page-hardening.test.ts](../../main/tests/page-hardening.test.ts) stay green.
> 2. **Dash-sweep test anchor:** [tests/dash-sweep.test.ts](../../main/tests/dash-sweep.test.ts#L137-L177) reads `src/web/page.ts` as raw text and slices from `const APP_JS = \``. Export `APP_JS` directly (or update `dash-sweep.test.ts` to read the new client module files) in the same commit.
> 3. **Single-binary compilation:** Use plain `.ts` modules exporting template strings (not runtime `fs.readFileSync` of `.css`/`.js` assets) so `bun run build --all` keeps zero external asset dependencies.

**Recommended layout under `src/web/`:**

- `src/web/styles.ts` — `APP_CSS` (~450 LOC)
- `src/web/client/core.ts` — state, storage, API, audio, prefs, toasts, hosted connect, health (~450 LOC)
- `src/web/client/installed.ts` — filter, keyed DOM reuse, markdown renderer, detail/remove/update (~650 LOC)
- `src/web/client/search-and-boot.ts` — search, queue, modals, keyboard bindings, boot (~800 LOC)
- `src/web/page.ts` — joins client chunks into `export const APP_JS`, plus `cssVarsFor`, `bootstrapScript`, `pageCspFor`, `renderPage` (~320 LOC)

---

#### 2.4.4. Workstream 4 — `src/core` Boundary, Dead Spike, & Benchmark Script

**Targets:** `COUP-5a8cbd5368ab`, `COMP-c71250190536`, `COMP-7e48ec72fc72`

1. **`COUP-5a8cbd5368ab` (`src/core` internal leaks):**
   > **Pitfall:** Do **not** blindly funnel all 27 imports through [src/core/index.ts](../../main/src/core/index.ts). `src/main.ts` intentionally lazy-imports `./core/api.ts` and `./core/seed.ts` so `--version` and TUI startup stay fast. Worse, re-exporting `api.ts` from `index.ts` while `page.ts` imports `index.ts` would turn a module-level cycle into a **real file-level import cycle**.
   - **Fix the genuine deep leaks:** Update [src/tui/app.ts](../../main/src/tui/app.ts#L17-L29), [src/tui/Views.tsx](../../main/src/tui/Views.tsx#L17), [src/tui/model.ts](../../main/src/tui/model.ts#L1), and [src/tui/three-scene.ts](../../main/src/tui/three-scene.ts#L14) to import `services/types.ts`, `services/skill-doc.ts`, and `skills-client.ts` symbols from `../core/index.ts` (already re-exported there).
   - **Declare public sub-entries in Archify config:** Register `src/core/index.ts`, `src/core/api.ts`, `src/core/prefs.ts`, `src/core/theme.ts`, `src/core/seed.ts`, `src/core/version.ts`, and `src/core/disk-index.ts` under `rules.coupling.internalLeak.entries`.
2. **`COMP-c71250190536` ([scripts/react-spike/spike.tsx](../../main/scripts/react-spike/spike.tsx)):** Zero references anywhere in `main/`. Delete `scripts/react-spike/` (history stays in git) or add `scripts/react-spike/**` to Archify excludes.
3. **`COMP-7e48ec72fc72` ([scripts/perf/budget.ts](../../main/scripts/perf/budget.ts#L292-L665)):** Optional low-priority cleanup — split `main()` into 5 stage helpers (`benchFilterMatching`, `benchApiLists`, `benchSearch`, `benchPageProbes`, `writeReport`).

---

#### 2.4.5. Workstream 5 — Baseline Intentional Signals (Do Not Over-Refactor)

**Targets:** `COUP-ef47d5bb12bf`, `COMP-4a36ff194ac7`, `COMP-bc66a816f58a`, `COMP-d596a054f898`, `COMP-835aa3d4f44f`, `COMP-e884381444d2`

Add explicit, reasoned entries to [baseline.json](../../.archify/code-analysis-skills-ui-20261125-211159/baseline.json) rather than churning clean code to chase `CC <= 15`:

- `COUP-ef47d5bb12bf` (`src/core` 71% reach): Intentional shared kernel with low instability (`0.167`).
- `COMP-4a36ff194ac7` (`api.ts` `handler`, CC 16 / 30 LOC): Linear early-return security gate — must stay visually auditable in one screen.
- `COMP-d596a054f898` & `COMP-bc66a816f58a` (`disk-index.ts`, CC 18 / 24–37 LOC): Flat untrusted-JSON validation guards.
- `COMP-835aa3d4f44f` & `COMP-e884381444d2` (`hooks.ts` `runOnce` & `updates-check.ts` `checkForUpdates`, CC 18 / 56–70 LOC): Shallow, linear 2-stage parsers (only split if you want zero open `info` entries).

---

### 2.5. Recommended Strategy Options

| Option | Scope | Outcome on Archify Findings | Effort / Risk |
| --- | --- | --- | --- |
| **Option A (Recommended)** | **Full cleanup + clean baseline** (Workstreams 1 → 2 → 3 → 4 → 5 in 3 small waves) | **0 open errors, 0 accepted errors, 0 open warnings, 0–2 open info** (6 intentional items baselined) | Medium · Low risk (strong test/E2E/PTY/perf safety net) |
| **Option B [75%]** | **High-leverage slice only** (Workstream 1 + `onKey` + `route` + delete `react-spike` + baseline rest) | Clears the cycle, `src/web` reach warning, and top 2 complexity hotspots (`CC 190` & `CC 85`); defers `page.ts`, `Views.tsx`, `model.ts`, `budget.ts` | Small · Very low risk |
| **Option C** | **Triage & baseline only** (update `baseline.json` + Archify config, remove `react-spike`, no `src/` edits) | Cleans signal noise immediately; leaves real debt (`onKey` CC 190, `page.ts` 2,713 LOC, `route` CC 85) for a later milestone | Minimal · Zero runtime risk |

**Recommendation:** **Option A**, executed in three verifiable commits/waves on a fresh phase worktree (`phase/archify-remediation`):

1. **Wave 1 (Coupling & Hygiene):** Workstream 1 + Workstream 4 (`skillMatches` extraction, `pageRenderer` injection, `src/core/index.ts` deep-leak cleanup, remove `scripts/react-spike/`).
2. **Wave 2 (Complexity):** Workstream 2 (`onKey`, `route`, `update`, `SearchBody`/`InstalledBody`) + `budget.ts` stage split.
3. **Wave 3 (WebUI Split & Baseline):** Workstream 3 (`src/web/page.ts` modularization + `bun run export:page`) + Workstream 5 (update `baseline.json` + re-run Archify to verify zero open warnings/errors).

**Verification gate for any code wave:**

```sh
bun test && bun run selftest && bun run export:page && bun run pty-smoke && bunx playwright test && bun run perf:budget -- --strict
```

Followed by re-running the Archify prepare command from [prepare-stdout.txt](../../.archify/code-analysis-skills-ui-20261125-211159/prepare-stdout.txt) to confirm every targeted finding flips to `fixed`.

---

**Next step:** Tell me which option you want (**A**, **B**, **C**, or a specific subset) and whether you also want this report saved into `main/docs/` or tracked as a Linear issue before I start any edits.

---

## 3. User (Turn 2 · `2026-11-26T06:48:57Z`)

a

---

<details>
<summary>Tool activity (20 calls)</summary>

- \[step 55\] `update_focus` — Inspecting TUI, web, test, and Archify details for execution plan
- \[step 55\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/tui/app.ts` (L1–537)
- \[step 55\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/tui/model.ts` (L1–165)
- \[step 55\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/tui/Views.tsx` (L1–225)
- \[step 55\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/tests/page-hardening.test.ts`
- \[step 55\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/scripts/export-page.ts`
- \[step 55\] `read_file` — `/Users/s-a-c/.agents/skills/s-a-c-git-write-gate/SKILL.md`
- \[step 55\] `run_command` — Check archify CLI options and bun location
- \[step 64\] `update_focus` — Checking Archify config schema and exact web/perf split points
- \[step 64\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/scripts/perf/budget.ts` (L1–185)
- \[step 64\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/web/page.ts` (L500–555)
- \[step 64\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/web/page.ts` (L860–890)
- \[step 64\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/web/page.ts` (L1530–1560)
- \[step 64\] `run_command` — Check git-write-gate config and Archify config format
- \[step 72\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/tui/app.ts` (L940–974)
- \[step 72\] `run_command` — Locate Archify config schema for internalLeak entries
- \[step 75\] `run_command` — Check internalLeak config format in archify package
- \[step 77\] `run_command` — Inspect archify modules and config references
- \[step 80\] `run_command` — Read internalLeak config schema from archify module
- \[step 82\] `read_file` — `/Users/s-a-c/.agents/skills/archify/modules/code-analysis/evaluate/rules/coupling/concentration.mjs` (L1–120)

</details>

### 3.1. Execution Plan Handoff (`2026-11-26T06:52:21Z` · Step 85)

<details>
<summary>Full execution plan passed to execution model</summary>

Execute Option A (Full Cleanup + Clean Baseline) in a dedicated phase worktree `archify-remediation` (`phase/archify-remediation`). Do NOT run `git commit`, `git merge`, or `git push` (no explicit commit/merge authorization); leave the worktree fully verified and ready for user review.

Always prefix shell binaries with `\` or full paths to bypass interactive shell aliases, and include `/Users/s-a-c/.local/share/bun/bin:$HOME/.bun/bin:$HOME/.local/bin` on `PATH` for `bun`, `bunx`, and `uv`.

---

### 3.2. Step 0: Create Phase Worktree & Install Dependencies

1. From `/Users/s-a-c/Projects/s-a-c/skills-ui`, create the linked worktree:
   `\git -C main worktree add ../archify-remediation -b phase/archify-remediation`
2. Install dependencies inside `archify-remediation/`:
   `cd /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation && PATH="/Users/s-a-c/.local/share/bun/bin:$HOME/.bun/bin:$HOME/.local/bin:$PATH" bun install`
3. Perform ALL repo edits strictly inside `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/` (never modify `main/`).

---

### 3.3. Step 1 (Wave 1): Break `src/core ↔ src/web` Coupling, Unify `skillMatches`, Fix Deep Leaks, Remove Dead Spike

1. **Extract `skillMatches` to `src/core/filter.ts`:**
   - Create `archify-remediation/src/core/filter.ts` containing the exact `skillMatches` function moved from `src/web/page.ts` (L45–57). Preserve its strict constraint: NO backticks, NO template literals, NO regex literals inside `skillMatches` so `skillMatches.toString()` stays byte-for-byte identical when interpolated into `APP_JS`.
   - Re-export `export { skillMatches } from "./filter.ts";` in `archify-remediation/src/core/index.ts`.
   - In `archify-remediation/src/web/page.ts`, import `{ skillMatches } from "../core/filter.ts"` and re-export `export { skillMatches } from "../core/filter.ts";` (keeps `tests/filter-parity.test.ts` import compatible).
   - In `archify-remediation/src/tui/model.ts`:
     - Replace line 1 import from `../core/services/types.ts` with `import { skillMatches, type HealthCheckResult, type InstalledSkill, type SearchSkill, type SkillProvenance, type SourceSkill } from "../core/index.ts";`.
     - In `visibleSkills(model)` (L167–193), replace the duplicated 4-field `||` filter with `const byText = q ? model.skills.filter((s) => skillMatches(s, q)) : model.skills;`. (Drops `visibleSkills` CC below 15, resolving `COMP-84c5e376d642`.)
   - In `archify-remediation/scripts/perf/budget.ts`, import `skillMatches` from `../../src/core/index.ts` instead of `../../src/web/page.ts`.

2. **Invert `src/core/api.ts → src/web/page.ts` via `ApiOptions.pageRenderer`:**
   - In `archify-remediation/src/core/api.ts`:
     - Remove line 1 (`import { pageCspFor, renderPage } from "../web/page.ts";`).

     - Export `PageRenderer` interface:

       ```ts
       export interface PageRenderer {
         renderPage: (version: string, prefs?: UiPreferences, serverPort?: number, seed?: UiSeed, opts?: { hosted?: boolean }) => string;
         pageCspFor: (prefs?: UiPreferences, serverPort?: number, seed?: UiSeed, hosted?: boolean) => string;
       }
       ```

     - Add `pageRenderer?: PageRenderer;` to `ApiOptions`.

     - At the top of `createSkillsUiServer(options)`: if `options.withPage && !options.pageRenderer`, throw `new Error("createSkillsUiServer: withPage requires options.pageRenderer")` so missed callers fail fast.

     - In `GET /` / `GET /index.html`: call `options.pageRenderer.renderPage(...)` and `options.pageRenderer.pageCspFor(...)`.
   - In `archify-remediation/src/web/page.ts`, export `export const webPageRenderer = { renderPage, pageCspFor };`.
   - In `archify-remediation/src/main.ts` (`runWeb`): when `!headless`, lazily load `const { webPageRenderer } = await import("./web/page.ts");` and pass `pageRenderer: webPageRenderer` to `createSkillsUiServer(...)`.
   - Update ALL other `withPage: true` callers to pass `pageRenderer: webPageRenderer` (importing `webPageRenderer` from `src/web/page.ts` — for `scripts/perf/budget.ts`, only pass `pageRenderer: withPage ? webPageRenderer : undefined`):
     - `scripts/perf/budget.ts`
     - `tests/api.test.ts`
     - `tests/perf/filter-dom.test.ts`
     - `tests/web-055.test.ts`
     - `tests/serve-hardening.test.ts`
     - `tests/fixtures/audit-web-server.ts`
     - `tests/page-smoke.test.ts`
     - `tests/page-hardening.test.ts`
     - `tests/hosted-auth.test.ts`
   - Run `\rg -n "withPage" archify-remediation/` to confirm zero missed callers.

3. **Clean up genuine deep leaks into `src/core/services/*` and `src/core/skills-client.ts`:**
   - `archify-remediation/src/tui/app.ts`: import `skillsVersion`, `readSkillDoc`, and types (`HealthCheckResult`, `InstalledSkill`, `MutationEvent`, `PostMutationHookResult`, `SearchSkill`, `SkillProvenance`, `SourceSkill`, `UpdatesResult`) from `../core/index.ts` instead of `../core/skills-client.ts`, `../core/services/skill-doc.ts`, and `../core/services/types.ts`.
   - `archify-remediation/src/tui/Views.tsx`: import `type { InstalledSkill, SearchSkill, UpdatesResult, UiPreferences }` from `../core/index.ts` instead of `../core/services/types.ts`.
   - `archify-remediation/src/tui/three-scene.ts`: import `type { InstalledSkill }` from `../core/index.ts` instead of `../core/services/types.ts`.
   - **Pitfall:** Keep direct imports to top-level public entries (`src/core/api.ts`, `prefs.ts`, `theme.ts`, `seed.ts`, `version.ts`, `disk-index.ts`) as-is — do NOT re-export `api.ts` from `src/core/index.ts` (preserves lazy startup in `src/main.ts` and prevents real import cycles).

4. **Delete obsolete S-92 spike:**
   - Remove `archify-remediation/scripts/react-spike/` (`spike.tsx` and `repro-cell-diff.tsx`). Confirm zero active references remain.

---

### 3.4. Step 2 (Wave 2): Decompose the 6 High-Complexity Functions

Keep every function's behavior, race-protection tokens (`checkBusySeq`, `loadSeq`, `bodySeq`, `searchSeq`), S-183 single-sort memoization, and runtime strings (no en/em dashes in runtime strings — enforced by `tests/dash-sweep.test.ts`!) 100% intact. Target cyclomatic complexity < 20 on every extracted function/component (well below the warning threshold 25 and ideally under info threshold 15 where natural).

1. **`archify-remediation/src/tui/app.ts` (`runTuiOn.<locals>.onKey`, CC 190 → < 15–20):**
   - Extract inside `runTuiOn`:
     - `saveAndApplyPrefs(patch: Partial<UiPreferences>): void` — replaces the 5 repeated prefs blocks (`t`, `[`/`]`, `0`, `,`, `m`).
     - `runUpdateCheck(): Promise<void>` — extracts the 48-line `case "c"` async IIFE (preserve exact `scope`, `checkBusySeq`, toast, and `finally` ownership checks).
     - `installSelectedSearchSkill(): Promise<void>` — extracts the `case "return"` search-tab install async IIFE.
     - `handleAgentSelectKey(k: string): void` and `handleDetailScrollKey(k: string): boolean`.
     - `handleOverlayKey(key: KeyEvent): boolean` — handles `confirm`, `help`, `healthOpen`, `agentSelect`, `graph`, `queueKey`, `installed+tab`, `detailScroll` in the exact original precedence order; returns `true` when consumed.
     - `handleTextEntryKey(k: string, inFilter: boolean, inSearch: boolean): void` — handles `inFilter || inSearch` branch verbatim (including `disarmQuit()`).
     - `handleShiftedAndTabKey(key: KeyEvent): boolean` — handles shifted `A`/`I`/`G`/`H`/`P` and `tabFor(k)`.
     - `handleCommandKey(k: string): void` — handles command-mode `switch` (calling `runUpdateCheck()`, `installSelectedSearchSkill()`, `saveAndApplyPrefs(...)`), plus a small `handleSettingsKey(k: string): boolean` for `t`/`,`/`m`/`[`/`]`/`0` if needed to keep CC < 15.
   - `onKey` becomes a ~20-line top-level router calling those helpers in order.

2. **`archify-remediation/src/core/api.ts` (`createSkillsUiServer.<locals>.route`, CC 85 → < 15):**
   - Extract a shared helper `finalizeMutation(event, scope, skills, ok)` inside `createSkillsUiServer` for `invalidateListCache()` + `healthChecker.invalidate()` + conditional `runPostMutationHook(...)`.
   - Extract focused per-endpoint handlers inside `createSkillsUiServer`:
     - `handleGetPage`, `handleGetVersion`, `handleGetHealthCheck`, `handleGetSkills`, `handleGetSkill`, `handleGetSearch`, `handlePostInstall`, `handleGetSourceSkills`, `handlePostRemove`, `handlePostUpdate`, `handleGetUpdates`, `handleGetPrefs`, `handlePutPrefs`.
   - Wire a dispatch table `const routes: Record<string, (req: Request, url: URL) => Promise<Response> | Response>` mapping `"GET /"`, `"GET /index.html"`, `"GET /api/version"`, etc.
   - `route(req)` looks up `routes[\`${req.method} ${url.pathname}\`]` inside the existing `try/catch` error boundary (`BodyTooLarge` → 413, `BadJson` → 400, `SkillsBusyError` → 503, else 500). Preserve exact validation error strings and status codes.

3. **`archify-remediation/src/tui/model.ts` (`update`, CC 90 → < 20):**
   - Define internal `interface UpdateCtx { next: TuiModel; visibleOf: () => InstalledSkill[]; visibleSearchOf: () => SearchSkill[]; forget: () => void; }`.
   - Extract pure domain reducers at module level:
     - `applySkillsLoaded(ctx, skills)`
     - `applyMove(ctx, delta)` & `applyHomeEnd(ctx, edge: "home" | "end")`
     - `applyCheckAction(ctx, kind: "toggle-check" | "check-all" | "toggle-all-checks" | "invert-checks" | "clear-checks")`
     - `applyAgentSelectAction(ctx, action)` (handles all 6 `agent-select-*` actions)
     - `applyQueueAction(ctx, action)` (handles `search-pane`, `queue-toggle`, `queue-delete-at`, `queue-clear`)
     - `applySortToggle(ctx)` and `applyProvenanceCycle(ctx)`
   - Replace the 39-arm `switch` in `update()` with a typed `ACTION_HANDLERS: { [K in Action["type"]]: (ctx: UpdateCtx, action: Extract<Action, { type: K }>) => void }` dispatch table (preserves full TypeScript exhaustiveness while dropping `update()` CC from 90 to < 10!). Keep the shallow clone and final `next.visible = visibleOf(); next.visibleResults = visibleSearchOf();` untouched.

4. **`archify-remediation/src/tui/Views.tsx` (`InstalledBody` CC 51, `SearchBody` CC 77 → all < 15–20):**
   - Extract shared hook `useSelectionScrollFollow(scrollRef, rowRef, deps, fallbackIndex?: number)` to deduplicate the identical `y - sy` scroll-follow `useEffect` in `InstalledBody` and `SearchBody` (preserving `InstalledBody`'s `fallbackIndex` fallback when `y`/`sy` are not numbers).
   - Extract pure title helpers `installedListTitle(model: TuiModel, visibleCount: number, listWidthPct: number): string` and `searchListTitle(model: TuiModel): string` (keeping the exact 19-char 80-col rule).
   - Extract presentational subcomponents:
     - `InstalledSkillRow` and `InstalledDetailPane` (from `InstalledBody`).
     - `SearchResultRow`, `SearchQueueSection`, and `SearchDetailPane` (from `SearchBody`).

5. **`archify-remediation/scripts/perf/budget.ts` (`main`, CC 46 → < 15–20):**
   - Extract 5 stage helpers from `main()`:
     - `benchFilterMatching(scenario: Scenario)`
     - `benchApiLists(scenario: Scenario, servers: Server[]): Promise<Server>` (cold project, warm project, detail read, cold/warm global API observations; returns the long-lived `warm` server)
     - `benchSearch(warm: Server): Promise<SearchStub>` (starts stub, measures search overhead + concurrent dedup; returns `stub` for `finally` cleanup)
     - `benchPageProbes(scenario: Scenario, servers: Server[]): Promise<Browser>` (cold global paint, filter probes, rebuild/replay probes, stale-overwrite probe; returns `browser` for `finally` cleanup)
     - `recordShimSpawns()` and `emitReport(scenario: Scenario)`
   - Keep `main()`'s `try/finally` teardown, env snapshot/restore, and `--strict` exit code behavior identical.

---

### 3.5. Step 3 (Wave 3): Modularize `src/web/page.ts` Byte-for-Byte Identically

1. **Split `archify-remediation/src/web/page.ts` into cohesive TS modules (no runtime FS reads — keep single-binary `bun build --compile` self-contained):**
   - `archify-remediation/src/web/styles.ts`: `export const APP_CSS = \`...\`;` (exact CSS string from `page.ts` L64–507).
   - `archify-remediation/src/web/client/core.ts`: `export const CLIENT_CORE_JS = \`...\`;` (exact `APP_JS` slice from `(function(){` through `chipColor`, L509–871).
   - `archify-remediation/src/web/client/installed.ts`: `export function buildClientInstalledJs(skillMatchesSrc: string): string` returning the exact `APP_JS` slice from `/* ---------- installed list ---------- */` through `checkForUpdates` (L872–1541), interpolating `${skillMatchesSrc}` at the exact original position.
   - `archify-remediation/src/web/client/search-and-boot.ts`: `export const CLIENT_SEARCH_AND_BOOT_JS = \`...\`;` (exact `APP_JS` slice from `/* ---------- search ---------- */` through `})();\n`, L1542–2445).
   - `archify-remediation/src/web/page.ts` (~320 LOC): imports `APP_CSS`, `CLIENT_CORE_JS`, `buildClientInstalledJs`, `CLIENT_SEARCH_AND_BOOT_JS`, and `skillMatches` from `../core/filter.ts`; assembles:
     `export const APP_JS = CLIENT_CORE_JS + buildClientInstalledJs(SKILL_MATCHES_SRC) + CLIENT_SEARCH_AND_BOOT_JS;`
     Keep `export { skillMatches }`, `export const webPageRenderer = { renderPage, pageCspFor }`, `pageCspFor`, and `renderPage`.
   - **Byte-identity verification:** Run `bun run export:page` and verify `\git -C archify-remediation diff docs/app.html` produces **0 bytes of diff**! (If there is any whitespace/newline diff in `APP_JS`, adjust the chunk boundary so `docs/app.html` is byte-for-byte identical.)

2. **Update `archify-remediation/tests/dash-sweep.test.ts`:**
   - Replace the fragile `appJsBody(read("src/web/page.ts"))` string-slicer with importing `{ APP_JS } from "../src/web/page.ts"` directly and calling `lex(APP_JS)` in the `web APP_JS` test. Verify `bun test tests/dash-sweep.test.ts` passes.

---

### 3.6. Step 4: Archify Config, Baseline Update, & Full Verification

1. **Run the complete project test & verification suite inside `archify-remediation/`:**

   ```sh
   cd /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation
   export PATH="/Users/s-a-c/.local/share/bun/bin:$HOME/.bun/bin:$HOME/.local/bin:$PATH"
   bun test && bun run selftest && bun run export:page && bun run pty-smoke && bunx playwright test && bun run perf:budget -- --strict
   ```

   All tests, selftest, PTY smoke, Playwright E2E, and 11/11 strict perf budgets MUST pass. Verify `\git diff docs/app.html` is empty.

2. **Create Archify config for declared public entries:**
   Write `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/config.json`:

   ```json
   {
     "rules": {
       "coupling": {
         "internalLeak": {
           "entries": [
             "src/core/index.ts",
             "src/core/api.ts",
             "src/core/prefs.ts",
             "src/core/theme.ts",
             "src/core/seed.ts",
             "src/core/version.ts",
             "src/core/disk-index.ts",
             "src/tui/app.ts",
             "src/tui/renderer-ready.ts",
             "src/web/page.ts"
           ]
         }
       }
     }
   }
   ```

3. **Run Archify check and update `baseline.json` using Archify's own CLI:**
   - First inspect raw findings with `--fail-on never --json`:

     ```sh
     \node /Users/s-a-c/.config/agents/skills/archify/bin/archify.mjs code-analysis check /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation \
       --language ts \
       --config /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/config.json \
       --baseline /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/baseline.json \
       --compare /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/analysis/findings.json \
       --fail-on never --json
     ```

   - Confirm all targeted findings (`COUP-e41598564701`, `COMP-ae16d139cc2c`, `COMP-879a4456c823`, `COMP-ac091708c066`, `COMP-36d369b34b91`, `COMP-73633f919afd`, `COMP-7e48ec72fc72`, `COUP-241f7ffd9b73`, `COUP-5a8cbd5368ab`, `COMP-c71250190536`, `COMP-84c5e376d642`) are **gone/fixed**, and check whether any newly extracted helper accidentally tripped `complexity/function` (if so, tighten that helper until zero new complexity findings exist!).

   - Revoke stale `COUP-e41598564701` from `baseline.json` (`--revoke COUP-e41598564701`).

   - Accept the remaining intentional signals via `--accept <id> --reason "<concise reason>"` on `baseline.json`:
     - `COUP-ef47d5bb12bf` (now `info`, `fanOut: 0` shared kernel)
     - `COMP-4a36ff194ac7` (`api.ts` `handler`, 30-line linear security gate)
     - `COMP-d596a054f898` & `COMP-bc66a816f58a` (`disk-index.ts`, flat untrusted-JSON validation guards)
     - `COMP-835aa3d4f44f` & `COMP-e884381444d2` (`hooks.ts` `runOnce` & `updates-check.ts` `checkForUpdates`, shallow linear parsers)
     - If `COUP-8b42059fbd40` still fires at 3/6 = 50% reach solely due to `scripts-perf` (`budget.ts`), accept it with the exact factual reason ("3 genuine WebUI entrypoints out of 6 non-web modules: CLI `--web`, static exporter, perf harness; `src-core` and `src-tui` are fully decoupled from `src-web`").

   - Re-run `archify code-analysis check ... --fail-on warning --json` and confirm exit code 0, **0 open errors, 0 accepted errors, 0 open warnings, 0 open info**.

   - Re-run `archify code-analysis prepare` to refresh `.archify/code-analysis-skills-ui-20261125-211159`:

     ```sh
     \node /Users/s-a-c/.config/agents/skills/archify/bin/archify.mjs code-analysis prepare /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation \
       --ir /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/architecture-skills-ui-20261125-211159/candidate.json \
       --out /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159 \
       --locale en --language ts \
       --config /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/config.json \
       --baseline /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/baseline.json \
       --quality showcase
     ```

   - Report `\git -C archify-remediation status --short`, `\git -C archify-remediation diff --stat`, verification results, and the before/after Archify finding counts.

---

### 3.7. Re-Plan If

- Any test in `bun test`, `pty-smoke`, `playwright test`, or `perf:budget -- --strict` fails for a reason other than an expected test-harness update (`pageRenderer` wiring or `dash-sweep.test.ts` `APP_JS` import).
- Splitting `src/web/page.ts` causes `docs/app.html` to differ after `bun run export:page` or breaks `pageCspFor()` hash verification in `tests/page-hardening.test.ts`.
- Any newly extracted function triggers a new Archify `complexity/function` or `coupling/*` finding that cannot be resolved cleanly by adjusting the extraction boundary.
- `archify code-analysis check --config` rejects the `config.json` schema.

</details>

<details>
<summary>Tool activity (34 calls)</summary>

- \[step 88\] `update_steps`
- \[step 88\] `update_focus` — Creating phase worktree and installing dependencies
- \[step 88\] `run_command` — Create phase worktree and install dependencies
- \[step 88\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/main/src/tui/three-scene.ts` (L1–60)
- \[step 88\] `run_command` — Inspect all withPage call sites
- \[step 94\] `update_steps`
- \[step 94\] `update_focus` — Breaking core-web cycle, unifying skillMatches, and fixing deep leaks
- \[step 94\] `write_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/filter.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/index.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/model.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/model.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/app.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/three-scene.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/api.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/api.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/api.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/api.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/main.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/scripts/perf/budget.ts`
- \[step 94\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/scripts/perf/budget.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/api.test.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/perf/filter-dom.test.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/web-055.test.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/serve-hardening.test.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/fixtures/audit-web-server.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/page-smoke.test.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/page-hardening.test.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/page-hardening.test.ts`
- \[step 114\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/hosted-auth.test.ts`
- \[step 114\] `run_command` — Remove spike, check withPage callers, and run bun test

</details>

## 4. Assistant (`2026-11-26T06:57:40Z` · Step 125)

I've completed Wave 1 edits (inverting `core ↔ web` via `pageRenderer`, extracting `skillMatches` to `src/core/filter.ts`, cleaning up deep imports into `src/core/services/*`, and removing `scripts/react-spike/`) and started `bun test` in `archify-remediation`. Waiting for the test run to finish before starting Wave 2.

---

<details>
<summary>Tool activity (38 calls)</summary>

- \[step 127\] `update_steps`
- \[step 127\] `update_focus` — Reading remaining slices of Views.tsx and budget.ts before Wave 2 edits
- \[step 127\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx` (L610–746)
- \[step 127\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/scripts/perf/budget.ts` (L180–295)
- \[step 127\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/scripts/perf/budget.ts` (L660–697)
- \[step 134\] `update_focus` — Decomposing onKey, route, update, Views, and budget.ts
- \[step 134\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/app.ts`
- \[step 134\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/api.ts`
- \[step 134\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/model.ts`
- \[step 134\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx`
- \[step 134\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/scripts/perf/budget.ts`
- \[step 141\] `update_focus` — Typechecking Wave 2 and reading page.ts split boundaries
- \[step 141\] `run_command` — Run TypeScript check and selftest after Wave 2
- \[step 141\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts` (L30–85)
- \[step 141\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts` (L470–505)
- \[step 141\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts` (L835–870)
- \[step 141\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts` (L1505–1545)
- \[step 141\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts` (L2405–2435)
- \[step 149\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/services/source.ts` (L1–30)
- \[step 149\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts` (L865–905)
- \[step 152\] `update_steps`
- \[step 152\] `update_focus` — Fixing type exports and splitting src/web/page.ts byte-identically
- \[step 152\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/services/types.ts`
- \[step 152\] `run_command` — Split page.ts CSS and JS chunks byte-identically
- \[step 157\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/dash-sweep.test.ts` (L1–25)
- \[step 157\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/core/index.ts`
- \[step 157\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx`
- \[step 161\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/dash-sweep.test.ts` (L185–209)
- \[step 161\] `read_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts` (L2420–2691)
- \[step 165\] `write_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts`
- \[step 165\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/dash-sweep.test.ts`
- \[step 165\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/dash-sweep.test.ts`
- \[step 165\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/dash-sweep.test.ts`
- \[step 170\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/tests/dash-sweep.test.ts`
- \[step 170\] `run_command` — Verify byte-identical page export and core tests
- \[step 173\] `run_command` — Find template interpolations in split web modules
- \[step 175\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/client/core.ts`
- \[step 175\] `run_command` — Verify byte-identical page export and core tests

</details>

## 5. Assistant (`2026-11-26T07:06:15Z` · Step 178)

`bun run export:page` produced a byte-identical `docs/app.html`, and the core unit tests (`dash-sweep`, `page-hardening`, `filter-parity`, `tui`, `api`) are running now. Waiting for completion before running the full verification gate and Archify check.

---

<details>
<summary>Tool activity (4 calls)</summary>

- \[step 180\] `update_steps`
- \[step 180\] `update_focus` — Running full verification gate and configuring Archify
- \[step 180\] `write_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/config.json`
- \[step 180\] `run_command` — Run full test, PTY, Playwright, and perf gate

</details>

## 6. Assistant (`2026-11-26T07:07:10Z` · Step 186)

Archify `config.json` is written and the full verification suite (`bun test`, `selftest`, `export:page`, `pty-smoke`, Playwright E2E, and `perf:budget -- --strict`) is running in `archify-remediation`. Waiting for completion before running `archify code-analysis check` and refreshing the baseline.

---

<details>
<summary>Tool activity (17 calls)</summary>

- \[step 188\] `update_focus` — Running Archify code-analysis check on archify-remediation
- \[step 188\] `run_command` — Run Archify code-analysis check
- \[step 191\] `run_command` — Inspect all findings from archify check output
- \[step 193\] `read_file` — `/Users/s-a-c/.gemini/antigravity/brain/b196b55f-66e1-4eeb-a951-7627689c2464/.system_generated/steps/190/output.txt` (L1–450)
- \[step 196\] `run_command` — List all 18 findings from latest check
- \[step 198\] `update_focus` — Tightening extracted helpers to drop all new complexity and internal-leak findings
- \[step 198\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/web/page.ts`
- \[step 198\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/app.ts`
- \[step 198\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx`
- \[step 198\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx`
- \[step 198\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx`
- \[step 198\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/model.ts`
- \[step 198\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/model.ts`
- \[step 207\] `update_focus` — Re-checking Archify findings after helper tightening
- \[step 207\] `run_command` — Verify Archify check findings after tightening
- \[step 210\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx`
- \[step 210\] `run_command` — Run final full verification gate

</details>

## 7. Assistant (`2026-11-26T07:13:30Z` · Step 213)

Final code tightening is complete (`InstalledSkillRow` and `src/web/page.ts` import cleanup), and the full verification gate is running in `archify-remediation`. Waiting for completion before updating `baseline.json` and re-running `archify code-analysis prepare`.

---

<details>
<summary>Tool activity (6 calls)</summary>

- \[step 215\] `update_focus` — Updating Archify baseline and refreshing analysis artifacts
- \[step 215\] `run_command` — Verify remaining findings and check --accept/--revoke CLI usage
- \[step 219\] `edit_file` — `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation/src/tui/Views.tsx`
- \[step 219\] `run_command` — Check --accept and --revoke CLI syntax in archify.mjs
- \[step 222\] `run_command` — Confirm zero new complexity findings in Archify
- \[step 222\] `run_command` — Run final verification suite after Views.tsx edit

</details>

## 8. Assistant (`2026-11-26T07:17:46Z` · Step 225)

`InstalledSkillRow` is now below the complexity threshold, bringing Archify down to 7 total findings (0 errors, 1 warning, 6 info — all 11 targeted findings resolved, 0 new findings). Waiting for the final verification suite (`task-224`) to finish before updating `baseline.json` and running `archify code-analysis prepare`.

---

### 8.1. Plan Review Checkpoint (`2026-11-26T07:20:45Z` · Step 228)

<details>
<summary>Status report handed back to planning model</summary>

Status report at plan review due:

Completed steps:

- Step 0: Created linked worktree `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation` on branch `phase/archify-remediation` and ran `bun install`.
- Step 1 (Wave 1): Extracted `skillMatches` to `src/core/filter.ts` (re-exported via `src/core/index.ts` and `src/web/page.ts`, used in `src/tui/model.ts` and `scripts/perf/budget.ts`), inverted `src/core/api.ts -> src/web/page.ts` via `ApiOptions.pageRenderer` + `webPageRenderer` (updated `src/main.ts`, `scripts/perf/budget.ts`, and all 8 `withPage: true` test/fixture files), cleaned deep imports into `src/core/services/*` and `src/core/skills-client.ts` across `src/tui/{app.ts,Views.tsx,three-scene.ts}`, and deleted `scripts/react-spike/`.
- Step 2 (Wave 2): Decomposed `runTuiOn.<locals>.onKey` (`src/tui/app.ts`), `createSkillsUiServer.<locals>.route` (`src/core/api.ts`), `update` (`src/tui/model.ts`), `InstalledBody` and `SearchBody` (`src/tui/Views.tsx`), and `main` (`scripts/perf/budget.ts`). Tightened helper extractions after initial Archify check so zero new complexity findings remain.
- Step 3 (Wave 3): Split `src/web/page.ts` into `src/web/styles.ts`, `src/web/client/core.ts`, `src/web/client/installed.ts`, and `src/web/client/search-and-boot.ts`, and updated `tests/dash-sweep.test.ts` to import `APP_JS` directly.
- Step 4 (partial): Wrote `.archify/code-analysis-skills-ui-20261125-211159/config.json`.

Verifications passed after the final code edit (`task-224` + Archify check):

- `bun test`: 321 pass, 0 fail across 23 files.
- `bun run selftest`: PASS.
- `bun run export:page && git diff --exit-code docs/app.html`: byte-identical (0 diff).
- `bun run pty-smoke`: PASS.
- `bunx playwright test`: 48 passed.
- `bun run perf:budget -- --strict`: 11/11 budgets MET.
- `archify code-analysis check` (with new `config.json`): 7 total findings (0 errors, 1 warning `COUP-8b42059fbd40`, 6 info: `COUP-ef47d5bb12bf` + 5 pre-existing `info` complexity items `COMP-4a36ff194ac7`, `COMP-bc66a816f58a`, `COMP-d596a054f898`, `COMP-835aa3d4f44f`, `COMP-e884381444d2`). All 11 targeted findings resolved, 0 new complexity findings, 0 internal-leak findings, 0 cycle findings.

Remaining (Step 4 finalization only):

1. Revoke stale `COUP-e41598564701` and accept the 7 remaining intentional findings in `.archify/code-analysis-skills-ui-20261125-211159/baseline.json` via `archify code-analysis check`.
2. Verify `archify code-analysis check ... --fail-on warning --json` exits 0 with 0 open findings.
3. Re-run `archify code-analysis prepare` to refresh `.archify/code-analysis-skills-ui-20261125-211159`.
4. Collect `git status --short` and `git diff --stat` in `archify-remediation` (no commits/merges/pushes) and present the final report.

</details>

### 8.2. Execution Plan Handoff (`2026-11-26T07:21:02Z` · Step 231)

<details>
<summary>Full execution plan passed to execution model</summary>

Execution is on track: Steps 0–3 and the full project verification gate (`bun test`, `selftest`, `export:page`, `pty-smoke`, Playwright E2E, `perf:budget -- --strict`) are complete and verified after the final code edit. Do NOT re-run tests or edit any repo source files unless a command fails. Do NOT run `git commit`, `git merge`, or `git push`.

Carry out the remaining Step 4 finalization:

1. **Update `.archify/code-analysis-skills-ui-20261125-211159/baseline.json` via Archify CLI:**
   Using `\node /Users/s-a-c/.config/agents/skills/archify/bin/archify.mjs code-analysis check /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation --language ts --config /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/config.json --baseline /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/baseline.json`:
   - Revoke stale `COUP-e41598564701` (`--revoke COUP-e41598564701`).
   - Accept the 7 remaining intentional findings with concise reasons (`--accept <id> --reason "<reason>"`):
     - `COUP-ef47d5bb12bf`: "Intended shared kernel (`src/core`) with `fanOut: 0` (instability 0) consumed by CLI, TUI, WebUI, and scripts."
     - `COUP-8b42059fbd40`: "3 genuine WebUI entrypoints out of 6 non-web modules (CLI --web, static exporter, perf harness); src-core and src-tui are fully decoupled from src-web."
     - `COMP-4a36ff194ac7`: "30-line linear early-return HTTP security gate (Host, cross-site fetch, rate limit, Origin, OPTIONS, Bearer); keeping it flat preserves auditability."
     - `COMP-bc66a816f58a`: "37-line flat guard-clause validation for untrusted persisted disk-index envelope; splitting obscures schema checks."
     - `COMP-d596a054f898`: "24-line flat guard-clause validation for untrusted persisted skill entry; splitting obscures field checks."
     - `COMP-835aa3d4f44f`: "56-line shallow linear subprocess outcome parser (spawn error, timeout, JSON schema, fallback)."
     - `COMP-e884381444d2`: "70-line shallow 2-stage update checker (lock classification + concurrent GitHub tree lookup)."

2. **Verify clean Archify gate:**
   Run:

   ```sh
   \node /Users/s-a-c/.config/agents/skills/archify/bin/archify.mjs code-analysis check /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation \
     --language ts \
     --config /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/config.json \
     --baseline /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/baseline.json \
     --fail-on info --json
   ```

   Confirm exit code 0, `counts.error === 0`, `counts.warning === 0`, `counts.info === 0`, `counts.accepted === 7`, `counts.acceptedErrors === 0`, `review.baseline.stale === 0`.

3. **Refresh the Archify analysis report:**
   Run:

   ```sh
   \node /Users/s-a-c/.config/agents/skills/archify/bin/archify.mjs code-analysis prepare /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation \
     --ir /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/architecture-skills-ui-20261125-211159/candidate.json \
     --out /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159 \
     --locale en --language ts \
     --config /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/config.json \
     --baseline /Users/s-a-c/Projects/s-a-c/skills-ui/.archify/code-analysis-skills-ui-20261125-211159/baseline.json \
     --quality showcase
   ```

4. **Collect git status/diff summary and report:**
   Run `\git -C /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation status --short && \git -C /Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation diff --stat`, mark all checklist steps done via `update_steps`, and present a concise final report with clickable file links, before/after Archify counts, verification evidence, and next-step git commands (leaving commit/merge to the user).

Re-plan if:

- `archify code-analysis check --revoke` or `--accept` fails or leaves stale/unmatched baseline entries.
- `archify code-analysis prepare` exits non-zero.

</details>

<details>
<summary>Tool activity (2 calls)</summary>

- \[step 235\] `update_focus` — Updating baseline, verifying clean gate, and refreshing Archify report
- \[step 235\] `run_command` — Update baseline, verify clean Archify gate, and refresh report

</details>

## 9. Assistant (`2026-11-26T07:22:01Z` · Step 238)

Updating `.archify/code-analysis-skills-ui-20261125-211159/baseline.json`, running the `--fail-on info` Archify gate, refreshing `archify code-analysis prepare`, and collecting the `git status` / `git diff --stat` summary. Waiting for completion.

---

<details>
<summary>Tool activity (1 calls)</summary>

- \[step 240\] `update_steps`

</details>

## 10. Assistant (`2026-11-26T07:22:22Z` · Step 242)

Option A is complete in [archify-remediation](../) (`phase/archify-remediation`), with all 11 targeted Archify findings resolved, 0 new findings introduced, and the Archify gate passing at `--fail-on info`. No git commits, merges, or pushes were run.

### 10.1. Before Vs. After (Archify)

| Metric | Before (`main` @ `58247eb`) | After (`phase/archify-remediation`) |
| --- | --- | --- |
| Verdict | `attention` | **`none-found`** |
| Open errors / warnings / info | 0 / 9 / 8 | **0 / 0 / 0** |
| Accepted findings | 1 (`COUP-e41598564701` cycle) | **7** (0 errors, 0 stale) |
| Module cycles (`src-core ↔ src-web`) | 1 (accepted error) | **0** (`src-core` `fanOut: 0`) |
| Internal leaks (`src-core`) | 27 imports across 9 files | **0** |

---

### 10.2. Changes Implemented

1. **Decoupled `src/core` from `src/web` & unified `skillMatches`**
   - Extracted `skillMatches` into [src/core/filter.ts](../src/core/filter.ts) and re-exported it via [src/core/index.ts](../src/core/index.ts) and [src/web/page.ts](../src/web/page.ts). Replaced the duplicated match logic in `visibleSkills` ([src/tui/model.ts](../src/tui/model.ts)) and switched [scripts/perf/budget.ts](../scripts/perf/budget.ts) to import from `src/core/index.ts`.
   - Inverted `src/core/api.ts → src/web/page.ts` via `PageRenderer` and `ApiOptions.pageRenderer` in [src/core/api.ts](../src/core/api.ts), exporting `webPageRenderer` from [src/web/page.ts](../src/web/page.ts) and injecting it lazily from [src/main.ts](../src/main.ts) (plus updating all `withPage: true` test/fixture/benchmark callers).
   - Fixed deep imports into `src/core/services/*` and `src/core/skills-client.ts` across [src/tui/app.ts](../src/tui/app.ts), [src/tui/Views.tsx](../src/tui/Views.tsx), and [src/tui/three-scene.ts](../src/tui/three-scene.ts).
   - Deleted the dead S-92 spike directory `scripts/react-spike/`.

2. **Decomposed all 6 high-complexity functions (CC < 15 on every extracted function)**
   - [src/tui/app.ts](../src/tui/app.ts): Split `onKey` (`CC 190`) into focused overlay, text-entry, shifted/tab, navigation, action, and settings helpers plus `runUpdateCheck`, `installSelectedSearchSkill`, and `saveAndApplyPrefs`.
   - [src/core/api.ts](../src/core/api.ts): Split `route` (`CC 85`) into 13 endpoint handlers, `parseInstallSkills`, `finalizeMutation`, and a `"METHOD /path"` dispatch table.
   - [src/tui/model.ts](../src/tui/model.ts): Replaced the 39-arm `update` switch (`CC 90`) with pure slice reducers and a typed `ACTION_HANDLERS` map.
   - [src/tui/Views.tsx](../src/tui/Views.tsx): Split `InstalledBody` (`CC 51`) and `SearchBody` (`CC 77`) into `useSelectionScrollFollow`, `installedListTitle`, `searchListTitle`, `skillRowStyle`, `InstalledSkillRow`, `InstalledDetailPane`, `HighlightedRuns`, `SearchResultRow`, `SearchQueueSection`, `SearchRepoSkillsList`, and `SearchDetailPane`.
   - [scripts/perf/budget.ts](../scripts/perf/budget.ts): Split `main` (`CC 46`) into modular benchmark stage functions.

3. **Modularized `src/web/page.ts` byte-identically**
   - Split CSS and client JS into [src/web/styles.ts](../src/web/styles.ts), [src/web/client/core.ts](../src/web/client/core.ts), [src/web/client/installed.ts](../src/web/client/installed.ts), and [src/web/client/search-and-boot.ts](../src/web/client/search-and-boot.ts), assembled in [src/web/page.ts](../src/web/page.ts).
   - Updated [tests/dash-sweep.test.ts](../tests/dash-sweep.test.ts) to import `APP_JS` directly.

4. **Updated Archify configuration and baseline**
   - Added [config.json](../../.archify/code-analysis-skills-ui-20261125-211159/config.json) declaring `src/core`, `src/tui`, and `src/web` public entries.
   - Revoked stale `COUP-e41598564701` and accepted the 7 remaining intentional signals in [baseline.json](../../.archify/code-analysis-skills-ui-20261125-211159/baseline.json), then refreshed [repo.analysis.html](../../.archify/code-analysis-skills-ui-20261125-211159/analysis/repo.analysis.html).

---

### 10.3. Verification Evidence (All Run After Final Source Edit)

- `bun test`: **321 pass, 0 fail** (23 files, 1,114 assertions)
- `bun run selftest`: **PASS**
- `bun run export:page && git diff --exit-code docs/app.html`: **0 bytes diff** (byte-identical HTML and CSP hashes)
- `bun run pty-smoke`: **PASS**
- `bunx playwright test`: **48 passed**
- `bun run perf:budget -- --strict`: **11/11 budgets MET**
- `archify code-analysis check ... --fail-on info --json`: **`verdict: "none-found"`**, exit 0, 0 open findings, 7 accepted, 0 stale
- `archify code-analysis prepare`: **`status: "ok"`**
- `git diff --stat`: `20 files changed, 1712 insertions(+), 4153 deletions(-)` (plus 5 new files: `src/core/filter.ts`, `src/web/styles.ts`, `src/web/client/{core,installed,search-and-boot}.ts`)

---

### 10.4. Next Step

Review the diff in `/Users/s-a-c/Projects/s-a-c/skills-ui/archify-remediation`, then commit and fast-forward merge when ready:

```sh
git -C archify-remediation status
git -C archify-remediation diff
```

---
