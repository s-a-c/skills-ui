import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Hosted-UI auth surface (0.5.x, S-131 design): a stable Bearer token for
 * cross-origin requests from the hosted page, an origin allowlist, and a
 * Host-header allowlist against DNS rebinding. Same-origin / no-Origin
 * requests (the embedded `--web` page, curl, tests) are exempt — this
 * guards other websites' JS driving the local serve, nothing else.
 * Since 0.5.1 impl A, no-Origin requests stamped `Sec-Fetch-Site:
 * cross-site` (a hostile page's no-cors fetch) are rejected outright.
 */

const TOKEN_ENV = "SKILLS_UI_HOSTED_TOKEN";
const ORIGINS_ENV = "SKILLS_UI_ALLOWED_ORIGINS";
const PREFS_DIR_ENV = "SKILLS_UI_PREFS_DIR";

/** The hosted page's origin — GitHub Pages, ratified 2026-10-30. */
const BUILTIN_ORIGINS = ["https://s-a-c.github.io"];

const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function hostedTokenPath(): string {
  const dir =
    process.env[PREFS_DIR_ENV] ??
    join(homedir(), ".config", "skills-ui");
  return join(dir, "hosted-token");
}

/** Stable token: env override, else persisted file, else generated + persisted. */
export function getOrCreateHostedToken(path = hostedTokenPath()): string {
  const fromEnv = process.env[TOKEN_ENV]?.trim();
  if (fromEnv) return fromEnv;
  try {
    if (existsSync(path)) return readFileSync(path, "utf-8").trim();
  } catch {
    // unreadable → regenerate below
  }
  const token = randomBytes(32).toString("base64url");
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${token}\n`, { mode: 0o600 });
  } catch {
    // persistence failed (read-only dir) — the per-run token still works
  }
  return token;
}

/**
 * Timing-safe Bearer check (0.5.1 impl A): hash both sides to a fixed
 * length, then compare in constant time — never compare tokens directly.
 */
export function bearerMatches(authHeader: string, token: string): boolean {
  const a = createHash("sha256").update(authHeader).digest();
  const b = createHash("sha256").update(`Bearer ${token}`).digest();
  return timingSafeEqual(a, b);
}

/**
 * Hostile no-cors detection (0.5.1 impl A): a browser always stamps
 * Sec-Fetch-Site. No Origin + `cross-site` can only be another page's
 * no-cors GET (legit hosted calls send Origin; address-bar navigation
 * sends `none`; curl and Bun fetch send neither). Serves as the
 * browser-detection the "no-Origin ⇒ non-browser" assumption lacked.
 */
export function isCrossSiteFetch(req: Request): boolean {
  return (
    req.headers.get("origin") === null &&
    req.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site"
  );
}

/** Host-header allowlist: loopback names only (DNS-rebinding defense). */
export function isAllowedHost(host: string | null): boolean {
  if (host === null) return true; // real HTTP/1.1 always sends Host
  let name = host.trim().toLowerCase();
  if (name.startsWith("[")) {
    // [::1]:port → [::1]
    const close = name.indexOf("]");
    name = close === -1 ? name : name.slice(0, close + 1);
  } else {
    const colon = name.lastIndexOf(":");
    // one colon = host:port; several = unbracketed IPv6, keep as-is
    if (colon !== -1 && name.indexOf(":") === colon) name = name.slice(0, colon);
  }
  return name === "127.0.0.1" || name === "localhost" || name === "[::1]" || name === "::1";
}

function extraOrigins(): string[] {
  return (process.env[ORIGINS_ENV] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Origin allowlist: the Pages origin, http localhost any-port, env extras. */
export function isAllowedOrigin(origin: string): boolean {
  const o = origin.trim().toLowerCase();
  return BUILTIN_ORIGINS.includes(o) || LOCAL_ORIGIN_RE.test(o) || extraOrigins().includes(o);
}

/** Same-origin check against the request's own Host header. */
export function isSameOrigin(origin: string, host: string | null): boolean {
  return host !== null && origin.trim().toLowerCase() === `http://${host.trim().toLowerCase()}`;
}

/** ACAO echo + Vary for allowed cross-origin responses. */
export function corsHeaders(origin: string): Record<string, string> {
  return { "access-control-allow-origin": origin, vary: "Origin" };
}

/** OPTIONS preflight — browsers cannot send Authorization here by design. */
export function preflightResponse(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-max-age": "7200",
    },
  });
}
