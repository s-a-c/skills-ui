import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeBody, sanitizeMetadata, stripEscapes } from "../src/core/services/sanitize.ts";

/**
 * 0.5.1 impl D: every external-text ingress is sanitized — the sanitizers
 * themselves (ANSI CSI/OSC/DCS, C1 controls, wrong types, huge values) and
 * each ingress end-to-end through the shim (ls --json, install --list,
 * add --json, update) and the HTTP API (frontmatter description, SKILL.md
 * body).
 */

const SHIM = new URL("fixtures/skills-shim.mjs", import.meta.url).pathname;
const HOSTILE_LS = new URL("fixtures/contract/ls-hostile.json", import.meta.url).pathname;
const HOSTILE_ADD = new URL("fixtures/contract/add-hostile.json", import.meta.url).pathname;
const HOSTILE_SKILL_DIR = new URL("fixtures/contract/hostile-skill", import.meta.url).pathname;

const ANY_ESCAPE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;

let stateDir: string;
let prefsDir: string;
let server: { port: number; stop: () => Promise<void> } | null = null;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "skills-ui-san-state-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-san-prefs-"));
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = stateDir;
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
  process.env.SKILLS_SHIM_LS_PROJECT = HOSTILE_LS;
  process.env.SKILLS_SHIM_ADD = HOSTILE_ADD;
  delete process.env.SKILLS_UI_HOSTED_TOKEN;
  delete process.env.SKILLS_SHIM_LIST_NAMES;
});

afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(prefsDir, { recursive: true, force: true });
  delete process.env.SKILLS_UI_SKILLS_BIN;
  delete process.env.SKILLS_SHIM_STATE;
  delete process.env.SKILLS_UI_PREFS_DIR;
  delete process.env.SKILLS_UI_HOSTED_TOKEN;
  delete process.env.SKILLS_SHIM_LS_PROJECT;
  delete process.env.SKILLS_SHIM_ADD;
  delete process.env.SKILLS_SHIM_LIST_NAMES;
});

describe("unit: sanitizers", () => {
  test("stripEscapes removes CSI, OSC (BEL and ST), DCS/PM/APC, and two-byte escapes", () => {
    expect(stripEscapes("\u001b[31mred\u001b[0m")).toBe("red");
    expect(stripEscapes("a\u001b]0;title\u0007b")).toBe("ab");
    expect(stripEscapes("a\u001b]0;t\u001b\\b")).toBe("ab");
    expect(stripEscapes("a\u001bP1;2q data\u001b\\b")).toBe("ab");
    expect(stripEscapes("a\u001b^pm\u001b\\b")).toBe("ab"); // PM is covered too
    expect(stripEscapes("a\u001bAb")).toBe("ab");
    expect(stripEscapes("\u009b31mC1\u009bm")).toBe("C1");
  });

  test("sanitizeMetadata collapses newlines, strips controls, trims", () => {
    expect(sanitizeMetadata("  ok  ")).toBe("ok");
    expect(sanitizeMetadata("line1\r\nline2\nline3")).toBe("line1 line2 line3");
    expect(sanitizeMetadata("a\u0000b\u0007c\u007fd\u0085e")).toBe("abcde");
    expect(sanitizeMetadata("plain text stays")).toBe("plain text stays");
  });

  test("sanitizeBody preserves structure (newlines, tabs) while stripping escapes", () => {
    const body = "# T\n\npara one\n\u001b[31mred\u001b[0m\n\tindented\ttab\n\u001b]0;x\u0007end";
    const out = sanitizeBody(body);
    expect(out).toBe("# T\n\npara one\nred\n\tindented\ttab\nend");
    expect(out).not.toMatch(ANY_ESCAPE);
  });

  test("huge values pass through without choking", () => {
    const huge = "\u001b[31m" + "x".repeat(5_000_000) + "\u001b[0m";
    const out = sanitizeMetadata(huge);
    expect(out.length).toBe(5_000_000);
    expect(out).toBe("x".repeat(5_000_000));
  });
});

describe("ingress: skills ls --json (installed list)", () => {
  test("names, agents, source fields come out clean; path stays raw; wrong types coerce", async () => {
    const { listInstalled } = await import("../src/core/services/installed.ts");
    const skills = await listInstalled("project");
    expect(skills.length).toBe(3);
    for (const s of skills) {
      const rendered = JSON.stringify([s.name, s.agents, s.source, s.sourceUrl, s.sourceType]);
      expect(rendered).not.toMatch(ANY_ESCAPE);
    }
    expect(skills[0]!.name).toBe("good-skill");
    expect(skills[0]!.agents).toEqual(["Claude Code"]);
    expect(skills[1]!.name).toBe("evil-skill"); // cyan markers + BEL stripped
    expect(skills[1]!.agents[0]).toBe("Agent"); // OSC title dropped
    expect(skills[1]!.agents[1]).toBe("Bad Agent"); // C1 CSI stripped
    expect(skills[2]!.name).toBe("12345"); // numeric name coerced then sanitized
    expect(skills[2]!.agents).toEqual(["ok", "42"]);
  });
});

describe("ingress: install --list (source skills)", () => {
  test("cyan-extracted names are sanitized", async () => {
    process.env.SKILLS_SHIM_LIST_NAMES = JSON.stringify([
      "na\u0007me\u009b31m",
      "plain",
      "with space",
    ]);
    const { listSourceSkills } = await import("../src/core/services/source.ts");
    const skills = await listSourceSkills("https://example.com/repo");
    expect(skills.map((s) => s.name)).toEqual(["name", "plain"]); // BEL + whole C1-CSI sequence dropped, spaced dropped
  });
});

describe("ingress: add --json (install results)", () => {
  test("entry strings are sanitized", async () => {
    const { install } = await import("../src/core/services/install.ts");
    const result = await install({ source: "https://example.com/repo", skills: ["*"] });
    const rendered = JSON.stringify(result.results);
    expect(rendered).not.toMatch(ANY_ESCAPE);
    expect(result.results[0]!.name).toBe("hostile-added");
    expect(result.results[1]!.error).toBe("boom!");
    expect(result.results[1]!.reason).toBe("whynot");
  });
});

describe("ingress: api description + SKILL.md body", () => {
  test("frontmatter description and markdown body reach the API clean; body keeps structure", async () => {
    const { createSkillsUiServer } = await import("../src/core/api.ts");
    server = await createSkillsUiServer({ withPage: false });
    const base = `http://127.0.0.1:${server.port}`;

    const list = (await (await fetch(`${base}/api/skills`)).json()) as {
      skills: Array<{ name: string; description: string }>;
    };
    const good = list.skills.find((s) => s.name === "good-skill")!;
    expect(good.description).not.toMatch(ANY_ESCAPE);
    expect(good.description).toContain("Evil");
    expect(good.description).toContain("desc");
    expect(good.description).not.toContain("title"); // OSC payload dropped

    const detail = (await (await fetch(`${base}/api/skill?name=good-skill`)).json()) as {
      body: string;
    };
    expect(detail.body).toContain("# Hostile skill body");
    expect(detail.body).toContain("Line two preserves structure");
    expect(detail.body.split("\n").length).toBeGreaterThan(4); // structure preserved
    expect(detail.body).not.toMatch(ANY_ESCAPE);
  });
});
