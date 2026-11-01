import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chromium,
  expect as pwExpect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHIM, buildSyntheticCorpus, type SyntheticCorpus } from "./perf/helpers.ts";

/**
 * S-186 manual-smoke refinement pins — the human's gate-pass round on the
 * 0.5.3 live page. Same harness family as tests/perf/filter-dom.test.ts:
 * the REAL served page (createSkillsUiServer + Playwright chromium) inside
 * bun test, with /api/updates stubbed at the network layer so the update
 * state under test is exact.
 *
 * The two bug pins were written FIRST and watched failing on the 0.5.3
 * build (systematic-debugging: reproduce before fix):
 *
 *   - Clear:  #clearCheckedBtn cleared state.checked but manually checked
 *             row checkboxes stayed visually checked (stale li.__sig — the
 *             delegated change handler mutates the checked set without
 *             refreshing the row's stored signature, so the next reconcile
 *             diffs equal signatures and touches no DOM).
 *   - Update: the detail pane rendered #updateBtn unconditionally; it must
 *             exist only after a check-for-updates ran AND the skill has
 *             an update available (state.updates via detailOutdated).
 */

const PROJECT_ROWS = 2;

let corpusDir: string;
let prefsDir: string;
let corpus: SyntheticCorpus;
let server: { port: number; stop: () => Promise<void> } | null = null;
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/** Mutable /api/updates payload — tests flip it to simulate a check result. */
let updatesPayload: Record<string, unknown> = {};

beforeAll(async () => {
  corpusDir = mkdtempSync(join(tmpdir(), "skills-ui-smoke-corpus-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-smoke-prefs-"));
  corpus = buildSyntheticCorpus(corpusDir, PROJECT_ROWS, 0);
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = join(corpusDir, "shim-state");
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
  process.env.SKILLS_SHIM_LS_PROJECT = corpus.projectFixture;
  process.env.SKILLS_SHIM_LS_GLOBAL = corpus.globalFixture;
  const { createSkillsUiServer } = await import("../src/core/api.ts");
  server = await createSkillsUiServer({ withPage: true });
  browser = await chromium.launch();
  context = await browser.newContext();
  page = await context.newPage();
  await page.route("**/api/updates*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: "project",
        updates: updatesPayload,
        checkedCount: Object.keys(updatesPayload).length,
      }),
    })
  );
  updatesPayload = {}; // the load-time auto check must find nothing
  await page.goto(`http://127.0.0.1:${server.port}/`);
  await page.waitForFunction(
    (n) => document.querySelectorAll("#skillList li").length === n,
    PROJECT_ROWS,
    { timeout: 30_000 }
  );
}, 120_000);

afterAll(async () => {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
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

describe("S-186 manual-smoke pins (bugs 4/5 written failing-first on 0.5.3)", () => {
  test(
    "Clear unchecks the row checkboxes, not just the selected count",
    async () => {
      const row = page!.locator("#skillList li", { hasText: "perf-skill-000" });
      await row.locator("input.skill-check").check();
      await pwExpect(page!.locator("#selCount")).toHaveText("1");
      await pwExpect(row.locator("input.skill-check")).toBeChecked();
      await page!.locator("#clearCheckedBtn").click();
      await pwExpect(page!.locator("#selBar")).toBeHidden(); // the count reset worked…
      // …and the ROW must follow: the checkbox may not stay visually checked
      await pwExpect(row.locator("input.skill-check")).not.toBeChecked();
    },
    20_000
  );

  test(
    "the detail Update button exists only after a check finds an available update",
    async () => {
      // no check result yet (the stub answers empty): no Update button at all
      await page!.locator("#skillList li", { hasText: "perf-skill-000" }).click();
      await pwExpect(page!.locator("#detailPane")).toContainText("perf-skill-000");
      await pwExpect(page!.locator("#updateBtn")).toHaveCount(0);
      // a check that finds an update for THIS skill: the button appears
      updatesPayload = {
        "perf-skill-000": { name: "perf-skill-000", updateAvailable: true },
      };
      await page!.locator("#checkUpdatesBtn").click();
      await pwExpect(page!.locator("#detailPane .update-badge")).toContainText("update available");
      await pwExpect(page!.locator("#updateBtn")).toHaveCount(1);
      // …and a skill WITHOUT an available update still shows no Update button
      await page!.locator("#skillList li", { hasText: "perf-skill-001" }).click();
      await pwExpect(page!.locator("#detailPane")).toContainText("perf-skill-001");
      await pwExpect(page!.locator("#updateBtn")).toHaveCount(0);
    },
    20_000
  );

  test(
    "header actions are icon-only: words live in the labels, glyph and 32px frame carry the control",
    async () => {
      const theme = page!.locator("#themeToggle");
      // icon-only: no words in the button, one svg, state in the glyph
      await pwExpect(theme).toHaveText("");
      await pwExpect(theme.locator("svg")).toHaveCount(1);
      // applyPrefs owns the words after boot: the stateful action, not the noun.
      // Glyph = CURRENT theme (moon while mocha is active), label = the action.
      await pwExpect(theme).toHaveAttribute("aria-label", "Switch to light theme");
      expect(await theme.innerHTML()).toContain("M14 9.5"); // the moon path
      const box = await theme.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(32);
      expect(box!.height).toBeGreaterThanOrEqual(32);
      const settings = page!.locator("#settingsBtn");
      await pwExpect(settings).toHaveText("");
      await pwExpect(settings.locator("svg")).toHaveCount(1);
      await pwExpect(settings).toHaveAttribute("aria-label", "Settings");
      // the theme glyph flips with the theme, and the words follow in the label
      await theme.click();
      await pwExpect(theme).toHaveAttribute("aria-label", "Switch to dark theme");
      expect(await theme.innerHTML()).toContain("M8 1.25"); // the sun path
      await theme.click();
      await pwExpect(theme).toHaveAttribute("aria-label", "Switch to light theme");
      expect(await theme.innerHTML()).toContain("M14 9.5");
      // the connect button keeps the full words in its accessible label and
      // title (state rides aria-pressed + the filled/hollow dot svg)
      await pwExpect(page!.locator("#connectState")).toHaveAttribute(
        "title",
        "Connect to your local skills-ui serve"
      );
      await pwExpect(page!.locator("#connectState")).toHaveAttribute(
        "aria-label",
        "Connect to your local skills-ui serve"
      );
      await pwExpect(page!.locator("#connectState svg")).toHaveCount(1);
    },
    20_000
  );

  test(
    "the list pane is 35 percent of the page at 1280 wide, floored on small screens",
    async () => {
      await page!.setViewportSize({ width: 1280, height: 800 });
      const wide = await page!.locator("#listPane").boundingBox();
      expect(Math.round(wide!.width)).toBe(448); // 35% of 1280
      await page!.setViewportSize({ width: 390, height: 844 });
      const narrow = await page!.locator("#listPane").boundingBox();
      expect(narrow!.width).toBeLessThan(200); // the floor scales down: detail keeps room
      const detail = await page!.locator("#detailPane").boundingBox();
      expect(detail!.width).toBeGreaterThan(200);
      // no horizontal overflow at either size (body clips, but the grid must not need it)
      const overflow = await page!.evaluate(() => document.documentElement.scrollWidth);
      expect(overflow).toBeLessThanOrEqual(390);
      await page!.setViewportSize({ width: 1280, height: 800 });
    },
    20_000
  );

  test(
    "the Select all master checkbox is tri-state over the FILTERED list and toggles like the old button",
    async () => {
      const master = page!.locator("#selectAllMaster");
      // none checked: unchecked, not indeterminate
      await pwExpect(master).not.toBeChecked();
      // some checked: indeterminate (checked=false, indeterminate=true)
      await page!.locator("#skillList li", { hasText: "perf-skill-000" }).locator("input.skill-check").check();
      await pwExpect(master).not.toBeChecked();
      const someState = await master.evaluate((el: HTMLInputElement) => el.indeterminate);
      expect(someState).toBe(true);
      // all checked: checked, not indeterminate
      await page!.locator("#skillList li", { hasText: "perf-skill-001" }).locator("input.skill-check").check();
      await pwExpect(master).toBeChecked();
      const allState = await master.evaluate((el: HTMLInputElement) => el.indeterminate);
      expect(allState).toBe(false);
      const anyBoxChecked = () =>
        page!.evaluate(() =>
          Array.from(document.querySelectorAll("#skillList li input.skill-check")).some(
            (b) => (b as HTMLInputElement).checked
          )
        );
      // all -> none on click
      await master.uncheck();
      expect(await anyBoxChecked()).toBe(false);
      await pwExpect(page!.locator("#selCount")).toHaveText("0");
      // none -> all on click (the old Select all button semantics)
      await master.check();
      expect(await anyBoxChecked()).toBe(true);
      await pwExpect(page!.locator("#selCount")).toHaveText("2");
      // FILTERED semantics: narrow to one checked row, the master stays checked
      await page!.locator("#filter").fill("perf-skill-000");
      await page!.waitForFunction(() => document.querySelectorAll("#skillList li").length === 1);
      await pwExpect(master).toBeChecked();
      // uncheck the one visible row: the master reads none-of-filtered
      await page!
        .locator("#skillList li", { hasText: "perf-skill-000" })
        .locator("input.skill-check")
        .uncheck();
      await pwExpect(master).not.toBeChecked();
      // widen the needle: the still-checked hidden row makes it some again
      await page!.locator("#filter").fill("");
      await page!.waitForFunction(() => document.querySelectorAll("#skillList li").length === 2);
      const mixed = await master.evaluate((el: HTMLInputElement) => el.indeterminate);
      expect(mixed).toBe(true);
      // leave a clean slate: Playwright reads an indeterminate box as
      // unchecked, so uncheck() alone would no-op; a real click on an
      // indeterminate master is some -> all (the browser flips it checked
      // and the handler adds every filtered row), so drive that first
      await master.check();
      await pwExpect(page!.locator("#selCount")).toHaveText("2");
      await master.uncheck();
      await pwExpect(page!.locator("#selCount")).toHaveText("0");
    },
    20_000
  );

  test(
    "Update selected and Remove selected live in the top bar; #selBar keeps count + Clear",
    async () => {
      await pwExpect(page!.locator(".top-actions #updateCheckedBtn")).toBeAttached();
      await pwExpect(page!.locator(".top-actions #deleteCheckedBtn")).toBeAttached();
      await pwExpect(page!.locator("#selBar #updateCheckedBtn")).toHaveCount(0);
      await pwExpect(page!.locator("#selBar #deleteCheckedBtn")).toHaveCount(0);
      // hidden while nothing is selected
      await pwExpect(page!.locator("#updateCheckedBtn")).toBeHidden();
      await pwExpect(page!.locator("#deleteCheckedBtn")).toBeHidden();
      // visible while a selection exists, in the top bar
      await page!.locator("#skillList li", { hasText: "perf-skill-000" }).locator("input.skill-check").check();
      await pwExpect(page!.locator("#updateCheckedBtn")).toBeVisible();
      await pwExpect(page!.locator("#deleteCheckedBtn")).toBeVisible();
      // and #selBar still carries the count and Clear
      await pwExpect(page!.locator("#selBar #clearCheckedBtn")).toBeVisible();
      await pwExpect(page!.locator("#selCount")).toHaveText("1");
      await page!.locator("#clearCheckedBtn").click();
      await pwExpect(page!.locator("#updateCheckedBtn")).toBeHidden();
    },
    20_000
  );
});
