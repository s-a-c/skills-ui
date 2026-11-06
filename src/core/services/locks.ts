import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Scope } from "./types.ts";

/**
 * Read-only access to skills-lock.json (project: cwd; global: XDG state).
 * Path conventions ported from vercel-labs/skills skill-lock.ts / local-lock.ts.
 *
 * CORE-03 (S-197): entries are validated per record — a malformed entry never
 * discards its valid siblings (it moves to LockFile.diagnostics instead), and
 * container-level corruption of an EXISTING file (malformed JSON, root array,
 * skills:null/array) throws a controlled InvalidLockFileError rather than
 * silently reading as an empty lock. Stock v1.7.4 local-lock.ts makes
 * sourceUrl optional while the global skill-lock.ts requires it; this mixed
 * reader therefore accepts both shapes and validates only the fields above.
 */

export interface LockEntry {
  source: string;
  sourceType: string;
  sourceUrl?: string;
  ref?: string;
  skillPath?: string;
  skillFolderHash?: string;
  wellKnownDigest?: string;
  sourceBaseUrl?: string;
}

export interface LockFile {
  skills: Record<string, LockEntry>;
  /** name → reason for every entry that failed shape validation. */
  diagnostics?: Record<string, string>;
}

export class InvalidLockFileError extends Error {}

const optionalFields = [
  "sourceUrl",
  "ref",
  "skillPath",
  "skillFolderHash",
  "wellKnownDigest",
  "sourceBaseUrl",
] as const;

function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validEntry(v: unknown): v is LockEntry {
  return (
    record(v) &&
    typeof v.source === "string" &&
    typeof v.sourceType === "string" &&
    optionalFields.every((k) => !(k in v) || typeof v[k] === "string")
  );
}

function normalizeLock(value: unknown): LockFile {
  if (!record(value) || !record(value.skills)) {
    throw new InvalidLockFileError("invalid skills lock container");
  }
  const good: Array<[string, LockEntry]> = [];
  const bad: Array<[string, string]> = [];
  for (const [name, entry] of Object.entries(value.skills)) {
    if (validEntry(entry)) good.push([name, entry]);
    else bad.push([name, "invalid lock entry: expected source/sourceType and optional string fields"]);
  }
  // Unknown forward-compatible fields ride along on validated entries
  // (e.g. computedHash metadata is preserved untouched — this reader does
  // not invent an update mechanism for it).
  return { skills: Object.fromEntries(good), diagnostics: Object.fromEntries(bad) };
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    // Malformed EXISTING JSON is controlled corruption, never a silent
    // valid-empty result. normalizeLock runs OUTSIDE any catch so a thrown
    // InvalidLockFileError cannot be swallowed here.
    throw new InvalidLockFileError(
      `invalid skills lock file (${path}): ${(error as Error).message}`
    );
  }
  return normalizeLock(parsed);
}
