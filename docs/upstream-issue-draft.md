> **Ready-to-file draft (2026-11-02).** Title below, body = everything after it (the memo
> verbatim, with the #1389 cross-reference folded in). File it when ready; then delete this
> file or mark it filed in `docs/upstream-ls-memoization.md`'s status line.

**Title:** `[Bug]: skills ls re-parses every SKILL.md once per agent dir per canonical skill — O(canonical × corpus) — a minute-long ls on a real home directory`

**Labels (if offered):** bug, performance

---

**Cross-reference:** #1389 reports the same symptom on Windows (20–25 s `skills list -g`, 1,241 junctions to canonical skills, "repeatedly checks and scans many agent-specific directories") — the root-cause analysis below very likely explains it too; the junction/symlink farm is the same trigger as our symlinked agent dirs.

# `skills ls` re-parses every SKILL.md per agent dir per pass

Observed on `skills` CLI 1.7.4, macOS (arm64), a real home directory with ~26 agent dirs and ~300 skills. We hit this downstream (skills-ui, a wrapper UI that shells out to `skills`) where a single list request could stall for a minute; the analysis below is from our audit of the CLI's behavior.

## Symptom

A single `skills ls --json` over a real home directory takes on the order of a minute, is almost entirely I/O wait, and emits the same warning hundreds of times per run. Downstream (skills-ui's local HTTP API) this turns every `GET /api/skills` into a fresh multi-second-to-minute subprocess.

## Evidence

### Bisection (one `skills ls --json` per row, same machine)

| corpus scanned | wall time |
|---|---|
| `.agents` alone (255 skills) | 2.4 s |
| `.agents` + 26 other agent dirs | 16.4 s |
| the 26 dirs without `.agents` | 0.26 s |
| the real home directory (full set) | ~62 s |

The per-skill cost is roughly constant; the blow-up is in how many times each skill gets visited. Adding the 26 dirs multiplies work far beyond "one parse per file per dir": the agent-linking loop re-walks and re-parses the canonical corpus once per linking pass — **O(canonical × corpus) re-parses** for what should be O(corpus) parses plus O(canonical × corpus) index lookups.

Fresh corroboration on the same machine, 2026-11-01 (single runs, no cache):

| command (from `$HOME`) | wall time | rows |
|---|---|---|
| `skills ls --json` | 57.8 s | 279 project-scope |
| `skills ls --json -g` | 63.5 s | 300 global-scope |

### The warning storm is the smoking gun

Each run prints the same "Skipped …" warning 222–223 times — one broken SKILL.md (`ui-ux-pro-max`, missing frontmatter) re-parsed once per canonical skill whose agent-link probe missed. That is the re-parse storm made visible: the fallback path `readdir`s the whole agent dir and runs `stat` + full frontmatter parse on every entry, per miss, per linking pass.

### CPU profile

`sample(1)` on the worker PID during a real run: ~57% of wall in `kevent` (io_poll), ~40% in libuv threadpool `ReadFileJob` completions driving deep promise/generator microtask chains — the frontmatter-parse path. No child processes, no network: purely I/O-bound inside the CLI.

## Root cause (1.7.4 `listInstalledSkills`)

Every entry found in the **canonical** dir (`~/.agents/skills`) goes through an agent-linking loop over all detected agents: up to 3 `access()` name probes per agent, and on a miss — the common case when an agent dir stores different directory names — a fallback that `readdir`s the agent's entire skills dir and runs `stat` + `parseSkillMd` (full file read + YAML frontmatter parse) on **every** entry to match by name. With C canonical skills and A agent dirs containing F total files, that is up to C × F re-parses per `ls` (our corpus: 255 × 699 ≈ 178k potential re-parses).

## Proposed fix

Either or both, inside `listInstalledSkills`:

1. **Memoize `parseSkillMd` per absolute path** for the duration of the run (a `Map<path, parsed>`): every repeated visit of the same file then costs a map lookup.
2. **Build a per-agent name→dir index once per run**: one `readdir` per agent dir up front, then the linking loop is O(1) lookups instead of per-miss directory walks.

Either change collapses the cost toward the O(corpus) floor the bisection measured for the same corpus shapes (0.26–2.4 s tiers). Bonus: dedupe the "Skipped" warnings (one per file, not one per linking miss).

Happy to turn any of this into a PR if the approach sounds right — pointer to where you'd want the memoization (inside `parseSkillMd` callers vs. the loop) appreciated.
