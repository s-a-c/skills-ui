---
layout: home
title: skills-ui
nav_order: 1
description: TUI/WebUI wrapper for the stock skills CLI.
---

**skills-ui** gives the stock [`skills`](https://github.com/vercel-labs/skills) CLI a rich, self-contained UI: an OpenTUI terminal app, a local web UI, and a headless HTTP API — all shipped as one Bun-compiled binary with no runtime install beyond `skills` itself.

## Install

Grab a binary from the [releases](https://github.com/s-a-c/skills-ui/releases) (darwin-arm64 · darwin-x64 · linux-x64 · linux-arm64), then:

```sh
skills-ui               # terminal UI (OpenTUI)
skills-ui --web         # local web UI (opens the browser)
skills-ui serve         # headless HTTP API on 127.0.0.1
skills-ui --selftest    # in-memory smoke check — no TTY needed
```

Requires the stock `skills` CLI v1.7.x on `PATH` (or point `SKILLS_UI_SKILLS_BIN` at it).

## Highlights

- Wraps the **stock** `skills` CLI via subprocess — nothing bundled, nothing forked.
- Rich terminal UI: markdown, images, 3D graph view, synthesized audio, catppuccin theming.
- Headless `serve` API on loopback for scripting.
- A **hosted zero-install web UI** is coming in 0.5.x — see the [roadmap](https://github.com/s-a-c/skills-ui/blob/main/ROADMAP.md).

## Repo & agent conventions

- [Issue tracker (Linear)]({% link agents/issue-tracker.md %})
- [Triage labels]({% link agents/triage-labels.md %})
- [Domain docs]({% link agents/domain.md %})
