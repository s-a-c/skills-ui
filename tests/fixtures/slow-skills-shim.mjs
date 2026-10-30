#!/usr/bin/env -S bun
/**
 * Slow `skills` CLI shim for subprocess-queue tests: identical contract to
 * skills-shim.mjs for `--version` and `ls --json`, but sleeps
 * SKILLS_SHIM_DELAY_MS (default 150) before answering `ls` so concurrent
 * requests pile up in the spawn queue.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const delay = Number(process.env.SKILLS_SHIM_DELAY_MS ?? 150);

if (args[0] === "--version") {
  console.log("1.0.0");
  process.exit(0);
}

if (args[0] === "ls") {
  await Bun.sleep(delay);
  const fixture =
    process.env.SKILLS_SHIM_LS_PROJECT ??
    new URL("contract/ls-project.json", import.meta.url).pathname;
  console.log(readFileSync(fixture, "utf-8"));
  process.exit(0);
}

console.log("[]");
