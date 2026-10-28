export type Scope = "project" | "global";

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
