import { readLock } from "./locks.ts";
import type { Scope, UpdatesResult } from "./types.ts";

/**
 * Read-only update check. Compares each locked skill's GitHub tree SHA
 * (`skillFolderHash`) against the source repo's current tree via the
 * GitHub Trees API — the dominant check path, ported in spirit from
 * vercel-labs/skills `src/updates.ts` (MIT).
 *
 * Phase-1 capability boundary (surfaced via /api/version): well-known
 * digest groups and throwaway shallow clones for generic git sources are
 * not checked yet and report `not checkable yet`; they land in a later
 * 0.x. Local/missing-hash entries report `not checkable` like upstream.
 *
 * CORE-03 (S-197): entries that failed lock shape validation surface here as
 * visible per-entry diagnostics on the EXISTING UpdatesResult error shape
 * (sourceType:'unknown', error:message) — a broken sibling never silently
 * vanishes from the report. The updates dictionary is null-prototype so an
 * externally controlled entry name (e.g. "__proto__") cannot mutate
 * Object.prototype.
 *
 * CORE-04 (S-198): incomplete or absent tree evidence is inconclusive, never
 * an unqualified current result. fetchRepoTree returns null for a truncated
 * trees payload (or missing/malformed completeness metadata) — a partial
 * tree must not let unobserved paths report as current. A requested folder
 * missing from a COMPLETE tree is an explicit inconclusive error row (the
 * folder may have been removed upstream), distinct from the fetch-failure
 * text.
 */

interface TreeEntry {
  path: string;
  sha: string;
  type: string;
}

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isTreeEntry = (v: unknown): v is TreeEntry =>
  record(v) && typeof v.path === "string" && typeof v.sha === "string" && typeof v.type === "string";

export async function fetchRepoTree(source: string, ref?: string): Promise<TreeEntry[] | null> {
  // CORE-01 (S-195): an omitted ref must still request an explicit tree
  // identifier — the bare /git/trees URL shape is upstream-unsupported.
  // HEAD resolves the default branch's tree (GitHub Trees API permits a
  // tree ref); explicit refs stay one encoded path segment.
  const treeRef = ref ?? "HEAD";
  const refPath = `/${encodeURIComponent(treeRef)}`;
  // segment-wise encoding (0.5.1 impl A): a lockfile-controlled `source`
  // must not smuggle path separators or ':' into the authed API URL
  const repoPath = source
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const url = `https://api.github.com/repos/${repoPath}/git/trees${refPath}?recursive=1`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "skills-ui",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  // CORE-04 (S-198): completeness is part of the evidence. Only an
  // explicitly truncated:false payload with well-formed tree entries counts
  // as a complete tree; truncation, missing completeness metadata, or
  // malformed nodes are inconclusive (null). This is the bounded remedy —
  // no second (non-recursive subtree) request path for large repositories.
  const data: unknown = await res.json();
  if (
    !record(data) ||
    data.truncated !== false ||
    !Array.isArray(data.tree) ||
    !data.tree.every(isTreeEntry)
  )
    return null;
  return data.tree;
}

function treeHashFor(tree: TreeEntry[], skillPath: string): string | null {
  const normalized = skillPath.replace(/^\.\//, "").replace(/\/$/, "");
  const entry = tree.find((t) => t.path === normalized && t.type === "tree");
  return entry?.sha ?? null;
}

export async function checkForUpdates(scope: Scope): Promise<UpdatesResult> {
  const lock = readLock(scope);
  const { skills: entries } = lock;
  // Null-prototype: entry names come from the lock file — assignment of a
  // "__proto__" key must create an own property, not set a prototype.
  const result = Object.create(null) as UpdatesResult["updates"];
  const status = (
    name: string,
    sourceType: string,
    updateAvailable: boolean,
    error?: string
  ) => {
    result[name] = { name, updateAvailable, error, sourceType };
  };

  // Per-entry diagnostics from the lock reader: visible errors, not ghosts.
  for (const [name, message] of Object.entries(lock.diagnostics ?? {})) {
    status(name, "unknown", false, message);
  }

  const githubGroups = new Map<string, Array<{ name: string; source: string; ref?: string; skillPath?: string; skillFolderHash?: string; sourceType: string }>>();
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.sourceType === "github" && entry.skillFolderHash && entry.skillPath) {
      const key = `${entry.source}\n${entry.ref ?? ""}`;
      const group = githubGroups.get(key) ?? [];
      group.push({ name, ...entry });
      githubGroups.set(key, group);
    } else if (entry.sourceType === "well-known") {
      status(name, entry.sourceType, false, "not checkable yet (well-known digest check lands in a later 0.x)");
    } else if (entry.skillFolderHash && entry.skillPath && (entry.sourceUrl || entry.source)) {
      status(name, entry.sourceType, false, "not checkable yet (generic git clone check lands in a later 0.x)");
    } else {
      status(name, entry.sourceType, false, "not checkable (local or missing hash)");
    }
  }

  await Promise.all(
    [...githubGroups.values()].map(async (items) => {
      const first = items[0]!;
      let tree: TreeEntry[] | null = null;
      try {
        tree = await fetchRepoTree(first.source, first.ref);
      } catch {
        tree = null;
      }
      for (const item of items) {
        if (!tree) {
          status(item.name, "github", false, "check failed (repo not found or rate limited)");
          continue;
        }
        const latest = treeHashFor(tree, item.skillPath!);
        // CORE-04 (S-198): absent from a COMPLETE tree is inconclusive —
        // the folder may have been removed upstream — never an unqualified
        // current result. Text is distinct from the fetch-failure case.
        if (latest === null) {
          status(
            item.name,
            item.sourceType,
            false,
            "update status inconclusive: folder absent from complete tree"
          );
          continue;
        }
        status(item.name, "github", latest !== item.skillFolderHash);
      }
    })
  );

  return { scope, updates: result, checkedCount: Object.keys(result).length };
}
