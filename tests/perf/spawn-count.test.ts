import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHIM, countShimCalls, readShimCallLog } from "./helpers.ts";

/**
 * S-177 baseline pins via the shim call log (SKILLS_SHIM_CALLLOG).
 *
 * These are INSTRUMENTATION and BASELINE asserts — count-based, no
 * wall-clock. Current main has no serve-side list cache, so N requests ⇒
 * N `skills ls` spawns; the serve-cache ticket will invert these pins
 * (N ⇒ 1) as its acceptance evidence and update them here.
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
});

async function start(): Promise<string> {
  const { createSkillsUiServer } = await import("../../src/core/api.ts");
  const s = await createSkillsUiServer({ withPage: false });
  server = { port: s.port, base: `http://127.0.0.1:${s.port}`, stop: s.stop };
  return server.base;
}

describe("perf: spawn counting via shim call log", () => {
  test(
    "4 concurrent GET /api/skills ⇒ 4 `skills ls` spawns today (baseline pin; serve-cache inverts to 1)",
    async () => {
      const base = await start();
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => fetch(`${base}/api/skills?scope=project`))
      );
      expect(responses.every((r) => r.status === 200)).toBe(true);
      for (const r of responses) await r.json(); // drain bodies
      const calls = readShimCallLog(callLog);
      expect(countShimCalls(calls, ["ls", "--json"])).toBe(4);
      expect(countShimCalls(calls)).toBe(4); // nothing else spawned
    },
    30_000
  );

  test(
    "sequential GETs re-spawn every time on main — 3 requests ⇒ 3 spawns (no cache baseline pin)",
    async () => {
      const base = await start();
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${base}/api/skills?scope=project`);
        expect(res.status).toBe(200);
        await res.json();
      }
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(3);
    },
    30_000
  );

  test(
    "each detail read re-lists on main — 2 GET /api/skill ⇒ 2 spawns (baseline pin; detail cache inverts to 1)",
    async () => {
      const base = await start();
      for (let i = 0; i < 2; i++) {
        const res = await fetch(`${base}/api/skill?name=tdd&scope=project`);
        expect(res.status).toBe(200);
        await res.json();
      }
      expect(countShimCalls(readShimCallLog(callLog), ["ls", "--json"])).toBe(2);
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
