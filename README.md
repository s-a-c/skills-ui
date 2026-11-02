# skills-ui

**TUI/WebUI wrapper for the [`skills`](https://github.com/vercel-labs/skills) CLI.** OpenTUI terminal app + web UI over a local HTTP API, shipped as a self-contained Bun executable. Versioning: **0.x.y forever** — no 1.0 implied.

## What it is

- A single binary (`bun build --compile`) embedding the Bun runtime and OpenTUI's native core.
- Three entry modes: `skills-ui` (terminal UI) · `skills-ui --web` (local web UI) · `skills-ui serve` (headless HTTP API) — plus a **hosted zero-install page** at [s-a-c.github.io/skills-ui](https://s-a-c.github.io/skills-ui/app.html) that talks to your local `serve` over an authenticated loopback connection (Chrome/Edge/Firefox 153+; Safari blocks local network access).
- Wraps the **stock** `skills` CLI via subprocess (`ls --json`, `add --json -y`, `rm -y`, `update -y`) — nothing of `skills` is bundled or imported; it is discovered at runtime (`SKILLS_UI_SKILLS_BIN` → `PATH`).
- Talks to the public skills.sh registry directly for search.
- Rich terminal UI: markdown (tree-sitter), images (kitty/sixel/blocks), 3D graph view (`@opentui/three`), synthesized audio, catppuccin latte|mocha theming with WCAG-verified contrast.

## Performance (0.5.3)

Every hot path is measured against ratified budgets (`bun run perf:budget`, committed harness). On a real 300-skill corpus:

- the serve API caches per scope and coalesces concurrent reads — a warm global list is a **0.1 ms** cache hit where the stock CLI's `ls` scan costs tens of seconds per fresh run; detail reads resolve by exact path with **zero** subprocesses;
- the TUI paints a persisted index instantly on first load (**~0.5 ms** on a real 300-entry index) and revalidates behind it — no more blank minute on your first `g`;
- the web filter reconciles keyed rows instead of rebuilding the list per keystroke; search dedupes identical in-flight registry calls and stale responses can never overwrite newer results.

The remaining wall is upstream: `skills ls` itself re-parses every SKILL.md once per agent dir per canonical skill on large home directories ([vercel-labs/skills#2644](https://github.com/vercel-labs/skills/issues/2644)) — skills-ui caches around it, it can't fix it.

## Requirements

- `skills` on `PATH` (or point `SKILLS_UI_SKILLS_BIN` at it) — v1.7.x, stock upstream.
- Terminal with truecolor for full fidelity (degrades gracefully).

## Install

Pinned to a signed release tag (recommended — the installer script and the checksum manifest both come from the tag's tree, so `git tag -v` covers what verifies your binary):

```sh
curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/v0.5.3.1/scripts/install.sh | sh -s v0.5.3.1
```

Rolling latest from `main` (unpinned script):

```sh
curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/main/scripts/install.sh | sh
```

Either way it detects OS/arch, downloads the release binary, verifies it against the checksum manifest, and installs to `~/.local/bin` (override with `SKILLS_UI_INSTALL_DIR`). Manual alternative: grab a binary from the [releases](https://github.com/s-a-c/skills-ui/releases) (darwin-arm64 · darwin-x64 · linux-x64 · linux-arm64), `chmod +x`, put it on your `PATH`; browser-downloaded macOS copies also need `xattr -d com.apple.quarantine <file>` (ad-hoc signed). Package managers (Homebrew, winget, …) are roadmap-later.

## Usage

```sh
skills-ui               # terminal UI (OpenTUI)
skills-ui --web         # local web UI (opens the browser)
skills-ui serve         # headless HTTP API on 127.0.0.1
skills-ui add owner/repo --skill tdd   # opens the UI seeded for that install
skills-ui --selftest    # in-memory smoke check — no TTY needed
```

## Development

```sh
mise install            # bun 1.4.4
bun install
bun run dev             # terminal app
bun run selftest        # in-memory renderer smoke test — no TTY needed
bun test                # 230 tests: services (skills shim) · API · web page pins · TUI · perf budgets
bun run pty-smoke       # real-pty smoke over the compiled flows
bun run perf:budget     # the 0.5.3 budget harness (--real for the live corpus, never in CI)
bun run build           # compiled binary → dist/ (host target)
bun run build --all     # darwin-x64/arm64 + linux-x64/arm64 matrix
```

## Relationship to `skills`

This project has **no build-time dependency on `skills`** — source or package. The fork `s-a-c/vercel-labs-skills` (branch `dev/tui-webui`) is a porting reference only (API contract, web page, theme system), carried with attribution. See [ROADMAP.md](ROADMAP.md) and `plans/skills-ui-wrapper-pivot-plan.md` in the fork repo for the full architecture diagrams.

## License

MIT. Theme system and API contract adapted from `vercel-labs/skills` (MIT).
