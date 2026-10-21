#!/usr/bin/env bash
# Auto-update, run by launchd (see install.sh) inside the private clone:
# moves to the newest release tag (vX.Y.Z) and rebuilds only when there is one
# it hasn't built yet. --force rebuilds anyway.
set -euo pipefail

# Wrapped in main() so bash has the whole file parsed before git rewrites it.
main() {
  local src stamp tag new
  src="$(cd "$(dirname "$0")/.." && pwd)"
  stamp="$src/.git/debloat-built"

  # Plain vX.Y.Z only: pre-release tags like v2.0.0-beta are skipped.
  tag="$(git -C "$src" ls-remote --tags --refs origin 'v*' | sed 's|.*refs/tags/||' \
    | grep -E '^v[0-9]+(\.[0-9]+)*$' | sort -V | tail -1 || true)"
  if [[ -z "$tag" ]]; then
    echo "$(date '+%F %T') no releases yet"
    return
  fi

  git -C "$src" fetch --quiet --depth 1 origin tag "$tag"
  new="$(git -C "$src" rev-parse "$tag^{commit}")"
  if [[ "${1:-}" != "--force" && "$new" == "$(cat "$stamp" 2>/dev/null)" ]]; then
    echo "$(date '+%F %T') up to date ($tag)"
    return
  fi

  git -C "$src" reset --quiet --hard "$new"
  "$src/scripts/build.sh" --install --no-launch
  echo "$new" > "$stamp"
  echo "$(date '+%F %T') updated to $tag"
}

main "$@"
exit
