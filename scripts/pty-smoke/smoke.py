#!/usr/bin/env python3
"""skills-ui pty smoke (S-95): the S-87/S-88 flows against a real terminal.

Runs the app from source (bun run src/main.ts) through the skills-shim
fixture (120-skill global list) and asserts screen-row positions with
pyte. The in-memory bun test renderer cannot catch this class of bug.

Usage (from any cwd):
    uv run --with pyte python scripts/pty-smoke/smoke.py
or add pyte to your python and: python3 scripts/pty-smoke/smoke.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from runner import PtyApp

FAILURES = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}{(' — ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(name)


def main():
    app = PtyApp()
    try:
        app.read(5.0)  # startup, project scope

        # 1. frame integrity at startup: header top, footer bottom,
        #    list pane bordered with the filter hint in its title (S-88)
        check("startup: header at row 0", app.find("❯ Installed") == 0)
        check("startup: footer at bottom row", app.find("q quit") == app.rows - 1)
        check("startup: filter hint in list title", app.find("f filter") >= 0)

        # 2. g-jump: short project list -> 120-row global list in one
        #    render; nothing overlays, rows land inside the border (S-87/88)
        app.send("g", settle=3.0)
        check("g: border title carries the count", app.find("120 skills") == 1, f"row={app.find('120 skills')}")
        check("g: header still at row 0", app.find("❯ Installed") == 0)
        check("g: footer still at bottom", app.find("q quit") == app.rows - 1)
        check("g: first list row inside the border", app.find("❯ skill-001") == 2, f"row={app.find('❯ skill-001')}")
        check("g: no stale busy text", app.find("loading skills") == -1)

        # 3. selection follow: END lands the last row at the window bottom
        #    (before the filter section — filter text survives ESC by contract)
        app.send("\x1b[F", settle=2.5)  # END
        end_row = app.find("❯ skill-120")
        check("END: cursor on the last skill, visible", 0 < end_row < app.rows - 1, f"row={end_row}")
        app.send("\x1b[H", settle=2.5)  # HOME
        check("HOME: back to the first skill", app.find("❯ skill-001") >= 0)

        # 5. mouse (S-98): click a list row — SGR rows are 1-based, so
        #    row 6 = 0-based y 5 = list index 3 -> skill-004
        app.send("\x1b[<0;10;6M", settle=0.6)   # SGR press
        app.send("\x1b[<0;10;6m", settle=2.0)   # SGR release
        check("click: cursor moved to the clicked row", app.find("❯ skill-004") >= 0, f"row={app.find('❯ skill-004')}")
        app.send("\x1b[<0;60;10M", settle=0.6)
        app.send("\x1b[<0;60;10m", settle=2.0)
        check("click detail: scroll mode entered", app.find("scroll (tab)") >= 0)
        app.send("\t", settle=1.5)  # exit scroll mode for the later checks
        app.send("\x1b[H", settle=1.5)  # HOME back to the top

        # 4. filter typing: the title is the live filter display (S-88)
        app.send("f", settle=1.2)
        app.send("skill-11", settle=2.0)
        check("filter: live text in the title", app.find("filter: skill-11") == 1, f"row={app.find('filter: skill-11')}")
        check("filter: list narrowed", app.find("❯ skill-001") == -1)
        app.send("\x1b", settle=1.5)  # ESC exits, text kept

        # 6. space toggles a check; no console overlay appears (S-88 audio
        # class — smoke runs with sound off, checks the render path only)
        app.send(" ", settle=2.0)
        check("space: check rendered", app.find("✔") >= 0)
        check("space: no error console", app.find("Console") == -1)

        # 7. 3D graph (S-100): G opens the view, esc closes it — real pty,
        #    exercises the lazy @opentui/three load end to end
        app.send("G", settle=3.5)
        graph_row = app.find("graph ·")
        check("G: graph view opens", graph_row >= 0, f"row={graph_row}")
        check("G: no crash console", app.find("TypeError") == -1)
        app.send("\x1b", settle=2.0)
        check("G: esc closes graph", app.find("❯ Installed") == 0)
        app.send("G", settle=2.5)
        check("G: graph reopens (singleton reattach)", app.find("graph ·") >= 0)
        app.send("\x1b", settle=1.5)
    finally:
        app.stop()

    print()
    if FAILURES:
        print(f"SMOKE FAIL — {len(FAILURES)} check(s): {', '.join(FAILURES)}")
        sys.exit(1)
    print("SMOKE PASS — all checks green")


if __name__ == "__main__":
    main()
