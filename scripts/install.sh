#!/bin/sh
# skills-ui installer.
#
# Pinned to a signed tag (recommended — script and checksums both come from
# the tag's tree; see docs/release.md):
#   curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/v0.5.1/scripts/install.sh | sh -s v0.5.1
#
# Rolling latest from main:
#   curl -fsSL https://raw.githubusercontent.com/s-a-c/skills-ui/main/scripts/install.sh | sh
#
# Downloads the matching release binary, verifies it against the checksum
# manifest (preferring the tag-committed copy under checksums/ — a different
# trust path than the release assets; falls back to the release asset for
# older tags), and installs to $SKILLS_UI_INSTALL_DIR (default ~/.local/bin).
set -eu

REPO="s-a-c/skills-ui"
DEST="${SKILLS_UI_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${1:-}"

say() { printf '%s\n' "$*"; }
die() { printf 'install failed: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required"

# --- platform ---
os=$(uname -s)
case "$os" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) die "unsupported OS '$os' — grab a binary from https://github.com/$REPO/releases (package-manager builds are not available yet)" ;;
esac
arch=$(uname -m)
case "$arch" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) die "unsupported arch '$arch'" ;;
esac

# --- version (default: latest release tag) ---
if [ -z "$VERSION" ]; then
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4)
  [ -n "$VERSION" ] || die "could not resolve the latest release"
fi
case "$VERSION" in v*) ;; *) VERSION="v$VERSION" ;; esac

# release asset names drop the leading v: tag v0.5.0 → skills-ui-0.5.0-<os>-<arch>
ver="${VERSION#v}"
asset="skills-ui-$ver-$os-$arch"
base="https://github.com/$REPO/releases/download/$VERSION"

tmp=$(mktemp -d) || die "mktemp"
mkdir -p "$DEST" || die "cannot create $DEST (set SKILLS_UI_INSTALL_DIR to override)"
# download straight into $DEST as a temp file: verification and the final
# rename then happen on the same filesystem — no cross-device copy between
# verify and install, and an interrupted run never leaves a partial binary
tmpbin="$DEST/.skills-ui.$$.tmp"
trap 'rm -f "$tmpbin"; rm -rf "$tmp"' EXIT

say "-> $asset -> $DEST/skills-ui"
curl -fsSL -o "$tmpbin" "$base/$asset" || die "download failed ($base/$asset)"

# checksums: the tag-committed manifest (signed with the tag) is the
# preferred source — the release asset shares the binary's trust path
if ! curl -fsSL -o "$tmp/checksums" \
     "https://raw.githubusercontent.com/$REPO/$VERSION/checksums/checksums-$ver.txt" 2>/dev/null; then
  curl -fsSL -o "$tmp/checksums" "$base/checksums-$ver.txt" || die "checksums download failed"
fi

# --- verify ---
want=$(grep "  $asset\$" "$tmp/checksums" | cut -d' ' -f1)
[ -n "$want" ] || die "no checksum entry for $asset"
if command -v sha256sum >/dev/null 2>&1; then
  got=$(sha256sum "$tmpbin" | cut -d' ' -f1)
elif command -v shasum >/dev/null 2>&1; then
  got=$(shasum -a 256 "$tmpbin" | cut -d' ' -f1)
else
  die "need sha256sum or shasum to verify the download"
fi
[ "$got" = "$want" ] || die "checksum mismatch for $asset — retry, or report at https://github.com/$REPO/issues"

# --- install (same-directory rename: atomic) ---
mv -f "$tmpbin" "$DEST/skills-ui"
chmod +x "$DEST/skills-ui"

case ":$PATH:" in
  *":$DEST:"*) ;;
  *)
    say ""
    say "NOTE: $DEST is not on your PATH. Add this to your shell profile:"
    say "  export PATH=\"$DEST:\$PATH\""
    ;;
esac

say ""
say "installed: $DEST/skills-ui  ($VERSION, $os-$arch, checksum verified)"
say "check:     skills-ui --version   (the 'skills' CLI v1.7.x on PATH is also required)"
