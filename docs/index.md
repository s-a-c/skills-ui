---
layout: home
title: skills-ui
nav_order: 1
description: TUI/WebUI wrapper for the stock skills CLI.
---

**skills-ui** gives the stock [`skills`](https://github.com/vercel-labs/skills) CLI a rich, self-contained UI: an OpenTUI terminal app, a local web UI, and a headless HTTP API — all shipped as one Bun-compiled binary with no runtime install beyond `skills` itself.

## Install

Pinned to a signed release tag (recommended — the installer script and the checksum manifest both come from the tag's tree):

```sh
curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/v0.5.1/scripts/install.sh | sh -s v0.5.1
```

Rolling latest from `main`: `curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/main/scripts/install.sh | sh`. Either way it detects OS/arch, downloads the release binary, verifies it against the checksum manifest, and installs to `~/.local/bin`. Manual alternative: grab a binary from the [releases](https://github.com/s-a-c/skills-ui/releases) (darwin-arm64 · darwin-x64 · linux-x64 · linux-arm64), `chmod +x`, put it on your `PATH` (macOS browser downloads also need `xattr -d com.apple.quarantine <file>`).

Requires the stock `skills` CLI v1.7.x on `PATH` (or point `SKILLS_UI_SKILLS_BIN` at it).

```sh
skills-ui               # terminal UI (OpenTUI)
skills-ui --web         # local web UI (opens the browser)
skills-ui serve         # headless HTTP API on 127.0.0.1
skills-ui --selftest    # in-memory smoke check — no TTY needed
```

## Highlights

- Wraps the **stock** `skills` CLI via subprocess — nothing bundled, nothing forked.
- Rich terminal UI: markdown, images, 3D graph view, synthesized audio, catppuccin theming.
- Headless `serve` API on loopback for scripting.
- A **hosted zero-install web UI** shipped in 0.5.x — open **[s-a-c.github.io/skills-ui/app.html](https://s-a-c.github.io/skills-ui/app.html)**, run `skills-ui serve`, paste the URL + token. See the [roadmap](https://github.com/s-a-c/skills-ui/blob/main/ROADMAP.md).

## Repo & agent conventions

- [Issue tracker (Linear)]({{ site.baseurl }}/agents/issue-tracker.html)
- [Triage labels]({{ site.baseurl }}/agents/triage-labels.html)
- [Domain docs]({{ site.baseurl }}/agents/domain.html)
