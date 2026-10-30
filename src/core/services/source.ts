import { runSkills } from "../skills-client.ts";
import { sanitizeMetadata } from "./sanitize.ts";

/**
 * Skills available in a source, via `skills add <source> --list --yes`
 * run with FORCE_COLOR=1: upstream prints each name in cyan (SGR 36) with
 * dimmed descriptions; the cyan markers survive the pipe and are the only
 * reliable machine-readable signal. Parse ported verbatim from the fork's
 * web server (vercel-labs/skills src/web/server.ts, MIT).
 */
const CYAN_NAME_RE = /\x1b\[36m([^\x1b]+)\x1b\[(?:0|39)m/g;

export interface SourceSkill {
  name: string;
  description: string;
}

export async function listSourceSkills(source: string): Promise<SourceSkill[]> {
  const { combined } = await runSkills(["install", source, "--list", "--yes"], {
    forceColor: true,
    timeoutMs: 120_000,
  });
  const names: string[] = [];
  for (const match of combined.matchAll(CYAN_NAME_RE)) {
    // sanitize at ingress (0.5.1 impl D): the captured span can still
    // carry controls between the cyan markers
    const name = sanitizeMetadata(match[1]!);
    if (name && !name.includes(" ") && !names.includes(name)) names.push(name);
  }
  return names.map((name) => ({ name, description: "" }));
}
