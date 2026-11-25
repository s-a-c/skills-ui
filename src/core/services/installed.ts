import { lstatSync } from "node:fs";
import { runSkills } from "../skills-client.ts";
import { readLock } from "./locks.ts";
import { sanitizeMetadata } from "./sanitize.ts";
import type { InstalledSkill, Scope, SkillProvenance } from "./types.ts";

/**
 * Classify skill provenance from filesystem lstat + lockfile membership.
 * Symlinks always classify as "linked" so linked frameworks are warned before removal.
 */
export function classifyProvenance(
  skillPath: string,
  name: string,
  lockedNames: ReadonlySet<string>
): SkillProvenance {
  if (skillPath) {
    try {
      if (lstatSync(skillPath).isSymbolicLink()) return "linked";
    } catch {
      // Missing or unreadable path falls through to lockfile/local check.
    }
  }
  if (lockedNames.has(name)) return "locked";
  return "local";
}

/**
 * Installed skills via `skills ls --json [-g]` — the only JSON-emitting
 * listing surface stock upstream has. Output shape verified against
 * skills 1.7.4 (see tests/fixtures/contract/ls.json).
 */
export async function listInstalled(scope: Scope): Promise<InstalledSkill[]> {
  const args = ["ls", "--json"];
  if (scope === "global") args.push("-g");
  const { stdout } = await runSkills(args, {
    // 300s, not the 120s default: concurrent consumers serialize behind the
    // spawn queue and legitimately exceed it — a lone global scan is
    // already ~64-72s (S-166)
    timeoutMs: 300_000,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`skills ls --json produced unparseable output: ${stdout.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`skills ls --json produced ${typeof parsed}, expected array`);
  }
  let lockedNames = new Set<string>();
  try {
    lockedNames = new Set(Object.keys(readLock(scope).skills));
  } catch {
    // Corrupt lockfile must not break listing; provenance falls back cleanly.
  }
  return (parsed as Array<Record<string, unknown>>).map((raw) => {
    // display/model fields are external text — sanitized at ingress
    // (0.5.1 impl D); `path` stays raw: it addresses the filesystem and
    // is never rendered
    const name = sanitizeMetadata(String(raw.name ?? ""));
    const path = String(raw.path ?? "");
    return {
      name,
      path,
      scope: raw.scope === "global" ? "global" : "project",
      agents: Array.isArray(raw.agents) ? raw.agents.map((a) => sanitizeMetadata(String(a))) : [],
      source: raw.source == null ? null : sanitizeMetadata(String(raw.source)),
      sourceUrl: raw.sourceUrl == null ? null : sanitizeMetadata(String(raw.sourceUrl)),
      sourceType: raw.sourceType == null ? null : sanitizeMetadata(String(raw.sourceType)),
      provenance: classifyProvenance(path, name, lockedNames),
    };
  });
}

export async function findInstalled(name: string, scope: Scope): Promise<InstalledSkill | null> {
  const all = await listInstalled(scope);
  return all.find((s) => s.name === name) ?? null;
}
