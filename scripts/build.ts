/**
 * Build skills-ui binaries. Phase 0: host target only (darwin-arm64).
 * Phase 5 extends this to the full matrix with OPENTUI_LIBC + codesign.
 * Note: @opentui/core 0.7.0 embeds natives + tree-sitter worker + grammars
 * in the single-file executable with no extra entrypoints needed (verified:
 * compiled binary passes the markdown selftest).
 */
const targets = [["skills-ui", []] as const];
for (const [name, extra] of targets) {
  const entry = "src/main.ts";
  const cmd = new Bun.$`bun build --compile ${entry} --outfile dist/${name}`;
  await cmd;
  console.log(`built dist/${name}`);
}
