import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Scope } from "./types.ts";

/**
 * Read-only access to skills-lock.json (project: cwd; global: XDG state).
 * Path conventions ported from vercel-labs/skills skill-lock.ts / local-lock.ts.
 */

export interface LockEntry {
  source: string;
  sourceType: string;
  sourceUrl: string;
  ref?: string;
  skillPath?: string;
  skillFolderHash?: string;
  wellKnownDigest?: string;
  sourceBaseUrl?: string;
}

export interface LockFile {
  skills: Record<string, LockEntry>;
}

export function projectLockPath(cwd = process.cwd()): string {
  return join(cwd, "skills-lock.json");
}

export function globalLockPath(): string {
  const xdgState = process.env.XDG_STATE_HOME;
  if (xdgState) return join(xdgState, "skills", "skills-lock.json");
  return join(homedir(), ".local", "state", "skills", "skills-lock.json");
}

export function readLock(scope: Scope, cwd = process.cwd()): LockFile {
  const path = scope === "global" ? globalLockPath() : projectLockPath(cwd);
  if (!existsSync(path)) return { skills: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as LockFile;
    if (!parsed || typeof parsed !== "object" || typeof parsed.skills !== "object") {
      return { skills: {} };
    }
    return parsed;
  } catch {
    return { skills: {} };
  }
}
