# pty-smoke

Real-terminal smoke checks for the skills-ui TUI (S-95). The in-memory
bun test renderer is not faithful to the real one — this harness forks
the app in a pty, drives it with keys, and asserts screen-row positions
via [pyte](https://github.com/selectel/pyte).

## Run

From any cwd:

```sh
bun run pty-smoke        # or: uv run --with pyte python scripts/pty-smoke/smoke.py
```

Drives `bun run src/main.ts` against the fixture CLI (`bin/skills` on
PATH — env-proof) with a 120-skill global list and checks the S-87/S-88
flows: frame integrity, the short→long `g` jump, live filter title,
END/HOME selection follow, and the space/check path.

## Files

- `runner.py` — PtyApp: pty fork + pyte screen + paced `send`/`read`/`find`
- `smoke.py` — the checks (exit 1 with a FAIL list, or `SMOKE PASS`)
- `skills-smoke-bin.ts` — minimal `skills` CLI over the fixtures
- `bin/skills` — PATH shim exec'ing the smoke bin
- `fixtures/` — 120-skill global list, 2-skill project list

## Hard-won gotchas (do not rediscover)

1. **`os.execv` ignores your env dict.** Building `env = {...}` and then
   calling `os.execv(path, args)` silently drops it — use
   `os.execvpe(path, args, env)`. This exact bug produced a false
   "the renderer scrubs `process.env`" theory that cost hours (S-95).
   Symptom to remember: env overrides "not applying" in a pty child.
2. **Pace keys.** Rapid sends get dropped by the input parser — one key
   per `send()` with a settle, and expect occasional drops anyway.
3. **Set the winsize** (`TIOCSWINSZ`) right after `pty.fork`, or the app
   lays out against a default-size terminal.
4. **Pin the cwd** of the child (relative `src/main.ts` resolves from it).
5. **Escape sequences**: END is `\x1b[F`, HOME `\x1b[H`, PgDn `\x1b[6~`.
   A bare `\x1b` needs a settle before the next key or they merge.
6. Filter text **survives ESC by contract** (ESC exits filter mode, keeps
   the text) — clear it with backspaces if a check needs the full list.
