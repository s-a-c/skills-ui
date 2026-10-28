# skills-ui

**TUI/WebUI wrapper for the [`skills`](https://github.com/vercel-labs/skills) CLI.** OpenTUI terminal app + web UI over a local HTTP API, shipped as a self-contained Bun executable. Versioning: **0.x.y forever** — no 1.0 implied.

## What it is

- A single binary (`bun build --compile`) embedding the Bun runtime and OpenTUI's native core.
- Three entry modes: `skills-ui` (terminal UI) · `skills-ui --web` (local web UI) · `skills-ui serve` (headless HTTP API).
- Wraps the **stock** `skills` CLI via subprocess (`ls --json`, `add --json -y`, `rm -y`, `update -y`) — nothing of `skills` is bundled or imported; it is discovered at runtime (`SKILLS_BIN` → `PATH`).
- Talks to the public skills.sh registry directly for search.
- Rich terminal UI: markdown (tree-sitter), images (kitty/sixel/blocks), 3D graph view (`@opentui/three`), synthesized audio, catppuccin latte|mocha theming with WCAG-verified contrast.

## Requirements

- `skills` on `PATH` (or point `SKILLS_BIN` at it) — v1.7.x, stock upstream.
- Terminal with truecolor for full fidelity (degrades gracefully).

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
bun test                # 36 tests: services (skills shim) · API · TUI snapshots
bun run build           # compiled binary → dist/ (host target)
bun run build --all     # darwin-x64/arm64 + linux-x64/arm64 matrix
```

## Relationship to `skills`

This project has **no build-time dependency on `skills`** — source or package. The fork `s-a-c/vercel-labs-skills` (branch `dev/tui-webui`) is a porting reference only (API contract, web page, theme system), carried with attribution. See [ROADMAP.md](ROADMAP.md) and `plans/skills-ui-wrapper-pivot-plan.md` in the fork repo for the full architecture diagrams.

## License

MIT. Theme system and API contract adapted from `vercel-labs/skills` (MIT).
