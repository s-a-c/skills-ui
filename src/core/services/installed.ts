import { runSkills } from "../skills-client.ts";
import type { InstalledSkill, Scope } from "./types.ts";

/**
 * Installed skills via `skills ls --json [-g]` — the only JSON-emitting
 * listing surface stock upstream has. Output shape verified against
 * skills 1.7.4 (see tests/fixtures/contract/ls.json).
 */
export async function listInstalled(scope: Scope): Promise<InstalledSkill[]> {
  const args = ["ls", "--json"];
  if (scope === "global") args.push("-g");
  const { stdout } = await runSkills(args);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`skills ls --json produced unparseable output: ${stdout.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`skills ls --json produced ${typeof parsed}, expected array`);
  }
  return (parsed as Array<Record<string, unknown>>).map((raw) => ({
    name: String(raw.name ?? ""),
    path: String(raw.path ?? ""),
    scope: raw.scope === "global" ? "global" : "project",
    agents: Array.isArray(raw.agents) ? raw.agents.map(String) : [],
    source: raw.source == null ? null : String(raw.source),
    sourceUrl: raw.sourceUrl == null ? null : String(raw.sourceUrl),
    sourceType: raw.sourceType == null ? null : String(raw.sourceType),
  }));
}

export async function findInstalled(name: string, scope: Scope): Promise<InstalledSkill | null> {
  const all = await listInstalled(scope);
  return all.find((s) => s.name === name) ?? null;
}
