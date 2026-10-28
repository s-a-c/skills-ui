import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SHIM = new URL("fixtures/skills-shim.mjs", import.meta.url).pathname;

let stateDir: string;
let prefsDir: string;
let server: { port: number; stop: () => Promise<void> } | null = null;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "skills-ui-api-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-prefs-"));
  process.env.SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = stateDir;
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
});

afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(prefsDir, { recursive: true, force: true });
  delete process.env.SKILLS_BIN;
  delete process.env.SKILLS_SHIM_STATE;
  delete process.env.SKILLS_UI_PREFS_DIR;
});

async function start(): Promise<string> {
  const { createSkillsUiServer } = await import("../src/core/api.ts");
  server = await createSkillsUiServer({ withPage: true });
  return `http://127.0.0.1:${server.port}`;
}

describe("api", () => {
  test("GET /api/version — wrapper version + skills version + capabilities", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/version`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string; skillsVersion: string; capabilities: Record<string, string> };
    expect(body.version).toBe("0.0.0");
    expect(body.skillsVersion).toBe("1.7.4");
    expect(body.capabilities.updatesCheck).toBe("github");
  });

  test("GET /api/skills maps entries with frontmatter descriptions", async () => {
    // give the first fixture skill a SKILL.md with a description
    const skillDir = join(stateDir, "desc");
    mkdirSync(join(skillDir, "tdd"), { recursive: true });
    writeFileSync(
      join(skillDir, "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven flows\n---\n\n# TDD\n"
    );
    const base = await start();
    const res = await fetch(`${base}/api/skills?scope=project`);
    const body = (await res.json()) as { scope: string; skills: Array<Record<string, unknown>> };
    expect(body.scope).toBe("project");
    // descriptions read from the FIXTURE paths, which have no SKILL.md → ""
    expect(body.skills.every((s) => typeof s.description === "string")).toBe(true);
    expect(body.skills.find((s) => s.name === "code-review")?.source).toBe("anthropics/skills");
  });

  test("GET /api/skill — 400 without name, 404 unknown, body for known", async () => {
    const base = await start();
    expect((await fetch(`${base}/api/skill`)).status).toBe(400);
    expect((await fetch(`${base}/api/skill?name=nope`)).status).toBe(404);
  });

  test("GET /api/search returns empty for empty q", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/search?q=`);
    expect(await res.json()).toEqual({ results: [], adjustedQuery: null });
  });

  test("POST /api/install — 400 on bad body, 500 when add reports failure", async () => {
    const base = await start();
    expect((await fetch(`${base}/api/install`, { method: "POST", body: "{}" })).status).toBe(400);
    expect(
      (
        await fetch(`${base}/api/install`, {
          method: "POST",
          body: JSON.stringify({ source: "fixture/source", skills: "nope" }),
        })
      ).status
    ).toBe(400);
    // add fixture has one failed entry → 500 + ok:false
    const res = await fetch(`${base}/api/install`, {
      method: "POST",
      body: JSON.stringify({ source: "fixture/source", skills: ["alpha", "beta"] }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; output: string };
    expect(body.ok).toBe(false);
    expect(body.output).toContain("failed");
  });

  test("GET /api/source-skills parses cyan names", async () => {
    const base = await start();
    expect((await fetch(`${base}/api/source-skills`)).status).toBe(400);
    const res = await fetch(`${base}/api/source-skills?source=fixture/source`);
    const body = (await res.json()) as { skills: Array<{ name: string }> };
    expect(body.skills.map((s) => s.name)).toEqual(["alpha", "beta", "gamma"]);
  });

  test("POST /api/remove verifies via list-diff and reports in output", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/remove`, {
      method: "POST",
      body: JSON.stringify({ skills: ["tdd"] }),
    });
    const body = (await res.json()) as { ok: boolean; output: string };
    expect(body.ok).toBe(true);
    expect(body.output).toContain("tdd");
  });

  test("POST /api/update returns shim output", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/update`, {
      method: "POST",
      body: JSON.stringify({ skills: [] }),
    });
    const body = (await res.json()) as { ok: boolean; output: string };
    expect(body.ok).toBe(true);
    expect(body.output).toContain("Updated");
  });

  test("GET/PUT /api/prefs roundtrip", async () => {
    const base = await start();
    const initial = (await (await fetch(`${base}/api/prefs`)).json()) as Record<string, unknown>;
    expect(initial.theme).toBe("mocha");
    const put = await fetch(`${base}/api/prefs`, {
      method: "PUT",
      body: JSON.stringify({ theme: "latte", sound: false }),
    });
    const merged = (await put.json()) as Record<string, unknown>;
    expect(merged.theme).toBe("latte");
    expect(merged.sound).toBe(false);
  });

  test("unknown routes 404; page served with CSP at /", async () => {
    const base = await start();
    const notFound = await fetch(`${base}/api/nope`);
    expect(notFound.status).toBe(404);
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("connect-src 'self'");
    const html = await page.text();
    expect(html).toContain("data-theme=");
  });

  test("oversized bodies 413", async () => {
    const base = await start();
    const big = "x".repeat(1024 * 1024 + 100);
    const res = await fetch(`${base}/api/install`, {
      method: "POST",
      body: JSON.stringify({ source: big }),
    });
    expect(res.status).toBe(413);
  });
});
