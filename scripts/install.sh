#!/usr/bin/env bash
# Usage: install.sh [--from-source] [--no-auto-update] | --uninstall
set -euo pipefail

GH="${DEBLOAT_GH:-whydr4/youtube-debloat}"
HOME_DIR="${DEBLOAT_HOME:-$HOME/Library/Application Support/YouTube Debloat}"
SRC="$HOME_DIR/src"
LABEL="io.github.whydr4.youtube-debloat.update"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/YouTube Debloat.log"
APP="$HOME/Applications/YouTube Debloat.app"
ZIP="YouTube-Debloat.zip"

die() { echo "✘ $*" >&2; exit 1; }
unload_agent() { launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; }

latest_tag() {
  curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$GH/releases/latest" \
    | sed -nE 's|.*/releases/tag/(v[0-9]+(\.[0-9]+)*)$|\1|p'
}

write_agent() {
  mkdir -p "$(dirname "$AGENT")" "$(dirname "$LOG")"
  cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$1</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>DEBLOAT_GH</key><string>$GH</string>
    <key>DEBLOAT_HOME</key><string>$HOME_DIR</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>0</integer></dict>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
}

install_release() {
  local tag="$1"
  [[ -n "$tag" ]] || die "No releases yet. Build it yourself instead: add --from-source."
  curl -fsSLI -o /dev/null "https://github.com/$GH/releases/download/$tag/$ZIP" \
    || die "$tag has no prebuilt app yet (it's built a few minutes after the release). Try again
in a bit, or build it yourself: add --from-source."

  mkdir -p "$HOME_DIR"
  rm -rf "$SRC" "$HOME_DIR/DerivedData"
  curl -fsSL -o "$HOME_DIR/update.sh" "https://raw.githubusercontent.com/$GH/$tag/scripts/update.sh"

  echo "→ Downloading ${tag}…"
  DEBLOAT_GH="$GH" DEBLOAT_HOME="$HOME_DIR" bash "$HOME_DIR/update.sh" --force >/dev/null
  open "$APP"
  echo "✔ Installed to ~/Applications and launched. Now enable it in Safari → Settings → Extensions."
}

install_source() {
  local ref="${1:-main}"
  xcodebuild -version >/dev/null 2>&1 || die "Xcode isn't ready. Install it from the App Store, open it once, then run:
    sudo xcode-select -s /Applications/Xcode.app
and try again. (Or drop --from-source and skip Xcode altogether.)"

  mkdir -p "$HOME_DIR"
  rm -rf "$SRC"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$ref" "https://github.com/$GH.git" "$SRC"

  echo "→ Building $ref (a minute or two the first time)…"
  DERIVED_DATA="$HOME_DIR/DerivedData" "$SRC/scripts/build.sh" --install
  echo "$ref" > "$HOME_DIR/version"
  rm -f "$HOME_DIR/update.sh"
}

# Everything runs from main() so `curl | bash` parses the whole file before
# any command gets a chance to read the rest of the script from stdin.
main() {
  local from_source="" auto_update=1 tag updater
  for arg in "$@"; do
    case "$arg" in
      --uninstall)
        unload_agent
        rm -rf "$AGENT" "$HOME_DIR" "$APP" "$LOG"
        echo "✔ Removed. Safari forgets the extension on its next launch."
        return ;;
      --from-source) from_source=1 ;;
      --no-auto-update) auto_update="" ;;
      *) die "Unknown option: $arg" ;;
    esac
  done

  tag="$(latest_tag)" || die "Can't reach GitHub."
  if [[ -n "$from_source" ]]; then
    install_source "$tag"
    updater="$SRC/scripts/update.sh"
  else
    install_release "$tag"
    updater="$HOME_DIR/update.sh"
  fi

  unload_agent
  if [[ -z "$auto_update" ]]; then
    rm -f "$AGENT"
    echo "✔ Auto-update is off. Run this script again without the flag to turn it back on."
    return
  fi
  write_agent "$updater"
  launchctl bootstrap "gui/$(id -u)" "$AGENT"
  echo "✔ Auto-update is on: checks GitHub for new releases once a day. Log: ~/Library/Logs/YouTube Debloat.log"
}

main "$@"
