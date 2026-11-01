import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHIM, countShimCalls, readShimCallLog } from "./helpers.ts";

/**
 * S-178 serve-cache pins via the shim call log (SKILLS_SHIM_CALLLOG).
 *
 * The S-177 baseline pins (N requests ⇒ N spawns) were inverted here by the
 * S-178 per-server list cache + request coalescing in src/core/api.ts —
 * these pins assert the CACHED truth:
 *
 *   - concurrent same-scope GET /api/skills share one in-flight
 *     `skills ls --json` spawn (coalescing),
 *   - the first request for a scope populates the per-server cache; every
 *     later read on that server — list, detail-by-name, or (S-179)
 *     detail-by-path — spawns nothing (copy-on-read cache),
 *   - install/update mutations drop the cache, so the next list spawns
 *     exactly once again,
 *   - remove() via the API costs ≤ 2 ls total: before-set from the cache,
 *     and the post-rm verification list refreshes the cache in the same
 *     single spawn (previously two full uncached lists per removal),
 *   - the mutation-then-list behavior never resurrects pre-mutation rows.
 *
 * S-179 adds the detail-by-path pins: the client-supplied `path` is validated
 * as an EXACT cached-row member (no subprocess), the doc is read from the
 * matched row, and an unknown path is a 404 with zero extra spawns.
 *
 * Count-based only — no wall-clock asserts live in this file.
 */

let stateDir: string;
let prefsDir: string;
let callLog: string;
let server: { port: number; base: string; stop: () => Promise<void> } | null = null;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "skills-ui-perf-spawn-state-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-perf-spawn-prefs-"));
  callLog = join(stateDir, "calls.jsonl");
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = stateDir;
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
  process.env.SKILLS_SHIM_CALLLOG = callLog;
});

afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(prefsDir, { recursive: true, force: true });
  delete process.env.SKILLS_UI_SKILLS_BIN;
  delete process.env.SKILLS_SHIM_STATE;
  delete process.env.SKILLS_UI_PREFS_DIR;
  delete process.env.SKILLS_SHIM_CALLLOG;
  delete process.env.SKILLS_SHIM_RM_KEEP;
});

async function start(): Promise<string> {
  const { createSkillsUiServer } = await import("../../src/core/api.ts");
  const s = await createSkillsUiServer({ withPage: false });
  server = { port: s.port, base: `http://127.0.0.1:${s.port}`, stop: s.stop };
  return server.base;
}

interface ListRow {
  name: string;
  description: string;
  scope: string;
  agents: string[];
  path: string;
  source: string | null;
}

describe("perf: spawn counting via shim call log (S-178 cached truth)", () => {
  test(
    "8 concurrent GET /api/skills ⇒ exactly 1 `skills ls` spawn (coalesced + cached, inverts the S-177 4⇒4 baseline)",
    async () => {
      const base = await start();
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => fetch(`${base}/api/skills?scope=project`))
      );
      expect(responses.every((r) => r.status === 200)).toBe(true);
      const bodies = await Promise.all(responses.map((r) => r.json()));
      const first = bodies[0] as { skills: ListRow[] };
      for (const body of bodies) expect(body).toEqual(first); // identical rows for every concurrent reader
      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(1);
      expect(countShimCalls(calls)).toBe(1); // nothing else spawned
    },
    30_000
  );

  test(
    "8 concurrent mixed-scope GETs (4 project + 4 global) ⇒ exactly 2 spawns — one per scope (coalescing is scope-keyed)",
    async () => {
      const base = await start();
      const responses = await Promise.all([
        ...Array.from({ length: 4 }, () => fetch(`${base}/api/skills?scope=project`)),
        ...Array.from({ length: 4 }, () => fetch(`${base}/api/skills?scope=global`)),
      ]);
      expect(responses.every((r) => r.status === 200)).toBe(true);
      for (const r of responses) await r.json(); // drain bodies
      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(2); // 2-argv prefix matches both variants
      expect(countShimCalls(calls, ["ls", "--json", "-g"])).toBe(1);
      expect(countShimCalls(calls)).toBe(2);
    },
    30_000
  );

  test(
    "N sequential GETs on one server ⇒ 1 spawn total (first populates, rest hit the cache)",
    async () => {
      const base = await start();
      let first: unknown;
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${base}/api/skills?scope=project`);
        expect(res.status).toBe(200);
        const body = await res.json();
        if (i === 0) first = body;
        else expect(body).toEqual(first); // cached rows identical to the populating read
      }
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1);
    },
    30_000
  );

  test(
    "detail-by-name reads locate from the cached list — first read on a fresh serve ⇒ 1 spawn, subsequent ⇒ 0",
    async () => {
      const base = await start();
      let first: unknown;
      for (let i = 0; i < 2; i++) {
        const res = await fetch(`${base}/api/skill?name=tdd&scope=project`);
        expect(res.status).toBe(200);
        const body = await res.json();
        if (i === 0) first = body;
        else expect(body).toEqual(first);
      }
      // and a list read afterwards still spawns nothing
      const list = await fetch(`${base}/api/skills?scope=project`);
      expect(list.status).toBe(200);
      await list.json();
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1);
    },
    30_000
  );

  test(
    "S-179 detail-by-path, warm list ⇒ 0 extra spawns; unknown path ⇒ 404 with 0 extra spawns",
    async () => {
      const base = await start();
      const list = await fetch(`${base}/api/skills?scope=project`);
      const body = (await list.json()) as { skills: ListRow[] };
      const row = body.skills[0]!;
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1); // the warm-up spawn
      const detail = await fetch(
        `${base}/api/skill?scope=project&path=${encodeURIComponent(row.path)}`
      );
      expect(detail.status).toBe(200);
      const detailBody = (await detail.json()) as { name: string; scope: string; body: string };
      expect(detailBody.name).toBe(row.name);
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1); // 0 extra
      // a path that is not an exact cached row: 404, no subprocess
      const miss = await fetch(
        `${base}/api/skill?scope=project&path=${encodeURIComponent("/no/such/cached/skill")}`
      );
      expect(miss.status).toBe(404);
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1); // still 0 extra
    },
    30_000
  );

  test(
    "S-179 cold serve, detail-by-path first ⇒ 1 spawn (cache population), again ⇒ 0; warm name fallback ⇒ 0",
    async () => {
      const base = await start();
      // the path comes straight from the shim's contract fixture so the cold
      // detail is genuinely the FIRST request this server sees
      const contract = JSON.parse(
        readFileSync(new URL("../fixtures/contract/ls-project.json", import.meta.url), "utf-8")
      ) as Array<{ name: string; path: string }>;
      const row = contract[0]!;
      const first = await fetch(
        `${base}/api/skill?scope=project&path=${encodeURIComponent(row.path)}`
      );
      expect(first.status).toBe(200);
      expect(((await first.json()) as { name: string }).name).toBe(row.name);
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1); // population spawn
      const second = await fetch(
        `${base}/api/skill?scope=project&path=${encodeURIComponent(row.path)}`
      );
      expect(second.status).toBe(200);
      await second.json();
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1); // 0 extra
      // the name form on the warm cache: fallback works, still 0 spawns
      const byName = await fetch(
        `${base}/api/skill?scope=project&name=${encodeURIComponent(row.name)}`
      );
      expect(byName.status).toBe(200);
      expect(((await byName.json()) as { name: string }).name).toBe(row.name);
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1);
    },
    30_000
  );

  test(
    "remove() via the API on a fresh serve costs exactly 2 ls (before-set + post-rm refresh); a warm-cache remove costs 1 — and the cache never shows pre-rm rows",
    async () => {
      const base = await start();
      // cold-cache remove: listBefore spawns once, listAfter refresh spawns once
      const first = await fetch(`${base}/api/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: ["tdd"] }),
      });
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { ok: boolean; output: string };
      expect(firstBody.ok).toBe(true);
      expect(firstBody.output).toContain("Removed: tdd");
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(2);
      // warm-cache remove: before-set from the cache (0 spawns), one refresh
      const second = await fetch(`${base}/api/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: ["code-review"] }),
      });
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { ok: boolean; output: string };
      expect(secondBody.ok).toBe(true);
      expect(secondBody.output).toContain("Removed: code-review");
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(3); // +1 only
      // the post-remove cache serves the post-rm truth — zero extra spawns
      const after = await fetch(`${base}/api/skills?scope=project`);
      const body = (await after.json()) as { skills: ListRow[] };
      expect(body.skills.map((s) => s.name)).not.toContain("tdd");
      expect(body.skills.map((s) => s.name)).not.toContain("code-review");
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(3);
    },
    30_000
  );

  test(
    "failed remove (shim keeps the skill) still costs ≤ 2 ls and the refreshed cache keeps the kept row",
    async () => {
      process.env.SKILLS_SHIM_RM_KEEP = "tdd";
      const base = await start();
      const res = await fetch(`${base}/api/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: ["tdd"] }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; output: string };
      expect(body.ok).toBe(false); // still present in the after-set → failure, exactly as uncached
      expect(body.output).toContain("failed: tdd");
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(2); // before + refresh, no more
      const after = await fetch(`${base}/api/skills?scope=project`);
      const list = (await after.json()) as { skills: ListRow[] };
      expect(list.skills.map((s) => s.name)).toContain("tdd"); // refreshed cache reflects reality
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(2);
    },
    30_000
  );

  test(
    "mutation invalidates: after POST /api/install (even a failing one) the next /api/skills spawns exactly once again",
    async () => {
      const base = await start();
      await fetch(`${base}/api/skills?scope=project`).then((r) => r.json());
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1);
      // add fixture has one failed entry → 500 + ok:false; invalidation is
      // unconditional (upstream add can partially succeed)
      const install = await fetch(`${base}/api/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "fixture/source", skills: ["alpha", "beta"] }),
      });
      expect(install.status).toBe(500);
      const res = await fetch(`${base}/api/skills?scope=project`);
      expect(res.status).toBe(200);
      await res.json();
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(2); // exactly one re-spawn
    },
    30_000
  );

  test(
    "mutation invalidates: after POST /api/update the next /api/skills spawns exactly once again",
    async () => {
      const base = await start();
      await fetch(`${base}/api/skills?scope=project`).then((r) => r.json());
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(1);
      const update = await fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: [] }),
      });
      expect(update.status).toBe(200);
      const res = await fetch(`${base}/api/skills?scope=project`);
      expect(res.status).toBe(200);
      await res.json();
      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(2); // exactly one re-spawn
      expect(countShimCalls(calls)).toBe(3); // ls + update + ls — nothing else
    },
    30_000
  );

  test("call log is opt-in: without SKILLS_SHIM_CALLLOG no log file is written", async () => {
    delete process.env.SKILLS_SHIM_CALLLOG;
    const base = await start();
    const res = await fetch(`${base}/api/skills?scope=project`);
    expect(res.status).toBe(200);
    await res.json();
    expect(readShimCallLog(callLog)).toEqual([]); // absent file ⇒ zero calls parsed
  });
});
