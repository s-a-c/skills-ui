import type { SearchSkill } from "./types.ts";

/**
 * Registry search + fuzzy fallback, ported from vercel-labs/skills
 * `src/ui/search.ts` (MIT): no `limit` param (skills.sh's Algolia fuzzy
 * index vs its strict token path), substring gating for hyphenated
 * prefixes, progressive shortening, trailing-dash fan-out.
 */

const SEARCH_API_BASE = process.env.SKILLS_API_URL ?? "https://skills.sh";

/** Strip terminal escape sequences + collapse newlines (CWE-150 defense). */
export function sanitizeMetadata(str: string): string {
  return str
    .replace(
      /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, // CSI
      ""
    )
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "") // OSC
    .replace(/\x1b[P^_][\s\S]*?(?:\x1b\\)/g, "") // DCS/PM/APC
    .replace(/\x1b[\x20-\x7e]/g, "") // simple escapes
    .replace(/[\x00-\x08\x0b-\x1f\x7f\x80-\x9f]/g, "") // control chars
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export async function searchRegistryFuzzy(query: string, owner?: string): Promise<SearchSkill[]> {
  try {
    const params = new URLSearchParams({ q: query });
    if (owner) params.set("owner", owner);
    const res = await fetch(`${SEARCH_API_BASE}/api/search?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      skills?: Array<{ id: string; name: string; installs: number; source: string }>;
    };
    return (data.skills ?? [])
      .map((skill) => ({
        name: sanitizeMetadata(skill.name),
        slug: sanitizeMetadata(skill.id),
        source: sanitizeMetadata(skill.source || ""),
        installs: skill.installs,
      }))
      .sort((a, b) => (b.installs || 0) - (a.installs || 0));
  } catch {
    return [];
  }
}

export interface FallbackSearchResult {
  results: SearchSkill[];
  /** Query the registry actually matched, when it differs from the request. */
  adjustedQuery: string | null;
}

const MIN_QUERY_LENGTH = 4;
const MAX_SHORTENINGS = 6;

async function mapConcurrent<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 6): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export function makeSearchWithFallback(
  search: (query: string, owner?: string) => Promise<SearchSkill[]>
): (query: string, owner?: string) => Promise<FallbackSearchResult> {
  return async (query: string, owner?: string): Promise<FallbackSearchResult> => {
    const trimmed = query.trim();
    const token = (trimmed.toLowerCase().match(/^[a-z0-9]+/) || [""])[0]!;
    const gate = (results: SearchSkill[]): SearchSkill[] =>
      token.length < 3 || !trimmed.includes("-")
        ? results
        : results.filter(
            (r) => r.name.toLowerCase().includes(token) || r.source.toLowerCase().includes(token)
          );

    const direct = gate(await search(query, owner));
    if (direct.length > 0) return { results: direct, adjustedQuery: null };

    if (/[a-z0-9]$/i.test(trimmed) === false && token.length >= 3) {
      const prefix = trimmed.toLowerCase();
      const continuations = "abcdefghijklmnopqrstuvwxyz0123456789".split("").map((c) => prefix + c);
      const settled = await mapConcurrent(continuations, (q) =>
        search(q, owner).catch(() => [] as SearchSkill[])
      );
      const bySlug = new Map<string, SearchSkill>();
      for (const results of settled) {
        for (const r of results) {
          if (!r.name.toLowerCase().includes(token)) continue;
          if (!bySlug.has(r.slug)) bySlug.set(r.slug, r);
        }
      }
      const merged = [...bySlug.values()].sort((a, b) => b.installs - a.installs);
      if (merged.length > 0) return { results: merged, adjustedQuery: trimmed };
      return { results: [], adjustedQuery: null };
    }

    let shortened = trimmed;
    let attempts = 0;
    while (shortened.length >= MIN_QUERY_LENGTH && attempts < MAX_SHORTENINGS) {
      shortened = shortened.slice(0, -1);
      attempts++;
      const results = gate(await search(shortened, owner));
      if (results.length > 0) return { results, adjustedQuery: shortened };
    }
    return { results: [], adjustedQuery: null };
  };
}

export const searchWithFallback = makeSearchWithFallback(searchRegistryFuzzy);
