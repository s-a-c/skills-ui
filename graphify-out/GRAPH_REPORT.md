# Graph Report - main  (2026-11-27)

## Corpus Check
- 174 files · ~161,000 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 5, .lock 1, .toml 1)

## Summary
- 1359 nodes · 2522 edges · 67 communities (44 shown, 23 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 78 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core Services & Hooks
- CLI Smoke & Build Verification
- Performance Benchmark Suite
- OpenTUI CLI Canvas Runtime
- Sprite Animator Type Declarations
- OpenTUI Sprite Animation Runtime
- Repo Contracts & Milestone Gates
- Theme Tokens & TUI Art
- Release Checksums & Ticket Gates
- Agent Docs & Archify Review
- Package Manifest & Dependencies
- TUI Views & Overlays
- HTTP API Server & Auth
- Sprite Resource Manager Types
- PTY Smoke Test Runner
- CLI Entrypoint & TUI App
- Three Canvas Type Declarations
- Static Web Dashboard App
- Test Fixtures & Skills Shim
- Claude GitHub Actions Workflow
- Claude PR Review Workflow
- WGPU Renderer Type Declarations
- Skill Filtering & TUI Model
- TUI Action Handlers
- Web Client & Page Renderer
- TUI Dependencies & Preferences
- OpenTUI Three Package Metadata
- Docs Site Jekyll Config
- GPU Sprite Particle Generator
- Sprite & Texture Utilities Runtime
- Exploding Sprite Effects Runtime
- Mesh Pool & Sprite Resources
- UI Preferences Normalization
- TypeScript Compiler Config
- Physics Explosion Effects Runtime
- Planck Physics Runtime Adapter
- Rapier Physics Runtime Adapter
- Physics Engine Interface Types
- Dash Sweep Lexer & Tests
- Physics Explosion Type Declarations
- Binary Compilation Build Script
- Sprite Particle Effect Types
- Sprite Particle Generator Types
- Sprite Instance Manager Runtime
- Rapier Physics World Types
- Planck Physics World Types
- Version & Page Export Tests
- Spawn Queue & Concurrency Guard
- Planck Rigid Body Types
- Rapier Rigid Body Types
- OpenTUI Three Peer Dependencies
- CLI Seed Argument Parsing
- Explosion Manager Type Declarations
- Physics Explosion Manager Types
- Sprite Resource Cache Runtime
- Sprite Utilities Type Declarations
- Texture Utilities Type Declarations
- Upstream Performance Memos
- ANSI Terminal Color Painter
- Exploding Sprite Type Declarations
- OpenTUI Three Package Exports
- Standalone Binary Install Script
- TUI Audio Interface
- OpenTUI Three Repo Metadata
- Slow Skills Test Shim

## God Nodes (most connected - your core abstractions)
1. `createSkillsUiServer()` - 43 edges
2. `runTuiOn()` - 25 edges
3. `TiledSprite` - 25 edges
4. `TiledSprite` - 22 edges
5. `ThreeCliRenderer` - 22 edges
6. `sanitizeMetadata()` - 20 edges
7. `CLICanvas` - 20 edges
8. `ThreeRenderable` - 19 edges
9. `InstalledSkill` - 17 edges
10. `runSkills()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Byte-Identical Web Page Modularization (Wave 3)` --semantically_similar_to--> `Minimal Jimp-Free Semantic Patch (skills-ui.patch)`  [INFERRED] [semantically similar]
  docs/archify-findings-review-and-report-2026-11-26.md → vendor/opentui-three/README.skills-ui.md
- `Host-Env Post-Mutation Hook (SKILLS_UI_POST_MUTATION_HOOK)` --conceptually_related_to--> `Contract Test Fixture: Hostile Skill (ANSI/OSC/DCS/C1)`  [INFERRED]
  docs/designs/v0.5.5-hub-integration-provenance-and-health-strip.md → tests/fixtures/contract/hostile-skill/SKILL.md
- `freshServer()` --calls--> `createSkillsUiServer()`  [EXTRACTED]
  scripts/perf/budget.ts → src/core/api.ts
- `setupReal()` --calls--> `listInstalled()`  [EXTRACTED]
  scripts/perf/budget.ts → src/core/services/installed.ts
- `setupReal()` --calls--> `runSkills()`  [EXTRACTED]
  scripts/perf/budget.ts → src/core/skills-client.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Unified Split-Pane & Filter List Card Anatomy** — context_frame, context_filter_list_panel, context_detail_panel, context_filter_list_card, context_name_checkbox_unit, context_penultimate_card_line, context_contiguous_action_group [EXTRACTED 1.00]
- **0.5.1 Four-Slice Defense-in-Depth Security Hardening** — gates_0_5_1_security_hardening_gate, gates_s_156_serve_request_hardening, gates_s_157_hosted_page_hardening, gates_s_158_installer_release_trust, gates_s_159_ingress_metadata_sanitization [EXTRACTED 1.00]
- **0.5.5 Hub Integration, Provenance & Health Strip Architecture** — gates_0_5_5_hub_integration_gate, context_skill_provenance, context_post_mutation_hook, context_health_pill [EXTRACTED 1.00]
- **Release 0.5.2 WebUI and Core UX Gate Series** — gates_s_164_gate, gates_s_165_gate, gates_s_166_gate, gates_s_168_gate [EXTRACTED 1.00]
- **Release 0.5.3 Performance and Polish Gate Series** — gates_s_177_gate, gates_s_178_gate, gates_s_179_gate, gates_s_180_gate, gates_s_181_gate, gates_s_182_gate, gates_s_183_gate, gates_s_184_gate [EXTRACTED 1.00]
- **Release Binary SHA-256 Checksum Trust Chain** — checksums_readme_doc, checksums_checksums_0_4_0_manifest, checksums_checksums_0_5_0_manifest, checksums_checksums_0_5_1_manifest, checksums_checksums_0_5_2_manifest, checksums_checksums_0_5_3_manifest, checksums_checksums_0_5_3_1_manifest, checksums_checksums_0_5_5_manifest [EXTRACTED 1.00]
- **Multi-Surface Verification Gate Pipeline** — docs_archify_findings_review_and_report_2026_11_26_archify_remediation_report, docs_designs_v0_5_4_1_list_card_ergonomics_and_split_pane_parity_v0541_design, docs_designs_v0_5_5_hub_integration_provenance_and_health_strip_v055_design, scripts_pty_smoke_readme_pty_smoke_harness, scripts_perf_report_2026_11_01_synthetic_perf_report [EXTRACTED 1.00]
- **Agent Governance & Planning Plane Contracts** — docs_agents_domain_domain_docs_contract, docs_agents_issue_tracker_linear_workflow, docs_agents_triage_labels_canonical_triage_labels, docs_agents_workspace_multi_worktree_topology, docs_gates_gates_bootstrap_bootstrap_gates [EXTRACTED 1.00]
- **Cross-Platform Packaging & Supply-Chain Integrity Gates** — docs_release_release_procedure, docs_gates_gates_0_2_x_milestone_gates, vendor_opentui_three_readme_skills_ui_vendored_fork, docs_index_project_docs_home [INFERRED 0.85]
- **Hosted Mode Connection and Bootstrap Flow** — docs_app_connect_dialog, docs_app_hosted_mode_bridge, docs_app_serve_rest_api, docs_app_client_state, docs_app_hub_health_popover [EXTRACTED 1.00]
- **Installed Skill Filter and Keyed Reconcile Pipeline** — docs_app_list_pane, docs_app_filter_parity_predicate, docs_app_dom_reuse_reconciler, docs_app_perf_timing_instrumentation, docs_app_client_state [EXTRACTED 1.00]
- **Skill Mutation Safety and Post-Mutation Feedback Loop** — docs_app_update_removal_workflow, docs_app_confirm_dialog, docs_app_single_disabled_writer, docs_app_hub_health_popover, docs_app_toast_notifications, docs_app_webaudio_synth [EXTRACTED 1.00]

## Communities (67 total, 23 thin omitted)

### Community 0 - "Core Services & Hooks"
Cohesion: 0.05
Nodes (79): checkHealth(), clipSanitized(), createHealthChecker(), defaultHealthChecker, envCmd(), HEALTH_CMD_ENV, HealthChecker, invalidateHealthCache() (+71 more)

### Community 1 - "CLI Smoke & Build Verification"
Cohesion: 0.05
Nodes (40): @playwright/test, args, globalFixture, here, projectFixture, dir, entries, hashes (+32 more)

### Community 2 - "Performance Benchmark Suite"
Cohesion: 0.09
Nodes (56): argv, benchApiLists(), benchColdGlobalPaint(), benchColdList(), benchFilterMatching(), benchFilterRenderAndRebuild(), benchPageProbes(), benchSearch() (+48 more)

### Community 3 - "OpenTUI CLI Canvas Runtime"
Cohesion: 0.06
Nodes (3): CLICanvas, ThreeCliRenderer, ThreeRenderable

### Community 4 - "Sprite Animator Type Declarations"
Cohesion: 0.04
Nodes (7): Animation, AnimationDefinition, AnimationStateConfig, ResolvedAnimationState, SpriteAnimator, SpriteDefinition, TiledSprite

### Community 5 - "OpenTUI Sprite Animation Runtime"
Cohesion: 0.06
Nodes (3): Animation, SpriteAnimator, TiledSprite

### Community 6 - "Repo Contracts & Milestone Gates"
Cohesion: 0.07
Nodes (25): Linear Planning Plane (P-S-4 & Wayfinder Maps), SKILLS_UI_* Environment Variables, Skills-UI Repo Agent Contract, Contiguous Action Group, Detail Panel, Filter List Card, Filter List Panel, Frame (Root Viewport Container) (+17 more)

### Community 7 - "Theme Tokens & TUI Art"
Cohesion: 0.08
Nodes (36): ThemeName, AA_TEXT_RATIO, AA_UI_RATIO, BASIC_COLORS, buildThemeTokens(), CATPPUCCIN_LATTE, CATPPUCCIN_MOCHA, CatppuccinPalette (+28 more)

### Community 8 - "Release Checksums & Ticket Gates"
Cohesion: 0.06
Nodes (23): Release Checksums v0.4.0, Release Checksums v0.5.0, Release Checksums v0.5.1, Release Checksums v0.5.2, Release Checksums v0.5.3.1, Release Checksums v0.5.3, Release Checksums v0.5.5, Release Checksum Manifests README (+15 more)

### Community 9 - "Agent Docs & Archify Review"
Cohesion: 0.08
Nodes (21): Domain Docs Consumption Contract, Linear Issue Tracker Workflow (skills-ui P-S-4), Wayfinder Map Convention, Canonical Triage Labels Mapping, Multi-Worktree Workspace Topology, Archify Findings Review & Remediation Report (2026-11-26), Unbreakable Name-Checkbox Unit, v0.5.4.1 Design: List-Card Ergonomics & Split-Pane Parity (+13 more)

### Community 10 - "Package Manifest & Dependencies"
Cohesion: 0.07
Nodes (31): dependencies, @opentui/core@0.7.0, @opentui/keymap@0.7.0, @opentui/react@0.7.0, @opentui/three@file:vendor/opentui-three, react@19, description, devDependencies (+23 more)

### Community 11 - "TUI Views & Overlays"
Cohesion: 0.14
Nodes (33): syntaxTokensFor(), tokensFor(), AgentSelectOverlay(), App(), AppCtx, AppProvider, checkedTitle(), ConfirmOverlay() (+25 more)

### Community 12 - "HTTP API Server & Auth"
Cohesion: 0.14
Nodes (29): ApiOptions, BadJson, BodyTooLarge, createLimiter(), createSkillsUiServer(), json(), PageRenderer, readJsonBody() (+21 more)

### Community 13 - "Sprite Resource Manager Types"
Cohesion: 0.06
Nodes (8): InstanceManager, InstanceManagerOptions, MeshPool, MeshPoolOptions, ResourceConfig, SheetProperties, SpriteResource, SpriteResourceManager

### Community 14 - "PTY Smoke Test Runner"
Cohesion: 0.09
Nodes (4): PtyApp, check(), main(), _SearchFixtureHandler

### Community 15 - "CLI Entrypoint & TUI App"
Cohesion: 0.11
Nodes (22): argv, { port, rest }, selftest(), CrashGuard, installCrashGuard(), listCache, runTui(), AudioStreamLike (+14 more)

### Community 16 - "Three Canvas Type Declarations"
Cohesion: 0.06
Nodes (6): CLICanvas, SuperSampleAlgorithm, PRE_SQUEEZED, STANDARD, ThreeRenderable, ThreeRenderableOptions

### Community 17 - "Static Web Dashboard App"
Cohesion: 0.13
Nodes (24): Busy Status Bar, CLI Seed Handoff, Client State Store, Remove Confirmation Dialog, Hosted Backend Connect Dialog, Skills UI Web Dashboard, Skill & Search Detail Pane, TUI/Web Filter Parity Predicate (skillMatches) (+16 more)

### Community 18 - "Test Fixtures & Skills Shim"
Cohesion: 0.11
Nodes (13): args, stateFile, createInstallerFixture(), updatesPayload, SHIM, start(), ListRow, start() (+5 more)

### Community 19 - "Claude GitHub Actions Workflow"
Cohesion: 0.07
Nodes (28): if, permissions, runs-on, steps, types, types, jobs, claude (+20 more)

### Community 20 - "Claude PR Review Workflow"
Cohesion: 0.08
Nodes (23): permissions, runs-on, steps, jobs, claude-review, name, on, pull_request (+15 more)

### Community 21 - "WGPU Renderer Type Declarations"
Cohesion: 0.08
Nodes (6): SuperSampleType, CPU, GPU, NONE, ThreeCliRenderer, ThreeCliRendererOptions

### Community 22 - "Skill Filtering & TUI Model"
Cohesion: 0.12
Nodes (15): skillMatches(), DEFAULT_UI_PREFERENCES, realDeps, createTuiModel(), visibleSkills(), FrameDriver, waitForFrame(), FIXTURES (+7 more)

### Community 23 - "TUI Action Handlers"
Cohesion: 0.11
Nodes (18): SourceSkill, ACTION_HANDLERS, ActionHandlers, applyAgentSelectAction(), applyProvenanceCycle(), applySeed(), applySkillsLoaded(), applySortToggle() (+10 more)

### Community 25 - "Web Client & Page Renderer"
Cohesion: 0.16
Nodes (13): buildClientInstalledJs(), CLIENT_SEARCH_AND_BOOT_JS, bootstrapScript(), cssVarsFor(), pageCspFor(), renderPage(), safeJsonEmbed(), SKILL_MATCHES_SRC (+5 more)

### Community 26 - "TUI Dependencies & Preferences"
Cohesion: 0.20
Nodes (4): UiPreferences, UpdatesResult, runTuiOn(), TuiDeps

### Community 27 - "OpenTUI Three Package Metadata"
Cohesion: 0.13
Nodes (16): bun-webgpu, planck, description, engines, bun, license, main, module (+8 more)

### Community 28 - "Docs Site Jekyll Config"
Cohesion: 0.13
Nodes (14): aux_links, GitHub, Releases, baseurl, defaults, scope, values, description (+6 more)

### Community 30 - "Sprite & Texture Utilities Runtime"
Cohesion: 0.20
Nodes (3): SheetSprite, SpriteUtils, TextureUtils

### Community 33 - "UI Preferences Normalization"
Cohesion: 0.23
Nodes (10): isPort(), isReduceMotion(), isThemeName(), LIST_WIDTH_MAX, LIST_WIDTH_MIN, loadUiPreferences(), normalizePreferences(), SKILLS_PREFS_SOURCE (+2 more)

### Community 34 - "TypeScript Compiler Config"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck, strict (+4 more)

### Community 38 - "Physics Engine Interface Types"
Cohesion: 0.15
Nodes (5): PhysicsColliderDesc, PhysicsRigidBody, PhysicsRigidBodyDesc, PhysicsVector2, PhysicsWorld

### Community 39 - "Dash Sweep Lexer & Tests"
Cohesion: 0.18
Nodes (8): APP_JS, app, Hit, lex(), model, opensRegex(), ROOT, views

### Community 40 - "Physics Explosion Type Declarations"
Cohesion: 0.18
Nodes (5): PhysicsExplodingSpriteEffect, PhysicsExplosionCreationData, PhysicsExplosionEffectParameters, PhysicsExplosionHandle, PhysicsSpriteRecreationData

### Community 41 - "Binary Compilation Build Script"
Cohesion: 0.22
Nodes (7): all, args, binaries, pkg, requested, Target, TARGETS

### Community 42 - "Sprite Particle Effect Types"
Cohesion: 0.22
Nodes (5): ExplosionCreationData, ExplosionEffectParameters, ExplosionHandle, SpriteRecreationData, ParticleEffectParameters

### Community 47 - "Version & Page Export Tests"
Cohesion: 0.36
Nodes (4): out, APP_VERSION, List, start()

### Community 48 - "Spawn Queue & Concurrency Guard"
Cohesion: 0.39
Nodes (5): createSpawnQueue(), queueCap(), SkillsBusyError, Slot, start()

### Community 51 - "OpenTUI Three Peer Dependencies"
Cohesion: 0.33
Nodes (5): three, dependencies, @opentui/core@0.7.0, three@0.177.0, @opentui/core

### Community 52 - "CLI Seed Argument Parsing"
Cohesion: 0.47
Nodes (5): flagValues(), parseUiSeed(), positionals(), VALUE_FLAGS, runWeb()

### Community 58 - "Upstream Performance Memos"
Cohesion: 0.50
Nodes (4): Upstream Issue Draft: skills ls O(canonical x corpus) Re-Parse Storm, Upstream Memo: vercel-labs/skills#2644 (S-153), Real-Corpus Performance Budget Report (2026-11-01), Synthetic Performance Budget Report (2026-11-01)

### Community 61 - "OpenTUI Three Package Exports"
Cohesion: 0.40
Nodes (5): exports, ./runtime-modules, import, require, types

### Community 62 - "Standalone Binary Install Script"
Cohesion: 0.83
Nodes (3): die(), say(), install.sh script

### Community 64 - "OpenTUI Three Repo Metadata"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

## Knowledge Gaps
- **30 isolated node(s):** `NONE`, `GPU`, `CPU`, `STANDARD`, `PRE_SQUEEZED` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 594 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `OpenTUI Three Peer Dependencies` to `Sprite Animator Type Declarations`, `Physics Explosion Type Declarations`, `Sprite Particle Effect Types`, `Sprite Resource Manager Types`, `Three Canvas Type Declarations`, `WGPU Renderer Type Declarations`, `OpenTUI Three Type Index`, `Sprite Utilities Type Declarations`, `OpenTUI Three Package Metadata`, `Sprite & Texture Utilities Runtime`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `runTuiOn()` (e.g. with `.checkHealth()` and `.checkUpdates()`) actually correct?**
  _`runTuiOn()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `NONE`, `GPU`, `CPU` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Services & Hooks` be split into smaller, more focused modules?**
  _Cohesion score 0.05139920045688178 - nodes in this community are weakly interconnected._
- **Should `CLI Smoke & Build Verification` be split into smaller, more focused modules?**
  _Cohesion score 0.053551912568306013 - nodes in this community are weakly interconnected._
- **Should `Performance Benchmark Suite` be split into smaller, more focused modules?**
  _Cohesion score 0.08587570621468926 - nodes in this community are weakly interconnected._
- **Should `OpenTUI CLI Canvas Runtime` be split into smaller, more focused modules?**
  _Cohesion score 0.05902980713033314 - nodes in this community are weakly interconnected._