import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Ported from vercel-labs/skills `src/ui/prefs.ts` (MIT) — same shape, own
 * namespace (`~/.config/skills-ui/prefs.json`) so the wrapper and the skills
 * CLI's own UI never write the same file. On first run we import skills'
 * ui-prefs.json if present, so theme/sound/motion choices carry over.
 */

export type ThemeName = "mocha" | "latte";

export interface UiPreferences {
  theme: ThemeName;
  sound: boolean;
  reduceMotion: "auto" | boolean;
  /** Fixed port for `skills-ui --web` / `serve`. null = random each launch. */
  port: number | null;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "mocha",
  sound: true,
  reduceMotion: "auto",
  port: null,
};

const PREFS_DIR_ENV = "SKILLS_UI_PREFS_DIR";
/** skills CLI's own prefs file — read-only import source, never written. */
const SKILLS_PREFS_SOURCE = join(homedir(), ".config", "skills", "ui-prefs.json");

export function uiPrefsPath(dirOverride?: string): string {
  if (process.env[PREFS_DIR_ENV]) {
    return join(process.env[PREFS_DIR_ENV]!, "prefs.json");
  }
  if (dirOverride) {
    return join(dirOverride, "prefs.json");
  }
  return join(homedir(), ".config", "skills-ui", "prefs.json");
}

function isThemeName(value: unknown): value is ThemeName {
  return value === "mocha" || value === "latte";
}

function isReduceMotion(value: unknown): value is UiPreferences["reduceMotion"] {
  return value === "auto" || value === true || value === false;
}

function isPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** Merges only recognized keys so a corrupt or partial file cannot break the UI. */
export function normalizePreferences(input: unknown): UiPreferences {
  const prefs: UiPreferences = { ...DEFAULT_UI_PREFERENCES };
  if (input === null || typeof input !== "object") {
    return prefs;
  }
  const raw = input as Record<string, unknown>;
  if (isThemeName(raw.theme)) {
    prefs.theme = raw.theme;
  }
  if (typeof raw.sound === "boolean") {
    prefs.sound = raw.sound;
  }
  if (isReduceMotion(raw.reduceMotion)) {
    prefs.reduceMotion = raw.reduceMotion;
  }
  if (isPort(raw.port)) {
    prefs.port = raw.port;
  } else if (raw.port === null) {
    prefs.port = null;
  }
  return prefs;
}

export function loadUiPreferences(path = uiPrefsPath()): UiPreferences {
  try {
    if (!existsSync(path)) {
      return { ...DEFAULT_UI_PREFERENCES };
    }
    return normalizePreferences(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function saveUiPreferences(prefs: UiPreferences, path = uiPrefsPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(prefs, null, 2)}\n`, "utf-8");
}

/** One-time carry-over from the skills CLI's prefs, preserving the choice. */
export function importSkillsPrefsOnce(path = uiPrefsPath(), source = SKILLS_PREFS_SOURCE): boolean {
  try {
    if (existsSync(path) || !existsSync(source)) return false;
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(source, path);
    return true;
  } catch {
    return false;
  }
}
