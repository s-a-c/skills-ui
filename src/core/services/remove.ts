import { runSkills } from "../skills-client.ts";
import { listInstalled } from "./installed.ts";
import type { Scope } from "./types.ts";

export interface RemoveResult {
  ok: boolean;
  removed: string[];
  missing: string[];
}

/**
 * Remove via `skills rm <names> -y [-g]`, then verify by re-listing:
 * upstream `remove` exits 0 even when individual removals fail, so the
 * exit code is meaningless and the list-diff is the truth.
 */
export async function remove(names: string[], scope: Scope): Promise<RemoveResult> {
  if (names.length === 0) return { ok: true, removed: [], missing: [] };
  const before = new Set((await listInstalled(scope)).map((s) => s.name));
  const args = ["rm", ...names, "-y"];
  if (scope === "global") args.push("-g");
  await runSkills(args, { timeoutMs: 120_000 });
  const after = new Set((await listInstalled(scope)).map((s) => s.name));

  const removed: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    if (before.has(name) && !after.has(name)) removed.push(name);
    else if (!after.has(name)) removed.push(name); // was not installed either
    else missing.push(name); // still present → removal failed
  }
  return { ok: missing.length === 0, removed, missing };
}
