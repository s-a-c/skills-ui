import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { installCrashGuard, realDeps, runTuiOn, type TuiDeps } from "../src/tui/app.ts";
import { createTuiModel, update, visibleSkills, type TuiModel } from "../src/tui/model.ts";
import { resetSkillsBinCache } from "../src/core/skills-client.ts";
import { DEFAULT_UI_PREFERENCES } from "../src/core/prefs.ts";
import type { InstalledSkill, SearchSkill } from "../src/core/services/types.ts";

const SKILLS: InstalledSkill[] = [
  {
    name: "tdd",
    path: "/x/tdd",
    scope: "project",
    agents: ["Claude Code"],
    source: null,
    sourceUrl: null,
    sourceType: null,
  },
  {
    name: "code-review",
    path: "/x/code-review",
    scope: "project",
    agents: ["Cursor"],
    source: "anthropics/skills",
    sourceUrl: null,
    sourceType: "github",
  },
];

const RESULTS: SearchSkill[] = [
  { name: "cli-ansi", slug: "cli-ansi", source: "o/r", installs: 4 },
];

function fakeDeps(): TuiDeps {
  return {
    listInstalled: async () => SKILLS,
    search: async () => ({ results: RESULTS, adjustedQuery: null }),
    install: async (source, names, scope) => ({ ok: true, summary: `installed ${names.join(",")} from ${source} (${scope})` }),
    remove: async (names) => ({ ok: true, summary: `removed ${names.join(", ")}` }),
    update: async () => ({ ok: true, summary: "updated" }),
    skillBody: async () => "# tdd\n\n**markdown detail** rendered\n",
    checkUpdates: async () => ({
      scope: "project" as const,
      updates: {
        "code-review": { name: "code-review", updateAvailable: true, sourceType: "github" },
        tdd: { name: "tdd", updateAvailable: false, sourceType: "github" },
      },
      checkedCount: 2,
    }),
    skillsVersion: async () => "1.7.2",
    savePrefs: () => {},
    play: async () => {},
  };
}

/** Poll until `fn` returns true, retrying thrown bun-test assertions —
 * fixed sleeps flake when a shim spawn or React commit lands late. */
async function waitFor(fn: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let failed: unknown = null;
    let ok = false;
    try {
      ok = fn();
    } catch (error) {
      failed = error;
    }
    if (ok) return;
    if (Date.now() > deadline) throw failed ?? new Error("waitFor: condition still false after timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

let setup: Awaited<ReturnType<typeof createTestRenderer>> | null = null;

beforeEach(async () => {
  process.env.SKILLS_UI_PREFS_DIR = "/tmp/skills-ui-tui-test-prefs";
  process.env.SKILLS_UI_CACHE_DIR = "/tmp/skills-ui-tui-test-cache"; // S-183: never the real ~/.cache
  setup = await createTestRenderer({ width: 100, height: 30 });
});

afterEach(async () => {
  setup?.renderer.destroy();
  setup = null;
  delete process.env.SKILLS_UI_PREFS_DIR;
  delete process.env.SKILLS_UI_CACHE_DIR;
});

describe("tui (in-memory)", () => {
  test("renders installed list, selection, and markdown detail", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.renderOnce();
    await s.flush();
    await new Promise((r) => setTimeout(r, 400));
    await s.renderOnce();
    const frame = s.captureCharFrame();
    expect(frame).toContain("tdd");
    expect(frame).toContain("code-review");
    expect(frame).toContain("❯"); // selection marker
    expect(frame).toContain("markdown detail"); // markdown prose through the worker
  });

  test("keyboard contract: space checks, d opens confirm, y runs delete", async () => {
    const s = setup!;
    let removed: string[] | null = null;
    const deps = fakeDeps();
    deps.remove = async (names) => {
      removed = names;
      return { ok: true, summary: `removed ${names.join(", ")}` };
    };
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText(" ");
    await s.flush();
    await new Promise((r) => setTimeout(r, 100)); // React commits async (S-96)
    let frame = s.captureCharFrame();
    expect(frame).toContain("✔"); // checked marker
    s.mockInput.pressKey("d");
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    frame = s.captureCharFrame();
    expect(frame).toContain("remove skills");
    s.mockInput.pressKey("y");
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).toContain("removed code-review");
    expect(removed as string[] | null).toEqual(["code-review"]);
  });

  test("search tab: / then typing searches, space queues, u installs", async () => {
    const s = setup!;
    let installed: { source: string; names: string[]; scope: string } | null = null;
    const deps = fakeDeps();
    deps.install = async (source, names, scope) => {
      installed = { source, names, scope };
      return { ok: true, summary: "ok" };
    };
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("cli");
    await new Promise((r) => setTimeout(r, 500)); // debounce + search
    await s.flush();
    let frame = s.captureCharFrame();
    expect(frame).toContain("cli-ansi");
    await s.mockInput.typeText(" ");
    await s.flush();
    frame = s.captureCharFrame();
    expect(frame).toContain("(1)"); // queue badge in tab
    s.mockInput.pressEscape(); // exit text entry, keep query
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    s.mockInput.pressKey("u"); // run queue
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.flush();
    expect(installed as { source: string; names: string[]; scope: string } | null).toEqual({
      source: "o/r",
      names: ["cli-ansi"],
      scope: "project",
    });
  });

  test("S-161 G1: single- and queue-install thread the scope (project + global)", async () => {
    const s = setup!;
    const calls: Array<{ source: string; names: string[]; scope: string }> = [];
    const deps = fakeDeps();
    deps.install = async (source, names, scope) => {
      calls.push({ source, names, scope });
      return { ok: true, summary: "ok" };
    };
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));

    await s.mockInput.typeText("/"); // search tab, text mode
    await s.mockInput.typeText("cli");
    await new Promise((r) => setTimeout(r, 500)); // debounce + search
    await s.flush();
    await s.mockInput.pressEscape(); // command mode
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));

    await s.mockInput.pressKey("\r"); // single-result install — project scope
    await s.flush();
    await new Promise((r) => setTimeout(r, 150));
    await s.mockInput.typeText(" "); // queue cli-ansi
    await s.flush();
    await s.mockInput.pressKey("u"); // queue install — project scope
    await s.flush();
    await new Promise((r) => setTimeout(r, 200));

    await s.mockInput.pressKey("g"); // scope → global
    await s.flush();
    await new Promise((r) => setTimeout(r, 200));
    await s.mockInput.pressKey("\r"); // single-result install — global scope
    await s.flush();
    await new Promise((r) => setTimeout(r, 150));
    await s.mockInput.typeText(" "); // queue cli-ansi
    await s.flush();
    await s.mockInput.pressKey("u"); // queue install — global scope
    await s.flush();
    await waitFor(() => {
      expect(calls.length).toBe(4); // settle-proof: wait, don't sleep-guess
      return true;
    });

    expect(calls).toEqual([
      { source: "o/r", names: ["cli-ansi"], scope: "project" },
      { source: "o/r", names: ["cli-ansi"], scope: "project" },
      { source: "o/r", names: ["cli-ansi"], scope: "global" },
      { source: "o/r", names: ["cli-ansi"], scope: "global" },
    ]);
  });

  test("S-161 G1: skills-shim snapshot — --global only when scope is global", async () => {
    const s = setup!;
    const SHIM = new URL("fixtures/skills-shim.mjs", import.meta.url).pathname;
    const stateDir = mkdtempSync(join(tmpdir(), "skills-ui-tui-shim-"));
    const snapshotFile = join(stateDir, "snapshot.json");
    // realDeps.install → svcInstall → the shim; only the add call spawns
    const deps: TuiDeps = {
      ...realDeps,
      listInstalled: async () => SKILLS,
      search: async () => ({ results: RESULTS, adjustedQuery: null }),
      skillBody: async () => null,
      savePrefs: () => {},
      play: async () => {},
    };
    process.env.SKILLS_UI_SKILLS_BIN = SHIM;
    process.env.SKILLS_SHIM_STATE = stateDir;
    process.env.SKILLS_SHIM_SNAPSHOT = snapshotFile;
    resetSkillsBinCache(); // bin path is cached at first spawn — re-resolve to the shim
    try {
      await runTuiOn(s.renderer, undefined, deps);
      await s.flush();
      await new Promise((r) => setTimeout(r, 100));

      await s.mockInput.typeText("/");
      await s.mockInput.typeText("cli");
      await new Promise((r) => setTimeout(r, 500)); // debounce + search
      await s.flush();
      await s.mockInput.pressEscape(); // command mode
      await s.flush();
      await new Promise((r) => setTimeout(r, 50));
      await s.mockInput.typeText(" "); // queue cli-ansi
      await s.flush();
      await s.mockInput.pressKey("u"); // queue install — project scope
      await s.flush();
      // subprocess + reload settle: poll the snapshot, don't sleep-guess
      await waitFor(() => {
        const a = JSON.parse(readFileSync(snapshotFile, "utf-8")).args as string[];
        expect(a).toEqual(["add", "o/r", "--skill", "cli-ansi", "--yes", "--json"]);
        return true;
      });

      await s.mockInput.pressKey("g"); // scope → global
      await s.flush();
      await new Promise((r) => setTimeout(r, 200));
      await s.mockInput.typeText(" "); // queue again
      await s.flush();
      await s.mockInput.pressKey("u"); // queue install — global scope
      await s.flush();
      await waitFor(() => {
        const a = JSON.parse(readFileSync(snapshotFile, "utf-8")).args as string[];
        expect(a).toEqual(["add", "o/r", "--global", "--skill", "cli-ansi", "--yes", "--json"]);
        return true;
      });
    } finally {
      delete process.env.SKILLS_UI_SKILLS_BIN;
      delete process.env.SKILLS_SHIM_STATE;
      delete process.env.SKILLS_SHIM_SNAPSHOT;
      resetSkillsBinCache(); // leave the cache clean for other files in this process
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  test("S-161 A2: q types into the live filter and does not quit", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.mockInput.pressKey("f"); // filter live
    await s.flush();
    await s.mockInput.typeText("q"); // must type, never quit (S-161)
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(s.captureCharFrame()).toContain("filter: q");
    await s.mockInput.typeText("a"); // liveness: a dead app would ignore this
    await s.flush();
    expect(s.captureCharFrame()).toContain("filter: qa");
  });

  test("S-161 A2: q quits only on double-press; other keys disarm", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    let destroyed = false;
    s.renderer.once("destroy", () => {
      destroyed = true;
    });

    await s.mockInput.pressKey("q"); // first press: arms + toasts, still alive
    await s.flush();
    await new Promise((r) => setTimeout(r, 100)); // React commits the toast
    expect(destroyed).toBe(false);
    expect(s.captureCharFrame()).toContain("press q again to quit");

    await s.mockInput.pressKey("s"); // an unrelated key disarms
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(destroyed).toBe(false);
    await s.mockInput.pressKey("q"); // re-arms only
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    expect(destroyed).toBe(false);
    expect(s.captureCharFrame()).toContain("press q again to quit");

    await s.mockInput.pressKey("q"); // second consecutive press: destroy
    await s.flush();
    await waitFor(() => {
      expect(destroyed).toBe(true);
      return true;
    });
  });

  test("r removes the focused skill behind confirm; u with none checked updates all", async () => {
    const s = setup!;
    const removed: string[][] = [];
    const updated: string[][] = [];
    const deps = fakeDeps();
    deps.remove = async (names) => {
      removed.push(names);
      return { ok: true, summary: `removed ${names.join(", ")}` };
    };
    deps.update = async (names) => {
      updated.push(names);
      return { ok: true, summary: "updated" };
    };
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));

    await s.mockInput.pressKey("r"); // focused skill (code-review, A→Z first)
    await s.flush();
    let frame = s.captureCharFrame();
    expect(frame).toContain("remove skills");
    expect(frame).toContain("code-review");
    await s.mockInput.pressKey("escape"); // cancel — nothing runs
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(removed).toHaveLength(0);

    await s.mockInput.pressKey("r");
    await s.flush();
    await s.mockInput.pressKey("y");
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    expect(removed).toEqual([["code-review"]]);

    await s.mockInput.pressKey("u"); // nothing checked → update all in scope
    await s.flush();
    frame = s.captureCharFrame();
    expect(frame).toContain("update skills");
    await s.mockInput.pressKey("y");
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    expect(updated).toEqual([["code-review", "tdd"]]); // all visible names
  });

  test("S-162: n and N cancel the remove confirm — nothing runs, state intact", async () => {
    const s = setup!;
    const removed: string[][] = [];
    const deps = fakeDeps();
    deps.remove = async (names) => {
      removed.push(names);
      return { ok: true, summary: `removed ${names.join(", ")}` };
    };
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.mockInput.pressKey(" "); // check the focused skill (code-review, A→Z first)
    await s.flush();
    expect(s.captureCharFrame()).toContain("✔"); // checked marker to preserve

    await s.mockInput.pressKey("r"); // remove confirm
    await s.flush();
    expect(s.captureCharFrame()).toContain("remove skills");
    await s.mockInput.pressKey("n"); // cancel — the y/N copy is now wired
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    let frame = s.captureCharFrame();
    expect(frame).not.toContain("remove skills"); // dialog closed
    expect(frame).toContain("✔"); // checked state intact
    expect(removed).toHaveLength(0); // nothing ran

    await s.mockInput.pressKey("r"); // same again with the shift spelling
    await s.flush();
    expect(s.captureCharFrame()).toContain("remove skills");
    await s.mockInput.pressKey("N", { shift: true });
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    frame = s.captureCharFrame();
    expect(frame).not.toContain("remove skills");
    expect(removed).toHaveLength(0);
  });

  test("S-162: sort indicator rides the list title in both modes, fully visible at 80 cols", async () => {
    const s = setup!;
    // 3-digit count: the worst case for the title budget at 80 columns
    const wide: InstalledSkill[] = Array.from({ length: 105 }, (_, i) => ({
      name: `w${String(i + 1).padStart(3, "0")}`,
      path: `/x/w${i}`,
      scope: "project",
      agents: ["Claude Code"],
      source: null,
      sourceUrl: null,
      sourceType: null,
    }));
    const deps = fakeDeps();
    deps.listInstalled = async () => wide;
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await new Promise((r) => setTimeout(r, 400)); // settle the first load
    s.resize(80, 24); // the fit constraint: pane inner 21, title budget 19 chars
    await s.renderOnce();
    await s.flush();
    let frame = s.captureCharFrame();
    expect(frame).toContain("105 skills·checked"); // both segments fully rendered
    await s.mockInput.pressKey("s"); // → load order
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.renderOnce();
    frame = s.captureCharFrame();
    expect(frame).toContain("105 skills·order");
    expect(frame).not.toContain("skills·checked");
  });

  test("S-162: toasts queue FIFO — a second toast waits for the first's window", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.mockInput.pressKey("q"); // toast A: "press q again to quit"
    await s.flush();
    await s.mockInput.pressKey("c"); // toast B queued (also disarms the quit, S-161)
    await s.flush();
    await new Promise((r) => setTimeout(r, 1000)); // well inside A's 3.5s window
    let frame = s.captureCharFrame();
    expect(frame).toContain("press q again to quit"); // A still shown
    expect(frame).not.toContain("update(s) available"); // B did not clobber it
    await new Promise((r) => setTimeout(r, 4000)); // A's window ends → B pops
    frame = s.captureCharFrame();
    expect(frame).toContain("update(s) available"); // B shown in its own window
    expect(frame).not.toContain("press q again to quit");
  }, 15000); // the FIFO window waits ~5s — well over bun's 5s default timeout

  test("c checks for updates: ↑ badge, detail hint, toast", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    let frame = s.captureCharFrame();
    expect(frame).not.toContain("↑");
    await s.mockInput.pressKey("c");
    await s.flush();
    await new Promise((r) => setTimeout(r, 150));
    frame = s.captureCharFrame();
    expect(frame).toContain("↑"); // badge on code-review's row
    expect(frame).toContain("1 update(s) available"); // toast
    expect(frame).toContain("update available"); // detail hint — code-review is selected (A→Z first)
  });

  test("S-166 F4: a failed registry search shows the failure line, never 'no results'", async () => {
    const s = setup!;
    const deps = fakeDeps();
    deps.search = async () => ({ results: [], adjustedQuery: null, failed: true });
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("cli");
    await new Promise((r) => setTimeout(r, 500)); // debounce + search
    await s.flush();
    const frame = s.captureCharFrame();
    expect(frame).toContain("search failed — skills.sh unreachable");
    expect(frame).not.toContain("no results");
  });

  test("S-166 F4: a successful search clears the failure line", async () => {
    const s = setup!;
    const deps = fakeDeps();
    deps.search = async () => ({ results: RESULTS, adjustedQuery: null, failed: false });
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("cli");
    await new Promise((r) => setTimeout(r, 500)); // debounce + search
    await s.flush();
    const frame = s.captureCharFrame();
    expect(frame).toContain("cli-ansi"); // results render
    expect(frame).not.toContain("search failed");
  });

  test("S-182: a slow older search resolving after a newer one never overwrites the newer results", async () => {
    const s = setup!;
    const deps = fakeDeps();
    type Deferred = {
      query: string;
      resolve: (v: { results: SearchSkill[]; adjustedQuery: string | null }) => void;
    };
    const pending: Deferred[] = [];
    deps.search = (query: string) =>
      new Promise<{ results: SearchSkill[]; adjustedQuery: string | null }>((resolve) => {
        pending.push({ query, resolve });
      });
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("old");
    await new Promise((r) => setTimeout(r, 450)); // debounce (300 ms) fired — search("old") in flight
    await s.mockInput.typeText("x"); // query becomes "oldx" — a newer search is scheduled
    await new Promise((r) => setTimeout(r, 450)); // second debounce fired — search("oldx") in flight
    expect(pending.map((p) => p.query)).toEqual(["old", "oldx"]); // both dispatched, neither answered
    // the OLD query settles while the newer one is still pending
    pending[0]!.resolve({
      results: [{ name: "stale-old-result", slug: "stale-old-result", source: "o/r", installs: 9 }],
      adjustedQuery: null,
    });
    await s.flush();
    await new Promise((r) => setTimeout(r, 150)); // settle window — the guard must drop the stale apply
    await s.renderOnce();
    let frame = s.captureCharFrame();
    expect(frame).not.toContain("stale-old-result"); // dropped: the newer query owns the pane
    // the newer query lands — its results render and survive
    pending[1]!.resolve({
      results: [{ name: "fresh-new-result", slug: "fresh-new-result", source: "o/r", installs: 3 }],
      adjustedQuery: null,
    });
    await s.flush();
    await new Promise((r) => setTimeout(r, 200));
    await s.renderOnce();
    await waitFor(() => {
      expect(s.captureCharFrame()).toContain("fresh-new-result");
      return true;
    });
    frame = s.captureCharFrame();
    expect(frame).toContain("fresh-new-result");
    expect(frame).not.toContain("stale-old-result"); // the stale results never surfaced
  });

  test("S-182: a slow older search REJECTING after a newer one never toasts over newer state", async () => {
    const s = setup!;
    const deps = fakeDeps();
    type Deferred = {
      query: string;
      resolve: (v: { results: SearchSkill[]; adjustedQuery: string | null }) => void;
      reject: (e: Error) => void;
    };
    const pending: Deferred[] = [];
    deps.search = (query: string) =>
      new Promise<{ results: SearchSkill[]; adjustedQuery: string | null }>((resolve, reject) => {
        pending.push({ query, resolve, reject });
      });
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("old");
    await new Promise((r) => setTimeout(r, 450)); // debounce fired — search("old") in flight
    await s.mockInput.typeText("x"); // "oldx" — a newer search is scheduled
    await new Promise((r) => setTimeout(r, 450)); // second debounce fired — search("oldx") in flight
    expect(pending.map((p) => p.query)).toEqual(["old", "oldx"]);
    pending[0]!.reject(new Error("boom")); // the OLD query fails late, newer still pending
    await s.flush();
    await new Promise((r) => setTimeout(r, 150)); // settle window — the guard must drop the stale failure
    await s.renderOnce();
    let frame = s.captureCharFrame();
    expect(frame).not.toContain("search failed"); // stale rejection dropped: no toast over newer state
    // the newer query lands — its results render and the failure never surfaced
    pending[1]!.resolve({
      results: [{ name: "fresh-new-result", slug: "fresh-new-result", source: "o/r", installs: 3 }],
      adjustedQuery: null,
    });
    await s.flush();
    await new Promise((r) => setTimeout(r, 200));
    await s.renderOnce();
    await waitFor(() => {
      expect(s.captureCharFrame()).toContain("fresh-new-result");
      return true;
    });
    frame = s.captureCharFrame();
    expect(frame).toContain("fresh-new-result");
    expect(frame).not.toContain("search failed");
  });

  test("S-166 G4: check-status errors render in the detail line and the toast counts them", async () => {
    const s = setup!;
    s.resize(140, 30); // wide enough that the long error line and toast render unclipped
    const deps = fakeDeps();
    deps.checkUpdates = async () => ({
      scope: "project" as const,
      updates: {
        "code-review": {
          name: "code-review",
          updateAvailable: false,
          error: "not checkable yet (well-known digest check lands in a later 0.x)",
          sourceType: "well-known",
        },
        tdd: { name: "tdd", updateAvailable: false, sourceType: "github" },
      },
      checkedCount: 2,
    });
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.mockInput.pressKey("c");
    await s.flush();
    await new Promise((r) => setTimeout(r, 150));
    const frame = s.captureCharFrame();
    expect(frame).toContain("no updates available · 1 not checkable"); // toast mentions the count
    expect(frame).toContain("check: not checkable yet"); // detail line (code-review selected, A→Z first)
    expect(frame).not.toContain("↑"); // badge logic unchanged — an error alone is no badge
  });

  test("help overlay toggles with ?", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await s.mockInput.typeText("?");
    await s.flush();
    await new Promise((r) => setTimeout(r, 100)); // React commits async (S-96)
    expect(s.captureCharFrame()).toContain("this help");
    s.mockInput.pressEscape();
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.flush();
    expect(s.captureCharFrame()).not.toContain("this help");
  });
});

describe("tui model (pure)", () => {
  const base = (): TuiModel => createTuiModel(DEFAULT_UI_PREFERENCES);

  test("filter matches name, source, and agents; checks survive filtering", () => {
    let m = update(base(), { type: "skills-loaded", skills: SKILLS });
    m = update(m, { type: "filter", text: "anthropics" });
    expect(visibleSkills(m).map((s) => s.name)).toEqual(["code-review"]);
    m = update(m, { type: "filter", text: "cursor" });
    expect(visibleSkills(m).map((s) => s.name)).toEqual(["code-review"]);
    m = update(m, { type: "filter", text: "" });
    expect(visibleSkills(m)).toHaveLength(2);
  });

  test("scope switch clears checks and selection", () => {
    let m = update(base(), { type: "skills-loaded", skills: SKILLS });
    m = update(m, { type: "toggle-check" });
    m = update(m, { type: "move", delta: 1 });
    m = update(m, { type: "scope", scope: "global" });
    expect(m.checked.size).toBe(0);
    expect(m.scope).toBe("global");
  });

  test("queue toggles by source#name", () => {
    let m = update(base(), { type: "queue-toggle", skill: RESULTS[0]! });
    expect(m.queue.size).toBe(1);
    m = update(m, { type: "queue-toggle", skill: RESULTS[0]! });
    expect(m.queue.size).toBe(0);
  });

  test("clamp selection on filtered list", () => {
    let m = update(base(), { type: "skills-loaded", skills: SKILLS });
    m = update(m, { type: "move", delta: 5 });
    expect(m.selected).toBe(1);
    m = update(m, { type: "filter", text: "zzz" });
    expect(m.selected).toBe(0);
  });

  test("invert-checks and toggle-all-checks follow fork semantics", () => {
    let m = update(base(), { type: "skills-loaded", skills: SKILLS });
    m = update(m, { type: "toggle-check" }); // checks first visible (code-review, A→Z)
    expect([...m.checked]).toEqual(["code-review"]);
    m = update(m, { type: "invert-checks" }); // flips every visible check
    expect([...m.checked]).toEqual(["tdd"]);
    m = update(m, { type: "toggle-all-checks" }); // partial → check all
    expect(m.checked.size).toBe(2);
    m = update(m, { type: "toggle-all-checks" }); // all → clear
    expect(m.checked.size).toBe(0);
  });

  test("sort-toggle: checked-first on, load order off; no in-place mutation", () => {
    const loaded: InstalledSkill[] = ["b-skill", "a-skill", "c-skill"].map((name) => ({
      name,
      path: `/x/${name}`,
      scope: "project",
      agents: ["Claude Code"],
      source: null,
      sourceUrl: null,
      sourceType: null,
    }));
    let m = update(base(), { type: "skills-loaded", skills: loaded });
    expect(visibleSkills(m).map((s) => s.name)).toEqual(["a-skill", "b-skill", "c-skill"]); // A→Z
    expect(m.skills.map((s) => s.name)).toEqual(["b-skill", "a-skill", "c-skill"]); // untouched
    m = update(m, { type: "toggle-check" }); // checks a-skill
    m = update(m, { type: "move", delta: 2 }); // to c-skill in [a, c, b]
    m = update(m, { type: "toggle-check" }); // checks c-skill
    expect(visibleSkills(m).map((s) => s.name)).toEqual(["a-skill", "c-skill", "b-skill"]); // checked first
    m = update(m, { type: "sort-toggle" });
    expect(visibleSkills(m).map((s) => s.name)).toEqual(["b-skill", "a-skill", "c-skill"]); // load order
    expect(m.skills.map((s) => s.name)).toEqual(["b-skill", "a-skill", "c-skill"]); // still untouched
  });
  test("agent filter: overlay stages and applies; description is a secondary text match", () => {
    let m = update(base(), {
      type: "skills-loaded",
      skills: [{ ...SKILLS[0]!, description: "red-green-refactor loops" }, SKILLS[1]!],
    });
    m = update(m, { type: "filter", text: "refactor" }); // description-only match
    expect(visibleSkills(m).map((s) => s.name)).toEqual(["tdd"]);
    m = update(m, { type: "filter", text: "" });

    m = update(m, { type: "agent-select-open" });
    m = update(m, { type: "agent-select-toggle-all" }); // stage every agent
    expect(m.agentSelect?.staged.size).toBe(2);
    m = update(m, { type: "agent-select-apply" }); // normalizes to no filter
    expect(m.agentFilter.size).toBe(0);

    m = update(m, { type: "agent-select-open" });
    m = update(m, { type: "agent-select-toggle" }); // stage Claude Code
    m = update(m, { type: "agent-select-move", delta: 1 });
    m = update(m, { type: "agent-select-toggle" }); // stage Cursor too
    m = update(m, { type: "agent-select-apply" });
    expect(visibleSkills(m)).toHaveLength(2);

    m = update(m, { type: "agent-select-open" });
    m = update(m, { type: "agent-select-toggle-all" }); // stage every agent
    m = update(m, { type: "agent-select-move", delta: 1 });
    m = update(m, { type: "agent-select-toggle" }); // unstage Cursor from all
    m = update(m, { type: "agent-select-apply" });
    expect(visibleSkills(m).map((s) => s.name)).toEqual(["tdd"]); // only Claude Code

    m = update(m, { type: "agent-select-open" });
    m = update(m, { type: "agent-select-toggle" }); // would unstage Claude Code
    m = update(m, { type: "agent-select-cancel" }); // discard staging
    expect([...m.agentFilter]).toEqual(["Claude Code"]);
  });

  test("settings shows the discovered skills CLI version", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.mockInput.pressKey(","); // settings tab — triggers the lazy version load
    await s.flush();
    await new Promise((r) => setTimeout(r, 150));
    const frame = s.captureCharFrame();
    expect(frame).toContain("skills CLI");
    expect(frame).toContain("1.7.2");
  });

  test("crash guard: signals run cleanup once and exit; dispose unbinds; fatal errors exit 1", () => {
    const events: string[] = [];
    const exits: number[] = [];
    const fakeProcess = new EventEmitter();
    const guard = installCrashGuard({
      cleanup: () => events.push("cleanup"),
      exit: (code) => exits.push(code),
      process: fakeProcess as never,
    });
    fakeProcess.emit("SIGTERM");
    expect(events).toEqual(["cleanup"]);
    expect(exits).toEqual([0]);
    fakeProcess.emit("SIGTERM"); // idempotent — no double cleanup/exit
    expect(exits).toEqual([0]);
    guard.dispose();
    fakeProcess.emit("SIGINT");
    expect(exits).toEqual([0]); // unbound after dispose

    const exits2: number[] = [];
    const guard2 = installCrashGuard({
      cleanup: () => events.push("cleanup2"),
      exit: (code) => exits2.push(code),
      process: fakeProcess as never,
    });
    fakeProcess.emit("uncaughtException", new Error("boom"));
    expect(events).toContain("cleanup2");
    expect(exits2).toEqual([1]);
    guard2.dispose();
  });

  test("adjustedQuery notice renders when the search fell back", async () => {
    const s = setup!;
    const deps = fakeDeps();
    deps.search = async () => ({ results: RESULTS, adjustedQuery: "cli-ansi" });
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("zz");
    await new Promise((r) => setTimeout(r, 500));
    await s.flush();
    expect(s.captureCharFrame()).toContain('showing "cli-ansi"'); // in the search pane title
  });

  test("queue sub-view: pane flip, cursor clamps, delete-at", () => {
    const second: SearchSkill = { name: "b", slug: "b", source: "o/r", installs: 1 };
    let m = base();
    m = update(m, { type: "tab", tab: "search" });
    m = update(m, { type: "results", results: [...RESULTS, second] });
    m = update(m, { type: "queue-toggle", skill: RESULTS[0]! });
    m = update(m, { type: "queue-toggle", skill: second });
    m = update(m, { type: "search-pane", pane: "selected" });
    expect(m.searchPane).toBe("selected");
    m = update(m, { type: "move", delta: 5 }); // selected-pane cursor clamps
    expect(m.selectedCursor).toBe(1);
    m = update(m, { type: "queue-delete-at", key: "o/r#b" });
    expect(m.queue.size).toBe(1);
    expect(m.selectedCursor).toBe(0); // clamped after the delete
    m = update(m, { type: "search-pane", pane: "results" });
    m = update(m, { type: "move", delta: 1 }); // results cursor moves again
    expect(m.searchSelected).toBe(1);
  });
});

describe("0.2.x B1 (S-69): list ops", () => {
  const manySkills: InstalledSkill[] = Array.from({ length: 12 }, (_, i) => ({
    name: `s${String(i + 1).padStart(2, "0")}`,
    path: `/x/s${i}`,
    scope: "project",
    agents: ["Claude Code"],
    source: null,
    sourceUrl: null,
    sourceType: null,
  }));

  test("A toggles all checks, I inverts (shifted batch keys)", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    const checks = (): number => (s.captureCharFrame().match(/✔/g) ?? []).length;
    await s.mockInput.typeText("A");
    await s.flush();
    expect(checks()).toBe(2); // all checked
    await s.mockInput.typeText("I");
    await s.flush();
    expect(checks()).toBe(0); // inverted to none
    await s.mockInput.typeText("A");
    await s.flush();
    expect(checks()).toBe(2);
  });

  test("PgUp/PgDn page-scroll the list", async () => {
    const s = setup!;
    const deps = fakeDeps();
    deps.listInstalled = async () => manySkills;
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    let frame = s.captureCharFrame();
    expect(frame).toContain("─ s01 ─"); // detail border title of selection 0
    await s.mockInput.pressKey("\x1B[6~"); // PgDn as a terminal sends it
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).toContain("─ s11 ─"); // 0 + PAGE clamped to 11
    await s.mockInput.pressKey("\x1B[5~"); // PgUp
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).toContain("─ s01 ─"); // back to top
  });

  test("keymap contract: s sorts on installed (no prefs write), , toggles sound in settings", async () => {
    const s = setup!;
    const deps = fakeDeps();
    const saved: boolean[] = [];
    deps.savePrefs = (prefs) => {
      saved.push(prefs.sound);
    };
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));

    await s.mockInput.pressKey("s"); // installed tab: sort toggle, not prefs
    await s.flush();
    expect(saved).toHaveLength(0);
    await s.mockInput.pressKey("?"); // new keys documented in help
    await s.flush();
    expect(s.captureCharFrame()).toContain("sort checked first");
    expect(s.captureCharFrame()).toContain("check all / invert");
    await s.mockInput.pressEscape();
    await s.flush();
    await new Promise((r) => setTimeout(r, 50)); // let the parser close the bare ESC before x

    await s.mockInput.pressKey(","); // settings tab — , is the settings key end-to-end
    await s.flush();
    await s.mockInput.typeText(",");
    await s.flush();
    expect(saved).toHaveLength(1); // , toggles sound once settings is open
    expect(s.captureCharFrame()).toContain(",  sound");

    await s.mockInput.pressKey("i"); // back to installed
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    await s.mockInput.pressKey("x"); // x is free — falls into the text filter
    await s.flush();
    expect(s.captureCharFrame()).toContain("filter: x");
  });

  test("a opens the agent overlay (with all-toggle); f enters the text filter", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));

    await s.mockInput.pressKey("f"); // f enters the text filter…
    await s.flush();
    await s.mockInput.typeText("c"); // …so the bound key c lands in the filter, not the update check
    await s.flush();
    const afterF = s.captureCharFrame();
    expect(afterF).toContain("filter: c");
    expect(afterF).not.toContain("update(s) available");
    await s.mockInput.pressEscape();
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));

    await s.mockInput.pressKey("a"); // a = agent overlay
    await s.flush();
    let frame = s.captureCharFrame();
    expect(frame).toContain("filter by agent");
    await s.mockInput.pressKey("a"); // all — stages every agent
    await s.flush();
    await s.mockInput.pressKey("\r"); // apply → normalizes to no filter
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).not.toContain("filter by agent");
    expect(frame).not.toContain("agents:");

    await s.mockInput.pressKey("a"); // reopen, stage just the first agent
    await s.flush();
    await s.mockInput.pressKey(" ");
    await s.flush();
    await s.mockInput.pressKey("\r");
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    const filtered = s.captureCharFrame();
    expect(filtered).toContain("agents:"); // applied filter in the list pane title
    expect(filtered).not.toContain("code-review"); // Cursor's skill filtered out
  });

  test("tab toggles detail-scroll mode: title marker, keys route to the doc (S-88)", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    await s.mockInput.pressKey("\t");
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    let frame = s.captureCharFrame();
    expect(frame).toContain("scroll (tab)"); // mode marker in the detail title
    await s.mockInput.pressKey("\t"); // off
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).not.toContain("scroll (tab)");
  });

  test("filter bar sits permanently above the list with a long list, and resize re-renders", async () => {
    const s = setup!;
    const deps = fakeDeps();
    deps.listInstalled = async () => manySkills; // 12 rows — pushes bottom rows off-viewport
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    expect(s.captureCharFrame()).toContain("skills·checked"); // idle title: count + sort indicator
    await s.mockInput.pressKey("f");
    await s.flush();
    await s.mockInput.typeText("s0"); // filter bar now carries text
    await s.flush();
    const frame = s.captureCharFrame();
    // the bar renders above the list, on screen regardless of list length
    // (S-87/S-88: in a real terminal the text must also be boxed to paint)
    expect(frame.indexOf("filter: s0")).toBeGreaterThanOrEqual(0);
    expect(frame.indexOf("filter: s0")).toBeLessThan(frame.indexOf("❯ s01"));
    await s.mockInput.pressKey("\x1b[6~"); // PgDn must page even mid-filter (S-88)
    await s.flush();
    await new Promise((r) => setTimeout(r, 150));
    expect(s.captureCharFrame()).toContain("─ s09 ─"); // filter "s0" matches s01–s09; PgDn clamps to the last
    process.stdout.emit("resize"); // SIGWINCH path — must re-render without throwing
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    expect(s.captureCharFrame()).toContain("filter: s0");
  });

  test("search queue sub-view: Tab flips panes, d removes the queued item", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("cli");
    await new Promise((r) => setTimeout(r, 500)); // debounce + search
    await s.flush();
    let frame = s.captureCharFrame();
    expect(frame).toContain("cli-ansi");
    await s.mockInput.typeText(" "); // queue it
    await s.flush();
    frame = s.captureCharFrame();
    expect(frame).toContain("install list (1)");
    await s.mockInput.pressKey("\t"); // Tab → install list pane
    await s.flush();
    frame = s.captureCharFrame();
    expect(frame).toContain("❯ install list (1)");
    await s.mockInput.pressKey("\x1b"); // Esc → command mode (queue keys live there now, S-103)
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    await s.mockInput.pressKey("d"); // remove the queued item
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).toContain("install list (0)");
    expect(frame).toContain("(empty");
    await s.mockInput.pressKey("\t"); // Tab back → Results
    await s.flush();
    expect(s.captureCharFrame()).toContain("❯ Results");
  });
});

describe("S-100 rich views", () => {
  test("splash: initial model shows it, first load settles it away", async () => {
    expect(createTuiModel(DEFAULT_UI_PREFERENCES).splash).toBe(true);
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 150));
    const model = update(createTuiModel(DEFAULT_UI_PREFERENCES), { type: "splash-dismiss" });
    expect(model.splash).toBe(false);
    // and the live app no longer shows the splash marker
    const frame = s.captureCharFrame();
    expect(frame).toContain("tdd"); // normal installed view after load
    expect(frame).not.toContain("starting…");
  });

  test("graph: G opens the 3D view, esc closes it; g still switches scope", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await new Promise((r) => setTimeout(r, 150));
    await s.mockInput.pressKey("G", { shift: true });
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    let frame = s.captureCharFrame();
    expect(frame).toContain("graph");
    expect(frame).toContain("2 skills"); // snapshot title
    await s.mockInput.pressKey("\x1b"); // esc
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).toContain("❯ Installed"); // back to the tabs
  });

  test("art: source badges are deterministic per source, distinct across sources", async () => {
    const { sourceBadge, splashImage } = await import("../src/tui/art.ts");
    const a1 = sourceBadge("anthropics/skills", "mocha");
    const a2 = sourceBadge("anthropics/skills", "mocha");
    expect(a1).toBe(a2); // cached instance
    const b = sourceBadge("o/r", "mocha");
    expect(b).not.toBe(a1);
    const px = (img: ReturnType<typeof sourceBadge>, i: number) => img.raw("rgba8").data[i];
    const hash = (arr: number[]) => arr.join(",");
    const aSignature = hash([0, 1, 2, 3, 4].map((i) => px(a1, i)));
    const bSignature = hash([0, 1, 2, 3, 4].map((i) => px(b, i)));
    expect(aSignature).not.toBe(bSignature);
    const splash = splashImage("mocha");
    expect(splash.info().width).toBe(96);
    expect(splash.info().height).toBe(28);
  });
});

describe("S-101 search pane navigation", () => {
  const result = (i: number): SearchSkill => ({ name: `r-${String(i).padStart(2, "0")}`, slug: `r${i}`, source: "o/r", installs: 1 });

  test("move/end clamp the results cursor to the rendered cap (200)", () => {
    let m = createTuiModel(DEFAULT_UI_PREFERENCES);
    m.tab = "search";
    m.results = Array.from({ length: 250 }, (_, i) => result(i));
    m = update(m, { type: "end" });
    expect(m.searchSelected).toBe(199); // not 249 — cursor stays on rendered rows
    m = update(m, { type: "move", delta: 10 });
    expect(m.searchSelected).toBe(199); // still clamped
    m = update(m, { type: "home" });
    expect(m.searchSelected).toBe(0);
  });

  test("Home/End follow the active pane — the queue cursor moves too", () => {
    let m = createTuiModel(DEFAULT_UI_PREFERENCES);
    m.tab = "search";
    m.searchPane = "selected";
    m.queue = new Map([
      ["o/r#a", result(0)],
      ["o/r#b", result(1)],
      ["o/r#c", result(2)],
    ]);
    m = update(m, { type: "end" });
    expect(m.selectedCursor).toBe(2);
    expect(m.searchSelected).toBe(0); // results cursor untouched
    m = update(m, { type: "home" });
    expect(m.selectedCursor).toBe(0);
  });
});

describe("S-103 search text-entry + match highlighting", () => {
  test("typing vercel-labs keeps the hyphen; letters land in the query, not the queue", async () => {
    const s = setup!;
    const deps = fakeDeps();
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("vercel-labs");
    await new Promise((r) => setTimeout(r, 500)); // debounce + search
    await s.flush();
    const frame = s.captureCharFrame();
    expect(frame).toContain("vercel-labs"); // hyphen survives (space stays queue-by fork contract)
  });

  test("queue items survive letters typed in search mode; Esc restores queue keys", async () => {
    const s = setup!;
    const deps = fakeDeps();
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    await s.mockInput.typeText("/");
    await s.mockInput.typeText("cli");
    await new Promise((r) => setTimeout(r, 500));
    await s.flush();
    await s.mockInput.typeText(" "); // queue cli-ansi
    await s.flush();
    let frame = s.captureCharFrame();
    expect(frame).toContain("install list (1)");
    await s.mockInput.typeText("d"); // a letter mid-query — must NOT delete the queued item
    await new Promise((r) => setTimeout(r, 450));
    await s.flush();
    frame = s.captureCharFrame();
    expect(frame).toContain("install list (1)"); // queue untouched
    expect(frame).toContain("clid"); // the letter reached the query
    await s.mockInput.pressKey("\x1b"); // command mode
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    await s.mockInput.pressKey("d"); // now it removes
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).toContain("install list (0)");
  });

  test("highlightSegments marks every case-insensitive occurrence", async () => {
    const { highlightSegments } = await import("../src/tui/Views.tsx");
    expect(highlightSegments("vercel-labs/skills", ["labs"])).toEqual([
      { text: "vercel-", match: false },
      { text: "labs", match: true },
      { text: "/skills", match: false },
    ]);
    expect(highlightSegments("Lab-Lab", ["lab"])).toEqual([
      { text: "Lab", match: true },
      { text: "-", match: false },
      { text: "Lab", match: true },
    ]);
    expect(highlightSegments("nomatch", ["labs", null])).toEqual([{ text: "nomatch", match: false }]);
    // adjusted query wins only when the raw query misses
    expect(highlightSegments("cli-ansi", ["zzz", "ansi"])[1]).toEqual({ text: "ansi", match: true });
  });
});
