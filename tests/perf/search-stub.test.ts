import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHIM, startSearchStub, type SearchStub } from "./helpers.ts";

/**
 * S-177: the stub registry search server (fixed artificial RTT) and the
 * upstream call-count pins. Count/behavioral only — the wrapper-overhead
 * wall-clock number belongs to scripts/perf/budget.ts, not to tests.
 */

let stateDir: string;
let prefsDir: string;
let server: { stop: () => Promise<void> } | null = null;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "skills-ui-perf-search-state-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-perf-search-prefs-"));
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
  const { createSkillsUiServer } = await import("../../src/core/api.ts");
  const s = await createSkillsUiServer({ withPage: false });
  server = s;
  return `http://127.0.0.1:${s.port}`;
}

describe("perf: stub registry search server (fixed artificial RTT)", () => {
  test("wrapper forwards to SKILLS_UI_API_URL and maps the stub payload — exactly 1 upstream call", async () => {
    const stub = await startSearchStub({ rttMs: 40 });
    const prev = process.env.SKILLS_UI_API_URL;
    process.env.SKILLS_UI_API_URL = stub.url;
    try {
      const base = await start();
      const res = await fetch(`${base}/api/search?q=stub`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        results: Array<{ name: string; installs: number }>;
        adjustedQuery: string | null;
        failed?: boolean;
      };
      expect(body.results).toHaveLength(1);
      expect(body.results[0]!.name).toBe("stub-skill");
      expect(body.results[0]!.installs).toBe(42);
      expect(body.adjustedQuery).toBeNull();
      expect(body.failed).toBeUndefined(); // discriminated: absent on success
      expect(stub.requests).toHaveLength(1);
      expect(stub.requests[0]!.q).toBe("stub");
      // instrument sanity: the RTT stamping is coherent (end never before start)
      expect(stub.requests[0]!.end).toBeGreaterThanOrEqual(stub.requests[0]!.start);
    } finally {
      stub.stop();
      if (prev === undefined) delete process.env.SKILLS_UI_API_URL;
      else process.env.SKILLS_UI_API_URL = prev;
    }
  });

  test("distinct queries cost exactly one upstream call each (no fan-out on hyphen-free queries)", async () => {
    const stub = await startSearchStub({ rttMs: 10 });
    const prev = process.env.SKILLS_UI_API_URL;
    process.env.SKILLS_UI_API_URL = stub.url;
    try {
      const base = await start();
      for (const q of ["stub", "stub", "stub-skill"]) {
        // 'stub-skill' contains '-': the wrapper gates by first token ('stub'),
        // the stub result matches the gate, so still no fan-out
        const res = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(200);
        await res.json();
      }
      expect(stub.requests.map((r) => r.q)).toEqual(["stub", "stub", "stub-skill"]);
      expect(stub.maxIdenticalInFlight()).toBe(1); // all sequential
    } finally {
      stub.stop();
      if (prev === undefined) delete process.env.SKILLS_UI_API_URL;
      else process.env.SKILLS_UI_API_URL = prev;
    }
  });

  test(
    "3 concurrent identical searches ⇒ 3 identical upstream requests in flight (baseline pin; search-dedupe inverts to ≤1)",
    async () => {
      const stub: SearchStub = await startSearchStub({ rttMs: 80 });
      const prev = process.env.SKILLS_UI_API_URL;
      process.env.SKILLS_UI_API_URL = stub.url;
      try {
        const base = await start();
        const responses = await Promise.all(
          Array.from({ length: 3 }, () => fetch(`${base}/api/search?q=stub`))
        );
        expect(responses.every((r) => r.status === 200)).toBe(true);
        for (const r of responses) await r.json();
        expect(stub.requests).toHaveLength(3); // no dedupe on main — the recorded baseline
        expect(stub.maxIdenticalInFlight()).toBe(3);
      } finally {
        stub.stop();
        if (prev === undefined) delete process.env.SKILLS_UI_API_URL;
        else process.env.SKILLS_UI_API_URL = prev;
      }
    },
    15_000
  );
});
