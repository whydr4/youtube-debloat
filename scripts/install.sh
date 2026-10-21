#!/usr/bin/env bash
# One-command install: builds the latest YouTube Debloat release from source into
# ~/Applications and sets up auto-update to new releases. Works from a clone or
# piped straight from curl.
# Usage: install.sh [--no-auto-update | --uninstall]
set -euo pipefail

REPO="${DEBLOAT_REPO:-https://github.com/whydr4/youtube-debloat.git}"
# Private clone lives outside Desktop/Documents: launchd jobs can't read those (TCC).
HOME_DIR="${DEBLOAT_HOME:-$HOME/Library/Application Support/YouTube Debloat}"
SRC="$HOME_DIR/src"
LABEL="io.github.whydr4.youtube-debloat.update"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/YouTube Debloat.log"
APP="$HOME/Applications/YouTube Debloat.app"

die() { echo "✘ $*" >&2; exit 1; }
unload_agent() { launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; }

write_agent() {
  # Runs at login and daily at noon; a Mac that slept through noon catches up on wake.
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
    <string>$SRC/scripts/update.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>DERIVED_DATA</key><string>$HOME_DIR/DerivedData</string>
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

# Everything runs from main() so `curl | bash` parses the whole file before
# any command gets a chance to read the rest of the script from stdin.
main() {
  if [[ "${1:-}" == "--uninstall" ]]; then
    unload_agent
    rm -rf "$AGENT" "$HOME_DIR" "$APP" "$LOG"
    echo "✔ Removed. Safari forgets the extension on its next launch."
    return
  fi

  xcodebuild -version >/dev/null 2>&1 || die "Xcode isn't ready. Install it from the App Store, open it once, then run:
    sudo xcode-select -s /Applications/Xcode.app
and try again."

  # Newest plain vX.Y.Z tag; before the first release, whatever is on main.
  local ref
  ref="$(git ls-remote --tags --refs "$REPO" 'v*' | sed 's|.*refs/tags/||' \
    | grep -E '^v[0-9]+(\.[0-9]+)*$' | sort -V | tail -1 || true)"
  ref="${ref:-main}"

  mkdir -p "$HOME_DIR"
  rm -rf "$SRC"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$ref" "$REPO" "$SRC"

  echo "→ Building $ref (a minute or two the first time)…"
  DERIVED_DATA="$HOME_DIR/DerivedData" "$SRC/scripts/build.sh" --install
  git -C "$SRC" rev-parse HEAD > "$SRC/.git/debloat-built"

  unload_agent
  if [[ "${1:-}" == "--no-auto-update" ]]; then
    rm -f "$AGENT"
    echo "✔ Auto-update is off. Run this script again without the flag to turn it back on."
    return
  fi
  write_agent
  launchctl bootstrap "gui/$(id -u)" "$AGENT"
  echo "✔ Auto-update is on: checks GitHub for new releases once a day. Log: ~/Library/Logs/YouTube Debloat.log"
}

main "$@"
