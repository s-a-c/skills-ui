/**
 * Build skills-ui binaries. Phase 0/1: host target only (darwin-arm64).
 * Phase 5 extends this to the full matrix with OPENTUI_LIBC + codesign.
 * Note: @opentui/core 0.7.0 embeds natives + tree-sitter worker + grammars
 * in the single-file executable with no extra entrypoints needed (verified:
 * compiled binary passes the markdown selftest).
 */
export {};

const outfile = "dist/skills-ui";
await Bun.$`mkdir -p dist`;
await Bun.$`bun build --compile src/main.ts --outfile ${outfile}`.quiet();
const size = (((await Bun.file(outfile).arrayBuffer()).byteLength) / 1024 / 1024).toFixed(0);
console.log(`built ${outfile} (${size} MB)`);
