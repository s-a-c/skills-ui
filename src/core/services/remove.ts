import { runSkills } from "../skills-client.ts";
import { listInstalled } from "./installed.ts";
import type { InstalledSkill, Scope } from "./types.ts";

export interface RemoveResult {
  ok: boolean;
  removed: string[];
  missing: string[];
}

export interface RemoveOptions {
  /**
   * Pre-computed installed listing used as the before-set instead of
   * spawning a fresh `skills ls` (S-178: the serve passes its cached list —
   * zero spawns on a warm cache). Omitted ⇒ a fresh list is spawned
   * (default behavior, unchanged — the TUI path).
   */
  listBefore?: InstalledSkill[];
  /**
   * Produces the after-set instead of spawning a fresh `skills ls`. The
   * serve passes a callback that invalidates and re-populates its cache, so
   * the verification list IS the cache refresh (one spawn total after `rm`).
   * Omitted ⇒ a fresh list is spawned (default behavior, unchanged).
   */
  listAfter?: () => Promise<InstalledSkill[]>;
}

/**
 * Remove via `skills rm <names> -y [-g]`, then verify by re-listing:
 * upstream `remove` exits 0 even when individual removals fail, so the
 * exit code is meaningless and the list-diff is the truth.
 *
 * The before/after listings are injectable (S-178) so a caller that already
 * holds a fresh list — the serve's per-scope cache — verifies a removal
 * with at most one extra spawn instead of two uncached ones. Default (no
 * options): exactly the historical behavior, two fresh `skills ls` spawns.
 */
export async function remove(
  names: string[],
  scope: Scope,
  options: RemoveOptions = {}
): Promise<RemoveResult> {
  if (names.length === 0) return { ok: true, removed: [], missing: [] };
  const beforeList = options.listBefore ?? (await listInstalled(scope));
  const before = new Set(beforeList.map((s) => s.name));
  const args = ["rm", ...names, "-y"];
  if (scope === "global") args.push("-g");
  await runSkills(args, { timeoutMs: 120_000 });
  const afterList = options.listAfter ? await options.listAfter() : await listInstalled(scope);
  const after = new Set(afterList.map((s) => s.name));

  const removed: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    if (before.has(name) && !after.has(name)) removed.push(name);
    else if (!after.has(name)) removed.push(name); // was not installed either
    else missing.push(name); // still present → removal failed
  }
  return { ok: missing.length === 0, removed, missing };
}
