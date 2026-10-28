import { runSkills } from "../skills-client.ts";
import type { Scope } from "./types.ts";

/**
 * Update via `skills update -p|-g -y [names]`. Non-TTY runs auto-detect
 * scope upstream, but we pass it explicitly. Exit 1 only when any update
 * failed; per-skill outcomes are reported in text (parsed loosely — the
 * wrapper's UI re-lists and re-checks updates afterwards).
 */
export async function update(names: string[], scope: Scope): Promise<{ ok: boolean; output: string }> {
  const args = ["update", scope === "global" ? "-g" : "-p", "-y", ...names];
  const { combined, exitCode } = await runSkills(args, { timeoutMs: 300_000 });
  return { ok: exitCode === 0, output: combined.trim() };
}
