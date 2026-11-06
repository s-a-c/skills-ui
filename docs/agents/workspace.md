---
ijfw_version: 1.3.2
ijfw_schema: 1
type: software
primary_type: software
secondary_types: []
confidence: 0.907
detected_at: 2026-11-05T16:17:52.540Z
signals:
  - kind: manifest
    weight: 0.9
    manifests: [package.json, package.json]
  - kind: file_extension_ratio
    weight: 0.7
    domain: software
    ratio: 0.993
    count: 145
  - kind: filename_pattern
    weight: 0.2
    domain: content
    name: post-update.sample
---
# skills-ui — Workspace Agent Instructions

This directory is a **multi-worktree workspace**, not a single repository checkout.
This file is the workspace-level contract (canonical, versioned here at
`docs/agents/workspace.md`; the workspace root's `AGENTS.md` is a symlink to it).
It is based on and subordinate to the global master instruction file at
[`~/.config/agents/AGENTS.md`](~/.config/agents/AGENTS.md)
(DOX contract, operating posture, global rules), which applies in full here.

## 1. Instruction priority

1. Explicit user, system, and orchestrator instructions win.
2. The global master instructions: `~/.config/agents/AGENTS.md`.
3. This file, for workspace-level details (topology, routing).
4. The repo-level `AGENTS.md` inside a worktree for project details
   (committed on `main`; phase worktrees receive it via merge).

## 2. Workspace topology

One git repository held as a bare repo plus the `main` integration worktree
(phase worktrees are created on demand and removed when merged — last tidied
2026-11-06 when the audit-remediation phase merged):

| Path | Branch | Role |
|---|---|---|
| `.bare/` | — | Bare repository; all branches and objects live here |
| `main/` | `main` | Integration branch (current status: README + Linear) |
| `adversarial-review-2026-11-02/` | `phase/adversarial-review-2026-11-02` | Retained audit evidence — do not reuse or delete |
| `remediation-plan-2026-11-05/` | `phase/remediation-plan-2026-11-05` | Retained remediation planning + SDD evidence root — do not reuse or delete |

- To start a phase: `git -C main worktree add ../<name> -b phase/<name>`
  (then `bun install` inside it). When the phase merges: `git -C main
  worktree remove ../<name>` + `git -C main branch -d phase/<name>` —
  always `git -C <name> merge main` before an ff-merge back.
- These are **worktrees of one repo**, not packages: every worktree carries the
  same `package.json`. Never treat them as independent projects.
- `git -C main worktree list` reproduces this table. Rows marked *retained …
  evidence* are deliberately kept past their merge/audit; do not tidy them
  without owner instruction.
- `ijfw/` and `.ijfw/` are an unpopulated journaling scaffold (layout v2) — not
  part of the product; leave untouched unless asked.
- The workspace root itself is **outside every worktree** (its `.git` file
  points at `.bare`). This contract is the exception: it is versioned in-repo
  here, and the root `AGENTS.md` is a symlink to this file. All other root
  files (`..envrc`, `CLAUDE.md`, `egm-review-*/`, `.unlazy*` scopes) are
  untracked by git and unversioned.

## 3. Project management lives in Linear

The Linear project **skills-ui**
([P-S-4](https://linear.app/s-a-c/project/skills-ui-521f0931af82)) is the planning
plane: milestones, roadmap, decisions, and the project-management documents
(Vision & Goals, Roadmap, Conventions & Integration). Wayfinder maps are issues
labelled `wayfinder:map` with child decision tickets; see the repo-level
`AGENTS.md` in `main/` for how to work them. Repo-local agent-skill routing
(issue tracker, triage labels, domain docs) lives in `main/docs/agents/`.

## 4. Workspace-level rules

- Work inside the worktree whose branch matches the task; merge into `main` only
  with authorization.
- Env vars owned by the project are prefixed `SKILLS_UI_` — details in the
  Conventions & Integration document in Linear and the repo-level `AGENTS.md`.

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-AGENTS-START -->
No project agents yet. Run `ijfw team` to set them up.
<!-- IJFW-AGENTS-END -->
