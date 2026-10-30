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
 */

interface TreeEntry {
  path: string;
  sha: string;
  type: string;
}

export async function fetchRepoTree(source: string, ref?: string): Promise<TreeEntry[] | null> {
  const refPath = ref ? `/${encodeURIComponent(ref)}` : "";
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
  const data = (await res.json()) as { tree?: TreeEntry[] };
  return data.tree ?? null;
}

function treeHashFor(tree: TreeEntry[], skillPath: string): string | null {
  const normalized = skillPath.replace(/^\.\//, "").replace(/\/$/, "");
  const entry = tree.find((t) => t.path === normalized && t.type === "tree");
  return entry?.sha ?? null;
}

export async function checkForUpdates(scope: Scope): Promise<UpdatesResult> {
  const { skills: entries } = readLock(scope);
  const result: UpdatesResult["updates"] = {};
  const status = (
    name: string,
    sourceType: string,
    updateAvailable: boolean,
    error?: string
  ) => {
    result[name] = { name, updateAvailable, error, sourceType };
  };

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
        status(item.name, "github", latest !== null && latest !== item.skillFolderHash);
      }
    })
  );

  return { scope, updates: result, checkedCount: Object.keys(result).length };
}
