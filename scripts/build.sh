#!/usr/bin/env bash
# Builds "YouTube Debloat.app" with an ad-hoc signature (no Apple Developer account needed)
# and drops it into ./dist. Usage: ./scripts/build.sh [--install [--no-launch]]
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

# Copy without extended attributes: Finder/iCloud tag folders on the Desktop with
# com.apple.FinderInfo, which invalidates the signature, and Safari then refuses
# to list the extension ("does not have a code signature" in Console).
install_app() {
  rm -rf "$2"
  ditto --noextattr --noqtn "$1" "$2"
  xattr -cr "$2"
  codesign --verify --deep --strict "$2" 2>/dev/null || codesign --force --deep --sign - "$2"
  codesign --verify --deep --strict "$2"
}

mkdir -p "$ROOT/dist"
install_app "$DERIVED/Build/Products/Release/$APP" "$ROOT/dist/$APP"
echo "✔ Built: dist/$APP"

if [[ "${1:-}" == "--install" ]]; then
  mkdir -p "$HOME/Applications"
  install_app "$ROOT/dist/$APP" "$HOME/Applications/$APP"
  # Tell LaunchServices (and so Safari) about the new bundle without opening it.
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f "$HOME/Applications/$APP"
  if [[ "${2:-}" == "--no-launch" ]]; then
    echo "✔ Installed to ~/Applications."
  else
    open "$HOME/Applications/$APP"
    echo "✔ Installed to ~/Applications and launched. Now enable it in Safari → Settings → Extensions."
  fi
fi
