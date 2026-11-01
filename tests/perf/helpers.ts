/**
 * Shared perf-harness helpers (S-177). Used by tests/perf/*.test.ts AND
 * scripts/perf/budget.ts — one implementation, so the perf tests and the
 * budget report measure through the exact same machinery:
 *
 *   - buildSyntheticCorpus  390-project / 40-global shim fixture with real
 *                           SKILL.md files on disk (description enrichment
 *                           and /api/skill read them)
 *   - readShimCallLog       spawn counter over SKILLS_SHIM_CALLLOG
 *   - startSearchStub       stub skills.sh registry with a FIXED artificial
 *                           RTT and a request log (start/end per call, so
 *                           identical-in-flight concurrency is computable)
 *   - median / fmtMs        wall-clock stats (script rows report medians)
 *
 * Count-based and behavioral only here — no wall-clock asserts live in the
 * tests that import this file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SHIM = new URL("../fixtures/skills-shim.mjs", import.meta.url).pathname;

// ---------- synthetic corpus ----------

export interface ShimEntry {
  name: string;
  path: string;
  scope: "project" | "global";
  agents: string[];
  source: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
}

export interface SyntheticCorpus {
  root: string;
  projectFixture: string;
  globalFixture: string;
  project: ShimEntry[];
  global: ShimEntry[];
  counts: { project: number; global: number; total: number };
}

const AGENT_SETS = [
  ["Claude Code"],
  ["Claude Code", "Cursor"],
  ["Codex", "Gemini CLI"],
  ["Claude Code", "Cursor", "Codex"],
  [],
];

/**
 * Materialize a shim corpus: `projectCount` project-scope + `globalCount`
 * global-scope entries, each with a real directory and SKILL.md on disk so
 * description enrichment and detail reads touch actual files. Names are
 * `perf-skill-000`… (project) and `perf-global-000`… (global) so probes can
 * select exact row subsets and the first-paint probe has a marker that can
 * only come from the global listing.
 */
export function buildSyntheticCorpus(
  root: string,
  projectCount = 390,
  globalCount = 40
): SyntheticCorpus {
  const corpusDir = join(root, "corpus");
  mkdirSync(corpusDir, { recursive: true });
  const pad = (n: number, width: number): string => String(n).padStart(width, "0");

  const make = (prefix: string, i: number, scope: "project" | "global"): ShimEntry => {
    const name = `${prefix}-${pad(i, 3)}`;
    const path = join(corpusDir, scope, name);
    mkdirSync(path, { recursive: true });
    const agents = AGENT_SETS[i % AGENT_SETS.length]!;
    const sourced = i % 5 === 2; // every 5th skill looks installed from a repo
    writeFileSync(
      join(path, "SKILL.md"),
      [
        "---",
        `name: ${name}`,
        `description: Synthetic perf skill ${pad(i, 3)} for the ${scope} budget corpus`,
        "---",
        "",
        `# ${name}`,
        "",
        "Body line for the detail-read path. " + "filler ".repeat(12),
        "",
        "- list item one",
        "- list item two",
        "",
      ].join("\n")
    );
    return {
      name,
      path,
      scope,
      agents,
      source: sourced ? "anthropics/skills" : null,
      sourceUrl: sourced ? "https://github.com/anthropics/skills" : null,
      sourceType: sourced ? "github" : null,
    };
  };

  const project = Array.from({ length: projectCount }, (_, i) => make("perf-skill", i, "project"));
  const global = Array.from({ length: globalCount }, (_, i) => make("perf-global", i, "global"));
  const projectFixture = join(root, "ls-project.json");
  const globalFixture = join(root, "ls-global.json");
  writeFileSync(projectFixture, JSON.stringify(project, null, 2));
  writeFileSync(globalFixture, JSON.stringify(global, null, 2));
  return {
    root,
    projectFixture,
    globalFixture,
    project,
    global,
    counts: { project: projectCount, global: globalCount, total: projectCount + globalCount },
  };
}

// ---------- shim call log (spawn counting) ----------

export interface ShimCall {
  ts: number;
  args: string[];
}

/** Parse a SKILLS_SHIM_CALLLOG file; missing file ⇒ no spawns yet. */
export function readShimCallLog(path: string): ShimCall[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ShimCall);
}

/** Count logged invocations, optionally restricted to an exact argv prefix. */
export function countShimCalls(calls: ShimCall[], argv?: string[]): number {
  return calls.filter((c) => (argv ? argv.every((a, i) => c.args[i] === a) : true)).length;
}

// ---------- stub registry search server (fixed artificial RTT) ----------

export interface SearchStubRequest {
  q: string;
  /** performance-origin ms timestamps taken inside the stub server */
  start: number;
  end: number;
}

export interface SearchStub {
  port: number;
  url: string;
  /** every upstream /api/search hit, in arrival order */
  requests: SearchStubRequest[];
  /** highest count of same-q requests concurrently in flight */
  maxIdenticalInFlight: () => number;
  stop: () => void;
}

export interface SearchStubOptions {
  /** fixed artificial RTT applied to every query (ms) */
  rttMs?: number;
  /** per-query RTT override (ms) — the stale-overwrite probe needs a slow
   * stale query and a fast fresh one */
  perQueryRttMs?: Record<string, number>;
  /** registry payload returned for every query */
  skills?: Array<{ id: string; name: string; installs: number; source: string }>;
}

/**
 * Stub skills.sh registry: answers GET /api/search?q=… after a fixed
 * artificial RTT with a fixed payload. Deterministic by construction — the
 * wrapper-overhead row and the upstream call-count rows never touch the
 * network. Requests are logged with start/end so in-flight concurrency is
 * measured, not guessed.
 */
export async function startSearchStub(options: SearchStubOptions = {}): Promise<SearchStub> {
  const rttMs = options.rttMs ?? 40;
  const perQuery = options.perQueryRttMs ?? {};
  const skills = options.skills ?? [
    { id: "stub-skill", name: "stub-skill", installs: 42, source: "stub/registry" },
  ];
  const requests: SearchStubRequest[] = [];
  const t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const q = new URL(req.url).searchParams.get("q") ?? "";
      const start = performance.now() - t0;
      await Bun.sleep(perQuery[q] ?? rttMs);
      const end = performance.now() - t0;
      requests.push({ q, start, end });
      return Response.json({ skills });
    },
  });
  await (server as unknown as { ready?: Promise<unknown> }).ready;
  return {
    port: server.port ?? 0,
    url: `http://127.0.0.1:${server.port ?? 0}`,
    requests,
    maxIdenticalInFlight: () => {
      let max = 0;
      const byQ = new Map<string, SearchStubRequest[]>();
      for (const r of requests) {
        const list = byQ.get(r.q) ?? [];
        list.push(r);
        byQ.set(r.q, list);
      }
      for (const list of byQ.values()) {
        const events = list
          .flatMap((r) => [
            { t: r.start, delta: 1 },
            { t: r.end, delta: -1 },
          ])
          .sort((a, b) => a.t - b.t || a.delta - b.delta); // ends before starts at the same instant
        let running = 0;
        for (const e of events) {
          running += e.delta;
          if (running > max) max = running;
        }
      }
      return max;
    },
    stop: () => server.stop(true),
  };
}

// ---------- wall-clock stats ----------

export function median(samples: number[]): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function fmtMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}
