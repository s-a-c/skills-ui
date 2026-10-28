import { runSkills } from "../skills-client.ts";
import type { AddResultEntry } from "./types.ts";

export interface InstallOptions {
  source: string;
  /** Skill names; `["*"]` installs everything in the source. */
  skills: string[];
  global?: boolean;
  cwd?: string;
}

export interface InstallResult {
  ok: boolean;
  results: AddResultEntry[];
}

/**
 * Install via `skills add <source> --skill … --yes --json [--global]`.
 * Upstream contract: exactly one JSON array on stdout; exit 1 if any entry
 * failed OR was skipped; `status:"failed"` entries carry `error`.
 */
export async function install(opts: InstallOptions): Promise<InstallResult> {
  const args = ["add", opts.source];
  if (opts.global) args.push("--global");
  if (opts.skills.length === 1 && opts.skills[0] === "*") {
    args.push("--all");
  } else {
    for (const skill of opts.skills) args.push("--skill", skill);
  }
  args.push("--yes", "--json");
  const { stdout, exitCode } = await runSkills(args, { cwd: opts.cwd, timeoutMs: 300_000 });

  let results: AddResultEntry[] = [];
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (Array.isArray(parsed)) results = parsed as AddResultEntry[];
  } catch {
    // upstream guarantees a parseable array even on odd exit paths; if the
    // shape is broken, surface it as a single failed entry
    results = [{ status: "failed", error: `unparseable add output: ${stdout.slice(0, 200)}` }];
  }
  const ok = exitCode === 0 && results.every((r) => r.status === "installed");
  return { ok, results };
}
