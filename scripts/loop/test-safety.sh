#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/loop/lib.sh"

TEST_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/state"

export LOOP_CLAUDE_REMAINING=75
loop_init_static_usage claude "$TEST_DIR/state"
[[ "$(loop_remaining claude "$TEST_DIR/state")" == 75 ]]
loop_charge_static claude "$TEST_DIR/state" 20
[[ "$(loop_remaining claude "$TEST_DIR/state")" == 55.00 ]]

export LOOP_CLAUDE_USAGE_CMD='printf 88.5'
[[ "$(loop_remaining claude "$TEST_DIR/state")" == 88.5 ]]
export LOOP_CLAUDE_USAGE_CMD='printf unknown'
if loop_remaining claude "$TEST_DIR/state"; then
  printf 'invalid probe output was accepted\n' >&2
  exit 1
fi

printf 'You have hit your usage limit; resets at noon\n' >"$TEST_DIR/quota.log"
loop_is_quota_error "$TEST_DIR/quota.log"
printf 'Authentication required: please run login\n' >"$TEST_DIR/auth.log"
loop_is_auth_error "$TEST_DIR/auth.log"
printf 'TypeScript compile failed\n' >"$TEST_DIR/normal.log"
if loop_is_quota_error "$TEST_DIR/normal.log" ||
   loop_is_auth_error "$TEST_DIR/normal.log"; then
  printf 'ordinary failure was misclassified\n' >&2
  exit 1
fi

if "$ROOT/scripts/loop/drive.sh" 5 >"$TEST_DIR/max.log" 2>&1; then
  printf 'driver accepted more than four turns\n' >&2
  exit 1
fi
grep -q 'at most 4' "$TEST_DIR/max.log"

printf 'loop safety tests: PASS\n'
