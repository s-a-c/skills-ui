import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { InstalledSkill, Scope } from "./services/types.ts";

/**
 * S-183 stale-while-revalidate: a per-scope persisted copy of the enriched
 * installed list (`~/.cache/skills-ui/index-<scope>.json`), written whenever
 * a FRESH list lands so the next session's first scope load can paint
 * instantly while the real subprocess refresh runs.
 *
 * Contract (S-183):
 *  - The index is NEVER trusted as the basis for a mutation — install/remove/
 *    update always act on fresh subprocess truth (enforced in the TUI deps:
 *    mutations clear the cache and reload via listInstalled; this module only
 *    ever WRITES from that fresh truth).
 *  - Any parse error, wrong version, wrong shape, or hostile field ⇒ the
 *    index is ignored (null) and regenerated on the next fresh load. Loading
 *    hostile cache content must never throw, never crash the TUI.
 *  - Writes are atomic (tmp file + rename) so a crash mid-write cannot leave
 *    a torn file that parses as valid.
 *
 * Placement: core (not src/tui/) because it is plain persistence over the
 * core InstalledSkill type and mirrors prefs.ts's env-override pattern; the
 * TUI owns the SWR orchestration on top of it.
 */

export const DISK_INDEX_VERSION = 1;

/** ~300 enriched skills is a few hundred KB; anything past this is not ours. */
const MAX_INDEX_BYTES = 16_000_000;

/** How long a tmp file must sit untouched before the litter sweep removes it
 * (a concurrent writer's in-flight tmp is never pulled out from under it). */
const TMP_SWEEP_MIN_AGE_MS = 60_000;

/** Best-effort sweep of crash litter: tmp files from killed writers, scoped
 * to this index's prefix so one scope's save never touches another's. */
function sweepStaleTmp(dir: string, prefix: string): void {
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(prefix) || !name.endsWith(".tmp")) continue;
      const full = join(dir, name);
      if (Date.now() - statSync(full).mtimeMs < TMP_SWEEP_MIN_AGE_MS) continue;
      unlinkSync(full);
    }
  } catch {
    // litter sweep is best-effort by contract
  }
}

const CACHE_DIR_ENV = "SKILLS_UI_CACHE_DIR";

/** Resolved cache dir: env override first (tests MUST use it — never the
 * real ~/.cache), then the default skills-ui cache directory. */
export function diskIndexDir(dirOverride?: string): string {
  if (process.env[CACHE_DIR_ENV]) return process.env[CACHE_DIR_ENV]!;
  if (dirOverride) return dirOverride;
  return join(homedir(), ".cache", "skills-ui");
}

export function diskIndexPath(scope: Scope, dirOverride?: string): string {
  return join(diskIndexDir(dirOverride), `index-${scope}.json`);
}

export interface PersistedIndex {
  version: number;
  savedAt: string;
  skills: InstalledSkill[];
}

function isScope(value: unknown): value is Scope {
  return value === "project" || value === "global";
}

function isStrOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Sanitizes one persisted entry to a safe InstalledSkill, or null. Every
 * field is validated — a hostile or partial entry is dropped, never thrown. */
function normalizeEntry(input: unknown, scope: Scope): InstalledSkill | null {
  if (input === null || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.name !== "string" || raw.name === "") return null;
  if (typeof raw.path !== "string" || raw.path === "") return null;
  // entries from the other scope (or hostile scope values) never render here
  if (!isScope(raw.scope) || raw.scope !== scope) return null;
  if (!Array.isArray(raw.agents) || raw.agents.some((a) => typeof a !== "string")) return null;
  if (!isStrOrNull(raw.source) || !isStrOrNull(raw.sourceUrl) || !isStrOrNull(raw.sourceType)) return null;
  const skill: InstalledSkill = {
    name: raw.name,
    path: raw.path,
    scope,
    agents: raw.agents as string[],
    source: raw.source,
    sourceUrl: raw.sourceUrl,
    sourceType: raw.sourceType,
  };
  if (typeof raw.description === "string") skill.description = raw.description;
  return skill;
}

/** Parses untrusted file content into a PersistedIndex, or null when
 * anything is off (truncated JSON, wrong version, empty/partial skills). */
export function normalizeDiskIndex(content: string, scope: Scope): PersistedIndex | null {
  if (content.length > MAX_INDEX_BYTES) return null; // absurd size ⇒ not ours; skip the parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.version !== DISK_INDEX_VERSION) return null;
  if (typeof raw.savedAt !== "string") return null;
  if (!Array.isArray(raw.skills) || raw.skills.length === 0) return null;
  const skills: InstalledSkill[] = [];
  for (const entry of raw.skills) {
    const skill = normalizeEntry(entry, scope);
    if (skill) skills.push(skill);
  }
  if (skills.length === 0) return null; // every entry hostile ⇒ regenerate, don't render an empty lie
  return { version: DISK_INDEX_VERSION, savedAt: raw.savedAt, skills };
}

/** Loads the persisted index for a scope. Returns null when absent, corrupt,
 * partial, or hostile — callers fall through to the real load. NEVER throws. */
export function loadDiskIndex(scope: Scope, dirOverride?: string): InstalledSkill[] | null {
  try {
    const path = diskIndexPath(scope, dirOverride);
    if (!existsSync(path)) return null;
    // size check BEFORE the read: a multi-GB hostile file is rejected
    // without ever being pulled into memory
    if (statSync(path).size > MAX_INDEX_BYTES) return null;
    const index = normalizeDiskIndex(readFileSync(path, "utf-8"), scope);
    return index ? index.skills.map((s) => ({ ...s })) : null;
  } catch {
    return null;
  }
}

/** Persists a FRESH (subprocess-verified) enriched list atomically. Best
 * effort by contract: any error is swallowed — a failed cache write must
 * never take the TUI down. */
export function saveDiskIndex(scope: Scope, skills: InstalledSkill[], dirOverride?: string): void {
  const path = diskIndexPath(scope, dirOverride);
  sweepStaleTmp(dirname(path), basename(path)); // opportunistic crash-litter cleanup
  // per-pid tmp name: two writers never interleave into one tmp file, so the
  // rename always publishes a whole file
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    const index: PersistedIndex = {
      version: DISK_INDEX_VERSION,
      savedAt: new Date().toISOString(),
      skills: skills.map((s) => ({ ...s })),
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, JSON.stringify(index));
    renameSync(tmp, path); // same-dir rename: atomic on POSIX — no torn reads
  } catch {
    try {
      if (existsSync(tmp)) unlinkSync(tmp); // never leave tmp litter behind
    } catch {
      // still best-effort
    }
  }
}
