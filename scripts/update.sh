#!/usr/bin/env bash
# Run by launchd (see install.sh). Usage: update.sh [--force]
set -euo pipefail

GH="${DEBLOAT_GH:-whydr4/youtube-debloat}"
HOME_DIR="${DEBLOAT_HOME:-$HOME/Library/Application Support/YouTube Debloat}"
SRC="$HOME_DIR/src"
STAMP="$HOME_DIR/version"
APP="$HOME/Applications/YouTube Debloat.app"
ZIP="YouTube-Debloat.zip"

log() { echo "$(date '+%F %T') $*"; }

latest_tag() {
  curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$GH/releases/latest" \
    | sed -nE 's|.*/releases/tag/(v[0-9]+(\.[0-9]+)*)$|\1|p'
}

install_app() {
  xattr -cr "$1"
  codesign --verify --deep --strict "$1"
  mkdir -p "$(dirname "$APP")"
  rm -rf "$APP"
  ditto --noextattr --noqtn "$1" "$APP"
  xattr -cr "$APP"
  codesign --verify --deep --strict "$APP"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f "$APP"
}

from_release() {
  local tag="$1" tmp
  tmp="$(mktemp -d)"
  trap "rm -rf '$tmp'" EXIT
  if ! curl -fsSL -o "$tmp/$ZIP" "https://github.com/$GH/releases/download/$tag/$ZIP"; then
    log "$tag has no prebuilt app yet, will try again later"
    return 1
  fi
  ditto -x -k "$tmp/$ZIP" "$tmp"
  install_app "$tmp/YouTube Debloat.app"
  if curl -fsSL -o "$tmp/update.sh" "https://raw.githubusercontent.com/$GH/$tag/scripts/update.sh"; then
    mv "$tmp/update.sh" "$HOME_DIR/update.sh"
  fi
}

from_source() {
  local tag="$1"
  git -C "$SRC" fetch --quiet --depth 1 origin tag "$tag"
  git -C "$SRC" reset --quiet --hard "$tag^{commit}"
  DERIVED_DATA="${DERIVED_DATA:-$HOME_DIR/DerivedData}" "$SRC/scripts/build.sh" --install --no-launch
}

# Wrapped in main() so bash has the whole file parsed before it gets replaced.
main() {
  local tag
  tag="$(latest_tag)" || { log "can't reach GitHub"; return 1; }
  if [[ -z "$tag" ]]; then
    log "no releases yet"
    return
  fi
  if [[ "${1:-}" != "--force" && "$tag" == "$(cat "$STAMP" 2>/dev/null)" ]]; then
    log "up to date ($tag)"
    return
  fi

  if [[ -d "$SRC/.git" ]]; then
    from_source "$tag"
  else
    from_release "$tag"
  fi
  echo "$tag" > "$STAMP"
  log "updated to $tag"
}

main "$@"
exit
