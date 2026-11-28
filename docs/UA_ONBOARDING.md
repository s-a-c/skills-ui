# `skills-ui` Developer Onboarding Guide

*Generated from `.ua/knowledge-graph.json` at `main` (`2d70a98`, 116 files, 313 nodes, 1,029 edges).*

## 1. Project Overview

- **Name:** `skills-ui` (v0.5.5, versioned `0.x.y` indefinitely)
- **Description:** TUI/WebUI wrapper for the stock `skills` CLI — an OpenTUI terminal app and local/hosted web UI over an authenticated loopback HTTP API, shipped as a self-contained Bun executable.
- **Languages:** TypeScript, JavaScript, JSON, Markdown, Python, Shell, TOML, YAML
- **Frameworks & Toolchain:** Bun (`1.4.4`, pinned in [`mise.toml`](../mise.toml)), OpenTUI (`0.7.0`), React 19, Playwright, GitHub Actions
- **Core commands:**
  - `bun run dev` — launch the OpenTUI terminal app
  - `bun run selftest` — in-memory tree-sitter smoke check (no TTY required)
  - `bun test` — Bun unit, integration, security, and performance test suites
  - `bun run build` — compile standalone binary into `dist/` (`--all` for the 4-target matrix)
  - `bun run pty-smoke` — real-terminal Python `pyte` PTY smoke suite
  - `bun run perf:budget` — ratified performance budget harness

## 2. Architecture Layers

`skills-ui` is organized into **9 layers** (5 production code layers, 2 verification layers, plus build/config and documentation):

```text
[ Terminal UI (OpenTUI) ]     [ Web Dashboard UI ]
           \                         /
            v                       v
      [ CLI Entrypoint & Loopback API ]
                     |
                     v
          [ Skill Domain Services ]
                     |
                     v
      [ Core Runtime & Shared Primitives ]
                     |
                     v
           (external `skills` CLI)
```

| # | Layer | Files | Responsibility | Key Files |
|---|---|---|---|---|
| 1 | **Terminal UI (OpenTUI)** | 8 | Elm-style state model, React views, keyboard runtime, procedural art/audio, 3D skills graph, selftest screen | [`src/tui/app.ts`](../src/tui/app.ts), [`src/tui/Views.tsx`](../src/tui/Views.tsx), [`src/tui/model.ts`](../src/tui/model.ts) |
| 2 | **Web Dashboard UI** | 5 | Single-file local & hosted HTML dashboard, Catppuccin CSS, SHA-256 CSP pinning, modular browser client scripts | [`src/web/page.ts`](../src/web/page.ts), [`src/web/styles.ts`](../src/web/styles.ts), [`src/web/client/installed.ts`](../src/web/client/installed.ts) |
| 3 | **CLI Entrypoint & Loopback API** | 4 | Mode dispatch (`tui` / `--web` / `serve` / `--selftest`), CLI seed parsing, authenticated `Bun.serve` loopback HTTP API | [`src/main.ts`](../src/main.ts), [`src/core/api.ts`](../src/core/api.ts), [`src/core/hosted-auth.ts`](../src/core/hosted-auth.ts) |
| 4 | **Skill Domain Services** | 12 | `skills` CLI wrappers, lockfile provenance, `skills.sh` search, GitHub Trees update checks, `SKILL.md` reads, hooks/health, CWE-150 sanitization | [`src/core/services/installed.ts`](../src/core/services/installed.ts), [`src/core/services/locks.ts`](../src/core/services/locks.ts), [`src/core/services/hooks.ts`](../src/core/services/hooks.ts) |
| 5 | **Core Runtime & Shared Primitives** | 8 | Subprocess client, FIFO spawn queue, SWR disk index, prefs, shared filter predicate, Catppuccin themes, version constant | [`src/core/skills-client.ts`](../src/core/skills-client.ts), [`src/core/spawn-queue.ts`](../src/core/spawn-queue.ts), [`src/core/disk-index.ts`](../src/core/disk-index.ts) |
| 6 | **Automated Test Suites** | 25 | Bun unit/integration/hardening/perf suites and Playwright E2E specs across TUI, WebUI, API, and installer | [`tests/api.test.ts`](../tests/api.test.ts), [`tests/tui.test.ts`](../tests/tui.test.ts), [`tests/serve-hardening.test.ts`](../tests/serve-hardening.test.ts) |
| 7 | **Verification Harnesses, Shims & Fixtures** | 28 | Hermetic CLI shims, contract JSON fixtures, Playwright perf probes, budget runner, Python `pyte` PTY smoke harness | [`tests/fixtures/skills-shim.mjs`](../tests/fixtures/skills-shim.mjs), [`scripts/perf/budget.ts`](../scripts/perf/budget.ts), [`scripts/pty-smoke/smoke.py`](../scripts/pty-smoke/smoke.py) |
| 8 | **Build, Release, CI & Project Config** | 11 | 4-target Bun cross-compiler, checksum verifier, hosted HTML exporter, POSIX installer, GitHub Actions, toolchain configs | [`scripts/build.ts`](../scripts/build.ts), [`scripts/install.sh`](../scripts/install.sh), [`package.json`](../package.json) |
| 9 | **Documentation, Designs & Agent Specs** | 15 | User docs, roadmap, domain glossary, release runbook, Archify audit report, v0.5.4.1/v0.5.5 design specs, Linear/agent contracts | [`README.md`](../README.md), [`CONTEXT.md`](../CONTEXT.md), [`AGENTS.md`](../AGENTS.md) |

## 3. Key Concepts & Design Decisions

1. **Strict Subprocess Boundary (Zero Build Dependency on `skills`):** `skills-ui` never imports the upstream `skills` package. Every CLI operation runs through [`src/core/skills-client.ts`](../src/core/skills-client.ts) (resolving `SKILLS_UI_SKILLS_BIN` -> `PATH`, stripping sensitive env vars, enforcing timeouts) and is serialized by [`src/core/spawn-queue.ts`](../src/core/spawn-queue.ts) (a bounded FIFO semaphore that fails fast with `SkillsBusyError` / HTTP 503 under request storms).
2. **Ingress Sanitization (CWE-150):** All external text from CLI stdout, lockfiles, `SKILL.md` documents, and the `skills.sh` registry is stripped of ANSI/OSC/C1 escape sequences and control characters at ingress by [`src/core/services/sanitize.ts`](../src/core/services/sanitize.ts).
3. **Caching Around Slow Upstream Scans:** Because upstream `skills ls` re-parses every `SKILL.md` per agent directory ([`docs/upstream-ls-memoization.md`](upstream-ls-memoization.md)), [`src/core/api.ts`](../src/core/api.ts) caches lists per scope, coalesces concurrent reads, and reads `SKILL.md` directly from disk with zero subprocesses. [`src/core/disk-index.ts`](../src/core/disk-index.ts) gives the TUI instant stale-while-revalidate startup from `~/.cache/skills-ui`.
4. **Hardened Loopback Boundary for Hosted WebUI:** [`src/core/hosted-auth.ts`](../src/core/hosted-auth.ts) protects `127.0.0.1` from malicious browser tabs via `Host`/`Origin` allowlists (blocking DNS rebinding), `Sec-Fetch-Site` cross-site rejection, constant-time bearer comparison, and strict CORS preflight handling. [`src/web/page.ts`](../src/web/page.ts) pins every inline script block with SHA-256 CSP hashes (no `unsafe-inline` for scripts).
5. **TUI / WebUI Parity Without a Frontend Bundler:** [`src/core/filter.ts`](../src/core/filter.ts) writes `skillMatches` in template-literal-safe TypeScript so [`src/web/client/installed.ts`](../src/web/client/installed.ts) interpolates it verbatim into `APP_JS`. [`src/core/theme.ts`](../src/core/theme.ts) shares WCAG AA-verified Catppuccin Mocha/Latte tokens across terminal ANSI and CSS.
6. **Skill Provenance, Post-Mutation Hooks & Health Pill (v0.5.5):** [`src/core/services/locks.ts`](../src/core/services/locks.ts) and [`src/core/services/installed.ts`](../src/core/services/installed.ts) classify installed skills as `locked`, `linked`, or `local`. [`src/core/services/hooks.ts`](../src/core/services/hooks.ts) runs host-env-only `SKILLS_UI_POST_MUTATION_HOOK` and TTL-cached `SKILLS_UI_HEALTH_CMD` executables without shell interpolation.
7. **Elm-Style TUI Separation + Zero Static Assets:** [`src/tui/model.ts`](../src/tui/model.ts) holds pure state/reducers, [`src/tui/app.ts`](../src/tui/app.ts) runs imperative effects and keyboard handling, and [`src/tui/Views.tsx`](../src/tui/Views.tsx) subscribes via `useSyncExternalStore`. Splash art ([`src/tui/art.ts`](../src/tui/art.ts)) and PCM sound effects ([`src/tui/audio.ts`](../src/tui/audio.ts)) are synthesized procedurally so the compiled binary ships zero media files.
8. **Hermetic Verification:** All tests isolate host state via [`tests/fixtures/skills-shim.mjs`](../tests/fixtures/skills-shim.mjs) and [`tests/helpers/audit-state.ts`](../tests/helpers/audit-state.ts), and `src/core` stays decoupled from `src/web` via `PageRenderer` injection.

## 4. Guided Tour (12 Steps)

Follow these steps in order to build a complete mental model of the repository:

1. **Project Overview** — [`README.md`](../README.md), [`CONTEXT.md`](../CONTEXT.md)
   Learn the product modes (TUI, local WebUI, headless `serve`, hosted GitHub Pages) and the domain glossary (Frame, Filter List Panel, Detail Panel, Skill Provenance, Post-Mutation Hook, Health Pill).
2. **CLI Entry Point** — [`src/main.ts`](../src/main.ts), [`src/core/seed.ts`](../src/core/seed.ts), [`src/core/version.ts`](../src/core/version.ts)
   See how `--port`, `--version`, `--selftest`, `serve`, `--web`, and default TUI launch are dispatched, how subcommands (`add`, `update`, `remove`) become a `UiSeed`, and how `APP_VERSION` resolves compile-time defines vs `package.json`.
3. **Shared Core Runtime Primitives** — [`src/core/prefs.ts`](../src/core/prefs.ts), [`src/core/theme.ts`](../src/core/theme.ts), [`src/core/filter.ts`](../src/core/filter.ts), [`src/core/disk-index.ts`](../src/core/disk-index.ts)
   Inspect persisted preferences, WCAG-checked Catppuccin palettes, the shared `skillMatches` filter predicate, and atomic SWR disk caching.
   *Pattern note:* Writing pure, template-literal-safe TypeScript in `src/core/filter.ts` lets the web renderer inline the transpiled function directly into the browser script, guaranteeing identical filtering semantics across Bun and browser runtimes without a separate client bundler.
4. **Subprocess Boundary & Sanitization** — [`src/core/skills-client.ts`](../src/core/skills-client.ts), [`src/core/spawn-queue.ts`](../src/core/spawn-queue.ts), [`src/core/services/sanitize.ts`](../src/core/services/sanitize.ts), [`src/core/index.ts`](../src/core/index.ts)
   Trace binary resolution, child-env filtering, FIFO semaphore queuing, CWE-150 escape scrubbing, and the `src/core` barrel facade.
   *Pattern note:* A bounded async FIFO semaphore (`spawn-queue.ts`) queues Promise resolvers in JavaScript's single-threaded event loop to cap concurrent child processes without busy-waiting.
5. **Core Skill Domain Services** — [`src/core/services/types.ts`](../src/core/services/types.ts), [`src/core/services/installed.ts`](../src/core/services/installed.ts), [`src/core/services/locks.ts`](../src/core/services/locks.ts), [`src/core/services/install.ts`](../src/core/services/install.ts), [`src/core/services/remove.ts`](../src/core/services/remove.ts)
   Read the domain types, symlink + lockfile provenance classification, install JSON parsing, and diff-verified removal with cache reuse callbacks.
6. **Search, Updates & Hooks** — [`src/core/services/search.ts`](../src/core/services/search.ts), [`src/core/services/updates-check.ts`](../src/core/services/updates-check.ts), [`src/core/services/skill-doc.ts`](../src/core/services/skill-doc.ts), [`src/core/services/hooks.ts`](../src/core/services/hooks.ts)
   Explore `skills.sh` deduplicated fuzzy search, GitHub Trees SHA update checks, zero-spawn `SKILL.md` frontmatter stripping, and sanitized external hook/health execution.
7. **Loopback HTTP API & Auth** — [`src/core/api.ts`](../src/core/api.ts), [`src/core/hosted-auth.ts`](../src/core/hosted-auth.ts)
   Study the `Bun.serve` routes, per-scope list caching, request coalescing, rate/body limits, and browser-to-loopback defenses.
   *Pattern note:* Binding to `127.0.0.1` alone does not protect a local HTTP API from malicious browser tabs — validating `Host`/`Origin` blocks DNS rebinding, `Sec-Fetch-Site` rejects cross-site requests, and constant-time token comparison prevents timing leaks.
8. **OpenTUI State & Views** — [`src/tui/model.ts`](../src/tui/model.ts), [`src/tui/app.ts`](../src/tui/app.ts), [`src/tui/Views.tsx`](../src/tui/Views.tsx)
   Walk through the discriminated-union `Action` reducer, imperative controller/keymap runtime, and `useSyncExternalStore`-driven OpenTUI React components.
   *Pattern note:* TypeScript discriminated unions (`Action` in `model.ts`) enable exhaustive transition checks, while `useSyncExternalStore` safely bridges an imperative store into React without concurrent tearing.
9. **TUI Media, 3D & Selftest** — [`src/tui/art.ts`](../src/tui/art.ts), [`src/tui/audio.ts`](../src/tui/audio.ts), [`src/tui/three-scene.ts`](../src/tui/three-scene.ts), [`src/tui/spike.ts`](../src/tui/spike.ts), [`src/tui/renderer-ready.ts`](../src/tui/renderer-ready.ts)
   See procedural RGBA splash/identicons, 44.1 kHz PCM tone synthesis, the 3D Fibonacci-sphere skills graph (`@opentui/three`), and deterministic headless frame polling.
10. **Single-File Web Dashboard UI** — [`src/web/page.ts`](../src/web/page.ts), [`src/web/styles.ts`](../src/web/styles.ts), [`src/web/client/core.ts`](../src/web/client/core.ts), [`src/web/client/installed.ts`](../src/web/client/installed.ts), [`src/web/client/search-and-boot.ts`](../src/web/client/search-and-boot.ts)
    Inspect single-file HTML assembly, SHA-256 CSP hashing, keyed DOM-reusing row reconciliation, escape-first markdown rendering, and hosted-mode boot.
11. **Build, Release & Verified Install** — [`package.json`](../package.json), [`scripts/build.ts`](../scripts/build.ts), [`scripts/verify-build-targets.ts`](../scripts/verify-build-targets.ts), [`scripts/install.sh`](../scripts/install.sh), [`docs/release.md`](release.md)
    Follow how `src/main.ts` compiles into 4 platform binaries with macOS JIT codesigning, SHA-256 manifests, and fail-closed atomic installation.
12. **Testing, Performance Budgets & CI** — [`tests/fixtures/skills-shim.mjs`](../tests/fixtures/skills-shim.mjs), [`tests/serve-hardening.test.ts`](../tests/serve-hardening.test.ts), [`scripts/perf/budget.ts`](../scripts/perf/budget.ts), [`scripts/pty-smoke/smoke.py`](../scripts/pty-smoke/smoke.py), [`.github/workflows/claude-code-review.yml`](../.github/workflows/claude-code-review.yml)
    Review the executable test shim, hostile-input security tests, performance budget benchmarks, real-PTY smoke suite, and GitHub Actions review workflows.

## 5. File Map (Key Files by Layer)

### CLI Entrypoint & Loopback API
- [`src/main.ts`](../src/main.ts) — CLI entrypoint dispatching `--version`, `--selftest`, `serve`, `--web`, and default OpenTUI mode.
- [`src/core/api.ts`](../src/core/api.ts) — `Bun.serve` loopback HTTP API with route handlers, scope caching, coalescing, rate limiting, and body limits.
- [`src/core/hosted-auth.ts`](../src/core/hosted-auth.ts) — Persisted bearer token management, timing-safe auth, Host/Origin allowlists, `Sec-Fetch-Site`, and CORS helpers.
- [`src/core/seed.ts`](../src/core/seed.ts) — Parses `add`/`update`/`remove` CLI arguments into a launch `UiSeed`.

### Skill Domain Services
- [`src/core/services/types.ts`](../src/core/services/types.ts) — Shared domain interfaces (scopes, provenance, hooks, health, skills, update reports).
- [`src/core/services/sanitize.ts`](../src/core/services/sanitize.ts) — CWE-150 ANSI/control-char scrubbing applied at every external ingress boundary.
- [`src/core/services/locks.ts`](../src/core/services/locks.ts) — Read-only project (`skills-lock.json`) and global XDG (`.skill-lock.json`) parser with per-entry diagnostics.
- [`src/core/services/installed.ts`](../src/core/services/installed.ts) — Lists installed skills via `skills ls --json` and classifies provenance (`linked`, `locked`, `local`).
- [`src/core/services/install.ts`](../src/core/services/install.ts), [`remove.ts`](../src/core/services/remove.ts), [`update.ts`](../src/core/services/update.ts), [`source.ts`](../src/core/services/source.ts) — Wrappers around `skills add`, `rm` (diff-verified), `update`, and `install --list`.
- [`src/core/services/search.ts`](../src/core/services/search.ts) — `skills.sh` registry client with in-flight deduplication and fuzzy fallback strategies.
- [`src/core/services/updates-check.ts`](../src/core/services/updates-check.ts) — GitHub Trees API SHA comparison with strict completeness checks and null-prototype maps.
- [`src/core/services/skill-doc.ts`](../src/core/services/skill-doc.ts) — Zero-subprocess `SKILL.md` reader, frontmatter stripper, and body sanitizer.
- [`src/core/services/hooks.ts`](../src/core/services/hooks.ts) — `SKILLS_UI_POST_MUTATION_HOOK` runner and TTL-cached `SKILLS_UI_HEALTH_CMD` checker.

### Core Runtime & Shared Primitives
- [`src/core/index.ts`](../src/core/index.ts) — Public barrel facade for core services and runtime utilities.
- [`src/core/skills-client.ts`](../src/core/skills-client.ts) — Runtime `skills` binary discovery, sanitized child env, timeouts, and version probing.
- [`src/core/spawn-queue.ts`](../src/core/spawn-queue.ts) — Bounded FIFO async semaphore (`SKILLS_UI_SPAWN_QUEUE_CAP`, default 8).
- [`src/core/disk-index.ts`](../src/core/disk-index.ts) — Atomic SWR disk index in `~/.cache/skills-ui` partitioned by canonical project realpath.
- [`src/core/prefs.ts`](../src/core/prefs.ts) — `~/.config/skills-ui/prefs.json` persistence, normalization, and legacy migration.
- [`src/core/filter.ts`](../src/core/filter.ts) — Single `skillMatches` predicate shared between TUI and WebUI.
- [`src/core/theme.ts`](../src/core/theme.ts) — Catppuccin Mocha/Latte palettes, WCAG AA tokens, ANSI painters, and TextMate themes.
- [`src/core/version.ts`](../src/core/version.ts) — Single `APP_VERSION` source (`__APP_VERSION__` or `package.json`).

### Terminal UI (OpenTUI)
- [`src/tui/model.ts`](../src/tui/model.ts) — Pure `TuiModel`, `Action` union, immutable reducers, and scope-isolated filter/sort projections.
- [`src/tui/app.ts`](../src/tui/app.ts) — Imperative TUI runtime, signal crash guards, SWR hydration, service orchestration, and keymap contract.
- [`src/tui/Views.tsx`](../src/tui/Views.tsx) — React view hierarchy (splash, header, tabs, split-pane detail, 3D graph host, health strip, modals).
- [`src/tui/art.ts`](../src/tui/art.ts), [`audio.ts`](../src/tui/audio.ts), [`three-scene.ts`](../src/tui/three-scene.ts) — Procedural RGBA art, PCM audio cues, and 3D Fibonacci-sphere skills graph.
- [`src/tui/spike.ts`](../src/tui/spike.ts), [`renderer-ready.ts`](../src/tui/renderer-ready.ts) — `--selftest` markdown screen and deterministic in-memory frame polling.

### Web Dashboard UI
- [`src/web/page.ts`](../src/web/page.ts) — Single-file HTML renderer, SHA-256 CSP hash generator, and `webPageRenderer` adapter.
- [`src/web/styles.ts`](../src/web/styles.ts) — Catppuccin CSS custom-property stylesheet (`APP_CSS`).
- [`src/web/client/core.ts`](../src/web/client/core.ts) — Browser runtime, `sessionStorage` bearer auth, WebAudio cues, hosted probing, and busy-state locking.
- [`src/web/client/installed.ts`](../src/web/client/installed.ts) — Keyed DOM row reconciliation, inlined `skillMatches`, escape-first markdown renderer, and mutations.
- [`src/web/client/search-and-boot.ts`](../src/web/client/search-and-boot.ts) — Registry search, batch install queue, keyboard/splitter wiring, and `DOMContentLoaded` boot.

### Build, Release, Harnesses & Docs
- [`scripts/build.ts`](../scripts/build.ts), [`verify-build-targets.ts`](../scripts/verify-build-targets.ts), [`export-page.ts`](../scripts/export-page.ts), [`install.sh`](../scripts/install.sh) — Cross-platform compilation, target/digest auditing, GitHub Pages HTML export, and checksum-verified POSIX installer.
- [`tests/fixtures/skills-shim.mjs`](../tests/fixtures/skills-shim.mjs), [`scripts/perf/budget.ts`](../scripts/perf/budget.ts), [`scripts/pty-smoke/smoke.py`](../scripts/pty-smoke/smoke.py) — Core hermetic test shim, performance budget harness, and real-PTY smoke suite.
- [`AGENTS.md`](../AGENTS.md), [`docs/agents/workspace.md`](agents/workspace.md), [`ROADMAP.md`](../ROADMAP.md), [`docs/release.md`](release.md) — Repo/worktree contracts, Linear planning links (`P-S-4`), roadmap, and release runbook.

## 6. Complexity Hotspots (Approach Carefully)

These files have the highest structural complexity and edge connectivity in the graph. Read their paired tests before editing them.

### Production Code Hotspots
1. **[`src/tui/Views.tsx`](../src/tui/Views.tsx)** *(complex · fan-in 5, fan-out 46)* — Largest UI surface in the repo; enforces ratified terminology (`tests/terminology.test.ts`), Hallmark dash-sweep (`tests/dash-sweep.test.ts`), and split-pane/overlay rendering (`tests/tui.test.ts`).
2. **[`src/tui/app.ts`](../src/tui/app.ts)** *(complex · fan-in 9, fan-out 33)* — Coordinates signal crash guards, SWR disk-index swaps, debounced search, post-mutation hooks, and keyboard bindings. Race conditions are pinned by [`tests/tui.test.ts`](../tests/tui.test.ts) and [`tests/tui-disk-index.test.ts`](../tests/tui-disk-index.test.ts).
3. **[`src/core/api.ts`](../src/core/api.ts)** *(complex · fan-in 12, fan-out 29)* — Security and caching hub: Host/Origin/bearer gates, rate limiting, 1 MiB body caps, scope list coalescing, and generation-scoped cache invalidation. Guarded by [`tests/api.test.ts`](../tests/api.test.ts), [`tests/serve-hardening.test.ts`](../tests/serve-hardening.test.ts), and [`tests/perf/spawn-count.test.ts`](../tests/perf/spawn-count.test.ts).
4. **[`src/web/page.ts`](../src/web/page.ts)** *(complex · fan-in 15, fan-out 25 — highest fan-in in the repo)* + **[`src/web/client/installed.ts`](../src/web/client/installed.ts)**, **[`core.ts`](../src/web/client/core.ts)**, **[`search-and-boot.ts`](../src/web/client/search-and-boot.ts)** *(complex)* — Template-assembled browser JS with SHA-256 CSP hashing, escape-first markdown rendering, keyed DOM reconciliation, and stale-response guards. Guarded by [`tests/page-hardening.test.ts`](../tests/page-hardening.test.ts), [`tests/markdown-render.test.ts`](../tests/markdown-render.test.ts), and [`tests/e2e/audit-remediation.e2e.ts`](../tests/e2e/audit-remediation.e2e.ts).
5. **[`src/tui/model.ts`](../src/tui/model.ts)** *(complex · fan-in 7, fan-out 25)* — Pure Elm reducer and scope-isolated filtering/sorting projections; must preserve exact filter parity with [`src/core/filter.ts`](../src/core/filter.ts).
6. **[`src/core/services/hooks.ts`](../src/core/services/hooks.ts)**, **[`src/core/services/search.ts`](../src/core/services/search.ts)**, and **[`src/core/services/updates-check.ts`](../src/core/services/updates-check.ts)** *(complex)* — Concurrency and security invariants (sanitized subprocess spawns + TTL dedup, fuzzy search fallback + in-flight dedup, GitHub tree truncation + null-prototype safety).

### High-Complexity Test & Harness Hotspots
- [`scripts/perf/budget.ts`](../scripts/perf/budget.ts) & [`tests/perf/playwright-probes.ts`](../tests/perf/playwright-probes.ts) — Ratified perf budget runner and browser instrumentation.
- [`tests/tui.test.ts`](../tests/tui.test.ts), [`tests/tui-disk-index.test.ts`](../tests/tui-disk-index.test.ts), [`tests/e2e/hosted.e2e.ts`](../tests/e2e/hosted.e2e.ts), [`tests/e2e/audit-remediation.e2e.ts`](../tests/e2e/audit-remediation.e2e.ts), and [`scripts/pty-smoke/smoke.py`](../scripts/pty-smoke/smoke.py) — Large end-to-end verification suites.
