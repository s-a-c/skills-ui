/**
 * Build skills-ui binaries.
 *
 * Verified on @opentui/core 0.7.0: `bun build --compile` embeds the Zig
 * natives, tree-sitter worker and grammars in the single executable with
 * no extra entrypoints — the compiled binary passes the markdown selftest.
 *
 * Target matrix (roadmap 0.4.x; host-first):
 *   - darwin-arm64 / darwin-x64   (host cross-compiles fine)
 *   - linux-x64 / linux-arm64     (OPENTUI_LIBC=glibc defined at build time)
 *   - win32-x64                   (later; needs real-machine testing)
 *
 * macOS binaries get an ad-hoc codesign with the JIT entitlement
 * (required for Bun executables, Bun >= 1.2.4).
 *
 * Usage: bun run build [--target <name>]... | --all | (no args = host target)
 */
import { $ } from "bun";

const pkg = (await Bun.file("package.json").json()) as { version: string };

interface Target {
  name: string;
  define?: Record<string, string>;
  codesign?: boolean;
}

const TARGETS: Target[] = [
  { name: "darwin-arm64", codesign: true },
  { name: "darwin-x64", codesign: true },
  { name: "linux-x64", define: { "process.env.OPENTUI_LIBC": '"glibc"' } },
  { name: "linux-arm64", define: { "process.env.OPENTUI_LIBC": '"glibc"' } },
];

const args = process.argv.slice(2);
const all = args.includes("--all");
const requested = args.filter((a, i) => args[i - 1] === "--target");
const host = process.platform === "darwin" && process.arch === "arm64" ? "darwin-arm64" : null;

let selected: Target[];
if (all) selected = TARGETS;
else if (requested.length > 0) selected = TARGETS.filter((t) => requested.includes(t.name));
else selected = TARGETS.filter((t) => t.name === host);

if (selected.length === 0) {
  console.error(`no matching targets (known: ${TARGETS.map((t) => t.name).join(", ")})`);
  process.exit(1);
}

const ENTITLEMENTS = `dist/entitlements.plist`;
await $`mkdir -p dist`;
await Bun.write(
  ENTITLEMENTS,
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>\n`
);

for (const target of selected) {
  const outfile = `dist/skills-ui-${pkg.version}-${target.name}`;
  console.log(`building ${target.name} → ${outfile}`);
  // Bun.build's JS API does not expose --compile on this version; the CLI does
  // (verified in phase 0: natives + worker + grammars embed cleanly).
  // --target is what actually cross-compiles: without it bun emits a host
  // binary under every outfile name (the A1 finding — all four "targets"
  // used to be identical Mach-O arm64).
  const defineFlags = Object.entries(target.define ?? {}).flatMap(([k, v]) => ["--define", `${k}=${v}`]);
  const targetFlag = target.name === "darwin-arm64" ? [] : ["--target", `bun-${target.name}`];
  await $`bun build --compile ${targetFlag} src/main.ts --outfile ${outfile} ${defineFlags}`.quiet();
  if (target.codesign) {
    await $`codesign --sign - --force --entitlements ${ENTITLEMENTS} ${outfile}`.quiet();
  }
  const size = ((await Bun.file(outfile).arrayBuffer()).byteLength / 1024 / 1024).toFixed(0);
  console.log(`  ${size} MB`);
}
console.log("done");
