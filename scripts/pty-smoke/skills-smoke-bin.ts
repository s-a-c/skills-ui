#!/usr/bin/env -S bun
/**
 * Env-proof `skills` CLI stand-in for the pty smoke (S-95).
 *
 * The renderer scrubs process.env before the first resolveSkillsBin()
 * call, so SKILLS_UI_SKILLS_BIN / SKILLS_SHIM_* never reach the app in
 * a real terminal. This binary hardcodes its fixture paths relative to
 * its own location and is injected via PATH instead — env cannot lose it.
 * Implements exactly what the TUI exercises: --version, ls --json [-g].
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const globalFixture = join(here, "fixtures", "ls-global-long.json");
const projectFixture = join(here, "fixtures", "ls-project.json");

const args = process.argv.slice(2);

if (args[0] === "--version" || args[0] === "-v") {
  console.log("1.7.4");
  process.exit(0);
}

if (args[0] === "ls" || args[0] === "list") {
  const file = args.includes("-g") || args.includes("--global") ? globalFixture : projectFixture;
  console.log(readFileSync(file, "utf-8"));
  process.exit(0);
}

console.error(`skills-smoke-bin: unsupported args ${JSON.stringify(args)}`);
process.exit(1);
