import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { runTuiOn, type TuiDeps } from "../src/tui/app.ts";
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
});
