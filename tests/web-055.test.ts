import { afterAll, beforeAll, describe, test } from "bun:test";
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

let corpusDir: string;
let prefsDir: string;
let corpus: SyntheticCorpus;
let server: { port: number; stop: () => Promise<void> } | null = null;
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

let versionHealthCheck = false;
let healthPayload: { ok: boolean; summary: string; details?: string[] } = {
  ok: true,
  summary: "113/113 · 8 hosts",
  details: ["claude: 113 links"],
};

const PROVENANCE_SKILLS = [
  {
    name: "locked-skill",
    path: "/tmp/locked-skill",
    scope: "project",
    agents: ["Claude Code"],
    source: "org/repo",
    sourceUrl: "https://github.com/org/repo",
    sourceType: "github",
    provenance: "locked",
  },
  {
    name: "linked-skill",
    path: "/tmp/linked-skill",
    scope: "project",
    agents: ["Claude Code"],
    source: null,
    sourceUrl: null,
    sourceType: null,
    provenance: "linked",
  },
  {
    name: "local-skill",
    path: "/tmp/local-skill",
    scope: "project",
    agents: ["Cursor"],
    source: null,
    sourceUrl: null,
    sourceType: null,
    provenance: "local",
  },
];

beforeAll(async () => {
  corpusDir = mkdtempSync(join(tmpdir(), "skills-ui-055-corpus-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-055-prefs-"));
  corpus = buildSyntheticCorpus(corpusDir, 1, 0);
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

  await page.route("**/api/version*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: "0.5.5",
        skillsVersion: "1.7.2",
        capabilities: {
          updatesCheck: "github",
          hosted: true,
          healthCheck: versionHealthCheck,
          postMutationHook: true,
        },
      }),
    })
  );
  await page.route("**/api/skills*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: "project",
        skills: PROVENANCE_SKILLS,
      }),
    })
  );
  await page.route("**/api/updates*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scope: "project", updates: {}, checkedCount: 0 }),
    })
  );
  await page.route("**/api/health-check*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(healthPayload),
    })
  );
  await page.route("**/api/remove", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        output: "removed linked-skill",
        hook: {
          configured: true,
          ok: false,
          exitCode: 1,
          output: "sync drift detected",
        },
      }),
    })
  );

  await page.goto(`http://127.0.0.1:${server.port}/`);
  await page.waitForFunction(
    () => document.querySelectorAll("#skillList li").length === 3,
    null,
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

describe("0.5.5 WebUI provenance, non-locked confirm, hook toast & health strip", () => {
  test("hides #healthWrap when healthCheck capability is false", async () => {
    await pwExpect(page!.locator("#healthWrap")).toBeHidden();
  });

  test("renders provenance badges and filters rows via #provRow", async () => {
    await pwExpect(page!.locator("#skillList .prov-badge.prov-locked")).toHaveCount(1);
    await pwExpect(page!.locator("#skillList .prov-badge.prov-linked")).toHaveCount(1);
    await pwExpect(page!.locator("#skillList .prov-badge.prov-local")).toHaveCount(1);

    await page!.locator('#provRow [data-prov="locked"]').click();
    await pwExpect(page!.locator("#skillList li")).toHaveCount(1);
    await pwExpect(page!.locator("#skillList li").first()).toContainText("locked-skill");

    await page!.locator('#provRow [data-prov="linked"]').click();
    await pwExpect(page!.locator("#skillList li")).toHaveCount(1);
    await pwExpect(page!.locator("#skillList li").first()).toContainText("linked-skill");

    await page!.locator('#provRow [data-prov="local"]').click();
    await pwExpect(page!.locator("#skillList li")).toHaveCount(1);
    await pwExpect(page!.locator("#skillList li").first()).toContainText("local-skill");

    await page!.locator('#provRow [data-prov="all"]').click();
    await pwExpect(page!.locator("#skillList li")).toHaveCount(3);
  });

  test("warns on non-locked remove confirmation and shows hook failure toast", async () => {
    const linkedRow = page!.locator("#skillList li", { hasText: "linked-skill" });
    await linkedRow.locator("input.skill-check").check();
    await page!.locator("#deleteCheckedBtn").click();

    await pwExpect(page!.locator("#confirmText")).toContainText(
      "Warning: non-locked skills (linked-skill [linked])"
    );
    await page!.locator("#confirmYes").click();
    await pwExpect(page!.locator("#toasts")).toContainText("Hook warning: sync drift detected", { timeout: 10_000 });
  }, 20_000);

  test("shows #healthWrap when configured and refreshes status in #healthPop", async () => {
    versionHealthCheck = true;
    await page!.reload();
    await pwExpect(page!.locator("#healthWrap")).toBeVisible();
    await pwExpect(page!.locator("#healthPill")).toHaveAttribute("data-ok", "true");
    await pwExpect(page!.locator("#healthSummary")).toHaveText("113/113 · 8 hosts");

    await page!.locator("#healthPill").click();
    await pwExpect(page!.locator("#healthPop")).toHaveClass(/open/);
    await pwExpect(page!.locator("#healthDetails")).toContainText("claude: 113 links");

    healthPayload = {
      ok: false,
      summary: "112/113 · broken link",
      details: ["cursor: 1 broken"],
    };
    await page!.locator("#healthRefreshBtn").click();
    await pwExpect(page!.locator("#healthPill")).toHaveAttribute("data-ok", "false");
    await pwExpect(page!.locator("#healthSummary")).toHaveText("112/113 · broken link");
    await pwExpect(page!.locator("#healthDetails")).toContainText("cursor: 1 broken");

    await page!.locator("#healthCloseBtn").click();
    await pwExpect(page!.locator("#healthPop")).not.toHaveClass(/open/);
  }, 20_000);
});
