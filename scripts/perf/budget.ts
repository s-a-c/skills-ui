#!/usr/bin/env bun
/**
 * skills-ui performance budget harness (S-177) — measures the budgets
 * ratified in S-155 against the real serve API and the real served page.
 *
 * Usage:
 *   bun run perf:budget                 synthetic scenario (skills-shim
 *                                       corpus: 390 project + 40 global)
 *   bun run perf:budget -- --real       measure the REAL `skills` corpus on
 *                                       this machine. Never in CI. A real
 *                                       global `skills ls -g` takes on the
 *                                       order of a minute per spawn on this
 *                                       machine — expect a multi-minute run
 *                                       at the default 5 reps.
 *   bun run perf:budget -- --out        ALSO write scripts/perf/report-<date>.md
 *                                       (refuses to overwrite an existing
 *                                       same-day report unless --force)
 *   bun run perf:budget -- --strict     exit 1 on any BUDGET-MISS (gate use)
 *   bun run perf:budget -- --force      allow --out to overwrite today's report
 *   bun run perf:budget -- --reps N     repetitions per wall-clock row
 *                                       (default 5; median reported; min 1;
 *                                       accepts --reps=N too)
 *
 * Exit codes: 0 when the harness completed with verdicts (BUDGET-MISS rows
 * included); 1 only with --strict and at least one BUDGET-MISS; 2 on
 * harness errors or refusals (e.g. --real in CI, `skills` CLI missing).
 *
 * Sequencing (ratified in S-155): several fixes these rows measure land in
 * LATER tickets. BUDGET-MISS on current main is the recorded baseline, not
 * a harness failure.
 *
 * Wall-clock protocol: the API-timed rows (cold/warm lists, detail, search)
 * take REPS samples each (default 5) and report the MEDIAN. The filter
 * render-work row takes ONE sample per scenario needle (7 needles, median
 * across needles — not REPS per needle); render work = the page's own
 * skills-ui:filter-render User Timing measure (marks around every debounced
 * render pass), EXCLUDING both the ratified debounce wait and the browser's
 * frame pacing (perceived dispatch→render is context). The cold-global
 * paint row is REPS fresh-serve samples, median. The filter matching row is
 * REPS timed full-corpus skillMatches passes per needle, median across all
 * passes. Count rows (spawns, rebuilds, replays, in-flight, stale) are
 * exact. The stub registry answers every search probe with a FIXED
 * artificial RTT so the wrapper-overhead row never touches the network.
 */
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  SHIM,
  buildSyntheticCorpus,
  countShimCalls,
  fmtMs,
  median,
  readShimCallLog,
  startSearchStub,
  type SearchStub,
  type ShimEntry,
  type SyntheticCorpus,
} from "../../tests/perf/helpers.ts";
import {
  closeBrowser,
  newPerfContext,
  openServedPage,
  probeFilterRender,
  probeScopeFirstPaint,
  probeStaleOverwrite,
  stubUpdates,
} from "../../tests/perf/playwright-probes.ts";
import { createSkillsUiServer } from "../../src/core/api.ts";
import { listInstalled, readSkillDoc, runSkills, sanitizeMetadata, skillMatches } from "../../src/core/index.ts";
import { APP_VERSION } from "../../src/core/version.ts";
import { webPageRenderer } from "../../src/web/page.ts";

// ---------- CLI ----------

const USAGE =
  "usage: bun run perf:budget [--real] [--out] [--strict] [--force] [--reps N | --reps=N]";
const argv = process.argv.slice(2);
let REAL = false;
let OUT = false;
let STRICT = false;
let FORCE = false;
let REPS = 5;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]!;
  if (arg === "--real") REAL = true;
  else if (arg === "--out") OUT = true;
  else if (arg === "--strict") STRICT = true;
  else if (arg === "--force") FORCE = true;
  else if (arg === "--reps") {
    const raw = argv[i + 1];
    if (raw === undefined) {
      console.error(`perf:budget: --reps needs a value (1-50)\n${USAGE}`);
      process.exit(2);
    }
    REPS = Number(raw);
    i++;
  } else if (arg.startsWith("--reps=")) {
    REPS = Number(arg.slice("--reps=".length));
  } else {
    console.error(`perf:budget: unknown argument "${arg}"\n${USAGE}`);
    process.exit(2);
  }
}
if (!Number.isInteger(REPS) || REPS < 1 || REPS > 50) {
  console.error(`perf:budget: --reps must be an integer between 1 and 50\n${USAGE}`);
  process.exit(2);
}

type Verdict = "MET" | "BUDGET-MISS";
interface Row {
  hotPath: string;
  budget: string;
  measured: string;
  verdict: Verdict;
}

const rows: Row[] = [];
const observations: string[] = [];
function verdictFor(measured: number, budget: number): Verdict {
  return measured <= budget ? "MET" : "BUDGET-MISS";
}
function msRow(hotPath: string, budgetLabel: string, budgetMs: number, measuredMs: number): Row {
  const row: Row = {
    hotPath,
    budget: budgetLabel,
    measured: fmtMs(measuredMs),
    verdict: verdictFor(measuredMs, budgetMs),
  };
  rows.push(row);
  return row;
}
function progress(message: string): void {
  console.error(`[perf] ${message}`);
}
/** Harness failure: unwinds through the finally cleanup, then exit 2. */
function die(message: string): never {
  throw new Error(message);
}

// ---------- env hygiene ----------

const ENV_KEYS = [
  "SKILLS_UI_SKILLS_BIN",
  "SKILLS_SHIM_STATE",
  "SKILLS_UI_PREFS_DIR",
  "SKILLS_SHIM_LS_PROJECT",
  "SKILLS_SHIM_LS_GLOBAL",
  "SKILLS_SHIM_CALLLOG",
  "SKILLS_UI_API_URL",
] as const;
type EnvKey = (typeof ENV_KEYS)[number];
function snapshotEnv(): Record<EnvKey, string | undefined> {
  const snap = {} as Record<EnvKey, string | undefined>;
  for (const key of ENV_KEYS) snap[key] = process.env[key];
  return snap;
}
function restoreEnv(snap: Record<EnvKey, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (snap[key] === undefined) delete process.env[key];
    else process.env[key] = snap[key]!;
  }
}

interface Server {
  port: number;
  base: string;
  stop: () => Promise<void>;
}
async function freshServer(withPage: boolean): Promise<Server> {
  const s = await createSkillsUiServer({ withPage, pageRenderer: withPage ? webPageRenderer : undefined });
  return { port: s.port, base: `http://127.0.0.1:${s.port}`, stop: s.stop };
}

async function timedGetJson(url: string): Promise<{ ms: number; status: number; body: any }> {
  const t0 = performance.now();
  const res = await fetch(url);
  const body = await res.json();
  return { ms: performance.now() - t0, status: res.status, body };
}

// ---------- scenario ----------

interface Scenario {
  label: string;
  headerLines: string[];
  expectedProjectRows: number;
  globalRowCount: number;
  globalMarker: string;
  detailName: string;
  /** the cached row path for the detail probe — S-179: the page sends
   * name+path and the serve resolves by exact path match */
  detailPath: string;
  filterProbes: string[];
  rebuildProbe: string;
  /** the project listing itself — input to the in-process matching row */
  projectEntries: ShimEntry[];
}

async function setupSynthetic(workDir: string): Promise<Scenario> {
  const corpus: SyntheticCorpus = buildSyntheticCorpus(workDir, 390, 40);
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = join(workDir, "shim-state");
  process.env.SKILLS_UI_PREFS_DIR = join(workDir, "prefs");
  process.env.SKILLS_SHIM_LS_PROJECT = corpus.projectFixture;
  process.env.SKILLS_SHIM_LS_GLOBAL = corpus.globalFixture;
  process.env.SKILLS_SHIM_CALLLOG = join(workDir, "shim-calls.jsonl");
  return {
    label: "synthetic",
    headerLines: [
      "corpus: skills-shim fixtures — 390 project + 40 global skills (real SKILL.md files on disk; own SKILLS_SHIM_STATE per run)",
    ],
    expectedProjectRows: corpus.counts.project,
    globalRowCount: corpus.counts.global,
    globalMarker: corpus.global[0]!.name,
    detailPath: corpus.project[7]!.path,
    detailName: "perf-skill-007",
    filterProbes: ["p", "per", "perf-", "perf-skill-0", "perf-skill-1", "perf-skill-3", "perf-skill-00"],
    rebuildProbe: "perf-skill-00",
    projectEntries: corpus.project,
  };
}

let realPrefsDir: string | null = null;

async function setupReal(): Promise<Scenario> {
  const ci =
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    process.env.GITHUB_ACTIONS === "true" ||
    process.env.JENKINS_URL !== undefined ||
    process.env.BUILD_NUMBER !== undefined;
  if (ci) {
    die("--real must never run in CI (CI/GITHUB_ACTIONS/JENKINS_URL/BUILD_NUMBER set) — it measures THIS machine's real corpus and takes minutes");
  }
  delete process.env.SKILLS_UI_SKILLS_BIN; // resolve the real `skills` on PATH
  if (!process.env.SKILLS_UI_PREFS_DIR) {
    realPrefsDir = mkdtempSync(join(tmpdir(), "skills-ui-perf-real-prefs-"));
    process.env.SKILLS_UI_PREFS_DIR = realPrefsDir;
  }
  try {
    const version = await runSkills(["--version"], { timeoutMs: 15_000 });
    progress(`real skills CLI: ${version.stdout.trim()}`);
  } catch {
    die("--real needs the real `skills` CLI (npm i -g skills) — none resolvable on PATH");
  }
  progress("counting the real corpus (`skills ls --json` per scope — the global scan alone is ~1 min)…");
  const project = await listInstalled("project");
  const global = await listInstalled("global");
  if (project.length === 0) die("real corpus has no project-scope skills — nothing to measure");
  let skillMdFiles = 0;
  const agentDirs = new Set<string>();
  for (const entry of [...project, ...global] as ShimEntry[]) {
    const isFile = existsSync(entry.path) && statSync(entry.path).isFile();
    if (isFile || existsSync(join(entry.path, "SKILL.md"))) skillMdFiles++;
    agentDirs.add(dirname(dirname(entry.path)));
  }
  const globalOnly = global.map((g) => g.name).filter((n) => !project.some((p) => p.name === n));
  return {
    label: "real",
    headerLines: [
      `corpus: real skills CLI on this machine — ${project.length} project + ${global.length} global skills, ${skillMdFiles} SKILL.md files, ${agentDirs.size} agent dirs`,
      "NEVER RUN IN CI — numbers are specific to this machine and this corpus",
    ],
    expectedProjectRows: project.length,
    globalRowCount: global.length,
    globalMarker: globalOnly[0] ?? "",
    detailName: project[0]!.name,
    detailPath: project[0]!.path,
    // Real corpora can be TINY (the canonical gate cwd has 1 project skill):
    // plain name slices all match the same single row, so every narrowing
    // needle is a keyed-reconcile no-op and the render-work row never
    // samples a set-CHANGING render. Interleave a non-matching needle so
    // match/no-match alternates and each probe exercises a real render.
    filterProbes: [
      project[0]!.name.slice(0, 1),
      "zzz-real-no-match",
      project[0]!.name.slice(0, 3),
      "zzz-real-no-match",
      project[0]!.name.slice(0, 5),
      "zzz-real-no-match",
      project[0]!.name,
    ],
    rebuildProbe: project[0]!.name,
    projectEntries: project as ShimEntry[],
  };
}

// ---------- benchmark stages ----------

function benchFilterMatching(scenario: Scenario): void {
  const matchInputs = scenario.projectEntries.map((entry) => {
    const doc = readSkillDoc(entry.path);
    const description = sanitizeMetadata(doc?.match(/^description:\s*(.+)$/m)?.[1] ?? "");
    return { name: entry.name, description, source: entry.source, agents: entry.agents };
  });
  const matchNeedles = [...scenario.filterProbes, ""];
  skillMatches(matchInputs[0]!, ""); // JIT warm-up, untimed
  const matchingSamples: number[] = [];
  let matchedRows = 0;
  for (let rep = 0; rep < REPS; rep++) {
    for (const needle of matchNeedles) {
      const t0 = performance.now();
      for (const input of matchInputs) {
        if (skillMatches(input, needle)) matchedRows++;
      }
      matchingSamples.push(performance.now() - t0);
    }
  }
  const matchingMedian = median(matchingSamples);
  progress(
    `filter matching alone: ${fmtMs(matchingMedian)} median full-corpus pass (${matchInputs.length} entries x ${matchNeedles.length} needles x ${REPS} reps)`
  );
  msRow(
    `filter matching alone — skillMatches over ${scenario.expectedProjectRows} entries, per needle pass, median`,
    "≤ 5 ms",
    5,
    matchingMedian
  );
  observations.push(
    `filter matching instrument: ${matchedRows} matches counted across ${matchingSamples.length} timed full-corpus passes (liveness check; per-needle row counts are the filter probe samples below)`
  );
}

async function benchColdList(scope: "project" | "global", expectedProjectRows?: number): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const server = await freshServer(false);
    let r;
    try {
      r = await timedGetJson(`${server.base}/api/skills?scope=${scope}`);
    } finally {
      await server.stop().catch(() => {});
    }
    if (r.status !== 200) die(`cold ${scope} rep ${i + 1}: HTTP ${r.status}`);
    if (expectedProjectRows !== undefined && r.body.skills.length !== expectedProjectRows) {
      die(`cold project rep ${i + 1}: expected ${expectedProjectRows} rows, got ${r.body.skills.length}`);
    }
    samples.push(r.ms);
    progress(`cold ${scope}${scope === "global" ? " (API)" : ""} rep ${i + 1}/${REPS}: ${fmtMs(r.ms)}`);
  }
  return median(samples);
}

async function benchApiLists(scenario: Scenario, servers: Server[]): Promise<Server> {
  msRow(
    "cold project list — GET /api/skills, first call on a fresh serve",
    "≤ 500 ms",
    500,
    await benchColdList("project", scenario.expectedProjectRows)
  );

  const warm = await freshServer(false);
  servers.push(warm);
  await timedGetJson(`${warm.base}/api/skills?scope=project`); // its cold call — discarded
  const warmProject: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const r = await timedGetJson(`${warm.base}/api/skills?scope=project`);
    if (r.status !== 200) die(`warm project rep ${i + 1}: HTTP ${r.status}`);
    warmProject.push(r.ms);
  }
  msRow("warm list — repeated GET /api/skills?scope=project on a live serve", "≤ 100 ms", 100, median(warmProject));

  const detail: number[] = [];
  const detailUrl = `${warm.base}/api/skill?name=${encodeURIComponent(scenario.detailName)}&path=${encodeURIComponent(scenario.detailPath)}&scope=project`;
  for (let i = 0; i < REPS; i++) {
    const r = await timedGetJson(detailUrl);
    if (r.status !== 200) die(`detail rep ${i + 1}: HTTP ${r.status}`);
    detail.push(r.ms);
  }
  msRow(
    `detail read — GET /api/skill (name+path, exact-path resolution) for ${scenario.detailName} on a live serve`,
    "≤ 100 ms",
    100,
    median(detail)
  );

  const coldGlobalMed = await benchColdList("global");
  observations.push(
    `cold global list via API (context only — the ratified row is the page's perceived first paint): ${fmtMs(coldGlobalMed)} median`
  );
  const warmGlobal: number[] = [];
  await timedGetJson(`${warm.base}/api/skills?scope=global`); // warm-up
  for (let i = 0; i < REPS; i++) {
    warmGlobal.push((await timedGetJson(`${warm.base}/api/skills?scope=global`)).ms);
  }
  observations.push(`warm global list via API: ${fmtMs(median(warmGlobal))} median`);
  return warm;
}

async function benchSearch(warm: Server): Promise<SearchStub> {
  const stub = await startSearchStub({
    rttMs: 40,
    perQueryRttMs: { "stale-aaaa": 900, aaab: 50 },
    skills: [
      { id: "stub-skill", name: "stub-skill", installs: 42, source: "stub/registry" },
      { id: "fresh-aaab-result", name: "fresh-aaab-result", installs: 1, source: "stub/registry" },
    ],
    perQuerySkills: {
      "stale-aaaa": [{ id: "stale-aaaa-result", name: "stale-aaaa-result", installs: 2, source: "stub/registry" }],
    },
  });
  process.env.SKILLS_UI_API_URL = stub.url;

  const directRtt: number[] = [];
  const wrapped: number[] = [];
  for (let i = 0; i < REPS; i++) {
    directRtt.push((await timedGetJson(`${stub.url}/api/search?q=stub`)).ms);
    const r = await timedGetJson(`${warm.base}/api/search?q=stub`);
    if (r.status !== 200) die(`search overhead rep ${i + 1}: HTTP ${r.status}`);
    wrapped.push(r.ms);
  }
  const overhead = median(wrapped) - median(directRtt);
  observations.push(
    `search overhead inputs: stub RTT fixed at 40 ms; direct median ${fmtMs(median(directRtt))}; wrapped median ${fmtMs(median(wrapped))}`
  );
  rows.push({
    hotPath: "search wrapper overhead over registry RTT (GET /api/search vs direct stub call)",
    budget: "≤ 50 ms",
    measured: fmtMs(overhead),
    verdict: verdictFor(overhead, 50),
  });

  await Promise.all(Array.from({ length: 3 }, () => timedGetJson(`${warm.base}/api/search?q=stub`)));
  const inFlight = stub.maxIdenticalInFlight();
  const stubCallsForQ = stub.requests.filter((r) => r.q === "stub").length;
  observations.push(
    `upstream search calls logged: ${stub.requests.length} total, ${stubCallsForQ} for q=stub (1 of them is the concurrent identical-search pin; S-182 deduped 3 concurrent callers onto it)`
  );
  rows.push({
    hotPath: "in-flight identical upstream search requests (3 concurrent GET /api/search?q=stub)",
    budget: "≤ 1",
    measured: `${inFlight} concurrent (of ${stubCallsForQ} upstream calls)`,
    verdict: verdictFor(inFlight, 1),
  });
  return stub;
}

async function benchColdGlobalPaint(page: Page, scenario: Scenario, pageTimeout: number): Promise<void> {
  const paintSamples: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const paintServer = await freshServer(true);
    try {
      progress(`cold global paint rep ${i + 1}/${REPS}: opening a fresh serve + page…`);
      await openServedPage(page, paintServer.base, scenario.expectedProjectRows, pageTimeout);
      paintSamples.push(
        await probeScopeFirstPaint(page, {
          scope: "global",
          markerText: scenario.globalMarker,
          expectedRowCount: scenario.globalRowCount,
          timeoutMs: pageTimeout,
        })
      );
      progress(`cold global paint rep ${i + 1}/${REPS}: ${fmtMs(paintSamples[paintSamples.length - 1]!)}`);
    } finally {
      await paintServer.stop().catch(() => {});
    }
  }
  msRow(
    "cold global perceived first paint — scope switch on a fresh serve, median of fresh-serve reps",
    "≤ 300 ms",
    300,
    median(paintSamples)
  );
}

async function benchFilterRenderAndRebuild(page: Page, scenario: Scenario): Promise<void> {
  const FILTER_PROBE_WINDOW_MS = 400;
  const keystrokes: number[] = [];
  const perceived: number[] = [];
  const probeSamples: string[] = [];
  for (const value of scenario.filterProbes) {
    const probe = await probeFilterRender(page, value, FILTER_PROBE_WINDOW_MS);
    if (probe.timedOut) die(`filter probe: content for needle "${value}" never appeared (rows lost or value diverged)`);
    if (probe.noMutation && probe.renderWorkMs < 0) {
      die(`filter probe: zero DOM mutations AND no render measure for needle "${value}" — the debounced render never fired`);
    }
    const work = probe.noMutation ? Math.max(0, probe.renderWorkMs) : probe.renderWorkMs;
    const tag = probe.noMutation ? "no DOM change, render" : "render";
    probeSamples.push(`"${value}" → ${probe.rows} rows, ${tag} ${fmtMs(work)} (perceived ${fmtMs(probe.durationMs)})`);
    keystrokes.push(work);
    perceived.push(probe.durationMs);
  }
  observations.push(`filter probe samples: ${probeSamples.join("; ")}`);
  observations.push(
    `filter perceived dispatch→render (INCLUDES the ratified debounce wait, context only — the budget row charges the render work): ${fmtMs(median(perceived))} median`
  );
  msRow(
    "filter render work per debounced render (User Timing measure of the pass) — median over varied needles",
    "≤ 50 ms",
    50,
    median(keystrokes)
  );

  await probeFilterRender(page, scenario.rebuildProbe, FILTER_PROBE_WINDOW_MS);
  const repeat = await probeFilterRender(page, scenario.rebuildProbe, FILTER_PROBE_WINDOW_MS);
  if (repeat.timedOut) die("filter probe: same-result keystroke content never appeared (rows lost or value diverged)");
  const rebuilt = !repeat.noMutation && repeat.preservedRows < repeat.rows;
  rows.push({
    hotPath: "filter full rebuilds per same-result keystroke (row DOM identity preserved?)",
    budget: "0 full rebuilds",
    measured: repeat.noMutation
      ? `0 (no list mutation — ${repeat.rows}/${repeat.rows} rows preserved)`
      : rebuilt
        ? `1 (${repeat.preservedRows}/${repeat.rows} rows preserved)`
        : `0 (${repeat.preservedRows}/${repeat.rows} rows preserved)`,
    verdict: rebuilt ? "BUDGET-MISS" : "MET",
  });
  rows.push({
    hotPath: "filter animation replays per same-result keystroke",
    budget: "0 replays",
    measured: repeat.noMutation ? "0 (no list mutation — nothing replayed)" : `${repeat.freshAnimations} fresh list animations`,
    verdict: repeat.freshAnimations === 0 ? "MET" : "BUDGET-MISS",
  });
}

async function benchStaleOverwrite(page: Page): Promise<void> {
  const stale = await probeStaleOverwrite(page, {
    staleQuery: "stale-aaaa",
    freshQuery: "aaab",
    staleMarker: "stale-aaaa-result",
    freshMarker: "fresh-aaab-result",
    staleRttMs: 900,
    timeoutMs: 15_000,
  });
  if (!stale.freshRendered) {
    die(`stale probe: the fresh result never rendered — final #results: "${stale.finalText}"`);
  }
  rows.push({
    hotPath: "stale search response overwrites newer render (slow query answers after fast one)",
    budget: "never overwrites",
    measured: stale.staleOverwrote
      ? "overwrote — the late stale response replaced the fresh render"
      : "held — the fresh render survived the late stale response",
    verdict: stale.staleOverwrote ? "BUDGET-MISS" : "MET",
  });
}

async function benchPageProbes(scenario: Scenario, servers: Server[]): Promise<Browser> {
  const browser = await chromium.launch();
  const context: BrowserContext = await newPerfContext(browser);
  const page: Page = await context.newPage();
  await stubUpdates(page);
  const pageTimeout = REAL ? 300_000 : 60_000;

  await benchColdGlobalPaint(page, scenario, pageTimeout);

  const pageServer = await freshServer(true);
  servers.push(pageServer);
  progress("opening the served page for the filter probes…");
  await openServedPage(page, pageServer.base, scenario.expectedProjectRows, pageTimeout);
  await benchFilterRenderAndRebuild(page, scenario);
  await benchStaleOverwrite(page);
  return browser;
}

function recordShimSpawns(): void {
  if (REAL) return;
  const calls = readShimCallLog(process.env.SKILLS_SHIM_CALLLOG!);
  const globalLs = countShimCalls(calls, ["ls", "--json", "-g"]);
  const projectLs = countShimCalls(calls, ["ls", "--json"]) - globalLs;
  const other = countShimCalls(calls) - projectLs - globalLs;
  observations.push(
    `shim spawns this run: ${countShimCalls(calls)} total — ls --json (project) x${projectLs}, ls --json -g x${globalLs}, other x${other}`
  );
}

function emitReport(scenario: Scenario): void {
  const date = new Date();
  const report = renderReport(scenario, date);
  console.log(report);
  if (OUT) {
    const outPath = new URL(`./report-${date.toISOString().slice(0, 10)}${REAL ? "-real" : ""}.md`, import.meta.url).pathname;
    if (!FORCE && existsSync(outPath)) {
      die(`--out would overwrite the existing report ${outPath} — pass --force to overwrite`);
    }
    writeFileSync(outPath, report);
    progress(`report written: ${outPath}`);
  }
  if (STRICT && rows.some((r) => r.verdict === "BUDGET-MISS")) {
    process.exitCode = 1;
  }
}

// ---------- main ----------

async function main(): Promise<void> {
  const envSnap = snapshotEnv();
  const workDir = mkdtempSync(join(tmpdir(), "skills-ui-perf-budget-"));
  const servers: Server[] = [];
  let browser: Browser | null = null;
  let stub: SearchStub | null = null;
  try {
    const scenario = REAL ? await setupReal() : await setupSynthetic(workDir);
    progress(`scenario: ${scenario.label} — ${REPS} reps per wall-clock row (median reported)`);

    benchFilterMatching(scenario);
    const warm = await benchApiLists(scenario, servers);
    stub = await benchSearch(warm);
    browser = await benchPageProbes(scenario, servers);
    recordShimSpawns();
    emitReport(scenario);
  } finally {
    if (browser) await closeBrowser(browser);
    stub?.stop();
    for (const server of servers) await server.stop().catch(() => {});
    rmSync(workDir, { recursive: true, force: true });
    if (realPrefsDir) rmSync(realPrefsDir, { recursive: true, force: true });
    restoreEnv(envSnap);
  }
}

function renderReport(scenario: Scenario, date: Date): string {
  const lines: string[] = [];
  lines.push(`# skills-ui performance budget report`);
  lines.push("");
  lines.push(`- generated: ${date.toISOString()}`);
  lines.push(`- scenario: ${scenario.label} (S-177 harness; budgets ratified in S-155)`);
  for (const line of scenario.headerLines) lines.push(`- ${line}`);
  lines.push(
    `- reps: ${REPS} per API-timed wall-clock row (median reported); filter-render row: 1 sample x ${scenario.filterProbes.length} needles (median across needles); filter matching row: ${REPS} full-corpus passes x ${scenario.filterProbes.length + 1} needles (median across all passes)`
  );
  lines.push(`- app under test: skills-ui ${APP_VERSION} — serve API + served page`);
  lines.push(
    `- NOTE: BUDGET-MISS rows on current main are the recorded baseline — the fixes several rows measure land in later tickets (S-155 sequencing).`
  );
  lines.push("");
  lines.push(`| hot path | budget | measured | verdict |`);
  lines.push(`|---|---|---|---|`);
  for (const row of rows) {
    lines.push(`| ${row.hotPath} | ${row.budget} | ${row.measured} | ${row.verdict} |`);
  }
  lines.push("");
  lines.push(`## observations`);
  for (const observation of observations) lines.push(`- ${observation}`);
  lines.push("");
  return lines.join("\n");
}

main().catch((error: unknown) => {
  console.error(`perf:budget: harness error: ${String(error)}`);
  process.exit(2);
});
