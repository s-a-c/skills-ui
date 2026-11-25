import { sanitizeEnv } from "../skills-client.ts";
import { sanitizeMetadata } from "./sanitize.ts";
import type { HealthCheckResult, MutationEvent, PostMutationHookResult, Scope } from "./types.ts";

export const POST_MUTATION_HOOK_ENV = "SKILLS_UI_POST_MUTATION_HOOK";
export const HEALTH_CMD_ENV = "SKILLS_UI_HEALTH_CMD";

const DEFAULT_HOOK_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 15_000;
const DEFAULT_HEALTH_TTL_MS = 10_000;
const MAX_OUTPUT_CHARS = 4096;

function envCmd(name: string): string | null {
  const val = process.env[name]?.trim();
  return val ? val : null;
}

export function isPostMutationHookConfigured(): boolean {
  return envCmd(POST_MUTATION_HOOK_ENV) !== null;
}

export function isHealthCmdConfigured(): boolean {
  return envCmd(HEALTH_CMD_ENV) !== null;
}

function clipSanitized(raw: string, max = MAX_OUTPUT_CHARS): string {
  const clean = sanitizeMetadata(raw).trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

async function spawnExecutable(
  exe: string,
  opts: { cwd?: string; extraEnv?: Record<string, string>; timeoutMs: number }
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean; spawnError?: string }> {
  const env = sanitizeEnv();
  if (opts.extraEnv) Object.assign(env, opts.extraEnv);

  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn([exe], {
      cwd: opts.cwd,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      timedOut: false,
      spawnError: error instanceof Error ? error.message : String(error),
    };
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {
      // process may already have exited
    }
  }, opts.timeoutMs);

  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

export async function runPostMutationHook(opts: {
  event: MutationEvent;
  scope: Scope;
  skills: string[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<PostMutationHookResult> {
  const hookPath = envCmd(POST_MUTATION_HOOK_ENV);
  if (!hookPath) {
    return { configured: false, ok: true, skipped: true };
  }
  const cwd = opts.cwd ?? process.cwd();
  const res = await spawnExecutable(hookPath, {
    cwd,
    timeoutMs: opts.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS,
    extraEnv: {
      SKILLS_UI_EVENT: opts.event,
      SKILLS_UI_SCOPE: opts.scope,
      SKILLS_UI_SKILLS: opts.skills.join(","),
      SKILLS_UI_CWD: cwd,
    },
  });

  if (res.spawnError) {
    return {
      configured: true,
      ok: false,
      exitCode: -1,
      summary: "post-mutation hook failed to launch",
      output: clipSanitized(res.spawnError),
    };
  }

  const combined = clipSanitized([res.stderr, res.stdout].filter(Boolean).join("\n"));
  if (res.timedOut) {
    return {
      configured: true,
      ok: false,
      exitCode: res.exitCode,
      timedOut: true,
      summary: "post-mutation hook timed out",
      ...(combined ? { output: combined } : {}),
    };
  }

  const ok = res.exitCode === 0;
  return {
    configured: true,
    ok,
    exitCode: res.exitCode,
    summary: ok ? "post-mutation hook ok" : `post-mutation hook exited ${res.exitCode}`,
    ...(combined ? { output: combined } : {}),
  };
}

export interface HealthChecker {
  check(options?: { refresh?: boolean }): Promise<HealthCheckResult>;
  invalidate(): void;
}

export function createHealthChecker(opts?: { ttlMs?: number; timeoutMs?: number }): HealthChecker {
  const ttlMs = opts?.ttlMs ?? DEFAULT_HEALTH_TTL_MS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  let cached: { cmd: string; expiresAt: number; result: HealthCheckResult } | null = null;
  let inFlight: Promise<HealthCheckResult> | null = null;

  const runOnce = async (cmd: string): Promise<HealthCheckResult> => {
    const checkedAt = new Date().toISOString();
    const res = await spawnExecutable(cmd, { timeoutMs });
    if (res.spawnError) {
      return {
        configured: true,
        ok: false,
        summary: "health check failed to launch",
        details: [clipSanitized(res.spawnError)].filter(Boolean),
        checkedAt,
      };
    }
    if (res.timedOut) {
      const out = clipSanitized([res.stderr, res.stdout].filter(Boolean).join("\n"));
      return {
        configured: true,
        ok: false,
        summary: "health check timed out",
        ...(out ? { details: [out] } : {}),
        checkedAt,
      };
    }
    try {
      const parsed = JSON.parse(res.stdout) as unknown;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        typeof (parsed as Record<string, unknown>).ok !== "boolean" ||
        typeof (parsed as Record<string, unknown>).summary !== "string"
      ) {
        throw new Error("invalid health JSON shape");
      }
      const raw = parsed as { ok: boolean; summary: string; details?: unknown };
      const summary = clipSanitized(raw.summary, 240) || (raw.ok ? "healthy" : "unhealthy");
      const details = Array.isArray(raw.details)
        ? raw.details.slice(0, 32).map((d) => clipSanitized(String(d), 400)).filter(Boolean)
        : undefined;
      return {
        configured: true,
        ok: raw.ok && res.exitCode === 0,
        summary,
        ...(details && details.length > 0 ? { details } : {}),
        checkedAt,
      };
    } catch {
      const fallback = clipSanitized([res.stderr, res.stdout].filter(Boolean).join("\n"), 400);
      return {
        configured: true,
        ok: false,
        summary: res.exitCode === 0 ? "invalid health check output" : `health check failed (exit ${res.exitCode})`,
        ...(fallback ? { details: [fallback] } : {}),
        checkedAt,
      };
    }
  };

  return {
    async check(options?: { refresh?: boolean }): Promise<HealthCheckResult> {
      const cmd = envCmd(HEALTH_CMD_ENV);
      if (!cmd) {
        cached = null;
        return {
          configured: false,
          ok: true,
          summary: "not configured",
          checkedAt: new Date().toISOString(),
        };
      }
      const now = Date.now();
      if (!options?.refresh && cached && cached.cmd === cmd && now < cached.expiresAt) {
        return cached.result;
      }
      if (!inFlight) {
        inFlight = runOnce(cmd)
          .then((result) => {
            cached = { cmd, expiresAt: Date.now() + ttlMs, result };
            return result;
          })
          .finally(() => {
            inFlight = null;
          });
      }
      return inFlight;
    },
    invalidate(): void {
      cached = null;
    },
  };
}

const defaultHealthChecker = createHealthChecker();

export function checkHealth(options?: { refresh?: boolean }): Promise<HealthCheckResult> {
  return defaultHealthChecker.check(options);
}

export function invalidateHealthCache(): void {
  defaultHealthChecker.invalidate();
}
