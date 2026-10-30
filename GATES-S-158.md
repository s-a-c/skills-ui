# Gates: 0.5.1 impl C — installer + release trust (S-158)

OWNS: scripts/install.sh, checksums/, docs/release.md, README.md, docs/index.md

Scope: tag-committed checksum manifests (different trust path than release assets; `docs/release.md` encodes the build → commit → sign-tag → publish flow), tag-pinned installer docs, atomic same-directory install.

- [x] G1: full test suite green (no src changes; regression guard)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G2: committed manifests match the published release assets byte-for-byte
  CHECK: curl -fsSL https://github.com/s-a-c/skills-ui/releases/download/v0.5.0/checksums-0.5.0.txt | diff - checksums/checksums-0.5.0.txt && curl -fsSL https://github.com/s-a-c/skills-ui/releases/download/v0.4.0/checksums-0.4.0.txt | diff - checksums/checksums-0.4.0.txt && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=dbcafffa766de529b5e7056c8159d68e4565881eb4b5db2dff262b1e7534f03d; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G3: tag-pinned installer URL documented everywhere it is taught
  CHECK: sh -n scripts/install.sh && grep -q "raw.githubusercontent.com/s-a-c/skills-ui/v" README.md docs/index.md scripts/install.sh && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=6db37071e2193d628971bce4a2cbc01bf23afd043b3f368a0b0397cfc407c61f; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/sec051; path=bb832fc32021/41 entries

- [x] G4: manual — live install dry-run: fallback checksum path, atomic install, no temp residue, binary runs
  EVIDENCE: 2026-10-30 — `SKILLS_UI_INSTALL_DIR=/tmp/... sh scripts/install.sh v0.5.0` twice: the tag-committed manifest URL 404s silently, falls back to the release asset, checksum verifies, `skills-ui --version` = 0.5.0, destination contains only `skills-ui` (no `.skills-ui.*.tmp` residue); atomicity is by construction (verify and rename on the same filesystem).
