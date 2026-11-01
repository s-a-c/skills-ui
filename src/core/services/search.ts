import type { SearchSkill } from "./types.ts";
import { sanitizeMetadata } from "./sanitize.ts";

/**
 * Registry search + fuzzy fallback, ported from vercel-labs/skills
 * `src/ui/search.ts` (MIT): no `limit` param (skills.sh's Algolia fuzzy
 * index vs its strict token path), substring gating for hyphenated
 * prefixes, progressive shortening, trailing-dash fan-out.
 */

const API_BASE_DEFAULT = "https://skills.sh";

// Read lazily (not at module load) so tests can point SKILLS_UI_API_URL at
// a dead-port fixture after the module is cached (bun test shares the
// module registry across files).
function apiBase(): string {
  return process.env.SKILLS_UI_API_URL ?? API_BASE_DEFAULT;
}

export { sanitizeMetadata };

export interface RegistrySearchOutcome {
  results: SearchSkill[];
  /** True when the registry query itself failed (fetch error / !res.ok /
   * unparseable body). Threaded out so surfaces can say "search failed"
   * instead of lying "no results" (F4). */
  failed: boolean;
}

/**
 * S-182 in-flight dedup, at the level of the ACTUAL upstream fetch: both
 * consumers (the serve's /api/search handler and the TUI, which calls
 * searchWithFallback directly) converge on searchRegistryFuzzy, so a keyed
 * in-flight map here collapses identical concurrent HTTP calls for both —
 * including identical calls that arise from different composite queries'
 * shortening chains or fan-outs intersecting. The key is the full effective
 * query + owner, so two different queries never share. The entry is cleared
 * on settle (success AND failure): nothing is memoized — a sequential
 * repeat refires, and a failed outcome can never poison a later identical
 * query. Semantics: this only collapses identical CONCURRENT calls; which
 * calls fire for a single sequential query (and every result) is untouched.
 */
const inFlight = new Map<string, Promise<RegistrySearchOutcome>>();

async function searchRegistryFuzzyOnce(
  query: string,
  owner?: string
): Promise<RegistrySearchOutcome> {
  try {
    const params = new URLSearchParams({ q: query });
    if (owner) params.set("owner", owner);
    const res = await fetch(`${apiBase()}/api/search?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { results: [], failed: true };
    const data = (await res.json()) as {
      skills?: Array<{ id: string; name: string; installs: number; source: string }>;
    };
    return {
      results: (data.skills ?? [])
        .map((skill) => ({
          name: sanitizeMetadata(skill.name),
          slug: sanitizeMetadata(skill.id),
          source: sanitizeMetadata(skill.source || ""),
          installs: skill.installs,
        }))
        .sort((a, b) => (b.installs || 0) - (a.installs || 0)),
      failed: false,
    };
  } catch {
    return { results: [], failed: true };
  }
}

export function searchRegistryFuzzy(
  query: string,
  owner?: string
): Promise<RegistrySearchOutcome> {
  const key = JSON.stringify([query, owner ?? null]);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = searchRegistryFuzzyOnce(query, owner).finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

export interface FallbackSearchResult {
  results: SearchSkill[];
  /** Query the registry actually matched, when it differs from the request. */
  adjustedQuery: string | null;
  /** True when the primary registry query failed. Deliberately OUT of the
   * fallback semantics: a failed lookup short-circuits the shortening
   * fan-out (those queries would be just as doomed) and never manufactures
   * an adjustedQuery (F4). */
  failed?: boolean;
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
  search: (query: string, owner?: string) => Promise<RegistrySearchOutcome>
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

    const primary = await search(query, owner);
    const direct = gate(primary.results);
    // F4: the registry fetch failed — a failure signal, not a zero. No
    // fan-out of equally-doomed queries, no adjustedQuery fallback noise.
    if (primary.failed) return { results: direct, adjustedQuery: null, failed: true };
    if (direct.length > 0) return { results: direct, adjustedQuery: null };

    if (/[a-z0-9]$/i.test(trimmed) === false && token.length >= 3) {
      const prefix = trimmed.toLowerCase();
      const continuations = "abcdefghijklmnopqrstuvwxyz0123456789".split("").map((c) => prefix + c);
      const settled = await mapConcurrent(continuations, (q) =>
        search(q, owner)
          .then((o) => o.results)
          .catch(() => [] as SearchSkill[])
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
      const results = gate((await search(shortened, owner)).results);
      if (results.length > 0) return { results, adjustedQuery: shortened };
    }
    return { results: [], adjustedQuery: null };
  };
}

export const searchWithFallback = makeSearchWithFallback(searchRegistryFuzzy);
