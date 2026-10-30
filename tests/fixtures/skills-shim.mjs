#!/usr/bin/env -S bun
/**
 * Fixture `skills` CLI shim for tests. Emulates the exact subprocess
 * contract skills-ui relies on:
 *   --version            bare semver string
 *   ls --json [-g]       JSON array (state file, init from fixture on first call)
 *   install S --list --yes  cyan ANSI names (requires FORCE_COLOR=1 upstream)
 *   add … --json         fixture result array; exit 1 if any non-installed
 *   rm … -y              mutates state; always exits 0 (upstream quirk)
 *   update …             exits 0 with text
 * Also dumps an env snapshot for sanitization assertions.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const stateDir = process.env.SKILLS_SHIM_STATE ?? "/tmp/skills-shim-state";
const stateFile = join(stateDir, "installed.json");
const projectFixture = process.env.SKILLS_SHIM_LS_PROJECT ?? new URL("contract/ls-project.json", import.meta.url).pathname;
const globalFixture = process.env.SKILLS_SHIM_LS_GLOBAL ?? new URL("contract/ls-global.json", import.meta.url).pathname;
const addFixture = process.env.SKILLS_SHIM_ADD ?? new URL("contract/add.json", import.meta.url).pathname;

if (process.env.SKILLS_SHIM_SNAPSHOT) {
  mkdirSync(join(process.env.SKILLS_SHIM_SNAPSHOT, ".."), { recursive: true });
  writeFileSync(
    process.env.SKILLS_SHIM_SNAPSHOT,
    JSON.stringify(
      {
        hasCursorAgent: "CURSOR_AGENT" in process.env,
        hasClaudeCode: "CLAUDECODE" in process.env,
        hasNoColor: process.env.NO_COLOR === "1",
        forceColor: process.env.FORCE_COLOR ?? null,
        args,
      },
      null,
      2
    )
  );
}

function loadState() {
  if (!existsSync(stateFile)) {
    const fixture = args.includes("-g") || args.includes("--global") ? globalFixture : projectFixture;
    return JSON.parse(readFileSync(fixture, "utf-8"));
  }
  return JSON.parse(readFileSync(stateFile, "utf-8"));
}
function saveState(list) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(list, null, 2));
}

if (args[0] === "--version" || args[0] === "-v") {
  console.log("1.7.4");
  process.exit(0);
}

if (args[0] === "ls" || args[0] === "list") {
  const list = loadState().filter((s) =>
    args.includes("-g") || args.includes("--global") ? s.scope === "global" : s.scope === "project"
  );
  console.log(JSON.stringify(list, null, 2));
  process.exit(0);
}

if (args[0] === "install" && args.includes("--list")) {
  // upstream prints names in cyan; only meaningful with FORCE_COLOR through a pipe
  const source = args.find((a, i) => i > 0 && !a.startsWith("-")) ?? "fixture/source";
  // SKILLS_SHIM_LIST_NAMES (JSON array) overrides the names — used by the
  // hostile-input tests to push escape sequences through this path
  const names = process.env.SKILLS_SHIM_LIST_NAMES
    ? JSON.parse(process.env.SKILLS_SHIM_LIST_NAMES)
    : ["alpha", "beta", "gamma"];
  for (const name of names) {
    console.log(`\x1b[36m${name}\x1b[39m — from ${source}`);
  }
  process.exit(0);
}

if (args[0] === "add" || args[0] === "install" || args[0] === "a" || args[0] === "i") {
  const results = JSON.parse(readFileSync(addFixture, "utf-8"));
  console.log(JSON.stringify(results, null, 2));
  const allGood = results.every((r) => r.status === "installed");
  process.exit(allGood ? 0 : 1);
}

if (args[0] === "rm" || args[0] === "remove" || args[0] === "r") {
  const names = args.filter((a, i) => i > 0 && !a.startsWith("-"));
  const list = loadState().filter((s) => !names.includes(String(s.name)));
  saveState(list);
  console.log(`Successfully removed ${names.length} skill(s)`);
  process.exit(0); // upstream exits 0 even on partial failure
}

if (args[0] === "update" || args[0] === "upgrade" || args[0] === "check") {
  console.log("Updated skills (simulated)");
  process.exit(0);
}

console.error(`shim: unknown args ${JSON.stringify(args)}`);
process.exit(1);
