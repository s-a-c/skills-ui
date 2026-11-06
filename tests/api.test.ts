import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_VERSION } from "../src/core/version.ts";
import { resetSkillsBinCache } from "../src/core/skills-client.ts";
import { buildSyntheticCorpus, countShimCalls, readShimCallLog } from "./perf/helpers.ts";
import { createWorkspaceFixture } from "./helpers/audit-state.ts";

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

  // S-200 (finding HTTP-2): a malformed `skills` value in POST /api/update
  // used to widen silently into a whole-scope update. These pins run the real
  // server against the opt-in CLI shim call log (workspace fixture from
  // tests/helpers/audit-state.ts owns .agents/tmp fixtures and env) and
  // require rejection BEFORE any spawn — while an omitted `skills` and an
  // explicit [] remain the deliberate whole-scope operations.
  describe("api: POST /api/update selection validation (S-200)", () => {
    let fixture: ReturnType<typeof createWorkspaceFixture>;
    let restoreEnv: () => void;
    let callLog: string;

    beforeEach(() => {
      fixture = createWorkspaceFixture();
      restoreEnv = fixture.activate(); // sets SKILLS_SHIM_CALLLOG before start()
      callLog = fixture.env.SKILLS_SHIM_CALLLOG;
    });

    afterEach(async () => {
      await server?.stop();
      server = null;
      restoreEnv();
      fixture.cleanup();
    });

    test("malformed update selection never widens to all skills", async () => {
      const base = await start(); // existing api.test.ts helper
      for (const skills of [null, "tdd", ["tdd", null], [1], {}]) {
        const response = await fetch(base + "/api/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ skills }),
        });
        expect(response.status).toBe(400);
      }
      expect(readShimCallLog(callLog).filter((c) => c.args[0] === "update")).toEqual([]);
    });

    test("omitted skills and explicit [] stay deliberate whole-scope updates", async () => {
      const base = await start();
      const omitted = await fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(omitted.status).toBe(200);
      const emptied = await fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: [] }),
      });
      expect(emptied.status).toBe(200);
      const updates = readShimCallLog(callLog).filter((c) => c.args[0] === "update");
      expect(updates).toHaveLength(2);
      for (const call of updates) {
        expect(call.args).toEqual(["update", "-p", "-y"]); // no names ⇒ whole scope, unchanged
      }
    });

    test("selected names still reach update; option-shaped names still 400 before spawning", async () => {
      const base = await start();
      const selected = await fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: ["tdd"] }),
      });
      expect(selected.status).toBe(200);
      const optionShaped = await fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: ["--dry-run"] }),
      });
      expect(optionShaped.status).toBe(400);
      const updates = readShimCallLog(callLog).filter((c) => c.args[0] === "update");
      expect(updates).toHaveLength(1); // the 400 name spawned nothing
      expect(updates[0]!.args).toEqual(["update", "-p", "-y", "tdd"]); // selection passed through intact
    });
  });

  // S-199 (finding HTTP-1): the seed flow's "Install all" button posts
  // exactly skills:["*"] — install() maps that singleton wildcard to
  // `add <source> --all` (services/install.ts). The shared validSkillName
  // charset stays strict everywhere else; POST /api/install alone exempts
  // the SINGLETON wildcard, and these pins run the real server against the
  // opt-in CLI shim call log (workspace fixture from
  // tests/helpers/audit-state.ts owns .agents/tmp fixtures and env) with a
  // successful SKILLS_SHIM_ADD fixture so acceptance requires HTTP 200 +
  // ok:true, not merely a different error.
  describe("api: POST /api/install singleton wildcard (S-199)", () => {
    let fixture: ReturnType<typeof createWorkspaceFixture>;
    let restoreEnv: () => void;
    let callLog: string;

    beforeEach(() => {
      fixture = createWorkspaceFixture();
      // successful add fixture: every entry installed ⇒ shim exits 0 ⇒ the
      // wildcard acceptance below must see 200 + ok:true, not another error
      writeFileSync(
        join(fixture.root, "add-ok.json"),
        JSON.stringify([
          {
            name: "alpha",
            status: "installed",
            source: "fixture/repo",
            ref: null,
            hash: null,
            path: "/tmp/skills-shim-state/alpha",
            scope: "project",
            agents: ["claude-code"],
            mode: "copy",
            security: null,
          },
        ])
      );
      process.env.SKILLS_SHIM_ADD = join(fixture.root, "add-ok.json");
      restoreEnv = fixture.activate(); // sets SKILLS_SHIM_CALLLOG before start()
      callLog = fixture.env.SKILLS_SHIM_CALLLOG;
    });

    afterEach(async () => {
      await server?.stop();
      server = null;
      delete process.env.SKILLS_SHIM_ADD; // restore the fixture-owned env key
      restoreEnv();
      fixture.cleanup();
    });

    test('install all accepts singleton wildcard but rejects mixed lists', async () => {
      const base = await start();
      const send = (skills: unknown) => fetch(base + '/api/install', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'fixture/repo', skills })
      });
      const success=await send(['*']);
      expect(success.status).toBe(200);
      expect((await success.json()).ok).toBe(true);
      expect((await send(['*', 'tdd'])).status).toBe(400);
      expect((await send(['--all'])).status).toBe(400);
      const call = readShimCallLog(callLog).find(c => c.args[0] === 'add');
      expect(call?.args).toContain('--all');
      expect(call?.args).not.toContain('--skill');
    });

    test("only the wildcard request reaches the CLI; ordinary and empty lists keep their argv", async () => {
      const base = await start();
      const send = (skills: unknown) =>
        fetch(base + "/api/install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "fixture/repo", skills }),
        });
      expect((await send(["*"])).status).toBe(200);
      expect((await send(["alpha", "beta"])).status).toBe(200); // ordinary list unchanged
      expect((await send(["*", "tdd"])).status).toBe(400);
      expect((await send([])).status).toBe(200); // empty list: unchanged pass-through
      const adds = readShimCallLog(callLog).filter((c) => c.args[0] === "add");
      expect(adds).toHaveLength(3); // the mixed list 400'd before any spawn
      expect(adds[0]!.args).toContain("--all"); // singleton ⇒ --all, no --skill
      expect(adds[0]!.args).not.toContain("--skill");
      expect(adds[1]!.args.filter((a) => a === "--skill")).toHaveLength(2);
      expect(adds[1]!.args).toContain("alpha");
      expect(adds[1]!.args).toContain("beta");
      expect(adds[2]!.args).not.toContain("--all"); // empty list spawns neither flag
      expect(adds[2]!.args).not.toContain("--skill");
    });

    test("empty, malformed, and option-shaped selections keep their boundary verdicts", async () => {
      const base = await start();
      const send = (skills: unknown) =>
        fetch(base + "/api/install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "fixture/repo", skills }),
        });
      for (const skills of [null, "tdd", [1], [null], ["* ", "alpha"], ["*/*"], ["--dry-run"], [""], ["", "alpha"]]) {
        const res = await send(skills);
        expect(res.status).toBe(400);
      }
      // every rejection above happened BEFORE the CLI: no add spawn at all
      expect(readShimCallLog(callLog).filter((c) => c.args[0] === "add")).toEqual([]);
    });

    test("wildcard install still reports CLI failure honestly (S-199)", async () => {
      // failed add fixture: the wildcard path must surface ok:false, not lie
      writeFileSync(
        join(fixture.root, "add-failed.json"),
        JSON.stringify([{ name: "alpha", status: "failed", error: "simulated wildcard failure" }])
      );
      process.env.SKILLS_SHIM_ADD = join(fixture.root, "add-failed.json");
      const base = await start();
      const res = await fetch(base + "/api/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "fixture/repo", skills: ["*"] }),
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { ok: boolean; output: string };
      expect(body.ok).toBe(false);
      expect(body.output).toContain("failed");
    });
  });

  // S-201 (finding HTTP-3): the description enrichment cache was keyed by
  // path only, so after a wrapper-owned mutation (update/install/remove) the
  // list kept serving STALE cached descriptions while /api/skill detail
  // already showed the fresh body. These pins run the real server over real
  // fixture SKILL.md files (workspace fixture from tests/helpers/audit-state.ts
  // owns .agents/tmp fixtures and env; the shared stateDir fixture variable is
  // rebound under that owned root, not the system tmpdir), bind
  // SKILLS_SHIM_LS_PROJECT to a synthetic corpus before start(), and require
  // the list description to track the file after every mutation kind —
  // including failed/partial ones — and after a pre-mutation list request
  // held at the subprocess boundary settles late.
  describe("api: description enrichment invalidated with list generation (S-201)", () => {
    let fixture: ReturnType<typeof createWorkspaceFixture>;
    let restoreEnv: () => void;
    let callLog: string;
    let savedEnv: Array<[string, string | undefined]>;

    // env keys these tests set directly — saved and restored after each test
    const MUTABLE_ENV_KEYS = [
      "SKILLS_SHIM_LS_PROJECT",
      "SKILLS_SHIM_UPDATE_FAIL",
      "SKILLS_SHIM_HOLD_DIR",
      "SKILLS_SHIM_REAL_BIN",
    ];

    beforeEach(() => {
      fixture = createWorkspaceFixture();
      // rebind the shared fixture variables under the owned workspace root
      // (.agents/tmp), NOT the system tmpdir
      stateDir = fixture.root;
      prefsDir = join(fixture.root, "prefs");
      savedEnv = MUTABLE_ENV_KEYS.map((k) => [k, process.env[k]] as [string, string | undefined]);
      restoreEnv = fixture.activate(); // workspace-owned env before start()
      callLog = fixture.env.SKILLS_SHIM_CALLLOG;
      resetSkillsBinCache(); // SKILLS_UI_SKILLS_BIN may change per test below
    });

    afterEach(async () => {
      await server?.stop();
      server = null;
      for (const [key, value] of savedEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      restoreEnv();
      fixture.cleanup();
      resetSkillsBinCache();
    });

    const docFor = (name: string, description: string, body: string): string =>
      `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
    const OLD_DOC = (name: string): string => docFor(name, "OLD_DESCRIPTION", "OLD_BODY");

    type List = { skills: Array<{ name: string; description: string }> };
    const listDescription = async (base: string, name: string): Promise<string | undefined> => {
      const body = (await (await fetch(`${base}/api/skills`)).json()) as List;
      return body.skills.find((s) => s.name === name)?.description;
    };

    test("mutation refreshes list description and detail body", async () => {
      const corpus = buildSyntheticCorpus(stateDir, 2, 0);
      process.env.SKILLS_SHIM_LS_PROJECT = corpus.projectFixture;
      const skill = corpus.project[0]!, skillDoc = join(skill.path, "SKILL.md");
      writeFileSync(skillDoc, OLD_DOC(skill.name));
      const base = await start();
      expect(await listDescription(base, skill.name)).toBe("OLD_DESCRIPTION");
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1); // warm cache
      writeFileSync(skillDoc, docFor(skill.name, "NEW_DESCRIPTION", "NEW_BODY"));
      const changed = await fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: [skill.name] }),
      });
      expect(changed.status).toBe(200);
      expect(await listDescription(base, skill.name)).toBe("NEW_DESCRIPTION");
      const detail = (await (
        await fetch(`${base}/api/skill?name=${encodeURIComponent(skill.name)}`)
      ).json()) as { body: string };
      expect(detail.body).toContain("NEW_BODY");
      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["update", "-p", "-y", skill.name])).toBe(1);
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(2); // warm + post-update; detail served from the refreshed cache
    });

    test("install — even a partially failing install refreshes list descriptions", async () => {
      const corpus = buildSyntheticCorpus(stateDir, 2, 0);
      process.env.SKILLS_SHIM_LS_PROJECT = corpus.projectFixture;
      const skill = corpus.project[0]!, skillDoc = join(skill.path, "SKILL.md");
      writeFileSync(skillDoc, OLD_DOC(skill.name));
      const base = await start();
      expect(await listDescription(base, skill.name)).toBe("OLD_DESCRIPTION");
      writeFileSync(skillDoc, docFor(skill.name, "NEW_DESCRIPTION", "NEW_BODY"));
      // contract add fixture has one failed entry → 500 + ok:false; the
      // invalidation is unconditional (upstream add can partially succeed)
      const res = await fetch(`${base}/api/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "fixture/source", skills: ["alpha", "beta"] }),
      });
      expect(res.status).toBe(500);
      expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
      expect(await listDescription(base, skill.name)).toBe("NEW_DESCRIPTION");
      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(2); // warm + post-install; no extra spawns
    });

    test("remove refreshes the surviving rows' descriptions", async () => {
      const corpus = buildSyntheticCorpus(stateDir, 2, 0);
      process.env.SKILLS_SHIM_LS_PROJECT = corpus.projectFixture;
      const victim = corpus.project[0]!;
      const survivor = corpus.project[1]!;
      writeFileSync(join(survivor.path, "SKILL.md"), OLD_DOC(survivor.name));
      const base = await start();
      expect(await listDescription(base, survivor.name)).toBe("OLD_DESCRIPTION"); // warm cache
      writeFileSync(
        join(survivor.path, "SKILL.md"),
        docFor(survivor.name, "NEW_DESCRIPTION", "NEW_BODY")
      );
      const res = await fetch(`${base}/api/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: [victim.name] }),
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
      const body = (await (await fetch(`${base}/api/skills`)).json()) as List;
      expect(body.skills.map((s) => s.name)).not.toContain(victim.name);
      expect(body.skills.find((s) => s.name === survivor.name)?.description).toBe("NEW_DESCRIPTION");
      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(2); // warm + post-rm refresh; no extra spawns
    });

    test("a failed update still refreshes list descriptions", async () => {
      const corpus = buildSyntheticCorpus(stateDir, 2, 0);
      process.env.SKILLS_SHIM_LS_PROJECT = corpus.projectFixture;
      const skill = corpus.project[0]!, skillDoc = join(skill.path, "SKILL.md");
      writeFileSync(skillDoc, OLD_DOC(skill.name));
      const base = await start();
      expect(await listDescription(base, skill.name)).toBe("OLD_DESCRIPTION");
      writeFileSync(skillDoc, docFor(skill.name, "NEW_DESCRIPTION", "NEW_BODY"));
      process.env.SKILLS_SHIM_UPDATE_FAIL = "1";
      const res = await fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: [skill.name] }),
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { ok: boolean }).ok).toBe(false); // failure reported honestly…
      expect(await listDescription(base, skill.name)).toBe("NEW_DESCRIPTION"); // …and enrichment still dropped
      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(2); // warm + post-update; no extra spawns
    });

    test("a pre-mutation list held at the subprocess boundary settles late and never repopulates shared enrichment", async () => {
      // holder wrapper around the real fixture shim: while the hold marker
      // exists, the spawned `skills` child parks BEFORE doing any work — the
      // hold is at the real subprocess boundary, not a service mock
      const holdDir = join(fixture.root, "hold");
      mkdirSync(holdDir, { recursive: true });
      const holdMarker = join(holdDir, "hold-ls");
      const heldMarker = join(holdDir, "held");
      writeFileSync(holdMarker, "1");
      const holder = join(fixture.root, "held-skills-shim.mjs");
      writeFileSync(
        holder,
        [
          "#!/usr/bin/env -S bun",
          'import { existsSync, writeFileSync } from "node:fs";',
          'import { join } from "node:path";',
          "const args = process.argv.slice(2);",
          "const holdDir = process.env.SKILLS_SHIM_HOLD_DIR;",
          'if (holdDir && existsSync(join(holdDir, "hold-ls"))) {',
          '  writeFileSync(join(holdDir, "held"), JSON.stringify(args));',
          '  while (existsSync(join(holdDir, "hold-ls"))) await Bun.sleep(5);',
          "}",
          "const real = process.env.SKILLS_SHIM_REAL_BIN;",
          "const proc = Bun.spawnSync([process.execPath, real, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });",
          "process.stdout.write(proc.stdout);",
          "process.stderr.write(proc.stderr);",
          "process.exit(proc.exitCode ?? 0);",
          "",
        ].join("\n")
      );
      chmodSync(holder, 0o755);
      process.env.SKILLS_SHIM_HOLD_DIR = holdDir;
      process.env.SKILLS_SHIM_REAL_BIN = SHIM; // the real fixture shim, exec'd by the holder
      process.env.SKILLS_UI_SKILLS_BIN = holder; // the server spawns the holder
      resetSkillsBinCache();

      const corpus = buildSyntheticCorpus(stateDir, 2, 0);
      process.env.SKILLS_SHIM_LS_PROJECT = corpus.projectFixture;
      const skill = corpus.project[0]!, skillDoc = join(skill.path, "SKILL.md");
      writeFileSync(skillDoc, OLD_DOC(skill.name));
      const base = await start();

      // the mutation spawn is parked inside the holder (queue slot taken)
      const changed = fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: [skill.name] }),
      });
      const deadline = Date.now() + 10_000;
      while (!existsSync(heldMarker)) {
        if (Date.now() > deadline) throw new Error("holder never parked the update spawn");
        await Bun.sleep(5);
      }

      // the list request arrives while the mutation is in flight: it captures
      // the PRE-mutation generation, and its `ls` queues behind the held
      // update at the subprocess boundary
      const staleList = fetch(`${base}/api/skills?scope=project`);
      writeFileSync(skillDoc, docFor(skill.name, "NEW_DESCRIPTION", "NEW_BODY"));

      // release: invalidation lands, THEN the queued pre-mutation ls runs
      rmSync(holdMarker);
      expect((await changed).status).toBe(200);
      const stale = await staleList; // the old awaiter receives its own response
      expect(stale.status).toBe(200);
      const staleBody = (await stale.json()) as List;
      expect(staleBody.skills.find((s) => s.name === skill.name)).toBeDefined();

      // the file changes AGAIN afterwards with no mutation in between — no
      // invalidation runs, so only the generation guard keeps a stale
      // awaiter's enrichment write out of the CURRENT shared cache
      writeFileSync(skillDoc, docFor(skill.name, "FINAL_DESCRIPTION", "FINAL_BODY"));

      const body = (await (await fetch(`${base}/api/skills?scope=project`)).json()) as List;
      expect(body.skills.find((s) => s.name === skill.name)?.description).toBe("FINAL_DESCRIPTION");

      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["update", "-p", "-y", skill.name])).toBe(1);
      // exactly two ls: the late pre-mutation flight + the fresh read. A
      // third would mean the stale flight resurrected the list cache.
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(2);
    });
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
