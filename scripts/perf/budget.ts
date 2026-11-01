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
import { listInstalled, readSkillDoc, runSkills, sanitizeMetadata } from "../../src/core/index.ts";
import { APP_VERSION } from "../../src/core/version.ts";
import { skillMatches } from "../../src/web/page.ts";

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
  const s = await createSkillsUiServer({ withPage });
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
    filterProbes: [
      project[0]!.name.slice(0, 1),
      project[0]!.name.slice(0, 2),
      project[0]!.name.slice(0, 3),
      project[0]!.name.slice(0, 5),
      project[0]!.name.slice(0, 6),
      project[0]!.name.slice(0, 7),
      project[0]!.name.slice(0, 8),
    ],
    rebuildProbe: project[0]!.name,
    projectEntries: project as ShimEntry[],
  };
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

    // ----- filter matching alone (the "matching ≤ 5 ms @390" budget) -----
    // Pure skillMatches predicate work over the project corpus: the exact
    // match set the page's filteredSkills() runs (name, source, agents,
    // description). No DOM, no browser. Inputs are enriched with the same
    // frontmatter description the serve derives, so the strings the
    // predicate scans are the ones production scans. Timed as whole
    // full-corpus passes (never per-entry); median over REPS passes per
    // needle (the 7 scenario needles + the empty needle that matches all).
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

    // ----- wall-clock: cold project list (fresh serve per rep) -----
    const coldProject: number[] = [];
    for (let i = 0; i < REPS; i++) {
      const server = await freshServer(false);
      let r;
      try {
        r = await timedGetJson(`${server.base}/api/skills?scope=project`);
      } finally {
        await server.stop().catch(() => {}); // no accumulated live servers across reps
      }
      if (r.status !== 200) die(`cold project rep ${i + 1}: HTTP ${r.status}`);
      if (r.body.skills.length !== scenario.expectedProjectRows) {
        die(`cold project rep ${i + 1}: expected ${scenario.expectedProjectRows} rows, got ${r.body.skills.length}`);
      }
      coldProject.push(r.ms);
      progress(`cold project rep ${i + 1}/${REPS}: ${fmtMs(r.ms)}`);
    }
    msRow(
      "cold project list — GET /api/skills, first call on a fresh serve",
      "≤ 500 ms",
      500,
      median(coldProject)
    );

    // ----- wall-clock: warm list + detail read (one long-lived serve) -----
    const warm = await freshServer(false);
    servers.push(warm);
    await timedGetJson(`${warm.base}/api/skills?scope=project`); // its cold call — discarded
    const warmProject: number[] = [];
    for (let i = 0; i < REPS; i++) {
      const r = await timedGetJson(`${warm.base}/api/skills?scope=project`);
      if (r.status !== 200) die(`warm project rep ${i + 1}: HTTP ${r.status}`);
      warmProject.push(r.ms);
    }
    msRow(
      "warm list — repeated GET /api/skills?scope=project on a live serve",
      "≤ 100 ms",
      100,
      median(warmProject)
    );

    // S-179: the probe uses the production form — the page sends name+path
    // and the serve resolves by exact path match against the cached rows.
    const detail: number[] = [];
    for (let i = 0; i < REPS; i++) {
      const r = await timedGetJson(
        `${warm.base}/api/skill?name=${encodeURIComponent(scenario.detailName)}&path=${encodeURIComponent(scenario.detailPath)}&scope=project`
      );
      if (r.status !== 200) die(`detail rep ${i + 1}: HTTP ${r.status}`);
      detail.push(r.ms);
    }
    msRow(
      `detail read — GET /api/skill (name+path, exact-path resolution) for ${scenario.detailName} on a live serve`,
      "≤ 100 ms",
      100,
      median(detail)
    );

    // ----- wall-clock: cold global list via API (observation; the ratified
    // cold-global row is the perceived first paint, measured on the page) -----
    const coldGlobalApi: number[] = [];
    for (let i = 0; i < REPS; i++) {
      const server = await freshServer(false);
      let r;
      try {
        r = await timedGetJson(`${server.base}/api/skills?scope=global`);
      } finally {
        await server.stop().catch(() => {}); // no accumulated live servers across reps
      }
      if (r.status !== 200) die(`cold global rep ${i + 1}: HTTP ${r.status}`);
      coldGlobalApi.push(r.ms);
      progress(`cold global (API) rep ${i + 1}/${REPS}: ${fmtMs(r.ms)}`);
    }
    observations.push(
      `cold global list via API (context only — the ratified row is the page's perceived first paint): ${fmtMs(median(coldGlobalApi))} median`
    );
    const warmGlobal: number[] = [];
    await timedGetJson(`${warm.base}/api/skills?scope=global`); // warm-up
    for (let i = 0; i < REPS; i++) {
      warmGlobal.push((await timedGetJson(`${warm.base}/api/skills?scope=global`)).ms);
    }
    observations.push(`warm global list via API: ${fmtMs(median(warmGlobal))} median`);

    // ----- search: stub registry with fixed artificial RTT -----
    // One stub serves every search probe: 'stub' (hyphen-free → exactly one
    // upstream call) for overhead + in-flight; the stale/fresh pair for the
    // in-flight ordering probe on the page. 'stale-aaaa' must gate-match its
    // own token so the wrapper does not fan out shortenings behind it.
    stub = await startSearchStub({
      rttMs: 40,
      perQueryRttMs: { "stale-aaaa": 900, "aaab": 50 },
      // S-182: DISJOINT per-query payloads. The stale query answers a
      // stale-only set; the fresh/default answers a fresh set with NO stale
      // marker. With one shared payload a full stale-over-fresh swap renders
      // byte-identical content and the stale-overwrite row could never fire;
      // with disjoint payloads the row's detector is a TRUE full-swap
      // detector. 'stub' keeps its exact pre-S-182 row so the
      // wrapper-overhead and dedup rows are unchanged.
      skills: [
        { id: "stub-skill", name: "stub-skill", installs: 42, source: "stub/registry" },
        { id: "fresh-aaab-result", name: "fresh-aaab-result", installs: 1, source: "stub/registry" },
      ],
      perQuerySkills: {
        "stale-aaaa": [
          { id: "stale-aaaa-result", name: "stale-aaaa-result", installs: 2, source: "stub/registry" },
        ],
      },
    });
    process.env.SKILLS_UI_API_URL = stub.url; // restored from the env snapshot in finally

    const directRtt: number[] = [];
    for (let i = 0; i < REPS; i++) {
      directRtt.push((await timedGetJson(`${stub.url}/api/search?q=stub`)).ms);
    }
    const wrapped: number[] = [];
    for (let i = 0; i < REPS; i++) {
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

    // in-flight identical searches: 3 concurrent, same query
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

    // ----- page probes (real served page via Playwright) -----
    browser = await chromium.launch();
    const context: BrowserContext = await newPerfContext(browser); // animations must RUN
    const page: Page = await context.newPage();
    await stubUpdates(page);
    const pageTimeout = REAL ? 300_000 : 60_000;

    // cold global perceived first paint — TRULY COLD per rep: a fresh serve
    // (global never listed) and a fresh page load per sample, median of
    // REPS. A single sample proved machine-noisy (±100 ms swings on this
    // row on this machine); the median is the honest cold number.
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

    // the filter probes run on their own fresh serve (fresh load starts on
    // the project list with an empty filter)
    const pageServer = await freshServer(true);
    servers.push(pageServer);
    progress("opening the served page for the filter probes…");
    await openServedPage(page, pageServer.base, scenario.expectedProjectRows, pageTimeout);
    msRow(
      `filter matching alone — skillMatches over ${scenario.expectedProjectRows} entries, per needle pass, median`,
      "≤ 5 ms",
      5,
      matchingMedian
    );
    observations.push(
      `filter matching instrument: ${matchedRows} matches counted across ${matchingSamples.length} timed full-corpus passes (liveness check; per-needle row counts are the filter probe samples below)`
    );

    // per-needle row: the RENDER WORK of each debounced pass (first list
    // mutation → settled). The S-155 budget "≤ 50 ms per debounced render"
    // charges the render, not the ratified 150–200 ms debounce wait — the
    // perceived dispatch→render value (debounce included) is reported as
    // context. Probe window 400 ms: any legitimate debounced render of this
    // corpus lands well inside it; a no-mutation outcome for a CHANGING
    // needle inside that window means the render never happened.
    const FILTER_PROBE_WINDOW_MS = 400;
    const keystrokes: number[] = [];
    const perceived: number[] = [];
    const probeSamples: string[] = [];
    for (const value of scenario.filterProbes) {
      const probe = await probeFilterRender(page, value, FILTER_PROBE_WINDOW_MS);
      if (probe.timedOut) die(`filter probe: content for needle "${value}" never appeared (rows lost or value diverged)`);
      if (probe.noMutation) {
        // A changing needle CAN mutate nothing: when its result set equals
        // the previous one (e.g. "p" vs "" over this corpus — every name
        // contains both), the keyed reconcile is a legitimate no-op. The
        // page's own User Timing measure for this window proves the pass
        // ran; sample its render work. No measure at all means the
        // debounced render never fired — that is still fatal.
        if (probe.renderWorkMs <= 0) {
          die(`filter probe: zero DOM mutations for needle "${value}" — a changing needle must re-render`);
        }
        probeSamples.push(`"${value}" → ${probe.rows} rows, no DOM change, render ${fmtMs(probe.renderWorkMs)} (perceived ${fmtMs(probe.durationMs)})`);
        keystrokes.push(probe.renderWorkMs);
        perceived.push(probe.durationMs);
        continue;
      }
      keystrokes.push(probe.renderWorkMs);
      perceived.push(probe.durationMs);
      probeSamples.push(`"${value}" → ${probe.rows} rows, render ${fmtMs(probe.renderWorkMs)} (perceived ${fmtMs(probe.durationMs)})`);
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

    // rebuild + replay rows: two identical keystrokes — the second one renders
    // the SAME row set, so any recreation is measurable waste. A zero-mutation
    // outcome is the DOM-reuse happy path (0 rebuilds / 0 replays), not a
    // failure; a rebuild only counts MET when EVERY row kept identity.
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
      measured: repeat.noMutation
        ? "0 (no list mutation — nothing replayed)"
        : `${repeat.freshAnimations} fresh list animations`,
      verdict: repeat.freshAnimations === 0 ? "MET" : "BUDGET-MISS",
    });

    // stale-vs-newer ordering over the real page flow
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

    // ----- shim spawn accounting (synthetic only — the real CLI has no log) -----
    if (!REAL) {
      const calls = readShimCallLog(process.env.SKILLS_SHIM_CALLLOG!);
      const globalLs = countShimCalls(calls, ["ls", "--json", "-g"]);
      // the 2-argv prefix also matches the -g variant — subtract for the pure project count
      const projectLs = countShimCalls(calls, ["ls", "--json"]) - globalLs;
      const other = countShimCalls(calls) - projectLs - globalLs;
      observations.push(
        `shim spawns this run: ${countShimCalls(calls)} total — ls --json (project) x${projectLs}, ls --json -g x${globalLs}, other x${other}`
      );
    }

    // ----- report -----
    const date = new Date();
    const report = renderReport(scenario, date);
    console.log(report);
    if (OUT) {
      const outPath = new URL(`./report-${date.toISOString().slice(0, 10)}.md`, import.meta.url)
        .pathname;
      if (!FORCE && existsSync(outPath)) {
        die(`--out would overwrite the existing report ${outPath} — pass --force to overwrite`);
      }
      writeFileSync(outPath, report);
      progress(`report written: ${outPath}`);
    }
    if (STRICT && rows.some((r) => r.verdict === "BUDGET-MISS")) {
      process.exitCode = 1;
    }
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
