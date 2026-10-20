#!/usr/bin/env bash
# Builds "YouTube Debloat.app" with an ad-hoc signature (no Apple Developer account needed)
# and drops it into ./dist. Usage: ./scripts/build.sh [--install]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# DerivedData must live outside iCloud-synced folders (Desktop/Documents),
# otherwise codesign chokes on Finder xattrs ("resource fork ... not allowed").
DERIVED="${DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData/youtube-debloat}"
APP="YouTube Debloat.app"

xattr -cr "$ROOT/extension" "$ROOT/xcode" 2>/dev/null || true

xcodebuild \
  -project "$ROOT/xcode/YouTube Debloat.xcodeproj" \
  -scheme "YouTube Debloat" \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="" \
  build -quiet

mkdir -p "$ROOT/dist"
rm -rf "$ROOT/dist/$APP"
ditto "$DERIVED/Build/Products/Release/$APP" "$ROOT/dist/$APP"
echo "✔ Built: dist/$APP"

if [[ "${1:-}" == "--install" ]]; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/$APP"
  ditto "$ROOT/dist/$APP" "$HOME/Applications/$APP"
  open "$HOME/Applications/$APP"
  echo "✔ Installed to ~/Applications and launched. Now enable it in Safari → Settings → Extensions."
fi
