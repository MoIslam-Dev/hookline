#!/usr/bin/env bash
#
# Builds the file you upload to a marketplace.
#
# The important part is what it EXCLUDES. Running HookLine on your own machine
# creates data/hookline.sqlite containing your real captured requests, and a
# .env may hold your API token. Neither may ever reach a buyer, so this script
# builds the archive from an explicit allow-list instead of zipping the folder and
# hoping.
#
# Usage:  MARKETING/build-release.sh [version]
# Result: dist/hookline-v<version>.zip
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VERSION="${1:-$(node -p "require('./package.json').version")}"
OUT_DIR="$ROOT/dist"
ZIP="$OUT_DIR/hookline-v${VERSION}.zip"

if [ ! -d "$ROOT/src" ] || [ ! -d "$ROOT/public" ]; then
  echo "error: run this from inside the hookline repository" >&2
  exit 1
fi

echo "Building $ZIP"
rm -rf "$OUT_DIR" && mkdir -p "$OUT_DIR"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
DEST="$STAGE/hookline"

# --- what the buyer receives -------------------------------------------------
mkdir -p "$DEST"
for item in src public test package.json package-lock.json README.md DEMO.md CHANGELOG.md LICENSE Dockerfile .dockerignore docker-compose.yml fly.toml; do
  if [ -e "$ROOT/$item" ]; then
    cp -R "$ROOT/$item" "$DEST/"
  fi
done

# --- what must never ship ---------------------------------------------------
# data/ (your captured requests, your API token), .env, node_modules, .git,
# dist, MARKETING (internal listing copy), anything editor-related.
find "$DEST" \
  \( -name 'node_modules' -o -name '.git' -o -name 'data' -o -name '.env*' \
     -o -name '*.sqlite*' -o -name '*.log' -o -name '.DS_Store' \) \
  -prune -exec rm -rf {} + 2>/dev/null || true

# --- safety check before packing -------------------------------------------
FAIL=0
for bad in data .env .git node_modules MARKETING; do
  if [ -e "$DEST/$bad" ]; then
    echo "FAIL: $bad would have been shipped" >&2
    FAIL=1
  fi
done
if find "$DEST" -name '*.sqlite*' -print -quit | grep -q .; then
  echo "FAIL: a SQLite database would have been shipped" >&2
  FAIL=1
fi
if grep -rIlq --exclude-dir=.git -e 'HOOKLINE_TOKEN=' -e 'x-hookline-token:' "$DEST" 2>/dev/null; then
  if grep -rIoh -e 'HOOKLINE_TOKEN=[A-Za-z0-9_-]\{16,\}' -e '"x-hookline-token": *"[A-Za-z0-9]\{16,\}"' "$DEST" 2>/dev/null | head -1 | grep -q .; then
    echo "FAIL: something that looks like a real API token is in the package" >&2
    FAIL=1
  fi
fi
[ "$FAIL" -eq 0 ] || { echo "Refusing to build." >&2; exit 1; }

# --- pack -------------------------------------------------------------------
( cd "$STAGE" && zip -qr "$ZIP" hookline -x '*.DS_Store' )
rm -rf "$STAGE"

echo
echo "Built  $ZIP"
echo "Size   $(du -h "$ZIP" | cut -f1)"
echo
echo "Contents:"
unzip -l "$ZIP" | awk 'NR>3 && NF>=4 {print "  " $4 }' | grep -v '/$' | sort
echo
echo "Next: upload this file, and paste MARKETING/sellmycode-listing.md into the form."
