export type Scope = "project" | "global";

export type SkillProvenance = "locked" | "linked" | "local";

export type MutationEvent = "install" | "remove" | "update";

export interface PostMutationHookResult {
  configured: boolean;
  ok: boolean;
  skipped?: boolean;
  exitCode?: number;
  timedOut?: boolean;
  summary?: string;
  output?: string;
}

export interface HealthCheckResult {
  configured: boolean;
  ok: boolean;
  summary: string;
  details?: string[];
  checkedAt: string;
}

/** One installed skill, mapped from `skills ls --json` output. */
export interface InstalledSkill {
  name: string;
  /** Absolute canonical path (the CLI JSON emits this as `path`). */
  path: string;
  scope: Scope;
  /** Human agent display names, e.g. "Claude Code", "Cursor". */
  agents: string[];
  source: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  /** Filesystem/lockfile origin (0.5.5). */
  provenance?: SkillProvenance;
  /** Frontmatter description, enriched by callers that want it (TUI filter, API). */
  description?: string;
}

/** One registry search hit (skills.sh). */
export interface SearchSkill {
  name: string;
  slug: string;
  source: string;
  installs: number;
}

/** One entry of the `add --json` result array. */
export interface AddResultEntry {
  name?: string;
  status: "installed" | "failed" | "skipped";
  source?: string | null;
  path?: string;
  scope?: string;
  error?: string;
  reason?: string;
}

export interface UpdatesResult {
  scope: Scope;
  updates: Record<
    string,
    { name: string; updateAvailable: boolean; error?: string; sourceType: string }
  >;
  checkedCount: number;
}
