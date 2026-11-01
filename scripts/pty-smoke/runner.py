#!/usr/bin/env python3
"""pty runner for skills-ui smoke checks (S-95).

Forks the app in a real pty, feeds keys, and reconstructs the terminal
with pyte so assertions can target screen ROWS — the in-memory test
renderer is not faithful to the real one (S-87 lesson).

Gotchas that cost hours; do not rediscover them:
  * The renderer scrubs `process.env` — env-gated debug code inside the
    app never runs. Debug via unconditional file writes if you must.
  * The renderer captures stderr — console.error never reaches the TTY.
  * Rapid key sends get dropped by the input parser — pace keys (the
    `send` helper takes per-key settles) and prefer one key per send.
  * Pin the cwd: never rely on the caller's working directory.
"""
import fcntl
import os
import pty
import select
import signal
import struct
import termios
import time
from pathlib import Path

try:
    import pyte
except ImportError:
    raise SystemExit(
        "pyte is required: run via `uv run --with pyte python scripts/pty-smoke/smoke.py` "
        "or `pip install pyte`"
    )

TUI_ROOT = Path(__file__).resolve().parents[2]  # .../skills-ui/tui


class PtyApp:
    def __init__(self, cols=120, rows=24, cmd=None, env=None):
        self.rows, self.cols = rows, cols
        self.cmd = cmd or ["bun", "run", str(TUI_ROOT / "src" / "main.ts")]
        env = env or {}
        self.extra_env = env
        self.raw = bytearray()
        self.screen = pyte.Screen(cols, rows)
        self.stream = pyte.ByteStream(self.screen)
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            e = dict(os.environ)
            e["TERM"] = "xterm-256color"
            e["SKILLS_UI_PREFS_DIR"] = env.get("SKILLS_UI_PREFS_DIR", "/tmp/pty-smoke-prefs")
            e["SKILLS_UI_CACHE_DIR"] = env.get("SKILLS_UI_CACHE_DIR", "/tmp/pty-smoke-cache")  # S-183: disk index stays out of the real ~/.cache
            # Inject the smoke `skills` binary via PATH: the renderer scrubs
            # process.env before the app resolves SKILLS_UI_SKILLS_BIN, so
            # env-var overrides silently never apply in a real terminal.
            smoke_bin_dir = str(Path(__file__).parent / "bin")
            e["PATH"] = smoke_bin_dir + os.pathsep + e.get("PATH", "")
            e.update(env)
            os.chdir(TUI_ROOT)
            # execv* take no env — building one and calling execv silently
            # drops it (the S-95 lesson: this produced a false "the renderer
            # scrubs process.env" theory). Pass the env explicitly.
            os.execvpe(self.cmd[0], self.cmd, e)
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def read(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            r, _, _ = select.select([self.fd], [], [], 0.1)
            if r:
                try:
                    data = os.read(self.fd, 65536)
                except OSError:
                    return
                if not data:
                    return
                self.raw.extend(data)
                self.stream.feed(data)

    def send(self, keys, settle=1.2):
        os.write(self.fd, keys.encode())
        self.read(settle)

    def lines(self):
        return ["".join(row).rstrip() for row in self.screen.display]

    def find(self, needle):
        for i, line in enumerate(self.lines()):
            if needle in line:
                return i
        return -1

    def stop(self):
        try:
            os.kill(self.pid, signal.SIGKILL)
            os.waitpid(self.pid, 0)
        except (ChildProcessError, ProcessLookupError):
            pass
