import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { InvalidLockFileError, readLock } from "../src/core/services/locks.ts";
import { checkForUpdates } from "../src/core/services/updates-check.ts";
import { createWorkspaceFixture } from "./helpers/audit-state.ts";

/**
 * CORE-03 (S-197): lock records are validated per entry with per-entry
 * diagnostics — a broken entry must not discard valid siblings, and a
 * container-level corruption (skills:null, root array, malformed JSON) is a
 * controlled InvalidLockFileError the GET /api/updates handler reports as a
 * 400, never a generic 500. Seam: exported readLock against real disposable
 * JSON files (workspace fixture under owned .agents/tmp) plus checkForUpdates
 * at the upstream HTTP boundary (globalThis.fetch replaced, restored).
 */

let fixture: ReturnType<typeof createWorkspaceFixture>;
let root: string;
let restoreEnv: () => void;
let originalCwd: string;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  fixture = createWorkspaceFixture();
  root = fixture.root;
  originalCwd = process.cwd();
  originalFetch = globalThis.fetch;
  restoreEnv = fixture.activate();
  process.chdir(root);
});

afterEach(() => {
  process.chdir(originalCwd);
  globalThis.fetch = originalFetch;
  restoreEnv();
  fixture.cleanup();
});

const GOOD_ENTRY = {
  source: "fixture/repo",
  sourceType: "github",
  sourceUrl: "https://github.com/fixture/repo",
  skillPath: "skills/good",
  skillFolderHash: "old",
};

async function startServer(): Promise<{ port: number; stop: () => Promise<void> }> {
  const { createSkillsUiServer } = await import("../src/core/api.ts");
  return createSkillsUiServer({ withPage: false });
}

describe("locks: readLock validation (CORE-03 / S-197)", () => {
  test("invalid lock entries cannot discard valid siblings", () => {
    writeFileSync(
      join(root, "skills-lock.json"),
      JSON.stringify({
        skills: {
          good: GOOD_ENTRY,
          broken: null,
        },
      })
    );
    const lock = readLock("project", root);
    expect(Object.keys(lock.skills)).toEqual(["good"]);
    expect(lock.diagnostics?.broken).toContain("invalid lock entry");
  });

  test("null skills is a controlled invalid-lock error", () => {
    writeFileSync(join(root, "skills-lock.json"), '{"skills":null}');
    expect(() => readLock("project", root)).toThrow(InvalidLockFileError);
  });

  test("malformed JSON in an existing lock is a controlled error, not a silent empty lock", () => {
    writeFileSync(join(root, "skills-lock.json"), "{not json");
    expect(() => readLock("project", root)).toThrow(InvalidLockFileError);
  });

  test("a root array is a controlled invalid-lock container", () => {
    writeFileSync(join(root, "skills-lock.json"), '[{"skills":{}}]');
    expect(() => readLock("project", root)).toThrow(InvalidLockFileError);
  });

  test("a skills array is a controlled invalid-lock container", () => {
    writeFileSync(join(root, "skills-lock.json"), '{"skills":[]}');
    expect(() => readLock("project", root)).toThrow(InvalidLockFileError);
  });

  test("missing file still reads as an empty lock (no diagnostics)", () => {
    expect(readLock("project", root)).toEqual({ skills: {} });
  });

  test("optional-field wrong types invalidate only the offending entries", () => {
    writeFileSync(
      join(root, "skills-lock.json"),
      JSON.stringify({
        skills: {
          ok: GOOD_ENTRY,
          badRef: { source: "fixture/repo", sourceType: "github", ref: 42 },
          nullUrl: { source: "fixture/repo", sourceType: "github", sourceUrl: null },
          arrayEntry: ["nope"],
        },
      })
    );
    const lock = readLock("project", root);
    expect(Object.keys(lock.skills)).toEqual(["ok"]);
    expect(lock.diagnostics?.badRef).toContain("invalid lock entry");
    expect(lock.diagnostics?.nullUrl).toContain("invalid lock entry");
    expect(lock.diagnostics?.arrayEntry).toContain("invalid lock entry");
  });

  test("non-string required fields invalidate the entry", () => {
    writeFileSync(
      join(root, "skills-lock.json"),
      JSON.stringify({
        skills: {
          ok: GOOD_ENTRY,
          numericSource: { source: 7, sourceType: "github" },
          missingSource: { sourceType: "github" },
          numericType: { source: "fixture/repo", sourceType: 123 },
        },
      })
    );
    const lock = readLock("project", root);
    expect(Object.keys(lock.skills)).toEqual(["ok"]);
    for (const name of ["numericSource", "missingSource", "numericType"]) {
      expect(lock.diagnostics?.[name]).toContain("invalid lock entry");
    }
  });

  test("unknown forward-compatible fields survive validation (computedHash metadata preserved)", () => {
    writeFileSync(
      join(root, "skills-lock.json"),
      JSON.stringify({
        skills: {
          forward: {
            source: "fixture/repo",
            sourceType: "well-known",
            wellKnownDigest: "d",
            computedHash: "abc123",
            futureField: { nested: true },
          },
        },
      })
    );
    const lock = readLock("project", root);
    const entry = lock.skills.forward as unknown as Record<string, unknown>;
    expect(entry.computedHash).toBe("abc123"); // preserved untouched
    expect(entry.futureField).toEqual({ nested: true });
    expect(lock.diagnostics).toEqual({}); // shape itself was valid
  });
});

describe("locks: checkForUpdates diagnostics (CORE-03 / S-197)", () => {
  test("a valid sibling still detects an update while the broken sibling reports a visible error", async () => {
    writeFileSync(
      join(root, "skills-lock.json"),
      JSON.stringify({
        skills: {
          good: GOOD_ENTRY,
          broken: { source: "fixture/repo", sourceType: "github", sourceUrl: 42 },
        },
      })
    );
    globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ tree: [{ path: "skills/good", type: "tree", sha: "new" }] })
    ) as typeof fetch;
    try {
      const result = await checkForUpdates("project");
      expect(result.updates.good?.updateAvailable).toBe(true);
      expect(result.updates.good?.sourceType).toBe("github");
      expect(result.updates.broken?.sourceType).toBe("unknown");
      expect(result.updates.broken?.error).toContain("invalid lock entry");
      expect(result.checkedCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("an entry named __proto__ becomes an own update entry, not a prototype mutation", async () => {
    // Raw JSON (not an object literal): JSON.parse creates an own "__proto__"
    // property, which is exactly the externally controlled key shape.
    writeFileSync(
      join(root, "skills-lock.json"),
      '{"skills":{"__proto__":{"source":"fixture/local","sourceType":"local"}}}'
    );
    const result = await checkForUpdates("project");
    const updates = result.updates as Record<
      string,
      { name: string; error?: string; sourceType: string }
    >;
    expect(Object.keys(updates)).toContain("__proto__");
    expect(updates["__proto__"]?.name).toBe("__proto__");
    expect(updates["__proto__"]?.error).toContain("not checkable");
    expect(result.checkedCount).toBe(1);
  });
});

describe("locks: GET /api/updates seam (CORE-03 / S-197)", () => {
  test("a container-invalid lock yields the controlled 400, not a generic 500", async () => {
    writeFileSync(join(root, "skills-lock.json"), '{"skills":null}');
    const server = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/updates`);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("invalid skills lock file");
    } finally {
      await server.stop();
    }
  });

  test("a valid lock still serves 200 updates through the same seam", async () => {
    writeFileSync(
      join(root, "skills-lock.json"),
      JSON.stringify({ skills: { good: GOOD_ENTRY } })
    );
    // Stub only the upstream GitHub call; loopback requests to the server
    // under test must still reach the real HTTP client.
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("http://127.0.0.1")) return originalFetch(input, init);
      return Response.json({ tree: [{ path: "skills/good", type: "tree", sha: "new" }] });
    }) as typeof fetch;
    const server = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/updates`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        updates: Record<string, { updateAvailable: boolean; sourceType: string }>;
      };
      expect(body.updates.good?.updateAvailable).toBe(true);
      expect(body.updates.good?.sourceType).toBe("github");
    } finally {
      await server.stop();
    }
  });
});
