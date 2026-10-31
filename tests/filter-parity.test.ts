import { describe, expect, test } from "bun:test";
import { renderPage, skillMatches } from "../src/web/page.ts";
import { createTuiModel, visibleSkills } from "../src/tui/model.ts";
import { DEFAULT_UI_PREFERENCES } from "../src/core/prefs.ts";
import type { InstalledSkill } from "../src/core/services/types.ts";

/**
 * S-164 (F1 filter parity): the SAME query through BOTH surfaces' filter
 * code must return the SAME result set. The web predicate is skillMatches
 * in src/web/page.ts — its transpiled source is interpolated into the
 * served APP_JS, so filtering there runs this exact function. The TUI
 * applies the same match set (name, source, each agent, description as the
 * secondary match) inside visibleSkills (src/tui/model.ts). The fixtures
 * include an agent-only match ("claude") — the case that motivated the
 * ticket: the old web haystack (name+description+source) missed it.
 * The 0.5.2 gate cites this test as the cross-surface parity proof.
 */

const FIXTURES: InstalledSkill[] = [
  {
    name: "tdd",
    path: "/x/tdd",
    scope: "project",
    agents: ["Antigravity", "Codex", "Cursor", "Gemini CLI"],
    source: null,
    sourceUrl: null,
    sourceType: null,
    description: "red-green-refactor loops",
  },
  {
    name: "code-review",
    path: "/x/code-review",
    scope: "project",
    agents: ["Claude Code"],
    source: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills",
    sourceType: "github",
    description: "Review code changes",
  },
  {
    name: "zlib-docs",
    path: "/x/zlib-docs",
    scope: "project",
    agents: [],
    source: "me/zebra-skills",
    sourceUrl: null,
    sourceType: null,
    description: "compression how-tos",
  },
];

const QUERIES = [
  "",
  "claude", // agent-only match — the F1 case
  "CLAUDE", // case-insensitive agent match
  "codex",
  "anthropics", // source-only
  "me/zebra", // source substring
  "review", // name + description
  "refactor", // description-only
  "compression", // description-only on an unlinked skill
  "tdd",
  "zlib-docs",
  "nomatch",
];

/** TUI side: the real model pipeline — load the fixtures, apply the filter. */
function tuiResult(query: string): string[] {
  const model = createTuiModel(DEFAULT_UI_PREFERENCES);
  model.skills = FIXTURES;
  model.sortCheckedFirst = false; // load order on both sides — compare the filter as-is
  model.filter = query;
  return visibleSkills(model).map((s) => s.name);
}

/** Web side: exactly what filteredSkills does with the needle. */
function webResult(query: string): string[] {
  return FIXTURES.filter((s) => skillMatches(s, query)).map((s) => s.name);
}

describe("filter parity: web skillMatches vs TUI visibleSkills (S-164 F1)", () => {
  for (const q of QUERIES) {
    test(`query ${JSON.stringify(q)} → identical result sets on both surfaces`, () => {
      expect(webResult(q)).toEqual(tuiResult(q));
    });
  }

  test("agent-only query matches on both surfaces (the case that motivated F1)", () => {
    expect(webResult("claude")).toEqual(["code-review"]);
    expect(tuiResult("claude")).toEqual(["code-review"]);
  });

  test("empty query keeps everything in load order on both surfaces", () => {
    expect(webResult("")).toEqual(["tdd", "code-review", "zlib-docs"]);
    expect(tuiResult("")).toEqual(["tdd", "code-review", "zlib-docs"]);
  });

  test("the served page embeds the shared predicate, not a private copy", () => {
    const html = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });
    expect(html).toContain(skillMatches.toString());
    expect(html).toContain("return skillMatches(s, needle);");
  });
});
