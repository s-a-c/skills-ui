import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { pageCspFor, renderPage } from "../src/web/page.ts";

/**
 * 0.5.1 impl B: hash-pinned CSP (no script-src 'unsafe-inline'), sessionStorage
 * token storage with one-time legacy migration, </script>-safe JSON embeds,
 * and serve-side nosniff/referrer headers on the embedded page.
 */

const SCRIPT_BLOCK_RE = /<script>([\s\S]*?)<\/script>/g;

function scriptBlocks(html: string): string[] {
  return [...html.matchAll(SCRIPT_BLOCK_RE)].map((m) => m[1] ?? "");
}

function sha256b64(content: string): string {
  return createHash("sha256").update(content).digest("base64");
}

describe("page: hash-pinned CSP", () => {
  test("hosted meta CSP pins both scripts — no unsafe-inline for scripts", () => {
    const html = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
    expect(csp).toContain("script-src");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp.match(/'sha256-/g)?.length).toBe(2);
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("connect-src http://127.0.0.1:* http://localhost:*");
  });

  test("the pinned hashes match the actual emitted script contents", () => {
    for (const hosted of [true, false]) {
      const html = renderPage("0.0.0-test", undefined, 9999, undefined, { hosted });
      const csp = hosted
        ? html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ""
        : pageCspFor(undefined, 9999, undefined, false);
      const blocks = scriptBlocks(html);
      expect(blocks.length).toBe(2);
      for (const block of blocks) {
        expect(csp).toContain(`'sha256-${sha256b64(block)}'`);
      }
    }
  });

  test("renderPage is deterministic — two renders are byte-identical", () => {
    const a = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });
    const b = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });
    expect(a).toBe(b);
  });

  test("embedded CSP uses connect-src 'self' + the same hash pinning", () => {
    const csp = pageCspFor(undefined, undefined, undefined, false);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp.match(/'sha256-/g)?.length).toBe(2);
  });

  test("hosted page carries the referrer meta; frame-ancestors/nosniff stay serve-side", () => {
    const html = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).not.toContain("frame-ancestors");
  });
});

describe("page: </script>-safe JSON embeds", () => {
  test("a hostile seed cannot break out of the bootstrap script", () => {
    const html = renderPage("0.0.0-test", undefined, undefined, {
      kind: "add",
      source: "</script><script>alert(1)</script>",
      skills: ["x"],
    }, { hosted: true });
    const bootstrap = scriptBlocks(html)[0] ?? "";
    expect(bootstrap).not.toContain("</script>");
    expect(bootstrap).not.toContain("<script>");
    expect(bootstrap).toContain("\\u003c/script>"); // every < escaped — no raw tag can form
  });
});

describe("page: token lives in sessionStorage", () => {
  const html = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });

  test("saves the token via sessionStorage; never writes localStorage", () => {
    expect(html).toContain("sessionStorage.setItem(LS_TOKEN");
    expect(html).not.toContain("localStorage.setItem(LS_TOKEN");
    expect(html).not.toContain("localStorage.setItem(LS_BACKEND");
  });

  test("one-time migration moves legacy localStorage keys and removes them", () => {
    expect(html).toContain("function migrateLegacyStorage()");
    expect(html).toContain("localStorage.removeItem(LS_BACKEND)");
    expect(html).toContain("localStorage.removeItem(LS_TOKEN)");
  });
});

describe("page: emitted main script parses", () => {
  test("node --check accepts the emitted APP_JS block", () => {
    const html = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });
    const main = scriptBlocks(html)[1] ?? "";
    const tmp = join(tmpdir(), `skills-ui-pagejs-${Date.now()}.js`);
    writeFileSync(tmp, main);
    try {
      const proc = Bun.spawnSync(["node", "--check", tmp]);
      expect(proc.exitCode).toBe(0);
    } finally {
      rmSync(tmp, { force: true });
    }
  });
});

describe("serve: embedded page headers", () => {
  let server: { port: number; stop: () => Promise<void> } | null = null;
  beforeEach(() => {
    process.env.SKILLS_UI_PREFS_DIR = mkdtempSync(join(tmpdir(), "skills-ui-pageh-"));
  });
  afterEach(async () => {
    await server?.stop();
    server = null;
    rmSync(process.env.SKILLS_UI_PREFS_DIR!, { recursive: true, force: true });
    delete process.env.SKILLS_UI_PREFS_DIR;
  });

  test("GET / carries hash-pinned CSP + nosniff + no-referrer headers", async () => {
    const { createSkillsUiServer } = await import("../src/core/api.ts");
    server = await createSkillsUiServer({ withPage: true });
    const res = await fetch(`http://127.0.0.1:${server.port}/`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("'sha256-");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
