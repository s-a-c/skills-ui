import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyProvenance,
  createHealthChecker,
  globalLockPath,
  isHealthCmdConfigured,
  isPostMutationHookConfigured,
  readLock,
  runPostMutationHook,
} from "../src/core/index.ts";
import { InvalidLockFileError } from "../src/core/services/locks.ts";
import { sanitizeEnv } from "../src/core/skills-client.ts";
import { loadDiskIndex, saveDiskIndex } from "../src/core/disk-index.ts";
import { createSkillsUiServer } from "../src/core/api.ts";

const SHIM = new URL("fixtures/skills-shim.mjs", import.meta.url).pathname;

let tmpDir: string;
let xdgStateDir: string;
let shimStateDir: string;
let prefsDir: string;
let cacheDir: string;
let savedEnv: Record<string, string | undefined>;
let server: { port: number; stop: () => Promise<void> } | null = null;

function writeExe(name: string, script: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, script, "utf-8");
  chmodSync(path, 0o755);
  return path;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "skills-ui-055-"));
  xdgStateDir = join(tmpDir, "xdg-state");
  shimStateDir = join(tmpDir, "shim-state");
  prefsDir = join(tmpDir, "prefs");
  cacheDir = join(tmpDir, "cache");
  mkdirSync(join(xdgStateDir, "skills"), { recursive: true });
  mkdirSync(shimStateDir, { recursive: true });
  mkdirSync(prefsDir, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  savedEnv = {
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    SKILLS_UI_SKILLS_BIN: process.env.SKILLS_UI_SKILLS_BIN,
    SKILLS_SHIM_STATE: process.env.SKILLS_SHIM_STATE,
    SKILLS_UI_PREFS_DIR: process.env.SKILLS_UI_PREFS_DIR,
    SKILLS_UI_CACHE_DIR: process.env.SKILLS_UI_CACHE_DIR,
    SKILLS_UI_POST_MUTATION_HOOK: process.env.SKILLS_UI_POST_MUTATION_HOOK,
    SKILLS_UI_HEALTH_CMD: process.env.SKILLS_UI_HEALTH_CMD,
  };
  process.env.XDG_STATE_HOME = xdgStateDir;
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = shimStateDir;
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
  process.env.SKILLS_UI_CACHE_DIR = cacheDir;
  delete process.env.SKILLS_UI_POST_MUTATION_HOOK;
  delete process.env.SKILLS_UI_HEALTH_CMD;
});

afterEach(async () => {
  await server?.stop();
  server = null;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("T1: globalLockPath & SkillProvenance", () => {
  test("globalLockPath prefers .skill-lock.json and falls back to skills-lock.json", () => {
    const base = join(xdgStateDir, "skills");
    const dotFile = join(base, ".skill-lock.json");
    const legacyFile = join(base, "skills-lock.json");

    expect(globalLockPath()).toBe(dotFile);

    writeFileSync(legacyFile, JSON.stringify({ skills: { legacy: { source: "a/b", sourceType: "github" } } }));
    expect(globalLockPath()).toBe(legacyFile);
    expect(Object.keys(readLock("global").skills)).toEqual(["legacy"]);

    writeFileSync(dotFile, JSON.stringify({ skills: { modern: { source: "c/d", sourceType: "github" } } }));
    expect(globalLockPath()).toBe(dotFile);
    expect(Object.keys(readLock("global").skills)).toEqual(["modern"]);
  });

  test("globalLockPath preserves InvalidLockFileError when .skill-lock.json is malformed", () => {
    writeFileSync(join(xdgStateDir, "skills", ".skill-lock.json"), "{bad json");
    expect(() => readLock("global")).toThrow(InvalidLockFileError);
  });

  test("classifyProvenance distinguishes linked (symlink even if locked), locked, and local", () => {
    const realDir = join(tmpDir, "real-skill");
    const linkPath = join(tmpDir, "linked-skill");
    const targetDir = join(tmpDir, "ext-skill");
    mkdirSync(realDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });
    symlinkSync(targetDir, linkPath);

    const locked = new Set(["real-skill", "linked-skill"]);
    expect(classifyProvenance(realDir, "real-skill", locked)).toBe("locked");
    expect(classifyProvenance(linkPath, "linked-skill", locked)).toBe("linked");
    expect(classifyProvenance(join(tmpDir, "missing"), "untracked", locked)).toBe("local");
  });

  test("disk-index preserves SkillProvenance across save/load", () => {
    saveDiskIndex("global", [
      {
        name: "tdd",
        path: "/x/tdd",
        scope: "global",
        agents: ["Codex"],
        source: "obra/superpowers",
        sourceUrl: null,
        sourceType: "github",
        provenance: "linked",
      },
    ]);
    const loaded = loadDiskIndex("global");
    expect(loaded?.[0]?.provenance).toBe("linked");
  });
});

describe("T2: env-only hooks, health checker, and API security", () => {
  test("sanitizeEnv strips hook and health env vars from stock skills CLI subprocesses", () => {
    const env = sanitizeEnv({
      PATH: "/usr/bin",
      SKILLS_UI_SKILLS_BIN: "/bin/skills",
      SKILLS_UI_POST_MUTATION_HOOK: "/tmp/hook.sh",
      SKILLS_UI_HEALTH_CMD: "/tmp/health.sh",
    });
    expect(env.SKILLS_UI_SKILLS_BIN).toBe("/bin/skills");
    expect(env.SKILLS_UI_POST_MUTATION_HOOK).toBeUndefined();
    expect(env.SKILLS_UI_HEALTH_CMD).toBeUndefined();
  });

  test("runPostMutationHook skips when unset and passes structured env without a shell when set", async () => {
    expect(isPostMutationHookConfigured()).toBe(false);
    expect(await runPostMutationHook({ event: "install", scope: "global", skills: ["a"] })).toEqual({
      configured: false,
      ok: true,
      skipped: true,
    });

    const outPath = join(tmpDir, "hook-env.json");
    const hookExe = writeExe(
      "hook.sh",
      `#!/usr/bin/env bash
printf '{"event":"%s","scope":"%s","skills":"%s","cwd":"%s"}\\n' "$SKILLS_UI_EVENT" "$SKILLS_UI_SCOPE" "$SKILLS_UI_SKILLS" "$SKILLS_UI_CWD" > "${outPath}"
`
    );
    process.env.SKILLS_UI_POST_MUTATION_HOOK = hookExe;
    expect(isPostMutationHookConfigured()).toBe(true);
    const res = await runPostMutationHook({ event: "remove", scope: "global", skills: ["x", "y"], cwd: tmpDir });
    expect(res.ok).toBe(true);
    expect(res.configured).toBe(true);
    expect(JSON.parse(readFileSync(outPath, "utf-8"))).toEqual({
      event: "remove",
      scope: "global",
      skills: "x,y",
      cwd: tmpDir,
    });
  });

  test("runPostMutationHook treats non-zero exit and timeouts as non-fatal failures with sanitized output", async () => {
    process.env.SKILLS_UI_POST_MUTATION_HOOK = writeExe(
      "fail-hook.sh",
      `#!/usr/bin/env bash
echo "bad\u001b[31m drift" >&2
exit 7
`
    );
    const failed = await runPostMutationHook({ event: "update", scope: "global", skills: [] });
    expect(failed.ok).toBe(false);
    expect(failed.exitCode).toBe(7);
    expect(failed.output).toContain("bad drift");
    expect(failed.output).not.toContain("\u001b");

    process.env.SKILLS_UI_POST_MUTATION_HOOK = writeExe("slow-hook.sh", "#!/bin/sh\nsleep 2\n");
    const timed = await runPostMutationHook({ event: "update", scope: "project", skills: [], timeoutMs: 50 });
    expect(timed.ok).toBe(false);
    expect(timed.timedOut).toBe(true);
  });

  test("healthChecker caches for TTL, bypasses on refresh=true, and handles malformed JSON", async () => {
    expect(isHealthCmdConfigured()).toBe(false);
    const counterFile = join(tmpDir, "health-count.txt");
    writeFileSync(counterFile, "0");
    process.env.SKILLS_UI_HEALTH_CMD = writeExe(
      "health.sh",
      `#!/usr/bin/env bash
c=$(cat "${counterFile}")
c=$((c + 1))
echo "$c" > "${counterFile}"
printf '{"ok":true,"summary":"113/113 · 8 hosts","details":["run=%s"]}\\n' "$c"
`
    );
    expect(isHealthCmdConfigured()).toBe(true);
    const hc = createHealthChecker({ ttlMs: 60_000 });
    const r1 = await hc.check();
    const r2 = await hc.check();
    expect(r1.ok).toBe(true);
    expect(r1.summary).toBe("113/113 · 8 hosts");
    expect(r1.details).toEqual(["run=1"]);
    expect(r2.details).toEqual(["run=1"]);

    const r3 = await hc.check({ refresh: true });
    expect(r3.details).toEqual(["run=2"]);

    hc.invalidate();
    const r4 = await hc.check();
    expect(r4.details).toEqual(["run=3"]);

    process.env.SKILLS_UI_HEALTH_CMD = writeExe("bad-health.sh", "#!/bin/sh\necho 'not json'\nexit 0\n");
    hc.invalidate();
    const bad = await hc.check();
    expect(bad.ok).toBe(false);
    expect(bad.summary).toBe("invalid health check output");
  });

  test("GET /api/version exposes booleans only and GET /api/health-check enforces 0.5.1 auth/CORS", async () => {
    const hookExe = writeExe("ok-hook.sh", "#!/bin/sh\necho synced\n");
    const healthExe = writeExe(
      "ok-health.sh",
      '#!/bin/sh\necho \'{"ok":true,"summary":"113/113","details":["all good"]}\'\n'
    );
    process.env.SKILLS_UI_POST_MUTATION_HOOK = hookExe;
    process.env.SKILLS_UI_HEALTH_CMD = healthExe;

    let token = "";
    server = await createSkillsUiServer({
      withPage: false,
      onToken: (t) => {
        token = t;
      },
    });
    const base = `http://127.0.0.1:${server.port}`;

    const verRes = await fetch(`${base}/api/version`);
    const verText = await verRes.text();
    expect(verText).not.toContain(hookExe);
    expect(verText).not.toContain(healthExe);
    const ver = JSON.parse(verText) as { capabilities: { healthCheck: boolean; postMutationHook: boolean } };
    expect(ver.capabilities.healthCheck).toBe(true);
    expect(ver.capabilities.postMutationHook).toBe(true);

    // Cross-origin unauthenticated health-check is 401; disallowed origin is 403
    const unauth = await fetch(`${base}/api/health-check`, {
      headers: { origin: "https://s-a-c.github.io" },
    });
    expect(unauth.status).toBe(401);

    const badOrigin = await fetch(`${base}/api/health-check`, {
      headers: { origin: "https://evil.example", authorization: `Bearer ${token}` },
    });
    expect(badOrigin.status).toBe(403);

    const okCross = await fetch(`${base}/api/health-check`, {
      headers: { origin: "https://s-a-c.github.io", authorization: `Bearer ${token}` },
    });
    expect(okCross.status).toBe(200);
    const hcBody = (await okCross.json()) as { configured: boolean; ok: boolean; summary: string };
    expect(hcBody.configured).toBe(true);
    expect(hcBody.ok).toBe(true);
    expect(hcBody.summary).toBe("113/113");

    // Non-fatal failing hook on POST /api/remove still returns HTTP 200 ok:true + hook.ok:false
    process.env.SKILLS_UI_POST_MUTATION_HOOK = writeExe("warn-hook.sh", "#!/bin/sh\necho 'hook boom' >&2\nexit 2\n");
    const rmRes = await fetch(`${base}/api/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skills: ["tdd"], global: false }),
    });
    expect(rmRes.status).toBe(200);
    const rmBody = (await rmRes.json()) as { ok: boolean; hook?: { configured: boolean; ok: boolean; exitCode: number } };
    expect(rmBody.ok).toBe(true);
    expect(rmBody.hook?.configured).toBe(true);
    expect(rmBody.hook?.ok).toBe(false);
    expect(rmBody.hook?.exitCode).toBe(2);
  });
});
