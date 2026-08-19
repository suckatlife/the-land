#!/usr/bin/env bash
# Side-effect-free helpers for drive.sh, separated so safety decisions can be tested.

loop_validate_percent() {
  [[ "$1" =~ ^([0-9]+)(\.[0-9]+)?$ ]] &&
    awk -v n="$1" 'BEGIN { exit !(n >= 0 && n <= 100) }'
}

loop_percent_ge() {
  awk -v left="$1" -v right="$2" 'BEGIN { exit !(left >= right) }'
}

loop_add_percent() {
  awk -v left="$1" -v right="$2" 'BEGIN { printf "%.2f", left + right }'
}

loop_subtract_percent() {
  awk -v left="$1" -v right="$2" 'BEGIN {
    n=left-right; if (n<0) n=0; printf "%.2f", n
  }'
}

loop_agent_key() {
  printf '%s' "${1^^}"
}

loop_init_static_usage() {
  local agent="$1" state_dir="$2" key probe_key value
  key="LOOP_$(loop_agent_key "$agent")_REMAINING"
  probe_key="LOOP_$(loop_agent_key "$agent")_USAGE_CMD"
  value="${!key:-}"
  [[ -n "${!probe_key:-}" ]] && return 0
  [[ -z "$value" ]] && return 0
  loop_validate_percent "$value" || {
    printf '%s must be a percentage from 0 to 100\n' "$key" >&2
    return 1
  }
  printf '%s\n' "$value" >"$state_dir/$agent.remaining"
}

loop_remaining() {
  local agent="$1" state_dir="$2" probe_key probe output
  probe_key="LOOP_$(loop_agent_key "$agent")_USAGE_CMD"
  probe="${!probe_key:-}"
  if [[ -n "$probe" ]]; then
    output="$(bash -lc "$probe")" || return 2
    output="$(printf '%s' "$output" | tr -d '[:space:]')"
    loop_validate_percent "$output" || return 2
    printf '%s' "$output"
    return 0
  fi
  [[ -s "$state_dir/$agent.remaining" ]] || return 2
  output="$(<"$state_dir/$agent.remaining")"
  loop_validate_percent "$output" || return 2
  printf '%s' "$output"
}

loop_charge_static() {
  local agent="$1" state_dir="$2" cost="$3" path current
  path="$state_dir/$agent.remaining"
  [[ -s "$path" ]] || return 0
  current="$(<"$path")"
  loop_subtract_percent "$current" "$cost" >"$path.tmp"
  mv "$path.tmp" "$path"
}

loop_is_quota_error() {
  grep -Eqi \
    "usage limit.{0,40}(reached|exceeded)|rate limit.{0,40}(reached|exceeded)|quota.{0,40}(exceeded|exhausted)|you.?ve hit (your|the) (usage |rate )?limit|insufficient_quota|resets at" \
    "$1"
}

loop_is_auth_error() {
  grep -Eqi \
    "not logged in|login required|authentication (failed|required)|unauthorized|invalid (api |access )?(key|token)|please (run|use).{0,20}login" \
    "$1"
}
