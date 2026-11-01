import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_VERSION } from "../src/core/version.ts";

const SHIM = new URL("fixtures/skills-shim.mjs", import.meta.url).pathname;

let stateDir: string;
let prefsDir: string;
let server: { port: number; stop: () => Promise<void> } | null = null;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "skills-ui-api-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-prefs-"));
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = stateDir;
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
});

afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(prefsDir, { recursive: true, force: true });
  delete process.env.SKILLS_UI_SKILLS_BIN;
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
    expect(body.version).toBe(APP_VERSION);
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

  // S-179: detail-by-path — the server validates the caller's path as an
  // EXACT cached-row member for the scope and reads the doc from that row;
  // the payload is the same {name, scope, body} object the name form returns.
  test("GET /api/skill by path — cached row served with byte-identical shape to the name form (S-179)", async () => {
    const base = await start();
    const list = (await (await fetch(`${base}/api/skills?scope=project`)).json()) as {
      skills: Array<{ name: string; path: string }>;
    };
    const row = list.skills[0]!;
    const byPath = await (
      await fetch(`${base}/api/skill?scope=project&path=${encodeURIComponent(row.path)}`)
    ).text();
    const byName = await (
      await fetch(`${base}/api/skill?scope=project&name=${encodeURIComponent(row.name)}`)
    ).text();
    expect(byPath).toEqual(byName); // literal byte-identical bodies — one shared construction tail
    const parsed = JSON.parse(byPath) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["body", "name", "scope"]);
    expect(parsed.name).toBe(row.name);
  });

  test("GET /api/skill by path — a real on-disk path that is NOT a cached row 404s untouched (S-179)", async () => {
    // hostile-ish probe: the file exists and is readable, but its path is not
    // an exact member of the cached list ⇒ 404, and skillBody never reads it
    const sneaky = join(stateDir, "sneaky");
    mkdirSync(sneaky, { recursive: true });
    writeFileSync(join(sneaky, "SKILL.md"), "# not a listed skill\n");
    const base = await start();
    const res = await fetch(`${base}/api/skill?scope=project&path=${encodeURIComponent(sneaky)}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("skill not found");
  });

  test("GET /api/skill — empty/absent path falls through to the name rules (S-179)", async () => {
    const base = await start();
    expect((await fetch(`${base}/api/skill?scope=project&path=`)).status).toBe(400); // no name ⇒ today's 400
    const ok = await fetch(`${base}/api/skill?scope=project&path=&name=tdd`);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { name: string }).name).toBe("tdd");
  });

  // S-179 review follow-up: near-miss paths must 404 — this pin is what
  // kills prefix/suffix match mutations (a strict prefix of a cached row's
  // path, e.g. the row's directory, is NOT that row; nor is the path with a
  // trailing character appended).
  test("GET /api/skill by path — prefix and near-miss variants of a cached row path 404 (S-179)", async () => {
    const base = await start();
    const list = (await (await fetch(`${base}/api/skills?scope=project`)).json()) as {
      skills: Array<{ name: string; path: string }>;
    };
    const row = list.skills[0]!;
    const parentDir = row.path.slice(0, row.path.lastIndexOf("/"));
    expect((await fetch(`${base}/api/skill?scope=project&path=${encodeURIComponent(parentDir)}`)).status).toBe(404);
    expect(
      (await fetch(`${base}/api/skill?scope=project&path=${encodeURIComponent(row.path + "x")}`)).status
    ).toBe(404);
  });

  // S-179 review follow-up: a present path WINS over a present name — a
  // stale client (row path no longer listed) gets an honest 404, not a
  // silent name fallback.
  test("GET /api/skill — present path beats present name; unknown path + known name is 404 (S-179)", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/skill?scope=project&path=${encodeURIComponent("/no/such/row")}&name=tdd`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("skill not found");
  });

  test("GET /api/search returns empty for empty q", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/search?q=`);
    expect(await res.json()).toEqual({ results: [], adjustedQuery: null });
  });

  test("GET /api/search carries failed:true when the registry is unreachable (S-166 F4)", async () => {
    const prev = process.env.SKILLS_UI_API_URL;
    process.env.SKILLS_UI_API_URL = "http://127.0.0.1:1"; // dead port — nothing listens
    try {
      const base = await start();
      const res = await fetch(`${base}/api/search?q=tdd`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { results: unknown[]; adjustedQuery: string | null; failed: boolean };
      expect(body.failed).toBe(true);
      expect(body.results).toEqual([]);
      expect(body.adjustedQuery).toBeNull(); // no fallback noise off a failed lookup
    } finally {
      if (prev === undefined) delete process.env.SKILLS_UI_API_URL;
      else process.env.SKILLS_UI_API_URL = prev;
    }
  });

  test("GET /api/search reports failed:false when the registry answers", async () => {
    const registry = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => Response.json({ skills: [{ id: "tdd", name: "tdd", installs: 5, source: "o/r" }] }),
    });
    const prev = process.env.SKILLS_UI_API_URL;
    process.env.SKILLS_UI_API_URL = `http://127.0.0.1:${registry.port}`;
    try {
      await (registry as unknown as { ready?: Promise<unknown> }).ready;
      const base = await start();
      const body = (await (await fetch(`${base}/api/search?q=tdd`)).json()) as { results: unknown[]; failed?: boolean };
      // discriminated field: absent on success, present-and-true only on failure
      expect(body.failed).toBeUndefined();
      expect(body.results).toHaveLength(1);
    } finally {
      registry.stop(true);
      if (prev === undefined) delete process.env.SKILLS_UI_API_URL;
      else process.env.SKILLS_UI_API_URL = prev;
    }
  });

  test("the served page's settings hint carries the real bound port, not 'a random port' (S-166 G9)", async () => {
    const base = await start(); // port 0 requested → auto-assigned; the hint must show the BOUND port
    expect(server).not.toBeNull();
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain(`window.__PORT__ = ${server!.port}`);
    expect(html).not.toContain("window.__PORT__ = 0");
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

  test("hosted page variant carries loopback-only meta CSP; embedded carries none", async () => {
    const { renderPage } = await import("../src/web/page.ts");
    const hosted = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });
    expect(hosted).toContain('http-equiv="Content-Security-Policy"');
    expect(hosted).toMatch(/connect-src[^"]*127\.0\.0\.1:\*/);
    expect(hosted).toContain('id="connectDialog"');
    const embedded = renderPage("0.0.0-test");
    expect(embedded).not.toContain('http-equiv="Content-Security-Policy"');
    expect(embedded).toContain('id="connectDialog"'); // present but only shown off-loopback
  });
});
