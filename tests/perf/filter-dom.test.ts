import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHIM, buildSyntheticCorpus, type SyntheticCorpus } from "./helpers.ts";
import { closeBrowser, newPerfContext, openServedPage, probeFilterRender, stubUpdates } from "./playwright-probes.ts";

/**
 * S-177 filter DOM probes against the REAL served page (createSkillsUiServer
 * + Playwright chromium, the in-process serve pattern from tests/api.test.ts).
 *
 * Count-based and behavioral only — the wall-clock filter budget belongs to
 * scripts/perf/budget.ts. The two baseline pins record what holds on current
 * main (every keystroke fully rebuilds the rows and replays their entrance
 * animations); the filter ticket inverts both and rewrites the pins.
 */

const PROJECT_ROWS = 60;
const GLOBAL_ROWS = 5;

let corpusDir: string;
let prefsDir: string;
let corpus: SyntheticCorpus;
let server: { port: number; stop: () => Promise<void> } | null = null;
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

beforeAll(async () => {
  corpusDir = mkdtempSync(join(tmpdir(), "skills-ui-perf-filter-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-perf-filter-prefs-"));
  corpus = buildSyntheticCorpus(corpusDir, PROJECT_ROWS, GLOBAL_ROWS);
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = join(corpusDir, "shim-state");
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
  process.env.SKILLS_SHIM_LS_PROJECT = corpus.projectFixture;
  process.env.SKILLS_SHIM_LS_GLOBAL = corpus.globalFixture;
  const { createSkillsUiServer } = await import("../../src/core/api.ts");
  server = await createSkillsUiServer({ withPage: true });
  browser = await chromium.launch();
  context = await newPerfContext(browser); // animations must RUN for the replay probe
  page = await context.newPage();
  await stubUpdates(page);
  await openServedPage(page, `http://127.0.0.1:${server.port}`, PROJECT_ROWS);
}, 120_000);

afterAll(async () => {
  if (context) await context.close().catch(() => {});
  if (browser) await closeBrowser(browser);
  await server?.stop();
  server = null;
  rmSync(corpusDir, { recursive: true, force: true });
  rmSync(prefsDir, { recursive: true, force: true });
  delete process.env.SKILLS_UI_SKILLS_BIN;
  delete process.env.SKILLS_SHIM_STATE;
  delete process.env.SKILLS_UI_PREFS_DIR;
  delete process.env.SKILLS_SHIM_LS_PROJECT;
  delete process.env.SKILLS_SHIM_LS_GLOBAL;
}, 30_000);

describe("perf: filter DOM probes (served page, 60-row corpus)", () => {
  test(
    "count assert: a filter keystroke renders exactly the matching rows, none otherwise",
    async () => {
      const hit = await probeFilterRender(page!, "perf-skill-01");
      expect(hit.rows).toBe(10); // perf-skill-010…019
      expect(hit.timedOut).toBe(false);
      const miss = await probeFilterRender(page!, "zzz-nothing-matches-this");
      expect(miss.rows).toBe(0); // empty state renders, zero li rows
    },
    20_000
  );

  test(
    "baseline pin: a same-result keystroke rebuilds every row (preservedRows 0 — filter ticket inverts)",
    async () => {
      const first = await probeFilterRender(page!, "perf-skill-00");
      expect(first.rows).toBe(10);
      const again = await probeFilterRender(page!, "perf-skill-00");
      expect(again.rows).toBe(10); // identical result set…
      expect(again.preservedRows).toBe(0); // …yet every node was recreated (current main)
    },
    20_000
  );

  test(
    "baseline pin: a keystroke replays the list entrance animations (freshAnimations > 0 — filter ticket inverts to 0)",
    async () => {
      const probe = await probeFilterRender(page!, "perf-skill-00");
      expect(probe.rows).toBe(10);
      expect(probe.freshAnimations).toBeGreaterThan(0);
    },
    20_000
  );

  test("instrument sanity: the probe always reports a positive render duration", async () => {
    const probe = await probeFilterRender(page!, "perf-skill-02");
    expect(probe.timedOut).toBe(false);
    expect(probe.noMutation).toBe(false); // current main: every keystroke mutates the list
    expect(probe.durationMs).toBeGreaterThan(0);
    expect(probe.rows).toBe(10); // perf-skill-020…029 ('perf-skill-0' alone prefixes ALL of 000–059)
  }, 20_000);
});
