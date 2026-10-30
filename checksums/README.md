# Release checksum manifests

`checksums-<ver>.txt` — shasum-compatible sha256, one line per release binary
(asset names drop the tag's leading `v`).

From **v0.5.1** the manifest is committed at the tagged commit (see
[`docs/release.md`](../docs/release.md)), so a signed tag covers the manifest
together with the tree it describes. `scripts/install.sh` verifies against
this copy first — a different trust path than the release-asset bucket the
binaries come from — and falls back to the release asset only for older tags.

- `checksums-0.4.0.txt`, `checksums-0.5.0.txt` — committed retroactively
  2026-10-30, copied verbatim from their GitHub release assets. Their tags
  predate this directory, so they carry repo provenance but **not** tag
  provenance.
