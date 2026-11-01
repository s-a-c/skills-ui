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
 * scripts/perf/budget.ts. The two S-180 pins record the FIXED behavior
 * (inverted from the main-baseline pins, which recorded the per-keystroke
 * full rebuild + animation replay): a same-result keystroke must mutate
 * nothing (DOM reuse — preservedRows === rows or the probe's noMutation
 * outcome), and no filter render may replay the entrance animations.
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
    "S-180 pin: a same-result keystroke mutates nothing — every row keeps identity (inverted from the rebuild baseline)",
    async () => {
      const first = await probeFilterRender(page!, "perf-skill-00");
      expect(first.rows).toBe(10);
      const again = await probeFilterRender(page!, "perf-skill-00");
      expect(again.rows).toBe(10); // identical result set…
      // …and the fixed behavior: the debounced render reconciles to a no-op,
      // so the probe's observation window sees ZERO list mutations while the
      // value holds and every pre-probe row node keeps identity.
      expect(again.noMutation).toBe(true);
      expect(again.preservedRows).toBe(again.rows); // 10/10 nodes preserved
      expect(again.freshAnimations).toBe(0);
    },
    20_000
  );

  test(
    "S-180 pin: filter renders replay zero entrance animations — even rows created fresh (inverted from the replay baseline)",
    async () => {
      const same = await probeFilterRender(page!, "perf-skill-00");
      expect(same.rows).toBe(10);
      expect(same.freshAnimations).toBe(0); // no render at all for the same needle
      // widen the needle: 50 rows are created fresh — they must appear
      // without replaying the entrance stagger (first-population-only)
      const widen = await probeFilterRender(page!, "perf-skill-0");
      expect(widen.rows).toBe(60); // perf-skill-000…059
      expect(widen.timedOut).toBe(false);
      expect(widen.freshAnimations).toBe(0);
    },
    20_000
  );

  test("instrument sanity: a changing needle still renders (mutations happen) with a positive duration", async () => {
    const probe = await probeFilterRender(page!, "perf-skill-02");
    expect(probe.timedOut).toBe(false);
    expect(probe.noMutation).toBe(false); // the needle changed — the render must mutate
    expect(probe.durationMs).toBeGreaterThan(0);
    expect(probe.rows).toBe(10); // perf-skill-020…029 ('perf-skill-0' alone prefixes ALL of 000–059)
  }, 20_000);
});

describe("perf: first-paint cascade (S-180 — the stagger must actually play once)", () => {
  /** Sampler installed before first paint: the peak count of list-scoped
   * `rise` CSS animations seen at any 50 ms tick since document start. The
   * cascade lives ~59*28ms + 350ms for 60 rows, so a playing cascade reads
   * > 0 even if this check runs late; a dead cascade (class stripped before
   * insertion) reads 0 forever. */
  async function openWithRiseSampler(): Promise<Page> {
    const p = await context!.newPage();
    await p.addInitScript(() => {
      const peak = { n: 0 };
      (window as unknown as { __risePeak: { n: number } }).__risePeak = peak;
      setInterval(() => {
        const rise = document
          .getAnimations()
          .filter((a) => a instanceof CSSAnimation && a.animationName === "rise")
          .filter((a) => {
            const t = (a.effect as KeyframeEffect | null)?.target;
            return t instanceof Element && t.closest("#skillList") !== null;
          }).length;
        if (rise > peak.n) peak.n = rise;
      }, 50);
    });
    await stubUpdates(p);
    await p.goto(`http://127.0.0.1:${server!.port}/`);
    await p.waitForFunction(
      (n) => document.querySelectorAll("#skillList li").length === n,
      PROJECT_ROWS,
      { timeout: 60_000 }
    );
    return p;
  }
  const risePeak = (p: Page) =>
    p.evaluate(() => (window as unknown as { __risePeak: { n: number } }).__risePeak.n);
  const riseNow = (p: Page) =>
    p.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a instanceof CSSAnimation && a.animationName === "rise")
        .filter((a) => {
          const t = (a.effect as KeyframeEffect | null)?.target;
          return t instanceof Element && t.closest("#skillList") !== null;
        }).length
    );

  /** The cascade is observably RUNNING (live list-scoped rise animations
   * > 0) — polled via waitForFunction's rAF loop, so no sampler-tick race. */
  const waitRise = (p: Page, want: boolean, timeoutMs: number) =>
    p.waitForFunction(
      (w) => {
        const live = document
          .getAnimations()
          .filter((a) => a instanceof CSSAnimation && a.animationName === "rise")
          .filter((a) => {
            const t = (a.effect as KeyframeEffect | null)?.target;
            return t instanceof Element && t.closest("#skillList") !== null;
          }).length;
        return w ? live > 0 : live === 0;
      },
      want, // closure vars do not serialize into the page — pass as arg
      { timeout: timeoutMs }
    );

  test(
    "S-180 pin: the entrance cascade plays on the page-load first paint (animations enabled)",
    async () => {
      const p = await openWithRiseSampler();
      try {
        await waitRise(p, true, 10_000); // the cascade actually runs…
        // …and the sampler saw it (polled: the next 50 ms tick lands while
        // the ~2 s cascade is still live, so this cannot miss it)
        await p.waitForFunction(() => (window as unknown as { __risePeak: { n: number } }).__risePeak.n > 0, undefined, { timeout: 5_000 });
        expect(await risePeak(p)).toBeGreaterThan(0);
        await waitRise(p, false, 20_000); // …then finishes (no infinite replay)
        expect(await riseNow(p)).toBe(0);
      } finally {
        await p.close();
      }
    },
    45_000
  );

  test(
    "S-180 pin: after first paint, scope switches never re-cascade (0 fresh rise animations)",
    async () => {
      const p = await openWithRiseSampler();
      try {
        await waitRise(p, true, 10_000); // cascade played at load
        // sampler corroborates (polled — an immediate read can race the
        // sampler's 50 ms tick)
        await p.waitForFunction(() => (window as unknown as { __risePeak: { n: number } }).__risePeak.n > 0, undefined, { timeout: 5_000 });
        await waitRise(p, false, 20_000); // and finished before probing
        // second population (global): rows are created WITHOUT the stamp —
        // zero rise animations may start from this render onward
        await p.locator('[data-scope="global"]').click();
        await p.waitForFunction(
          (n) => document.querySelectorAll("#skillList li").length === n,
          GLOBAL_ROWS, // closure vars do not serialize into the page — pass as arg
          { timeout: 60_000 }
        );
        await p.waitForTimeout(150); // settle: a wrongly-started cascade would tick in
        expect(await riseNow(p)).toBe(0);
        // third population (project rows were discarded on the switch and are
        // recreated): still no cascade — the stamp is once per page load
        await p.locator('[data-scope="project"]').click();
        await p.waitForFunction(
          (n) => document.querySelectorAll("#skillList li").length === n,
          PROJECT_ROWS,
          { timeout: 60_000 }
        );
        await p.waitForTimeout(150);
        expect(await riseNow(p)).toBe(0);
      } finally {
        await p.close();
      }
    },
    60_000
  );
});
