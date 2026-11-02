# Upstream memo: `skills ls` re-parses every SKILL.md per agent dir per pass (S-153)

**Status:** FILED upstream 2026-11-02 as
[vercel-labs/skills#2644](https://github.com/vercel-labs/skills/issues/2644)
(cross-linked from #1389). This document is the source copy; the filed body
lives in `docs/upstream-issue-draft.md`.

**Upstream repo:** vercel-labs/skills (`skills` CLI). Observed on 1.7.4,
macOS (arm64), a real home directory with ~26 agent dirs and ~300 skills.

## Symptom

A single `skills ls --json` over a real home directory takes on the order of
a minute, is almost entirely I/O wait, and emits the same warning hundreds of
times per run. Downstream (skills-ui's local HTTP API) this turns every
`GET /api/skills` into a fresh multi-second-to-minute subprocess.

## Evidence

### Bisection (one `skills ls --json` per row, same machine, S-153 audit)

| corpus scanned | wall time |
|---|---|
| `.agents` alone (255 skills) | 2.4 s |
| `.agents` + 26 other agent dirs | 16.4 s |
| the 26 dirs without `.agents` | 0.26 s |
| the real home directory (full set) | ~62 s |

The per-skill cost is roughly constant; the blow-up is in how many times each
skill gets visited. Adding the 26 dirs multiplies work far beyond "one parse
per file per dir": the agent-linking loop re-walks and re-parses the
canonical corpus once per linking pass — **O(canonical × corpus) re-parses**
for what should be O(corpus) parses plus O(canonical × corpus) index lookups.

Fresh corroboration on the same machine, 2026-11-01 (single runs, no cache):

| command (from `$HOME`) | wall time | rows |
|---|---|---|
| `skills ls --json` | 57.8 s | 279 project-scope |
| `skills ls --json -g` | 63.5 s | 300 global-scope |

### CPU profile

~57% of samples in `kevent`, ~40% in libuv `ReadFileJob` promise chains.
The process is not computing — it is waiting on thousands of small file
reads issued through promise machinery. This is a read-amplification problem,
not a parsing-CPU problem.

### The visible signature: hundreds of duplicate warnings per run

Every run prints, e.g. (222 occurrences in the S-153 audit; 223 in the
2026-11-01 corroboration run, one `skills ls --json`):

```
⚠ Skipped /Users/s-a-c/.augment/skills/ui-ux-pro-max/SKILL.md — missing required frontmatter field(s): name, description
```

The same path fails frontmatter parsing and warns **once per re-parse**. The
warning count is a direct counter for how many times the file was parsed in a
single listing — i.e. the re-parse storm, made user-visible.

## Proposed fix (either suffices; both compose)

1. **Memoize `parseSkillMd` per absolute path** (a per-run/process
   `Map<path, result>`): every re-visit of an already-parsed path becomes a
   map hit. The duplicate warnings disappear for free (warn only on a cache
   miss). Frontmatter does not change mid-run.
2. **Build a per-agent name→dir index once per run** and let the
   agent-linking loop consult the index instead of re-walking/re-parsing
   candidate dirs per canonical skill: O(corpus) parses + O(canonical ×
   corpus) map lookups.

Either change takes a full-home `skills ls` from ~60 s to within a small
multiple of the 2.4 s single-dir measurement.

## What skills-ui did meanwhile (downstream, not a fix)

skills-ui wraps the CLI as a subprocess (wrap-don't-fork — the boundary
stays) and stopped paying the cost repeatedly: the serve API caches one
`ls --json` result per scope per server, coalesces concurrent list requests
onto one in-flight spawn, and lets `remove` reuse the cached before-set plus
one post-rm refresh (previously up to two full uncached lists per removal).
Invalidation happens on install/remove/update mutations. That turns "one
~60 s spawn per HTTP request" into "one spawn per mutation", but every cold
request still pays the upstream storm — only the upstream fix removes it.
