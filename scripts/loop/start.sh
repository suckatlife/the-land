#!/usr/bin/env bash
# Friendly one-time launcher. It asks for usage once per run, never per turn.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/loop/lib.sh"

ask_if_missing() {
  local agent="$1" key probe_key label value
  key="LOOP_${agent^^}_REMAINING"
  probe_key="LOOP_${agent^^}_USAGE_CMD"
  [[ -n "${!key:-}" || -n "${!probe_key:-}" ]] && return 0
  label="${agent^}"
  read -r -p "$label plan remaining (0-100, blank = unavailable): " value
  if [[ -n "$value" ]]; then
    loop_validate_percent "$value" || {
      printf 'Expected a percentage from 0 to 100.\n' >&2
      exit 1
    }
    printf -v "$key" '%s' "$value"
    export "$key"
  fi
}

ask_if_missing claude
ask_if_missing codex
exec "$ROOT/scripts/loop/drive.sh" "${1:-4}"
