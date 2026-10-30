import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeBody } from "./sanitize.ts";

/**
 * Read a skill's SKILL.md. `path` (from `ls --json`) may be the file itself
 * or the skill's directory depending on install mode — try both.
 * Ported from vercel-labs/skills installed.ts readSkillDoc (MIT).
 */
export function readSkillDoc(path: string): string | null {
  const candidates = [path, join(path, "SKILL.md")];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isDirectory()) continue;
      return readFileSync(candidate, "utf-8");
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Strip a leading YAML frontmatter block, as the fork's web UI does. */
export function stripFrontmatter(doc: string): string {
  if (!doc.startsWith("---")) return doc;
  const end = doc.indexOf("\n---", 3);
  if (end === -1) return doc;
  return doc.slice(end + 4).replace(/^\n+/, "");
}

export function skillBody(path: string): string | null {
  const doc = readSkillDoc(path);
  // sanitized at ingress (0.5.1 impl D): SKILL.md is external text that
  // renders as markdown in the TUI — escapes stripped, structure kept
  return doc === null ? null : sanitizeBody(stripFrontmatter(doc));
}
