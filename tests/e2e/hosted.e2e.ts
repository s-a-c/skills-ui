import { test, expect, type Browser } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const HOSTED_PAGE = "https://s-a-c.github.io/skills-ui/app.html";
const PORT = 8397;
const BACKEND = `http://127.0.0.1:${PORT}`;
const EMPTY_PORT = 8398;
const EMPTY_BACKEND = `http://127.0.0.1:${EMPTY_PORT}`;
const BUN = join(homedir(), ".bun", "bin", "bun");

let serve: ChildProcessWithoutNullStreams | null = null;
let emptyServe: ChildProcessWithoutNullStreams | null = null;
let token = "";
let prefsDir = "";
let emptyPrefsDir = "";

function startServe(
  port: number,
  extraEnv: Record<string, string>,
  prefsDirOverride?: string,
  cmd = "serve" // `serve` = headless API (hosted-page tests); `web` also serves the page at /
): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(BUN, ["run", "src/main.ts", cmd, "--port", String(port)], {
    cwd: resolve(HERE, "../.."),
    env: {
      ...process.env,
      SKILLS_UI_PREFS_DIR: prefsDirOverride ?? prefsDir,
      // per-serve shim state: without this every serve shares
      // /tmp/skills-shim-state and one test's rm/install write leaks into
      // every other serve's `ls` (the empty-list fixture only applies while
      // the state file is absent)
      SKILLS_SHIM_STATE: join(prefsDirOverride ?? prefsDir, "shim-state"),
      SKILLS_UI_SKILLS_BIN: resolve(HERE, "../fixtures/skills-shim.mjs"),
      SKILLS_UI_API_URL: "http://127.0.0.1:1", // registry unreachable → search degrades to []
      SKILLS_UI_HOSTED_TOKEN: "e2e-fixed-token",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolveDone, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`serve did not start:\n${out}`)), 10_000);
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
      if (out.includes(`running at http://127.0.0.1:${port}`)) {
        clearTimeout(timer);
        resolveDone(child);
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      out += d.toString();
    });
  });
}

test.beforeAll(async () => {
  prefsDir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "skills-ui-e2e-"));
  serve = await startServe(PORT, {});
  // a second backend whose `skills ls --json` answers an empty list —
  // regression coverage for the renderList empty-state path (0.5.1 hotfix)
  emptyPrefsDir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "skills-ui-e2e-empty-"));
  emptyServe = await startServe(EMPTY_PORT, {
    SKILLS_UI_PREFS_DIR: emptyPrefsDir,
    SKILLS_SHIM_LS_PROJECT: resolve(HERE, "../fixtures/contract/ls-empty.json"),
  });
  token = "e2e-fixed-token";
});

test.afterAll(async () => {
  serve?.kill("SIGTERM");
  emptyServe?.kill("SIGTERM");
  rmKeepServe?.kill("SIGTERM");
  updFailServe?.kill("SIGTERM");
  if (prefsDir) rmSync(prefsDir, { recursive: true, force: true });
  if (emptyPrefsDir) rmSync(emptyPrefsDir, { recursive: true, force: true });
  if (rmKeepPrefsDir) rmSync(rmKeepPrefsDir, { recursive: true, force: true });
  if (updFailPrefsDir) rmSync(updFailPrefsDir, { recursive: true, force: true });
});

async function connect(page: import("@playwright/test").Page, tok = token): Promise<void> {
  await page.locator("#backendInput").fill(BACKEND);
  await page.locator("#tokenInput").fill(tok);
  await page.locator("#connectBtn").click();
}

test.describe("hosted page → local serve", () => {
  test("connects with the LNA permission granted, lists skills, survives reload", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext({ permissions: ["local-network-access"] });
    const page = await ctx.newPage();
    await page.goto(HOSTED_PAGE);
    await expect(page.locator("#connectDialog")).toBeVisible();
    await connect(page);
    await expect(page.locator("#connectDialog")).not.toBeVisible();
    await expect(page.locator("#connectState")).toHaveText(/connected/);
    await expect(page.locator("#listPane")).toContainText("code-review", { timeout: 15_000 });

    await page.reload();
    await expect(page.locator("#connectState")).toHaveText(/connected/, { timeout: 15_000 });
    await expect(page.locator("#connectDialog")).not.toBeVisible();
    await expect(page.locator("#listPane")).toContainText("code-review");
    await ctx.close();
  });

  test("wrong token is rejected with guidance", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext({ permissions: ["local-network-access"] });
    const page = await ctx.newPage();
    await page.goto(HOSTED_PAGE);
    await expect(page.locator("#connectDialog")).toBeVisible();
    await connect(page, "wrong-token");
    await expect(page.locator("#connectStatus")).toContainText("Token rejected");
    await expect(page.locator("#connectDialog")).toBeVisible();
    await ctx.close();
  });

  test("without the LNA grant the backend is unreachable — the gate is real", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext(); // no local-network-access grant
    const page = await ctx.newPage();
    await page.goto(HOSTED_PAGE);
    await expect(page.locator("#connectDialog")).toBeVisible();
    await connect(page);
    await expect(page.locator("#connectStatus")).toContainText("Cannot reach the backend", { timeout: 15_000 });
    await ctx.close();
  });

  test("empty installed list renders the empty state with no page error (0.5.1 hotfix regression)", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext({ permissions: ["local-network-access"] });
    const page = await ctx.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(HOSTED_PAGE);
    await page.locator("#backendInput").fill(EMPTY_BACKEND);
    await page.locator("#tokenInput").fill(token);
    await page.locator("#connectBtn").click();
    await expect(page.locator("#connectDialog")).not.toBeVisible();
    await expect(page.locator("#listPane")).toContainText("Nothing here yet", { timeout: 15_000 });
    expect(pageErrors).toEqual([]);
    await ctx.close();
  });
});

/* ---------- S-163: web honesty on the pre-deploy local page ----------
   These drive the page served by GET / on the local origin (the shipped
   APP_JS itself), not the GitHub Pages copy, so behavior changes under
   test land here before the hosted page is re-exported. */
const RM_KEEP_PORT = 8399;
const UPD_FAIL_PORT = 8400;
const localOrigin = (port: number) => `http://127.0.0.1:${port}`;
let rmKeepServe: ChildProcessWithoutNullStreams | null = null;
let updFailServe: ChildProcessWithoutNullStreams | null = null;
let rmKeepPrefsDir = "";
let updFailPrefsDir = "";

/** Keep /api/updates deterministic and network-free: an empty, zero-update answer. */
async function quietUpdateCheck(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/updates*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scope: "project", updates: {}, checkedCount: 0 }),
    })
  );
}

test.describe("local page honesty (S-163)", () => {
  test.beforeAll(async () => {
    rmKeepPrefsDir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "skills-ui-e2e-rmkeep-"));
    rmKeepServe = await startServe(
      RM_KEEP_PORT,
      { SKILLS_SHIM_RM_KEEP: "code-review" },
      rmKeepPrefsDir,
      "web"
    );
    updFailPrefsDir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "skills-ui-e2e-updfail-"));
    updFailServe = await startServe(
      UPD_FAIL_PORT,
      { SKILLS_SHIM_UPDATE_FAIL: "1" },
      updFailPrefsDir,
      "web"
    );
  });

  test("failed remove (shim keeps the skill) toasts the failure output, never a success tone", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.goto(localOrigin(RM_KEEP_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("code-review", { timeout: 15_000 });
    await page.locator("#skillList li", { hasText: "code-review" }).click();
    await page.locator("#removeBtn").click();
    await page.locator("#confirmYes").click();
    await expect(page.locator("#toasts .toast.error")).toContainText("failed: code-review");
    await expect(page.locator("#toasts .toast.success")).toHaveCount(0);
    // the kept skill is still installed — the refreshed list reflects reality
    await expect(page.locator("#listPane")).toContainText("code-review");
    await ctx.close();
  });

  test("failed bulk remove via deleteChecked toasts the failure output, never a success tone", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.goto(localOrigin(RM_KEEP_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("code-review", { timeout: 15_000 });
    await page
      .locator("#skillList li", { hasText: "code-review" })
      .locator("input.skill-check")
      .check();
    await page.locator("#deleteCheckedBtn").click();
    await page.locator("#confirmYes").click();
    await expect(page.locator("#toasts .toast.error")).toContainText("failed: code-review");
    await expect(page.locator("#toasts .toast.success")).toHaveCount(0);
    // the kept skill is still installed — the refreshed list reflects reality
    await expect(page.locator("#listPane")).toContainText("code-review");
    await ctx.close();
  });

  test("failed update (shim exits 1) toasts the CLI output, never a success tone", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.goto(localOrigin(UPD_FAIL_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    await page.locator("#updateAllBtn").click();
    await expect(page.locator("#toasts .toast.error")).toContainText("Update failed (simulated)");
    await expect(page.locator("#toasts .toast.success")).toHaveCount(0);
    await ctx.close();
  });

  test("auto update-check failure toasts update-check-failed with the message", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route("**/api/updates*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "check exploded" }),
      })
    );
    await page.goto(localOrigin(RM_KEEP_PORT) + "/");
    await expect(page.locator("#toasts .toast.error")).toContainText(
      "update check failed: check exploded",
      { timeout: 15_000 }
    );
    await ctx.close();
  });

  test("forced update check with zero results toasts no-updates-available", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.goto(localOrigin(RM_KEEP_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    await page.locator("#checkUpdatesBtn").click();
    await expect(page.locator("#toasts .toast.success")).toContainText("no updates available");
    await ctx.close();
  });

  test("remove seed pre-checks installed names and toasts the missing ones", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.addInitScript((seed) => {
      // The serve's bootstrap script would overwrite window.__SEED__; a
      // non-writable, non-configurable property makes that assignment a
      // silent no-op (sloppy-mode script) so the seed survives to applySeed().
      Object.defineProperty(window, "__SEED__", {
        value: seed,
        writable: false,
        configurable: false,
      });
    }, { kind: "remove", skills: ["tdd", "ghost"] });
    await page.goto(localOrigin(RM_KEEP_PORT) + "/");
    await expect(page.locator("#selBar")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#selCount")).toHaveText("1");
    await expect(
      page.locator("#skillList li", { hasText: "tdd" }).locator("input.skill-check")
    ).toBeChecked();
    await expect(page.locator("#toasts .toast.error")).toContainText(
      "1 skill selected for removal \u2014 not installed: ghost"
    );
    await expect(page.locator("#toasts .toast.success")).toHaveCount(0);
    await ctx.close();
  });

  test("single install success flips the result button in place (no tab re-entry)", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let installed = false;
    // The point of this test is the client re-render path (A6), so the API
    // surface under it is stubbed at the network layer: /api/skills gains
    // the skill only once /api/install has answered ok.
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/updates") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ scope: "project", updates: {}, checkedCount: 0 }),
        });
      }
      if (url.pathname === "/api/search") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results: [
              { name: "new-skill", slug: "me/skills", source: "me/skills", installs: 12, description: "A fresh skill" },
            ],
            adjustedQuery: null,
          }),
        });
      }
      if (url.pathname === "/api/skills") {
        const scope = url.searchParams.get("scope") ?? "project";
        const skills: Record<string, unknown>[] = [
          { name: "tdd", description: "fixture", scope, agents: ["Claude Code"], path: "/tmp/tdd", source: null },
        ];
        if (installed) {
          skills.push({ name: "new-skill", description: "A fresh skill", scope, agents: ["Claude Code"], path: "/tmp/new-skill", source: "me/skills" });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ scope, skills }),
        });
      }
      if (url.pathname === "/api/install") {
        installed = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, output: "[]" }),
        });
      }
      return route.continue();
    });
    await page.goto(localOrigin(RM_KEEP_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    await page.locator('[data-tab="search"]').click();
    await page.locator("#searchInput").fill("new-skill");
    const btn = page.locator("#results .install-btn");
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText("Install");
    await btn.click();
    await expect(btn).toBeDisabled({ timeout: 15_000 });
    await expect(btn).toHaveText("Installed");
    await expect(page.locator("#results .result-chip")).toContainText("installed");
    await ctx.close();
  });
});

/* ---------- S-166: search-failure honesty + check-status rendering + port
   truth. Same harness pattern as the S-163/S-164 blocks: the page served by
   GET / (the shipped APP_JS itself), with the /api surface stubbed at the
   network layer so the signals under test are exact. */

const SF_PORT = 8403;
let sfServe: ChildProcessWithoutNullStreams | null = null;
let sfPrefsDir = "";

test.describe("local page search failure + check status (S-166)", () => {
  test.beforeAll(async () => {
    sfPrefsDir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "skills-ui-e2e-sf-"));
    sfServe = await startServe(SF_PORT, {}, sfPrefsDir, "web");
  });
  test.afterAll(async () => {
    sfServe?.kill("SIGTERM");
    if (sfPrefsDir) rmSync(sfPrefsDir, { recursive: true, force: true });
  });

  test("search failure renders the failure state, never 'No results' (F4)", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.route("**/api/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [], adjustedQuery: null, failed: true }),
      })
    );
    await page.goto(localOrigin(SF_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    await page.locator('[data-tab="search"]').click();
    await page.locator("#searchInput").fill("anything");
    await expect(page.locator("#results .empty.search-error")).toHaveText(
      "search failed — skills.sh unreachable",
      { timeout: 15_000 }
    );
    await expect(page.locator("#results")).not.toContainText("No results");
    await ctx.close();
  });

  test("check-status errors render in the detail pane and the row tooltip (G4)", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route("**/api/updates*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          scope: "project",
          updates: {
            tdd: {
              name: "tdd",
              updateAvailable: false,
              error: "not checkable yet (generic git clone check lands in a later 0.x)",
              sourceType: "github",
            },
            "code-review": {
              name: "code-review",
              updateAvailable: false,
              error: "not checkable (local or missing hash)",
              sourceType: "local",
            },
          },
          checkedCount: 2,
        }),
      })
    );
    await page.goto(localOrigin(SF_PORT) + "/");
    await expect(page.locator("#skillList li", { hasText: "tdd" })).toBeVisible({ timeout: 15_000 });
    // the detail pane (first selected skill) carries the Updates meta row
    await expect(page.locator("#detailPane")).toContainText("not checkable", { timeout: 15_000 });
    await expect(page.locator("#detailPane")).toContainText("Updates", { timeout: 15_000 });
    // row-level affordance: the check status rides the list row as a tooltip
    await expect(
      page.locator("#skillList li", { hasText: "tdd" })
    ).toHaveAttribute("title", /update check: not checkable/);
    await ctx.close();
  });

  test("settings hint shows the real bound port, not 'a random port' (G9)", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.goto(localOrigin(SF_PORT) + "/");
    await expect(page.locator("#portNow")).toHaveText(`port ${SF_PORT}`, { timeout: 15_000 });
    await ctx.close();
  });
});

/* ---------- S-164: web semantics — Esc keeps text, honest sort, filter
   parity control, direction-call regressions. Same harness pattern as the
   S-163 block: the page served by GET / (the shipped APP_JS itself). */

const SEM_PORT = 8401;
let semServe: ChildProcessWithoutNullStreams | null = null;
let semPrefsDir = "";

test.describe("local page web semantics (S-164)", () => {
  // own serve: Playwright scopes beforeAll per describe group, so the
  // S-163 servers above never run for this block
  test.beforeAll(async () => {
    semPrefsDir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "skills-ui-e2e-sem-"));
    semServe = await startServe(SEM_PORT, {}, semPrefsDir, "web");
  });
  test.afterAll(async () => {
    semServe?.kill("SIGTERM");
    if (semPrefsDir) rmSync(semPrefsDir, { recursive: true, force: true });
  });

  test("Esc in the filter blurs but keeps the text and the applied filter", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.goto(localOrigin(SEM_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    // "claude" matches code-review only, via its agent name — the F1 case
    await page.locator("#filter").fill("claude");
    await expect(page.locator("#skillList li")).toHaveCount(1);
    await page.locator("#filter").press("Escape");
    await expect(page.locator("#filter")).not.toBeFocused();
    await expect(page.locator("#filter")).toHaveValue("claude");
    await expect(page.locator("#skillList li")).toHaveCount(1); // filter still applied
    await expect(page.locator("#skillList li", { hasText: "code-review" })).toBeVisible();
    await expect(page.locator("#skillList li", { hasText: "tdd" })).toHaveCount(0);
    await ctx.close();
  });

  test("Esc in search keeps the query and the rendered results", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.route("**/api/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            { name: "found-skill", slug: "me/found", source: "me/found", installs: 3, description: "x" },
          ],
          adjustedQuery: null,
        }),
      })
    );
    await page.goto(localOrigin(SEM_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    await page.locator('[data-tab="search"]').click();
    await page.locator("#searchInput").fill("found");
    await expect(page.locator("#results li", { hasText: "found-skill" })).toBeVisible({ timeout: 15_000 });
    await page.locator("#searchInput").press("Escape");
    await expect(page.locator("#searchInput")).not.toBeFocused();
    await expect(page.locator("#searchInput")).toHaveValue("found");
    await expect(page.locator("#results li", { hasText: "found-skill" })).toBeVisible();
    await ctx.close();
  });

  test("sort control cycles checked-first / A–Z / load order, each labeled and each real", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Load order (zebra, alpha, middle) differs from A–Z, and one checked
    // skill makes all three modes produce three different orders.
    const fixture = [
      { name: "zebra", description: "z", agents: ["Claude Code"], path: "/x/zebra", source: null },
      { name: "alpha", description: "a", agents: ["Claude Code"], path: "/x/alpha", source: null },
      { name: "middle", description: "m", agents: ["Claude Code"], path: "/x/middle", source: null },
    ];
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/updates") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ scope: "project", updates: {}, checkedCount: 0 }),
        });
      }
      if (url.pathname === "/api/skills") {
        const scope = url.searchParams.get("scope") ?? "project";
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ scope, skills: fixture.map((s) => ({ ...s, scope })) }),
        });
      }
      if (url.pathname === "/api/skill") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ body: "(fixture)" }),
        });
      }
      if (url.pathname.startsWith("/api/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, output: "[]" }),
        });
      }
      return route.continue();
    });
    const names = async (): Promise<string[]> =>
      (await page.locator("#skillList li .skill-name").allTextContents()).map((t) => t.trim());
    await page.goto(localOrigin(SEM_PORT) + "/");
    await expect(page.locator("#skillList li")).toHaveCount(3, { timeout: 15_000 });
    // the ratified default flip: checked-first (A→Z tiebreak) is pressed on load
    await expect(page.locator('[data-sort="checked"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-sort="name"]')).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('[data-sort="load"]')).toHaveAttribute("aria-pressed", "false");
    await page.locator("#skillList li", { hasText: "middle" }).locator("input.skill-check").check();
    await page.locator('[data-sort="checked"]').click();
    expect(await names()).toEqual(["middle", "alpha", "zebra"]); // checked first + A→Z tiebreak
    await page.locator('[data-sort="name"]').click();
    await expect(page.locator('[data-sort="name"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-sort="checked"]')).toHaveAttribute("aria-pressed", "false");
    expect(await names()).toEqual(["alpha", "middle", "zebra"]); // A–Z
    await page.locator('[data-sort="load"]').click();
    await expect(page.locator('[data-sort="load"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-sort="name"]')).toHaveAttribute("aria-pressed", "false");
    expect(await names()).toEqual(["zebra", "alpha", "middle"]); // load order = fixture order
    await ctx.close();
  });

  test("update all with nothing checked posts skills: [] — the whole-scope update (S4)", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    let updateBody = "";
    await page.route("**/api/update", (route) => {
      updateBody = route.request().postData() ?? "";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, output: "[]" }),
      });
    });
    await page.goto(localOrigin(SEM_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    await expect(page.locator("#selBar")).toBeHidden(); // nothing checked
    await page.locator("#updateAllBtn").click();
    await expect(page.locator("#toasts .toast.success")).toContainText("Update finished", { timeout: 15_000 });
    expect(JSON.parse(updateBody)).toEqual({ skills: [], global: false });
    await ctx.close();
  });

  test("switching scope clears the checked set (S6)", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await page.goto(localOrigin(SEM_PORT) + "/");
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    await page.locator("#skillList li", { hasText: "tdd" }).locator("input.skill-check").check();
    await expect(page.locator("#selBar")).toBeVisible();
    await expect(page.locator("#selCount")).toHaveText("1");
    await page.locator('[data-scope="global"]').click();
    await expect(page.locator("#selBar")).toBeHidden(); // setScope cleared the checks
    await page.locator('[data-scope="project"]').click();
    await expect(page.locator("#listPane")).toContainText("tdd", { timeout: 15_000 });
    await expect(page.locator("#skillList li", { hasText: "tdd" }).locator("input.skill-check")).not.toBeChecked();
    await expect(page.locator("#selBar")).toBeHidden();
    await ctx.close();
  });
});

/* ---------- S-165: web markdown detail — zero-dep renderer, escape-first.
   Same harness pattern as the S-163/S-164 blocks: the page served by GET /
   (the shipped APP_JS itself), with the /api surface stubbed at the network
   layer so the SKILL.md body under test is exact. */

const MD_PORT = 8402;
let mdServe: ChildProcessWithoutNullStreams | null = null;
let mdPrefsDir = "";

const CORPUS_MD = [
  "# Usage",
  "",
  "Run with **care**, see `skills-ui serve`.",
  "",
  "- item one",
  "- item two",
  "",
  "```",
  "bun run src/main.ts",
  "```",
].join("\n");

const HOSTILE_MD = [
  "<script>alert(1)</script>",
  "",
  "<img src=x onerror=alert(1)>",
  "",
  "[x](javascript:alert(1))",
  "",
  "```",
  "</pre><script>alert(2)</script>",
  "```",
].join("\n");

/** One fixture skill whose SKILL.md comes from the given markdown body. */
async function stubSkillApi(
  page: import("@playwright/test").Page,
  body: string
): Promise<void> {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/updates") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ scope: "project", updates: {}, checkedCount: 0 }),
      });
    }
    if (url.pathname === "/api/skills") {
      const scope = url.searchParams.get("scope") ?? "project";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          scope,
          skills: [
            { name: "md-fixture", description: "markdown fixture", scope, agents: ["Claude Code"], path: "/x/md-fixture", source: null },
          ],
        }),
      });
    }
    if (url.pathname === "/api/skill") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ body }),
      });
    }
    return route.continue();
  });
}

test.describe("local page markdown detail (S-165)", () => {
  test.beforeAll(async () => {
    mdPrefsDir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "skills-ui-e2e-md-"));
    mdServe = await startServe(MD_PORT, {}, mdPrefsDir, "web");
  });
  test.afterAll(async () => {
    mdServe?.kill("SIGTERM");
    if (mdPrefsDir) rmSync(mdPrefsDir, { recursive: true, force: true });
  });

  test("detail view renders SKILL.md as markdown structure, not a raw pre", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await quietUpdateCheck(page);
    await stubSkillApi(page, CORPUS_MD);
    await page.goto(localOrigin(MD_PORT) + "/");
    await expect(page.locator("#skillList li", { hasText: "md-fixture" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#readme h2")).toHaveText("Usage");
    await expect(page.locator("#readme .md-li")).toHaveCount(2);
    await expect(page.locator("#readme .md-li").first()).toHaveText("item one");
    await expect(page.locator("#readme strong")).toHaveText("care");
    await expect(page.locator("#readme .md-code")).toHaveText("skills-ui serve");
    await expect(page.locator("#readme pre.md-pre code.md-codeblock")).toHaveText("bun run src/main.ts");
    // links stay inert text: no anchor, no href, URL visible
    await expect(page.locator("#readme a")).toHaveCount(0);
    await ctx.close();
  });

  test("hostile SKILL.md shows the payload as text only — no script runs, no page error", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await quietUpdateCheck(page);
    await stubSkillApi(page, HOSTILE_MD);
    await page.goto(localOrigin(MD_PORT) + "/");
    await expect(page.locator("#skillList li", { hasText: "md-fixture" })).toBeVisible({ timeout: 15_000 });
    // every payload string is present in the DOM as TEXT
    const readme = page.locator("#readme");
    await expect(readme).toContainText("<script>alert(1)</script>");
    await expect(readme).toContainText("<img src=x onerror=alert(1)>");
    await expect(readme).toContainText("javascript:alert(1)");
    await expect(readme).toContainText("</pre><script>alert(2)</script>");
    // and none of it is live: no script/anchor/img element inside the pane,
    // no href attribute anywhere in it
    await expect(page.locator("#readme script")).toHaveCount(0);
    await expect(page.locator("#readme a")).toHaveCount(0);
    await expect(page.locator("#readme img")).toHaveCount(0);
    await expect(page.locator("#readme [href]")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await ctx.close();
  });
});
