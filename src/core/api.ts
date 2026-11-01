import { pageCspFor, renderPage } from "../web/page.ts";
import {
  checkForUpdates,
  install,
  listInstalled,
  listSourceSkills,
  remove,
  searchWithFallback,
  skillBody,
  update,
} from "./index.ts";
import {
  bearerMatches,
  corsHeaders,
  getOrCreateHostedToken,
  isAllowedHost,
  isAllowedOrigin,
  isCrossSiteFetch,
  isSameOrigin,
  preflightResponse,
} from "./hosted-auth.ts";
import {
  DEFAULT_UI_PREFERENCES,
  loadUiPreferences,
  normalizePreferences,
  saveUiPreferences,
  uiPrefsPath,
  type UiPreferences,
} from "./prefs.ts";
import type { UiSeed } from "./seed.ts";
import { readSkillDoc } from "./services/skill-doc.ts";
import { sanitizeMetadata } from "./services/sanitize.ts";
import type { InstalledSkill, Scope } from "./services/types.ts";
import { SkillsBusyError, skillsVersion } from "./skills-client.ts";
import { APP_VERSION } from "./version.ts";

/**
 * The wrapper's HTTP API — contract ported 1:1 from the fork's web server
 * (vercel-labs/skills src/web/server.ts, MIT) so the ported WebUI works
 * unmodified, plus GET /api/version for capability negotiation.
 * Binds 127.0.0.1 only; JSON everywhere; no-store; 1 MiB body cap.
 */

const BODY_LIMIT = 1024 * 1024;

export interface ApiOptions {
  port?: number | null;
  seed?: UiSeed;
  /** Serve the HTML page at / (true for --web, false for headless serve). */
  withPage?: boolean;
  onReady?: (info: { port: number; fellBack: boolean }) => void;
  /** Called once at startup with the hosted-UI token (main.ts prints it). */
  onToken?: (token: string) => void;
  /**
   * Global request limiter (0.5.1 impl A): token-bucket capacity and
   * refill per second. Defaults are generous for a single local user;
   * `null` disables (tests may shrink or disable it).
   */
  rateLimit?: { capacity: number; refillPerSec: number } | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// ---------- request body ----------

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > BODY_LIMIT) throw new BodyTooLarge();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new BadJson("body must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BodyTooLarge || error instanceof BadJson) throw error;
    throw new BadJson("invalid JSON body");
  }
}

class BodyTooLarge extends Error {}
class BadJson extends Error {}

// ---------- boundary validation (0.5.1 impl A) ----------
//
// Everything validated here flows into `Bun.spawn` argv or outbound URLs:
// reject leading `-` (upstream flag injection), control characters, and
// oversized values before they leave the HTTP boundary.

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._@/-]*$/;

function validText(value: string, max: number): string | null {
  if (!value || value.length > max || CONTROL_CHARS_RE.test(value)) return null;
  if (value.startsWith("-")) return null;
  return value;
}

/** Skill name going to `skills add/rm/update`: conservative charset. */
function validSkillName(value: string): string | null {
  const text = validText(value, 128);
  return text !== null && SKILL_NAME_RE.test(text) ? text : null;
}

/** Source: http(s) URL without credentials, or a plain path/shorthand. */
function validSource(value: string): string | null {
  const text = validText(value, 512);
  if (text === null) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (url.username || url.password) return null;
    } catch {
      return null;
    }
  }
  return text;
}

/** Free-text query (never reaches argv; still bounded and clean). */
function validQuery(value: string): string | null {
  if (value.length > 512 || CONTROL_CHARS_RE.test(value)) return null;
  return value;
}

// ---------- rate limiter (0.5.1 impl A) ----------

function createLimiter(capacity: number, refillPerSec: number): () => boolean {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function scopeParam(url: URL): "project" | "global" {
  return url.searchParams.get("scope") === "global" ? "global" : "project";
}

// ---------- the API ----------

export async function createSkillsUiServer(options: ApiOptions = {}): Promise<{
  port: number;
  fellBack: boolean;
  stop: () => Promise<void>;
}> {
  const prefs: UiPreferences = loadUiPreferences();
  const preferred = options.port ?? prefs.port ?? 0;
  // The actually-bound port (auto-assign may rewrite a requested 0); set
  // once the socket is up, read by GET / so the page's settings hint shows
  // the true port instead of "a random port" (G9).
  let boundPort = 0;

  // ---------- serve-scoped list cache (S-178) ----------
  //
  // Every `GET /api/skills` used to spawn a fresh `skills ls --json`
  // (S-153: multi-second on a small corpus, ~60 s on a real home directory;
  // two open tabs = two concurrent spawns) and `remove()` paid two full
  // uncached lists per removal. This mirrors the TUI's listCache
  // (src/tui/app.ts, S-89) at the API layer:
  //
  //   - per-SERVER state, deliberately not a module-level map (the mistake
  //     the original module-level descriptionCache made before S-178 moved
  //     it per-server below): tests and the budget harness create many
  //     servers against different shim states, and a module map would
  //     leak rows across them;
  //   - copy-on-read: every caller gets a fresh array and fresh row
  //     objects, so no handler can mutate the cached listing;
  //   - coalescing: concurrent requests for the same scope share one
  //     in-flight `listInstalled` promise — one spawn, not N;
  //   - invalidation: any install/remove/update drops BOTH scopes (TUI
  //     parity: one clear() per mutation) and also drops the in-flight
  //     entries and bumps the generation — a list already in flight when a
  //     mutation lands must never repopulate the cache with stale rows
  //     when it settles. Its own awaiters still receive that response
  //     (exactly what they would have gotten without a cache); the next
  //     request after invalidation re-spawns.
  const listCache = new Map<Scope, InstalledSkill[]>();
  const inFlightLists = new Map<Scope, Promise<InstalledSkill[]>>();
  let listGeneration = 0;

  const copyRows = (skills: InstalledSkill[]): InstalledSkill[] =>
    skills.map((s) => ({ ...s, agents: [...s.agents] }));

  const cachedListInstalled = async (scope: Scope): Promise<InstalledSkill[]> => {
    const cached = listCache.get(scope);
    if (cached) return copyRows(cached);
    const generation = listGeneration;
    let flight = inFlightLists.get(scope);
    if (!flight) {
      flight = listInstalled(scope).then((skills) => {
        // a mutation landed while this spawn was in flight ⇒ its rows are
        // stale — the invalidation already dropped this flight, so do not
        // let it resurrect its listing into the cache
        if (generation === listGeneration) listCache.set(scope, skills);
        return skills;
      });
      // clear on settle (success or failure); the identity guard never
      // drops a NEWER flight stored by a post-invalidation request
      flight.then(
        () => {
          if (inFlightLists.get(scope) === flight) inFlightLists.delete(scope);
        },
        () => {
          if (inFlightLists.get(scope) === flight) inFlightLists.delete(scope);
        }
      );
      inFlightLists.set(scope, flight);
    }
    return flight.then(copyRows);
  };

  const invalidateListCache = (): void => {
    listGeneration += 1;
    listCache.clear();
    inFlightLists.clear();
  };

  // ---------- description enrichment (frontmatter, cached per server) ----------

  const descriptionCache = new Map<string, string>();

  const descriptionFor = (path: string): string => {
    const cached = descriptionCache.get(path);
    if (cached !== undefined) return cached;
    const doc = readSkillDoc(path);
    const match = doc?.match(/^description:\s*(.+)$/m);
    // frontmatter descriptions are external text — sanitized at ingress
    const description = sanitizeMetadata(match?.[1] ?? "");
    descriptionCache.set(path, description);
    return description;
  };

  const route = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      if (method === "GET" && (path === "/" || path === "/index.html")) {
        if (!options.withPage) return json({ error: "not found: headless serve mode" }, 404);
        return new Response(renderPage(APP_VERSION, prefs, boundPort || undefined, options.seed), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            // hash-pinned CSP (0.5.1 impl B) — no script-src 'unsafe-inline';
            // these two cannot go in a meta CSP, so the embedded page gets
            // them as real headers
            "content-security-policy": pageCspFor(prefs, boundPort || undefined, options.seed, false),
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
        });
      }

      if (method === "GET" && path === "/api/version") {
        let skills: string | null = null;
        try {
          skills = await skillsVersion();
        } catch {
          skills = null;
        }
        return json({
          version: APP_VERSION,
          skillsVersion: skills,
          capabilities: { updatesCheck: "github", hosted: true },
        });
      }

      if (method === "GET" && path === "/api/skills") {
        const scope = scopeParam(url);
        // S-178: served from the per-server list cache — the first request
        // for a scope spawns one `skills ls`, concurrent requests coalesce
        // onto it, later requests hit the cache
        const skills = await cachedListInstalled(scope);
        return json({
          scope,
          skills: skills.map((s) => ({
            name: s.name,
            description: descriptionFor(s.path),
            scope: s.scope,
            agents: s.agents,
            path: s.path,
            source: s.source,
          })),
        });
      }

      if (method === "GET" && path === "/api/skill") {
        const scope = scopeParam(url);
        // S-178/S-179: both lookup forms run against the cached list — the
        // first read on a fresh serve populates it (one spawn), later reads
        // spawn nothing, whichever form the client used.
        const skills = await cachedListInstalled(scope);
        // S-179 detail-by-path — SECURITY boundary: the `path` param is
        // caller-supplied, so it is used ONLY as an exact-string membership
        // check against the scope's cached-or-in-flight InstalledSkill rows
        // (path is never echoed; a present path WINS over a present name,
        // so a stale client gets an honest 404),
        // and the doc read below happens on the matched cached row's path
        // (string-equal to the param by that check). No substring/prefix
        // matching and no read of any path that is not exactly a cached
        // row's path; a non-empty path that fails the check is 404 with no
        // file touched. Empty/absent path falls through to the cache-served
        // name lookup — unchanged 400/404 shape.
        const requestedPath = url.searchParams.get("path");
        let skill: InstalledSkill | undefined;
        if (requestedPath) {
          skill = skills.find((s) => s.path === requestedPath);
          if (!skill) return json({ error: "skill not found" }, 404);
        } else {
          const name = url.searchParams.get("name");
          if (!name) return json({ error: "name is required" }, 400);
          if (!validSkillName(name)) return json({ error: "invalid skill name" }, 400);
          skill = skills.find((s) => s.name === name);
          if (!skill) return json({ error: "skill not found" }, 404);
        }
        const body = skillBody(skill.path);
        return json({ name: skill.name, scope: skill.scope, body: body ?? "" });
      }

      if (method === "GET" && path === "/api/search") {
        const q = url.searchParams.get("q") ?? "";
        if (!q.trim()) return json({ results: [], adjustedQuery: null });
        if (validQuery(q) === null) return json({ error: "invalid query" }, 400);
        const { results, adjustedQuery, failed } = await searchWithFallback(q);
        // `failed` (F4): the registry was unreachable — surfaces must say so
        // instead of rendering an honest-looking "no results"
        return json({ results, adjustedQuery, failed });
      }

      if (method === "POST" && path === "/api/install") {
        const body = await readJsonBody(req);
        const source = typeof body.source === "string" ? body.source : null;
        if (!source) return json({ error: "source is required" }, 400);
        if (validSource(source) === null) return json({ error: "invalid source" }, 400);
        let skillsList: string[] | null = null;
        if (typeof body.skill === "string" && body.skill) skillsList = [body.skill];
        else if (Array.isArray(body.skills)) {
          if (!body.skills.every((s) => typeof s === "string")) {
            return json({ error: "skills must be a string array" }, 400);
          }
          skillsList = body.skills as string[];
        }
        if (!skillsList) return json({ error: "skill or skills is required" }, 400);
        if (!skillsList.every((s) => validSkillName(s) !== null)) {
          return json({ error: "invalid skill name" }, 400);
        }
        const result = await install({
          source,
          skills: skillsList,
          global: body.global === true,
        });
        // S-178: mutation ⇒ drop the list cache, failed attempts included
        // (upstream `add` can partially succeed before reporting failure).
        // No invalidate-on-throw guard needed here: install's throw paths
        // are all pre-spawn (queue overflow, spawn failure) — there is no
        // half-mutation to flush. If install ever gains a post-spawn throw,
        // add the remove() try/catch pattern below.
        invalidateListCache();
        const output = JSON.stringify(result.results);
        if (!result.ok) return json({ ok: false, output }, 500);
        return json({ ok: true, output });
      }

      if (method === "GET" && path === "/api/source-skills") {
        const source = url.searchParams.get("source");
        if (!source) return json({ error: "source is required" }, 400);
        if (validSource(source) === null) return json({ error: "invalid source" }, 400);
        const skills = await listSourceSkills(source);
        return json({ source, skills });
      }

      if (method === "POST" && path === "/api/remove") {
        const body = await readJsonBody(req);
        if (!Array.isArray(body.skills) || !body.skills.every((s) => typeof s === "string")) {
          return json({ error: "skills must be a string array" }, 400);
        }
        if (!(body.skills as string[]).every((s) => validSkillName(s) !== null)) {
          return json({ error: "invalid skill name" }, 400);
        }
        const scope = body.global === true ? "global" : "project";
        // S-178: the before-set comes from the list cache (fresh spawn only
        // on a cold cache); after `rm`, the verification list refreshes the
        // cache in that same single spawn — previously remove() paid two
        // full uncached lists per removal
        let result;
        try {
          result = await remove(body.skills as string[], scope, {
            listBefore: await cachedListInstalled(scope),
            listAfter: () => {
              invalidateListCache();
              return cachedListInstalled(scope);
            },
          });
        } catch (error) {
          // `rm` may have half-run before failing — never serve a stale
          // pre-rm list after an error
          invalidateListCache();
          throw error;
        }
        const output =
          result.ok ? `Removed: ${result.removed.join(", ")}` :
          `Removed: ${result.removed.join(", ") || "none"} — failed: ${result.missing.join(", ")}`;
        return json({ ok: result.ok, output });
      }

      if (method === "POST" && path === "/api/update") {
        const body = await readJsonBody(req);
        const skillsList =
          Array.isArray(body.skills) && body.skills.every((s) => typeof s === "string")
            ? (body.skills as string[])
            : [];
        if (!skillsList.every((s) => validSkillName(s) !== null)) {
          return json({ error: "invalid skill name" }, 400);
        }
        const scope = body.global === true ? "global" : "project";
        const result = await update(skillsList, scope);
        // S-178: mutation ⇒ drop the list cache (see /api/install — update's
        // throw paths are likewise pre-spawn only, no half-mutation to flush)
        invalidateListCache();
        return json({ ok: result.ok, output: result.output });
      }

      if (method === "GET" && path === "/api/updates") {
        const scope = scopeParam(url);
        return json(await checkForUpdates(scope));
      }

      if (method === "GET" && path === "/api/prefs") {
        return json(loadUiPreferences());
      }

      if (method === "PUT" && path === "/api/prefs") {
        const body = await readJsonBody(req);
        const merged = normalizePreferences({ ...loadUiPreferences(), ...body });
        saveUiPreferences(merged);
        return json(merged);
      }

      return json({ error: `not found: ${method} ${path}` }, 404);
    } catch (error) {
      if (error instanceof BodyTooLarge) return json({ error: "body too large" }, 413);
      if (error instanceof BadJson) return json({ error: (error as Error).message }, 400);
      if (error instanceof SkillsBusyError) {
        return json({ error: "server busy — try again shortly" }, 503);
      }
      // internals stay in the server log; clients get a generic body
      console.error("[api] internal error:", error);
      return json({ error: "internal error" }, 500);
    }
  };

  // Hosted-UI gate (S-131 design): Host allowlist → preflight → Bearer on
  // cross-origin requests. GET /api/version stays token-free (still Host- and
  // origin-gated) so the hosted page can negotiate capabilities before pairing.
  const token = getOrCreateHostedToken();
  options.onToken?.(token);

  const withCors = (res: Response, origin: string | null): Response => {
    if (origin === null) return res;
    return new Response(res.body, {
      status: res.status,
      headers: { ...Object.fromEntries(res.headers.entries()), ...corsHeaders(origin) },
    });
  };

  // Global token bucket (0.5.1 impl A): generous for one local user, but a
  // request storm cannot multiply subprocess work. `rateLimit: null` disables.
  const limiter =
    options.rateLimit === null
      ? null
      : createLimiter(options.rateLimit?.capacity ?? 120, options.rateLimit?.refillPerSec ?? 30);

  const handler = async (req: Request): Promise<Response> => {
    const host = req.headers.get("host");
    if (!isAllowedHost(host)) return json({ error: "host not allowed" }, 403);

    // No-Origin + Sec-Fetch-Site: cross-site = a hostile page's no-cors
    // request (0.5.1 impl A). Real non-browser clients send neither header.
    if (isCrossSiteFetch(req)) return json({ error: "cross-site request rejected" }, 403);

    if (limiter && !limiter()) return json({ error: "rate limited" }, 429);

    const origin = req.headers.get("origin");
    const crossOrigin = origin !== null && !isSameOrigin(origin, host);
    if (crossOrigin && !isAllowedOrigin(origin)) {
      return json({ error: "origin not allowed" }, 403);
    }
    if (req.method === "OPTIONS") {
      // preflights cannot carry Authorization (browser rule) — answer allowed ones
      return crossOrigin ? preflightResponse(origin) : json({ error: "not found" }, 404);
    }
    const isVersionProbe = req.method === "GET" && new URL(req.url).pathname === "/api/version";
    if (crossOrigin && !isVersionProbe) {
      const auth = req.headers.get("authorization") ?? "";
      if (!bearerMatches(auth, token)) {
        // CORS headers on error responses too — the page must be able to read
        // the 401 to say "wrong token" instead of an opaque network failure.
        return withCors(json({ error: "unauthorized" }, 401), origin);
      }
    }
    return withCors(await route(req), crossOrigin ? origin : null);
  };

  let server: Awaited<ReturnType<typeof listen>>;
  let fellBack = false;
  const listen = async (port: number) => {
    const s = Bun.serve({
      port,
      hostname: "127.0.0.1",
      fetch: handler,
      // enforce the 1 MiB cap at transport level (0.5.1 impl A): without
      // this Bun buffers up to 128 MB before our readJsonBody check runs
      maxRequestBodySize: BODY_LIMIT,
      // keep the socket alive across slow handlers (0.5.1 hotfix): Bun's
      // default 10 s idle timeout tears down any request whose handler
      // outlasts it — a global `skills ls` takes ~62 s on a real corpus,
      // which surfaced in the browser as "Failed to fetch"
      idleTimeout: 255,
    });
    // ready() resolves once the socket is bound (typed loosely across Bun minors)
    await (s as unknown as { ready?: Promise<unknown> }).ready;
    return s;
  };
  try {
    server = await listen(preferred ?? 0);
  } catch {
    // preferred port busy/privileged — fall back to ephemeral, like the fork
    fellBack = preferred !== null && preferred !== 0;
    server = await listen(0);
  }

  const port = server.port ?? 0;
  if (!port) throw new Error("failed to bind a local port");
  boundPort = port;
  options.onReady?.({ port, fellBack });
  return {
    port,
    fellBack,
    stop: async () => server.stop(true),
  };
}

export { DEFAULT_UI_PREFERENCES, uiPrefsPath };
