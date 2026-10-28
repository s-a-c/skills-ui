/**
 * Client for the external `skills` CLI (stock vercel-labs/skills).
 *
 * The wrapper owns no build-time dependency on `skills`: the binary is
 * resolved at runtime (SKILLS_UI_SKILLS_BIN → PATH) and every invocation runs as a
 * subprocess with a sanitized environment. Agent-detection variables
 * (CURSOR_AGENT, CLAUDECODE, …) are stripped because they silently flip
 * `add`/`remove` into auto-yes/auto-agent modes upstream; parsed output
 * runs with NO_COLOR, except `--list` which needs FORCE_COLOR=1 to keep
 * its cyan name markers through the pipe (ANSI regex upstream of us).
 */

export interface RunResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
}

export interface RunOptions {
  /** Force ANSI color output (needed only for `add --list` parsing). */
  forceColor?: boolean;
  /** Kill the child after this many ms (default 120s, as upstream does). */
  timeoutMs?: number;
  /** Working directory for the child (default: this process's cwd). */
  cwd?: string;
  /** Extra env vars layered over the sanitized environment. */
  env?: Record<string, string>;
}

const ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
  "SHELL",
  "USER",
  "TMPDIR",
  "TERM",
  "TERM_PROGRAM",
  "TZ",
  "SSH_AUTH_SOCK",
]);

const ENV_PREFIX_ALLOWLIST = [
  "SKILLS_",
  "XDG_",
  "LC_",
  "LANG",
  "GIT_",
  "NPM_CONFIG_",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
];

export function sanitizeEnv(
  base: Record<string, string | undefined> = process.env
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (ENV_ALLOWLIST.has(key) || ENV_PREFIX_ALLOWLIST.some((p) => key.startsWith(p))) {
      env[key] = value;
    }
  }
  return env;
}

let cachedBin: string | null = null;

export class SkillsCliError extends Error {}

/** Resolve the `skills` executable: SKILLS_UI_SKILLS_BIN override, else `skills` on PATH. */
export function resolveSkillsBin(): string {
  if (cachedBin) return cachedBin;
  cachedBin = process.env.SKILLS_UI_SKILLS_BIN?.trim() || "skills";
  return cachedBin;
}

export function resetSkillsBinCache(): void {
  cachedBin = null;
}

/** Run `skills <args>` and capture everything. */
export async function runSkills(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const bin = resolveSkillsBin();
  const env = sanitizeEnv();
  env.NO_COLOR = "1";
  if (options.forceColor) env.FORCE_COLOR = "1";
  else delete env.FORCE_COLOR;
  Object.assign(env, options.env ?? {});

  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn([bin, ...args], {
      cwd: options.cwd,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new SkillsCliError(
      `cannot run \`${bin}\` — install skills (npm i -g skills) or set SKILLS_UI_SKILLS_BIN: ${String(error)}`
    );
  }
  const timeoutMs = options.timeoutMs ?? 120_000;
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { stdout, stderr, combined: stdout + stderr, exitCode };
  } finally {
    clearTimeout(timer);
  }
}

/** `skills --version` — a bare semver string, e.g. "1.7.4". */
export async function skillsVersion(): Promise<string> {
  const { stdout } = await runSkills(["--version"], { timeoutMs: 10_000 });
  const version = stdout.trim();
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new SkillsCliError(`unexpected --version output: ${JSON.stringify(stdout)}`);
  }
  return version;
}
