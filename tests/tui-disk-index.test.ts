import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { realDeps, runTuiOn, type TuiDeps } from "../src/tui/app.ts";
import { waitForFrame } from "../src/tui/renderer-ready.ts";
import { deferred } from "./helpers/audit-state.ts";
import {
  DISK_INDEX_VERSION,
  diskIndexPath,
  loadDiskIndex,
  normalizeDiskIndex,
  saveDiskIndex,
} from "../src/core/disk-index.ts";
import { resetSkillsBinCache } from "../src/core/skills-client.ts";
import { DEFAULT_UI_PREFERENCES } from "../src/core/prefs.ts";
import { createTuiModel, update } from "../src/tui/model.ts";
import type { InstalledSkill, Scope } from "../src/core/services/types.ts";

/**
 * S-183 stale-while-revalidate: the per-scope persisted index under
 * SKILLS_UI_CACHE_DIR (NEVER the real ~/.cache in tests), the
 * stale-paint-before-subprocess ordering, swap reconciliation
 * (selection/checked/filter), hostile-content immunity, and the
 * mutations-act-on-fresh-truth invariant.
 */

const STALE: InstalledSkill[] = [
  {
    name: "alpha",
    path: "/x/alpha",
    scope: "project",
    agents: ["Claude Code"],
    source: null,
    sourceUrl: null,
    sourceType: null,
    description: "alpha persisted description",
  },
  { name: "beta", path: "/x/beta", scope: "project", agents: ["Cursor"], source: "o/r", sourceUrl: null, sourceType: "github" },
  { name: "gamma", path: "/x/gamma", scope: "project", agents: [], source: null, sourceUrl: null, sourceType: null },
];

const FRESH: InstalledSkill[] = [
  { name: "alpha", path: "/x/alpha", scope: "project", agents: ["Claude Code"], source: null, sourceUrl: null, sourceType: null },
  { name: "beta", path: "/x/beta2", scope: "project", agents: ["Cursor"], source: "o/r", sourceUrl: null, sourceType: "github" },
  { name: "delta", path: "/x/delta", scope: "project", agents: [], source: null, sourceUrl: null, sourceType: null },
];

function entry(name: string, scope: Scope = "project"): InstalledSkill {
  return { name, path: `/x/${name}`, scope, agents: ["Claude Code"], source: null, sourceUrl: null, sourceType: null };
}

function writeIndexFile(dir: string, scope: Scope, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(diskIndexPath(scope, dir), content);
}

function writeIndex(dir: string, scope: Scope, skills: InstalledSkill[]): void {
  writeIndexFile(dir, scope, JSON.stringify({ version: DISK_INDEX_VERSION, savedAt: "2026-11-01T00:00:00.000Z", skills }));
}

/** Deferred-fake list source (the S-182 test pattern): every call is held
 * open until the test resolves it — nothing resolves on its own. A missing
 * resolver is a failure at the release site, never an optional chain. */
function deferredListDeps(): { deps: TuiDeps; resolveAll: (skills: InstalledSkill[]) => void } {
  const pending: Array<ReturnType<typeof deferred<InstalledSkill[]>>> = [];
  const deps: TuiDeps = {
    ...realDeps,
    listInstalled: () => {
      const settle = deferred<InstalledSkill[]>();
      pending.push(settle);
      return settle.promise;
    },
    skillBody: async (path) => `body of ${path}`,
    savePrefs: () => {},
    play: async () => {},
  };
  return { deps, resolveAll: (skills) => pending.splice(0).forEach((settle) => settle.resolve(skills)) };
}

/** Poll until `fn` stops throwing (the tui.test.ts settle-proof pattern). */
async function waitFor(fn: () => void, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      fn();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

let cacheDir = "";
let setup: Awaited<ReturnType<typeof createTestRenderer>> | null = null;

beforeEach(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), "skills-ui-disk-index-"));
  process.env.SKILLS_UI_CACHE_DIR = cacheDir;
  process.env.SKILLS_UI_PREFS_DIR = join(cacheDir, "prefs");
  setup = await createTestRenderer({ width: 100, height: 30 });
});

afterEach(async () => {
  setup?.renderer.destroy();
  setup = null;
  delete process.env.SKILLS_UI_CACHE_DIR;
  delete process.env.SKILLS_UI_PREFS_DIR;
  delete process.env.SKILLS_UI_SKILLS_BIN;
  delete process.env.SKILLS_SHIM_STATE;
  resetSkillsBinCache();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("disk index (unit)", () => {
  test("save then load round-trips the enriched shape", () => {
    saveDiskIndex("project", STALE, cacheDir);
    expect(loadDiskIndex("project", cacheDir)).toEqual(STALE);
    expect(loadDiskIndex("global", cacheDir)).toBeNull(); // other scope: absent
  });

  test("truncated JSON is ignored (regenerate, never throw)", () => {
    writeIndexFile(cacheDir, "project", JSON.stringify({ version: 1, savedAt: "x", skills: [{ name: "al" }] }).slice(0, -4));
    expect(loadDiskIndex("project", cacheDir)).toBeNull();
  });

  test("wrong version and non-object content are ignored", () => {
    writeIndex(cacheDir, "project", STALE);
    const raw = readFileSync(diskIndexPath("project", cacheDir), "utf-8");
    writeIndexFile(cacheDir, "project", raw.replace('"version":1', '"version":99'));
    expect(loadDiskIndex("project", cacheDir)).toBeNull();
    writeIndexFile(cacheDir, "project", "[]");
    expect(loadDiskIndex("project", cacheDir)).toBeNull();
    writeIndexFile(cacheDir, "project", "null");
    expect(loadDiskIndex("project", cacheDir)).toBeNull();
  });

  test("hostile entries are dropped; an all-hostile file is ignored, not rendered", () => {
    const hostile = {
      version: DISK_INDEX_VERSION,
      savedAt: "2026-11-01T00:00:00.000Z",
      skills: [
        { name: 123, path: "/x/a", scope: "project", agents: [], source: null, sourceUrl: null, sourceType: null },
        { name: "ok", path: "/x/ok", scope: "project", agents: ["Claude Code"], source: null, sourceUrl: null, sourceType: null },
        { name: "no-agents", path: "/x/na", scope: "project", agents: "Claude Code", source: null, sourceUrl: null, sourceType: null },
        { name: "wrong-scope", path: "/x/ws", scope: "global", agents: [], source: null, sourceUrl: null, sourceType: null },
        { name: "proto", path: "/x/p", scope: "project", agents: [], source: null, sourceUrl: null, sourceType: null, description: { evil: true } },
        "not-an-object",
      ],
    };
    const parsed = normalizeDiskIndex(JSON.stringify(hostile), "project");
    // entries with hostile REQUIRED fields are dropped; the "proto" entry's
    // core is well-formed, so it survives with its hostile OPTIONAL
    // description dropped — either way nothing hostile reaches the model
    expect(parsed?.skills.map((s) => s.name)).toEqual(["ok", "proto"]);
    expect(parsed?.skills.every((s) => s.description === undefined)).toBeTrue();

    writeIndexFile(cacheDir, "project", JSON.stringify({ ...hostile, skills: [hostile.skills[0], "x"] }));
    expect(loadDiskIndex("project", cacheDir)).toBeNull(); // zero valid entries ⇒ regenerate
  });

  test("empty or missing skills array counts as partial — ignored", () => {
    writeIndexFile(cacheDir, "project", JSON.stringify({ version: DISK_INDEX_VERSION, savedAt: "x", skills: [] }));
    expect(loadDiskIndex("project", cacheDir)).toBeNull();
    writeIndexFile(cacheDir, "project", JSON.stringify({ version: DISK_INDEX_VERSION, savedAt: "x" }));
    expect(loadDiskIndex("project", cacheDir)).toBeNull();
  });

  test("absurdly oversized content is skipped before parsing", () => {
    writeIndexFile(cacheDir, "project", `{"version":1,"pad":"${"x".repeat(17_000_000)}"}`);
    expect(loadDiskIndex("project", cacheDir)).toBeNull();
  });

  test("atomic write leaves exactly the index file — no tmp residue", () => {
    saveDiskIndex("project", STALE, cacheDir);
    expect(readdirSync(cacheDir)).toEqual(["index-project.json"]);
  });
});

describe("S-183 rider (pure model)", () => {
  test("checked-first re-sort from toggle-check is visible in the SAME dispatch (pins the forget()s)", () => {
    // if toggle-check's forget() were dropped, the final next.visible would
    // reuse the pre-toggle memo and this expectation would see [a, b, c]
    let m = update(createTuiModel(DEFAULT_UI_PREFERENCES), {
      type: "skills-loaded",
      skills: [entry("a"), entry("b"), entry("c")],
    });
    m = update(m, { type: "move", delta: 2 }); // selection -> c
    m = update(m, { type: "toggle-check" }); // checks c; memo must be invalidated
    expect(m.visible.map((s) => s.name)).toEqual(["c", "a", "b"]);
  });
});

describe("S-183 stale-while-revalidate (renderer)", () => {
  test("first load paints the persisted index BEFORE the list subprocess resolves", async () => {
    const s = setup!;
    writeIndex(cacheDir, "project", STALE); // startup scope is project
    const { deps, resolveAll } = deferredListDeps();
    let startupSettled = false;
    void runTuiOn(s.renderer, undefined, deps).then(() => {
      startupSettled = true;
    }); // startup awaits the deferred — do not await here
    await s.flush();
    // handshake: poll the STALE paint while the source is still pending —
    // readiness is the frame itself, not a sleep
    await waitForFrame(
      s,
      (f) => f.includes("alpha") && f.includes("3 skills") && f.includes("body of /x/alpha") && f.includes("loading skills") && !f.includes("starting…")
    );
    // the list source is still pending — these rows can only be the disk index.
    // The predicate carries the stale-paint markers (alpha rows, real count,
    // filled detail pane, busy label, splash beaten); a deadline miss reports
    // the frame.
    expect(startupSettled).toBe(false); // request-start observed, nothing released yet

    resolveAll(FRESH); // subprocess truth lands (released only after request-start was observed)
    // settle-proof: the swap is done only when the busy label cleared —
    // that lands in the finally, AFTER the fresh detail body dispatch
    const settled = await waitForFrame(s, (f) => f.includes("delta") && !f.includes("loading skills"));
    expect(settled).not.toContain("gamma"); // swapped to truth
  });

  test("first `g` paints the persisted GLOBAL index before its subprocess resolves", async () => {
    const s = setup!;
    writeIndex(cacheDir, "global", [
      { name: "galpha", path: "/g/alpha", scope: "global", agents: ["Claude Code"], source: null, sourceUrl: null, sourceType: null },
      { name: "gbeta", path: "/g/beta", scope: "global", agents: [], source: null, sourceUrl: null, sourceType: null },
    ]);
    let resolveGlobal: ((skills: InstalledSkill[]) => void) | null = null;
    const deps: TuiDeps = {
      ...realDeps,
      listInstalled: async (scope) =>
        scope === "project"
          ? FRESH // startup settles instantly, no index seeded for project
          : new Promise<InstalledSkill[]>((resolve) => {
              resolveGlobal = resolve; // the real global list is held pending
            }),
      skillBody: async (path) => `body of ${path}`,
      savePrefs: () => {},
      play: async () => {},
    };
    await runTuiOn(s.renderer, undefined, deps); // startup: project
    await waitForFrame(s, (f) => f.includes("delta")); // project rows settled

    await s.mockInput.pressKey("g"); // first global load this session
    await s.flush();
    // handshake: the request went out AND the persisted rows painted first —
    // observed before anything is released. The predicate carries the
    // persisted-rows-before-subprocess markers.
    await waitForFrame(
      s,
      (f) => f.includes("galpha") && f.includes("gbeta") && f.includes("loading skills") && f.includes("body of /g/alpha")
    );
    if (!resolveGlobal) throw new Error("global list load was never dispatched"); // a missing resolver is a failure

    resolveGlobal([
      { name: "galpha", path: "/g/alpha2", scope: "global", agents: ["Claude Code"], source: null, sourceUrl: null, sourceType: null },
      { name: "gdelta", path: "/g/delta", scope: "global", agents: [], source: null, sourceUrl: null, sourceType: null },
    ]); // truth lands
    // fully settled (finally ran) — truth swapped in, busy cleared
    const settled = await waitForFrame(s, (f) => f.includes("gdelta") && !f.includes("loading skills"));
    expect(settled).toContain("galpha"); // still present in truth
    expect(settled).not.toContain("gbeta"); // swapped off the stale rows
  });

  test("a seeded check survives the stale paint even when the index predates the skill", async () => {
    const s = setup!;
    writeIndex(cacheDir, "project", STALE); // predates newer-skill entirely
    let resolveOnce: ((skills: InstalledSkill[]) => void) | null = null;
    const deps: TuiDeps = {
      ...realDeps,
      listInstalled: () =>
        new Promise<InstalledSkill[]>((resolve) => {
          resolveOnce = resolve; // fresh truth held pending
        }),
      skillBody: async (path) => `body of ${path}`,
      savePrefs: () => {},
      play: async () => {},
    };
    // `skills ui update newer-skill` seeds the check BEFORE any load
    void runTuiOn(s.renderer, { kind: "update", skills: ["newer-skill"] }, deps);
    await s.flush();
    // handshake: stale paint observed while the fresh load is held pending
    const staleFrame = await waitForFrame(s, (f) => f.includes("alpha") && f.includes("loading skills"));
    expect(staleFrame).not.toContain("newer-skill"); // the stale index predates it
    if (!resolveOnce) throw new Error("fresh list load was never dispatched"); // a missing resolver is a failure

    resolveOnce([
      { name: "alpha", path: "/x/alpha", scope: "project", agents: ["Claude Code"], source: null, sourceUrl: null, sourceType: null },
      { name: "newer-skill", path: "/x/newer", scope: "project", agents: ["Claude Code"], source: null, sourceUrl: null, sourceType: null },
    ]); // fresh truth HAS the seeded skill
    // fully settled: newer-skill rendered WITH its seeded check, busy cleared
    await waitForFrame(s, (f) => f.includes("newer-skill") && f.includes("✔") && !f.includes("loading skills"));
    await s.mockInput.pressKey("d"); // the delete gate reads model.checked
    await s.flush();
    // the confirm names newer-skill — still checked, the prune never touched it
    await waitForFrame(s, (f) => f.includes("remove skills") && f.includes("newer-skill"));
    await s.mockInput.pressEscape(); // cancel; nothing runs (pressKey("escape") sends the literal text, not ESC)
  });

  test("swap reconciles: selection follows the same NAME even when truth reshuffles indices", async () => {
    const s = setup!;
    writeIndex(cacheDir, "project", STALE);
    const { deps, resolveAll } = deferredListDeps();
    void runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    // handshake: stale paint observed while the list source is held pending
    await waitForFrame(s, (f) => f.includes("beta") && f.includes("loading skills"));
    await s.mockInput.pressKey("j"); // selection -> beta (stale rows: index 1)
    await s.flush();
    // the pre-swap selection state is observed before anything is released
    await waitForFrame(s, (f) => f.includes("─ beta ─"));

    // fresh truth inserts "aarv" (sorts first) — beta's index shifts 1 -> 2.
    // Index-preserving behavior would park the cursor on alpha; name-follow
    // must keep it on beta.
    const reshuffled = [entry("aarv"), ...FRESH];
    resolveAll(reshuffled);
    const settled = await waitForFrame(s, (f) => f.includes("aarv") && !f.includes("loading skills"));
    expect(settled).toContain("─ beta ─"); // followed the name to its NEW index
    expect(settled).not.toContain("─ alpha ─"); // not parked at the old index
  });

  test("swap reconciles: surviving checks survive; vanished checks are pruned; index behavior unchanged", async () => {
    const s = setup!;
    writeIndex(cacheDir, "project", STALE);
    const { deps, resolveAll } = deferredListDeps();
    void runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    // handshake: stale paint observed while the list source is held pending
    await waitForFrame(s, (f) => f.includes("alpha") && f.includes("loading skills"));
    await s.mockInput.pressKey(" "); // check alpha (already first — no resort, cursor stays)
    await s.flush();
    await waitForFrame(s, (f) => f.includes("✔")); // check observed before moving on
    await s.mockInput.pressKey("j");
    await s.mockInput.pressKey("j"); // -> gamma
    await s.flush();
    await s.mockInput.pressKey(" "); // check gamma (vanishes in fresh truth)
    await s.flush();
    // checking gamma re-sorts checked-first [alpha, gamma, beta]; the cursor
    // (index-stable) is now on beta — step up onto gamma
    await s.mockInput.pressKey("k");
    await s.flush();
    // the pre-swap selection state (gamma focused) is observed before release
    await waitForFrame(s, (f) => f.includes("─ gamma ─"));

    resolveAll(FRESH); // gamma gone, alpha kept
    const settled = await waitForFrame(
      s,
      (f) => f.includes("delta") && !f.includes("loading skills") && f.includes("body of /x/beta2")
    );
    expect(settled).toContain("✔"); // alpha's check survived — no lost checks
    expect(settled).not.toContain("gamma"); // gone from truth, gone from the list AND the pane, check pruned
    // the vanished name leaves the cursor at its index (clamp is a bound, not
    // a mover) — exactly today's reload behavior, unchanged (cursor index 1)
    expect(settled).toContain("─ beta ─");
    expect(settled).not.toContain("─ gamma ─");
  });

  test("swap keeps the live filter narrowed", async () => {
    const s = setup!;
    writeIndex(cacheDir, "project", STALE);
    const { deps, resolveAll } = deferredListDeps();
    void runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    // handshake: stale paint observed while the list source is held pending
    await waitForFrame(s, (f) => f.includes("alpha") && f.includes("loading skills"));
    await s.mockInput.pressKey("f"); // filter live
    await s.mockInput.typeText("al"); // matches alpha (name) only
    await s.flush();
    await waitForFrame(s, (f) => f.includes("filter: al"));

    resolveAll(FRESH);
    const settled = await waitForFrame(s, (f) => f.includes("─ alpha ─") && !f.includes("loading skills"));
    expect(settled).toContain("filter: al"); // filter survived the swap
    expect(settled).not.toContain("beta"); // still narrowed to alpha
    expect(settled).not.toContain("delta");
  });

  test("a corrupt index is ignored — the TUI loads fresh and never crashes", async () => {
    const s = setup!;
    writeIndexFile(cacheDir, "project", '{"version":1,"skills":[{"name":"ghost-skill"'); // torn write
    const deps = deferredListDeps().deps;
    deps.listInstalled = async () => FRESH; // fresh truth resolves immediately
    await runTuiOn(s.renderer, undefined, deps);
    await s.flush();
    // fresh truth rendered; the torn file never surfaced — the predicate
    // carries both
    await waitForFrame(s, (f) => f.includes("alpha") && !f.includes("ghost-skill") && !f.includes("loading skills"));
  });

  test("mutations act on fresh truth, never the index — and rewrite it from truth", async () => {
    const s = setup!;
    // stale index with a ghost the subprocess does not know about
    writeIndex(cacheDir, "project", [...STALE, entry("ghost-skill")]);
    const SHIM = new URL("fixtures/skills-shim.mjs", import.meta.url).pathname;
    const stateDir = mkdtempSync(join(tmpdir(), "skills-ui-disk-index-shim-"));
    process.env.SKILLS_UI_SKILLS_BIN = SHIM;
    process.env.SKILLS_SHIM_STATE = stateDir;
    resetSkillsBinCache();
    try {
      const deps: TuiDeps = { ...realDeps, skillBody: async () => null, savePrefs: () => {}, play: async () => {} };
      await runTuiOn(s.renderer, undefined, deps); // startup load: fresh truth (tdd, code-review)
      await s.flush();
      // readiness is the frame: fresh rows rendered and the load settled —
      // which is also the guarantee the index was regenerated from truth
      await waitForFrame(s, (f) => f.includes("tdd") && f.includes("code-review") && !f.includes("loading skills"));
      // the fresh load REGENERATED the index from truth — ghost gone
      expect((loadDiskIndex("project", cacheDir) ?? []).map((k) => k.name)).toEqual(["tdd", "code-review"]);

      await s.mockInput.pressKey("r"); // remove focused (code-review, A→Z first)
      await s.flush();
      await waitForFrame(s, (f) => f.includes("remove skills"));
      await s.mockInput.pressKey("y");
      const settled = await waitForFrame(s, (f) => !f.includes("code-review") && !f.includes("loading skills"));
      // the reload went back to the SUBPROCESS (shim rm mutated its state);
      // the index was rewritten from that truth, never read from the stale file
      expect((loadDiskIndex("project", cacheDir) ?? []).map((k) => k.name)).toEqual(["tdd"]);
      expect(settled).toContain("tdd");
    } finally {
      delete process.env.SKILLS_UI_SKILLS_BIN;
      delete process.env.SKILLS_SHIM_STATE;
      resetSkillsBinCache();
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  test("a slow older scope load resolving after a newer one never overwrites rows", async () => {
    const s = setup!;
    let resolveGlobal: ((skills: InstalledSkill[]) => void) | null = null;
    const deps: TuiDeps = {
      ...realDeps,
      listInstalled: async (scope) =>
        scope === "project"
          ? FRESH
          : new Promise<InstalledSkill[]>((resolve) => {
              resolveGlobal = resolve; // global load held pending
            }),
      skillBody: async () => null,
      savePrefs: () => {},
      play: async () => {},
    };
    await runTuiOn(s.renderer, undefined, deps); // startup: project settles
    await s.flush();
    await waitForFrame(s, (f) => f.includes("alpha") && !f.includes("loading skills")); // project rows settled

    await s.mockInput.pressKey("g"); // OLD global load dispatched, held pending
    await s.flush();
    // handshake 1: old-request-start observed BEFORE switching back
    if (!resolveGlobal) throw new Error("global scope load was never dispatched"); // a missing resolver is a failure
    await waitForFrame(s, (f) => f.includes("loading skills")); // old load in flight
    await s.mockInput.pressKey("p"); // NEWER load — resolves immediately
    // handshake 2: newer completion observed BEFORE old completion
    await waitForFrame(s, (f) => f.includes("alpha") && !f.includes("loading skills"));
    resolveGlobal([entry("global-only-skill", "global")]); // OLD load settles LAST
    // handshake 3: renderer flush after the old promise settles — the seq guard must drop it
    const frame = await waitForFrame(s, (f) => f.includes("alpha") && !f.includes("loading skills"));
    expect(frame).not.toContain("global-only-skill"); // stale load dropped by the seq guard
  });

  test("persisted-index load timing (log-only): 300 entries, median of 50 in-process reads", () => {
    const big = Array.from({ length: 300 }, (_, i) => ({
      ...entry(`skill-${String(i + 1).padStart(3, "0")}`),
      source: "anthropics/skills",
      sourceUrl: "https://github.com/anthropics/skills",
      sourceType: "github",
      description: "persisted frontmatter description for a realistic file size",
    }));
    saveDiskIndex("project", big, cacheDir);
    loadDiskIndex("project", cacheDir); // warm once (page cache), then measure
    const reps: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      const loaded = loadDiskIndex("project", cacheDir);
      reps.push(performance.now() - t0);
      expect(loaded).toHaveLength(300);
    }
    reps.sort((a, b) => a - b);
    const median = reps[Math.floor(reps.length / 2)]!;
    console.log(`[S-183] index load (300 entries, read+parse+normalize), median of 50: ${median.toFixed(3)} ms`);
    expect(median).toBeGreaterThan(0); // sanity only — no wall-clock budget assert here
  });
});
