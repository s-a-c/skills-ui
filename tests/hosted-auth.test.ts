import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getOrCreateHostedToken,
  hostedTokenPath,
  isAllowedHost,
  isAllowedOrigin,
  isSameOrigin,
} from "../src/core/hosted-auth.ts";

const SHIM = new URL("fixtures/skills-shim.mjs", import.meta.url).pathname;
const PAGES = "https://s-a-c.github.io";

let stateDir: string;
let prefsDir: string;
let server: { port: number; stop: () => Promise<void> } | null = null;
let token: string | undefined;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "skills-ui-auth-state-"));
  prefsDir = mkdtempSync(join(tmpdir(), "skills-ui-auth-prefs-"));
  process.env.SKILLS_UI_SKILLS_BIN = SHIM;
  process.env.SKILLS_SHIM_STATE = stateDir;
  process.env.SKILLS_UI_PREFS_DIR = prefsDir;
  delete process.env.SKILLS_UI_HOSTED_TOKEN;
  delete process.env.SKILLS_UI_ALLOWED_ORIGINS;
});

afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(prefsDir, { recursive: true, force: true });
  delete process.env.SKILLS_UI_SKILLS_BIN;
  delete process.env.SKILLS_SHIM_STATE;
  delete process.env.SKILLS_UI_PREFS_DIR;
  delete process.env.SKILLS_UI_HOSTED_TOKEN;
  delete process.env.SKILLS_UI_ALLOWED_ORIGINS;
});

async function start(): Promise<string> {
  const { createSkillsUiServer } = await import("../src/core/api.ts");
  let captured: string | undefined;
  server = await createSkillsUiServer({
    withPage: true,
    onToken: (t) => {
      captured = t;
    },
  });
  token = captured;
  return `http://127.0.0.1:${server.port}`;
}

describe("hosted-auth unit", () => {
  test("token: generated once, persisted, stable", () => {
    const p = join(prefsDir, "hosted-token");
    const t1 = getOrCreateHostedToken(p);
    expect(t1.length).toBeGreaterThanOrEqual(32);
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, "utf-8").trim()).toBe(t1);
    expect(getOrCreateHostedToken(p)).toBe(t1);
  });

  test("token: SKILLS_UI_HOSTED_TOKEN override wins, nothing persisted", () => {
    process.env.SKILLS_UI_HOSTED_TOKEN = "env-token";
    const p = join(prefsDir, "nope");
    expect(getOrCreateHostedToken(p)).toBe("env-token");
    expect(existsSync(p)).toBe(false);
  });

  test("hostedTokenPath honors SKILLS_UI_PREFS_DIR", () => {
    expect(hostedTokenPath()).toBe(join(prefsDir, "hosted-token"));
  });

  test("isAllowedHost: loopback names any port; others rejected", () => {
    expect(isAllowedHost("127.0.0.1:8123")).toBe(true);
    expect(isAllowedHost("localhost")).toBe(true);
    expect(isAllowedHost("LOCALHOST:80")).toBe(true);
    expect(isAllowedHost("[::1]:9000")).toBe(true);
    expect(isAllowedHost("::1")).toBe(true);
    expect(isAllowedHost(null)).toBe(true);
    expect(isAllowedHost("evil.com")).toBe(false);
    expect(isAllowedHost("127.0.0.1.evil.com:80")).toBe(false);
  });

  test("isAllowedOrigin: pages origin, http localhost any port, env extras", () => {
    expect(isAllowedOrigin(PAGES)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedOrigin("https://localhost:5173")).toBe(false);
    expect(isAllowedOrigin("https://evil.com")).toBe(false);
    expect(isAllowedOrigin("http://192.168.1.5:8080")).toBe(false);
    process.env.SKILLS_UI_ALLOWED_ORIGINS = "https://example.org, https://example.com";
    expect(isAllowedOrigin("https://example.org")).toBe(true);
    expect(isAllowedOrigin("https://example.com")).toBe(true);
    expect(isAllowedOrigin("https://example.net")).toBe(false);
  });

  test("isSameOrigin against the host header", () => {
    expect(isSameOrigin("http://127.0.0.1:8123", "127.0.0.1:8123")).toBe(true);
    expect(isSameOrigin("http://127.0.0.1:8123", "127.0.0.1:9999")).toBe(false);
    expect(isSameOrigin(PAGES, "127.0.0.1:8123")).toBe(false);
  });
});

describe("api hosted-UI gate", () => {
  test("no-Origin requests pass unchanged (embedded --web / curl)", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/version`);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(null);
    expect(((await res.json()) as { capabilities: { hosted: boolean } }).capabilities.hosted).toBe(true);
  });

  test("preflight from the Pages origin: 204 + echo + methods + max-age, no token needed", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/skills`, {
      method: "OPTIONS",
      headers: { origin: PAGES, "access-control-request-method": "GET" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(PAGES);
    expect(res.headers.get("vary")).toBe("Origin");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(res.headers.get("access-control-max-age")).toBe("7200");
  });

  test("cross-origin without token → 401 (readable: carries ACAO); with token → 200 + ACAO + Vary", async () => {
    const base = await start();
    const denied = await fetch(`${base}/api/skills`, { headers: { origin: PAGES } });
    expect(denied.status).toBe(401);
    expect(denied.headers.get("access-control-allow-origin")).toBe(PAGES);
    const allowed = await fetch(`${base}/api/skills`, {
      headers: { origin: PAGES, authorization: `Bearer ${token}` },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(PAGES);
    expect(allowed.headers.get("vary")).toBe("Origin");
  });

  test("GET /api/version is token-free cross-origin (pre-pairing negotiation)", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/version`, { headers: { origin: PAGES } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(PAGES);
  });

  test("disallowed cross-origin origin → 403, no ACAO", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/version`, { headers: { origin: "https://evil.com" } });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBe(null);
  });

  test("localhost dev origins are allowed but still need the token", async () => {
    const base = await start();
    const dev = await fetch(`${base}/api/skills`, { headers: { origin: "http://localhost:5173" } });
    expect(dev.status).toBe(401);
    const devAuthed = await fetch(`${base}/api/skills`, {
      headers: { origin: "http://localhost:5173", authorization: `Bearer ${token}` },
    });
    expect(devAuthed.status).toBe(200);
    expect(devAuthed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  test("token stable across restarts; env override honored", async () => {
    await start();
    const token1 = token!;
    await server!.stop();
    await start();
    expect(token).toBe(token1);
    const probe = await fetch(`${server ? `http://127.0.0.1:${server.port}` : ""}/api/version`, {
      headers: { origin: PAGES },
    });
    expect(probe.status).toBe(200);
    await server!.stop();
    process.env.SKILLS_UI_HOSTED_TOKEN = "fixed-token";
    await start();
    expect(token).toBe("fixed-token");
    const ok = await fetch(`http://127.0.0.1:${server!.port}/api/skills`, {
      headers: { origin: PAGES, authorization: "Bearer fixed-token" },
    });
    expect(ok.status).toBe(200);
  });
});
