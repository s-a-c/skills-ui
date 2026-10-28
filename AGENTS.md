# skills-ui — Repo Agent Instructions

Repo-level contract for the skills-ui codebase. Subordinate to the global master
instructions ([`~/.config/agents/AGENTS.md`](~/.config/agents/AGENTS.md), DOX
contract) and the workspace-level `AGENTS.md` one directory above this worktree
(topology, routing). This file is committed on `main`; the phase worktrees
receive it via merge.

## Project

TUI/WebUI wrapper for the stock [`skills`](https://github.com/vercel-labs/skills)
CLI: one Bun-compiled binary, three modes — `skills-ui` (OpenTUI terminal app),
`--web` (local web UI), `serve` (headless HTTP API). Wraps `skills` strictly via
subprocess; no build-time dependency on it. Versioning: 0.x.y forever — no 1.0
implied, breaking changes allowed at any minor.

- Stack: Bun 1.4.4 (pinned by `mise.toml`), TypeScript ESM, OpenTUI 0.7.0.
- Layout: `src/core/` (services, skills-client, prefs, theme) · `src/core/api.ts`
  (HTTP API) · `src/web/` (WebUI) · `src/tui/` (terminal app) · `src/main.ts`
  (entry) · `scripts/build.ts` (compile).
- Current state: milestone 0.0.x complete, 36 tests green.

## Environment variables

Every env var owned by this project is prefixed `SKILLS_UI_`:

| Variable | Purpose | Default |
|---|---|---|
| `SKILLS_UI_SKILLS_BIN` | Path to the wrapped `skills` executable | `skills` on PATH |
| `SKILLS_UI_PREFS_DIR` | Override prefs directory | `~/.config/skills-ui/prefs.json` |
| `SKILLS_UI_API_URL` | skills.sh registry base URL | `https://skills.sh` |

Standard and third-party vars (`GITHUB_TOKEN`, `XDG_STATE_HOME`, `COLORTERM`,
`OPENTUI_LIBC`) keep their conventional names. New project-owned vars must take
the `SKILLS_UI_` prefix.

## Commands

```sh
bun run dev        # terminal app
bun run selftest   # in-memory renderer smoke test, no TTY
bun test           # full suite (36 tests)
bun run build      # compiled binary → dist/ (--all for the target matrix)
```

## Git

- Development happens on `phase/*` branches, merged into `main`. This repo uses
  linked worktrees off `.bare` — see the workspace `AGENTS.md`.
- No commits, pushes, or remote sync without explicit authorization from the
  current request.

## Linear

Linear project **skills-ui** (P-S-4) is the planning plane:
https://linear.app/s-a-c/project/skills-ui-521f0931af82

- **Documents** (Vision & Goals, Roadmap, Conventions & Integration) are the
  canonical project-management docs; `ROADMAP.md` here mirrors the Roadmap
  document.
- **Milestones**: 0.1.x – 0.5.x.
- **Wayfinder**: maps are issues labelled `wayfinder:map` (current:
  "skills-ui 0.1.x route (wayfinder map)", S-57). Tickets are child issues
  labelled `wayfinder:<research|prototype|grilling|task>` with native blocking
  relations. Work at most one ticket per session; claim by assigning first;
  record resolutions as a comment, close the ticket, and append the gist to the
  map's Decisions so far.

## Agent skills

### Issue tracker

Issues live in the Linear project skills-ui (P-S-4), team S-a-c, via Linear MCP tools. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary, default strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.

## Skills for this project

- `i-have-adhd` — shape output for an ADHD reader: lead with the next action,
  number multi-step work, end with one concrete next action.
- `karpathy-guidelines` — think before coding, simplicity first, surgical
  changes, goal-driven execution with verifiable success criteria.
- `caveman` — terse responses; full prose for anything persisted outside chat
  (docs, commits, tickets, Linear).
- `wayfinder` — decision maps on Linear for routes still in fog.
- `grill-with-docs` — grilling + domain-modeling before building.
- `unlazy` — gates and verification discipline when outcomes must provably
  complete.

## Docs authority

1. Global: `~/.config/agents/AGENTS.md` and its `rules/`.
2. Workspace: `../AGENTS.md` (topology, routing).
3. This file (repo contract).
4. Linear documents (project-management canon).
