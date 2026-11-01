import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bearerMatches } from "../src/core/hosted-auth.ts";
import { SkillsBusyError, createSpawnQueue } from "../src/core/spawn-queue.ts";

/**
 * 0.5.1 impl A hostile-input suite: cross-site fetch-metadata rejection,
 * argv/shape validation at the API boundary, transport-level body cap,
 * rate limiting, and the serialized spawn queue.
 */

const SHIM = new URL("fixtures/skills-shim.mjs", import.meta.url).pathname;
const SLOW_SHIM = new URL("fixtures/slow-skills-shim.mjs", import.meta.url).pathname;

let stateDir: string;
let prefsDir: string;
let server: { port: number; stop: () => Promise<void> } | null = null;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "skills-ui-hard-state-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-hard-prefs-"));
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = stateDir;
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
  delete process.env.SKILLS_UI_HOSTED_TOKEN;
  delete process.env.SKILLS_UI_ALLOWED_ORIGINS;
  delete process.env.SKILLS_UI_SPAWN_QUEUE_CAP;
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
  delete process.env.SKILLS_UI_ALLOWED_ORIGINS;
  delete process.env.SKILLS_UI_SPAWN_QUEUE_CAP;
});

async function start(
  rateLimit?: { capacity: number; refillPerSec: number } | null
): Promise<string> {
  const { createSkillsUiServer } = await import("../src/core/api.ts");
  server = await createSkillsUiServer({ withPage: true, ...(rateLimit !== undefined ? { rateLimit } : {}) });
  return `http://127.0.0.1:${server.port}`;
}

describe("unit: bearerMatches (timing-safe)", () => {
  test("exact header matches; anything else does not", () => {
    expect(bearerMatches("Bearer abc", "abc")).toBe(true);
    expect(bearerMatches("Bearer abc", "abd")).toBe(false);
    expect(bearerMatches("bearer abc", "abc")).toBe(false);
    expect(bearerMatches("", "abc")).toBe(false);
  });
});

describe("unit: spawn queue", () => {
  test("serializes tasks and rejects when the waiting line is full", async () => {
    process.env.SKILLS_UI_SPAWN_QUEUE_CAP = "2";
    const queue = createSpawnQueue(1);
    const finished: number[] = [];
    const release = Promise.withResolvers<void>();
    const run = (i: number, block?: Promise<void>) =>
      queue.run(async () => {
        if (block) await block;
        finished.push(i);
      });
    const p0 = run(0, release.promise);
    const p1 = run(1);
    const p2 = run(2);
    expect(queue.running).toBe(1); // task 0 runs, 1–2 wait in line
    expect(queue.queued).toBe(2);
    let busy: unknown = null;
    try {
      await queue.run(async () => {});
    } catch (error) {
      busy = error;
    }
    expect(busy).toBeInstanceOf(SkillsBusyError);
    release.resolve();
    await Promise.all([p0, p1, p2]);
    expect(finished).toEqual([0, 1, 2]); // strict FIFO serialization
    expect(queue.queued).toBe(0);
    expect(queue.running).toBe(0);
  });
});

describe("unit: updates-check URL encoding + timeout", () => {
  test("fetchRepoTree encodes path segments and sends a timeout signal", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedSignal: unknown = null;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedSignal = init?.signal ?? null;
      return new Response(JSON.stringify({ tree: [] }), { status: 200 });
    }) as typeof fetch;
    try {
      const { fetchRepoTree } = await import("../src/core/services/updates-check.ts");
      const tree = await fetchRepoTree("vercel-labs/skills", "main");
      expect(tree).toEqual([]);
      expect(capturedUrl).toBe(
        "https://api.github.com/repos/vercel-labs/skills/git/trees/main?recursive=1"
      );
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      await fetchRepoTree("a b/c d");
      expect(capturedUrl).toContain("repos/a%20b/c%20d/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("api: cross-site fetch-metadata gate", () => {
  test("no-Origin + sec-fetch-site: cross-site → 403 on every endpoint", async () => {
    const base = await start();
    for (const path of ["/api/version", "/api/skills", "/api/updates", "/api/source-skills?source=https://evil.install/x"]) {
      const res = await fetch(`${base}${path}`, {
        headers: { "sec-fetch-site": "cross-site" },
      });
      expect(res.status).toBe(403);
    }
  });

  test("sec-fetch-site: none (address-bar navigation) passes", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/version`, { headers: { "sec-fetch-site": "none" } });
    expect(res.status).toBe(200);
  });

  test("header-less requests (curl / Bun fetch) pass — regression guard", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/version`);
    expect(res.status).toBe(200);
  });
});

describe("api: boundary validation", () => {
  test("source-skills rejects argv-injection, credentials, control chars, oversize", async () => {
    const base = await start();
    const bad = [
      "--global",
      "-x",
      "http://user:pass@evil.install/repo",
      "https://ok.example/a\u0000b",
      "a".repeat(513),
    ];
    for (const source of bad) {
      const res = await fetch(`${base}/api/source-skills?source=${encodeURIComponent(source)}`);
      expect(res.status).toBe(400);
    }
  });

  test("install rejects hostile source and skill names", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "https://good.example/repo", skills: ["--dry-run"] }),
    });
    expect(res.status).toBe(400);
    const res2 = await fetch(`${base}/api/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "-rf", skills: ["ok"] }),
    });
    expect(res2.status).toBe(400);
  });

  test("remove and update reject hostile skill names", async () => {
    const base = await start();
    for (const path of ["/api/remove", "/api/update"]) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: ["fine", "bad\u0007name"] }),
      });
      expect(res.status).toBe(400);
    }
  });

  test("search rejects control characters and oversize queries", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/search?q=${encodeURIComponent("a\u001bb")}`);
    expect(res.status).toBe(400);
    const res2 = await fetch(`${base}/api/search?q=${"x".repeat(513)}`);
    expect(res2.status).toBe(400);
  });
});

describe("api: transport-level body cap + bad JSON", () => {
  test("2 MiB body → 413 before buffering", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/prefs`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: "x".repeat(2 * 1024 * 1024) }),
    });
    expect(res.status).toBe(413);
  });

  test("malformed JSON → 400, not 500", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/prefs`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("api: rate limiter", () => {
  test("over-capacity burst → 429", async () => {
    const base = await start({ capacity: 2, refillPerSec: 0 });
    expect((await fetch(`${base}/api/version`)).status).toBe(200);
    expect((await fetch(`${base}/api/version`)).status).toBe(200);
    const limited = await fetch(`${base}/api/version`);
    expect(limited.status).toBe(429);
  });

  test("refill lets a short pause recover", async () => {
    const base = await start({ capacity: 1, refillPerSec: 1000 });
    expect((await fetch(`${base}/api/version`)).status).toBe(200);
    await Bun.sleep(30);
    expect((await fetch(`${base}/api/version`)).status).toBe(200);
  });
});

describe("api: serialized spawn queue", () => {
  test("burst of genuinely concurrent DISTINCT spawns beyond the queue cap → 503 server busy; the rest succeed", async () => {
    // S-178 reshaped this pin: /api/skills now coalesces concurrent
    // same-scope requests onto ONE in-flight `skills ls` and serves later
    // reads from the per-server cache, so a same-scope burst can no longer
    // fill the queue (that is the fix, pinned in tests/perf/spawn-count.test.ts).
    // The cap semantics must still bind for genuinely concurrent DISTINCT
    // spawns — here six different CLI-spawning endpoints race one queue
    // with cap 2; the overflow rejects fast with 503.
    process.env.SKILLS_UI_SKILLS_BIN = SLOW_SHIM;
    process.env.SKILLS_UI_SPAWN_QUEUE_CAP = "2";
    process.env.SKILLS_SHIM_DELAY_MS = "250";
    const base = await start();
    const results = await Promise.all([
      fetch(`${base}/api/skills?scope=project`), // `ls --json` spawn
      fetch(`${base}/api/skills?scope=global`), // `ls --json -g` — distinct scope ⇒ own flight
      fetch(`${base}/api/source-skills?source=fixture/source`), // `install --list` spawn
      fetch(`${base}/api/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "fixture/source", skills: ["alpha"] }),
      }), // `add` spawn
      fetch(`${base}/api/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "fixture/other", skills: ["beta"] }),
      }), // second distinct `add` spawn
      fetch(`${base}/api/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: [] }),
      }), // `update` spawn
    ].map((p) => p.then((r) => r.status)));
    const busy = results.filter((s) => s === 503).length;
    const ok = results.filter((s) => s === 200).length;
    expect(busy).toBeGreaterThanOrEqual(1); // 1 running + 2 queued + overflow rejected
    expect(ok).toBeGreaterThanOrEqual(3);
    expect(busy + ok).toBe(6);
    delete process.env.SKILLS_SHIM_DELAY_MS;
  });

  test("a handler slower than Bun's default idle timeout still answers (0.5.1 hotfix)", async () => {
    process.env.SKILLS_UI_SKILLS_BIN = SLOW_SHIM;
    process.env.SKILLS_SHIM_DELAY_MS = "13000"; // past the ~12 s teardown window
    const base = await start();
    const res = await fetch(`${base}/api/skills`);
    expect(res.status).toBe(200); // pre-fix: the socket died and fetch rejected
    delete process.env.SKILLS_SHIM_DELAY_MS;
  }, 30_000);
});
