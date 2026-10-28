import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { createTestRenderer } from "@opentui/core/testing";
import { installCrashGuard, runTuiOn, type TuiDeps } from "../src/tui/app.ts";
import { createTuiModel, update, visibleSkills, type TuiModel } from "../src/tui/model.ts";
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
    install: async (source, names) => ({ ok: true, summary: `installed ${names.join(",")} from ${source}` }),
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

let setup: Awaited<ReturnType<typeof createTestRenderer>> | null = null;

beforeEach(async () => {
  process.env.SKILLS_UI_PREFS_DIR = "/tmp/skills-ui-tui-test-prefs";
  setup = await createTestRenderer({ width: 100, height: 30 });
});

afterEach(async () => {
  setup?.renderer.destroy();
  setup = null;
  delete process.env.SKILLS_UI_PREFS_DIR;
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
    let frame = s.captureCharFrame();
    expect(frame).toContain("✔"); // checked marker
    s.mockInput.pressKey("d");
    await s.flush();
    await new Promise((r) => setTimeout(r, 50));
    frame = s.captureCharFrame();
    expect(frame).toContain("delete skills");
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
    let installed: { source: string; names: string[] } | null = null;
    const deps = fakeDeps();
    deps.install = async (source, names) => {
      installed = { source, names };
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
    expect(installed as { source: string; names: string[] } | null).toEqual({ source: "o/r", names: ["cli-ansi"] });
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
    expect(frame).toContain("delete skills");
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

  test("help overlay toggles with ?", async () => {
    const s = setup!;
    await runTuiOn(s.renderer, undefined, fakeDeps());
    await s.flush();
    await s.mockInput.typeText("?");
    await s.flush();
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
    expect(s.captureCharFrame()).toContain('no exact matches — showing results for "cli-ansi"');
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
    expect(filtered).toContain("agents:"); // applied filter line (wraps in a 42-col pane)
    expect(filtered).not.toContain("code-review"); // Cursor's skill filtered out
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
    expect(frame).toContain("Selected (1)");
    await s.mockInput.pressKey("\t"); // Tab → Selected pane
    await s.flush();
    frame = s.captureCharFrame();
    expect(frame).toContain("❯ Selected (1)");
    await s.mockInput.pressKey("d"); // remove the queued item
    await s.flush();
    await new Promise((r) => setTimeout(r, 100));
    frame = s.captureCharFrame();
    expect(frame).toContain("Selected (0)");
    expect(frame).toContain("(empty");
    await s.mockInput.pressKey("\t"); // Tab back → Results
    await s.flush();
    expect(s.captureCharFrame()).toContain("❯ Results");
  });
});
