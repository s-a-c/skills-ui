import { renderPage } from "../web/page.ts";
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
  DEFAULT_UI_PREFERENCES,
  loadUiPreferences,
  normalizePreferences,
  saveUiPreferences,
  uiPrefsPath,
  type UiPreferences,
} from "./prefs.ts";
import type { UiSeed } from "./seed.ts";
import { readSkillDoc } from "./services/skill-doc.ts";
import { skillsVersion } from "./skills-client.ts";

/**
 * The wrapper's HTTP API — contract ported 1:1 from the fork's web server
 * (vercel-labs/skills src/web/server.ts, MIT) so the ported WebUI works
 * unmodified, plus GET /api/version for capability negotiation.
 * Binds 127.0.0.1 only; JSON everywhere; no-store; 1 MiB body cap.
 */

const VERSION = "0.0.0";
const BODY_LIMIT = 1024 * 1024;

export interface ApiOptions {
  port?: number | null;
  seed?: UiSeed;
  /** Serve the HTML page at / (true for --web, false for headless serve). */
  withPage?: boolean;
  onReady?: (info: { port: number; fellBack: boolean }) => void;
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

// ---------- description enrichment (frontmatter, cached) ----------

const descriptionCache = new Map<string, string>();

function descriptionFor(path: string): string {
  const cached = descriptionCache.get(path);
  if (cached !== undefined) return cached;
  const doc = readSkillDoc(path);
  const match = doc?.match(/^description:\s*(.+)$/m);
  const description = match?.[1]?.trim() ?? "";
  descriptionCache.set(path, description);
  return description;
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

  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      if (method === "GET" && (path === "/" || path === "/index.html")) {
        if (!options.withPage) return json({ error: "not found: headless serve mode" }, 404);
        return new Response(renderPage(VERSION, prefs, undefined, options.seed), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy":
              "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'",
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
          version: VERSION,
          skillsVersion: skills,
          capabilities: { updatesCheck: "github" },
        });
      }

      if (method === "GET" && path === "/api/skills") {
        const scope = scopeParam(url);
        const skills = await listInstalled(scope);
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
        const name = url.searchParams.get("name");
        if (!name) return json({ error: "name is required" }, 400);
        const scope = scopeParam(url);
        const skills = await listInstalled(scope);
        const skill = skills.find((s) => s.name === name);
        if (!skill) return json({ error: "skill not found" }, 404);
        const body = skillBody(skill.path);
        return json({ name: skill.name, scope: skill.scope, body: body ?? "" });
      }

      if (method === "GET" && path === "/api/search") {
        const q = url.searchParams.get("q") ?? "";
        if (!q.trim()) return json({ results: [], adjustedQuery: null });
        const { results, adjustedQuery } = await searchWithFallback(q);
        return json({ results, adjustedQuery });
      }

      if (method === "POST" && path === "/api/install") {
        const body = await readJsonBody(req);
        const source = typeof body.source === "string" ? body.source : null;
        if (!source) return json({ error: "source is required" }, 400);
        let skillsList: string[] | null = null;
        if (typeof body.skill === "string" && body.skill) skillsList = [body.skill];
        else if (Array.isArray(body.skills)) {
          if (!body.skills.every((s) => typeof s === "string")) {
            return json({ error: "skills must be a string array" }, 400);
          }
          skillsList = body.skills as string[];
        }
        if (!skillsList) return json({ error: "skill or skills is required" }, 400);
        const result = await install({
          source,
          skills: skillsList,
          global: body.global === true,
        });
        const output = JSON.stringify(result.results);
        if (!result.ok) return json({ ok: false, output }, 500);
        return json({ ok: true, output });
      }

      if (method === "GET" && path === "/api/source-skills") {
        const source = url.searchParams.get("source");
        if (!source) return json({ error: "source is required" }, 400);
        const skills = await listSourceSkills(source);
        return json({ source, skills });
      }

      if (method === "POST" && path === "/api/remove") {
        const body = await readJsonBody(req);
        if (!Array.isArray(body.skills) || !body.skills.every((s) => typeof s === "string")) {
          return json({ error: "skills must be a string array" }, 400);
        }
        const scope = body.global === true ? "global" : "project";
        const result = await remove(body.skills as string[], scope);
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
        const scope = body.global === true ? "global" : "project";
        const result = await update(skillsList, scope);
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
      if (error instanceof BadJson) return json({ error: (error as Error).message }, 500);
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  };

  let server: Awaited<ReturnType<typeof listen>>;
  let fellBack = false;
  const listen = async (port: number) => {
    const s = Bun.serve({ port, hostname: "127.0.0.1", fetch: handler });
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
  options.onReady?.({ port, fellBack });
  return {
    port,
    fellBack,
    stop: async () => server.stop(true),
  };
}

export { DEFAULT_UI_PREFERENCES, uiPrefsPath };
