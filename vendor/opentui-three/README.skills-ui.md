# @opentui/three — skills-ui vendored fork (0.7.0-skills-ui.1)

This directory is a **vendored fork of the exact published
[`@opentui/three@0.7.0`](https://registry.npmjs.org/@opentui/three/-/three-0.7.0.tgz)
artifact**, pinned by skills-ui to remove the transitive
Jimp → @jimp/plugin-color → Zod 3.25.76 advisory chain
(GHSA-mrhx-c7xc-m3w5) without changing application graph behavior.

**Governing decision (ADR):**
[ADR — Preserve graph behavior with a pinned Jimp-free OpenTUI Three fork](https://linear.app/s-a-c/document/adr-preserve-graph-behavior-with-a-pinned-jimp-free-opentui-three-fork-844f7dd0c653)
(local copy: `egm-review-2026-11-05/context/adr-opentui-three-fork.md` in the
skills-ui workspace). The user explicitly selected this route (2026-11-05).

## Provenance (binding)

| Property | Value |
|---|---|
| Artifact | `https://registry.npmjs.org/@opentui/three/-/three-0.7.0.tgz` |
| Integrity (sha512) | `sha512-74N07wyogkUtNB7Py7u6D83SwpqS2YSWB36fGEV2hhMyosOKRTPNrOymFPAUKe3xZK1ghr5iZo8Ew0Pu522Qgg==` (verified against computed digest AND registry `dist.integrity`) |
| sha1 (`dist.shasum`) | `c29a78d906487c64393f67f6a1db540097fdf304` (verified against computed digest) |
| gitHead | `85339b24a1056b09bc729f488c99d6cfbe3a6125` (registry metadata for 0.7.0; upstream `packages/three/package.json` at that commit fetched and cross-checked) |
| Upstream contents | 19 files, 135,968 unpacked bytes (both verified post-extraction) |
| License | MIT — upstream `LICENSE` file preserved unchanged |

The published tarball's `package.json` does not carry a `gitHead` field (stripped
by the publish pipeline); the gitHead pin is proven via the registry packument
(`versions["0.7.0"].gitHead`) plus a fetch of
`github.com/anomalyco/opentui@85339b24…` `packages/three/package.json`, whose
published-form diff against the tarball manifest is the expected packaging
transformation (src → built entry points, `workspace:*` → `0.7.0`,
devDependencies stripped).

## What changed relative to upstream (the semantic patch)

Exactly three edits, recorded in [`skills-ui.patch`](./skills-ui.patch)
(apply with `patch -p1 -d vendor/opentui-three < vendor/opentui-three/skills-ui.patch`):

1. **Manifest**: `version` `0.7.0` → `0.7.0-skills-ui.1`; removed the
   `"jimp": "1.6.1"` dependency. Everything else in the manifest (name,
   exports, types, engines, MIT license, remaining deps/optionalDeps) is
   untouched.
2. **`CLICanvas.saveToFile`** (index.js, class `CLICanvas`): the
   Jimp-consuming screenshot-export body is replaced by an explicit
   unsupported-operation failure:

   ```js
   async saveToFile() {
     throw new Error('Image file export is not included in the skills-ui graph adapter');
   }
   ```

3. **`TextureUtils.loadTextureFromFile`** (index.js, class `TextureUtils`):
   the Jimp-consuming file-texture-loader body is replaced by an explicit
   unsupported-operation failure:

   ```js
   static async loadTextureFromFile() {
     throw new Error('Image file loading is not included in the skills-ui graph adapter');
   }
   ```

Nothing else is modified. All 19 upstream files are present; all rendering
code, exports and type definitions are byte-identical to the published
artifact except the two replaced function bodies. The two disabled APIs were
unused by skills-ui (verified: no application callers). Consequences of the
patch that are intentionally left in place to keep the diff minimal: the
delegating `ThreeCliRenderer.saveToFile` and `TextureUtils.fromFile` now
propagate those throws, and the `import { readFile } from "fs/promises"` in
index.js is unused (harmless builtin import).

## Regeneration procedure (from upstream, not from this directory)

```sh
# 1. Acquire the exact artifact into owned scratch
curl -fsSL -o "$SCRATCH/three-0.7.0.tgz" \
  https://registry.npmjs.org/@opentui/three/-/three-0.7.0.tgz

# 2. Verify integrity (must print the sha512 above)
openssl dgst -sha512 -binary "$SCRATCH/three-0.7.0.tgz" | openssl base64 -A; echo

# 3. Validate archive paths BEFORE extraction: reject absolute paths,
#    ".." traversal, drive letters, symlinks; expect 19 regular files.
tar -tvzf "$SCRATCH/three-0.7.0.tgz"

# 4. Extract into an empty scratch dir, verify gitHead via the registry
#    packument (versions["0.7.0"].gitHead) and 135,968 unpacked bytes.
mkdir "$SCRATCH/extracted" && tar -xzf "$SCRATCH/three-0.7.0.tgz" -C "$SCRATCH/extracted"

# 5. Copy extracted/package/. over vendor/opentui-three (minus this README
#    and skills-ui.patch), then apply the patch record:
patch -p1 -d vendor/opentui-three < vendor/opentui-three/skills-ui.patch

# 6. From the repo root: regenerate (never hand-edit) the lockfile, then
#    verify a frozen all-platform install.
bun install
bun install --frozen-lockfile --os='*' --cpu='*' --libc='*'
```

## Acceptance gates this fork must pass (any future re-pin too)

- Tarball integrity + gitHead verified as above; archive paths validated
  before extraction.
- `bun audit` clean of GHSA-mrhx-c7xc-m3w5 **via this chain**; independent
  resolved-graph inspection (installed manifests + module resolution, not
  manifest grep) shows no `jimp`/`@jimp/*` and no affected Zod reachable from
  `@opentui/three`.
- Frozen all-platform install (`bun install --frozen-lockfile --os='*' --cpu='*' --libc='*'`) succeeds.
- Graph lifecycle unchanged: TUI graph opens/renders/rotates/closes/reopens;
  source badges/splash/Markdown still work (`bun test`, `bun run selftest`,
  `bun run pty-smoke`).
- Compiled PTY + all four build targets (`bun run build --all`) pass their
  runtime selftests (native/Rosetta/Docker glibc as established).

Return to unmodified upstream only when a compatible published version removes
the Jimp chain and passes these same gates.
