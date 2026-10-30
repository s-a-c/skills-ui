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
const BUN = join(homedir(), ".bun", "bin", "bun");

let serve: ChildProcessWithoutNullStreams | null = null;
let token = "";
let prefsDir = "";

test.beforeAll(async () => {
  prefsDir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "skills-ui-e2e-"));
  serve = spawn(BUN, ["run", "src/main.ts", "serve", "--port", String(PORT)], {
    cwd: resolve(HERE, "../.."),
    env: {
      ...process.env,
      SKILLS_UI_PREFS_DIR: prefsDir,
      SKILLS_UI_SKILLS_BIN: resolve(HERE, "../fixtures/skills-shim.mjs"),
      SKILLS_UI_API_URL: "http://127.0.0.1:1", // registry unreachable → search degrades to []
      SKILLS_UI_HOSTED_TOKEN: "e2e-fixed-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  token = "e2e-fixed-token";
  await new Promise<void>((resolveDone, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`serve did not start:\n${out}`)), 10_000);
    serve!.stdout.on("data", (d: Buffer) => {
      out += d.toString();
      if (out.includes(`running at http://127.0.0.1:${PORT}`)) {
        clearTimeout(timer);
        resolveDone();
      }
    });
    serve!.stderr.on("data", (d: Buffer) => {
      out += d.toString();
    });
  });
});

test.afterAll(async () => {
  serve?.kill("SIGTERM");
  if (prefsDir) rmSync(prefsDir, { recursive: true, force: true });
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
});
