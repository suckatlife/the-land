#!/usr/bin/env bash
# Exercises the real driver with local fake CLIs. Makes no model or network calls.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEST_DIR"' EXIT

git clone --quiet --no-local "$ROOT" "$TEST_DIR/repo"
git -C "$TEST_DIR/repo" checkout --quiet auto-loop

printf '%s\n' '#!/usr/bin/env bash' \
  'printf "You have hit your usage limit; resets at noon.\\n"' \
  'exit 75' >"$TEST_DIR/fake-codex"
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "ordinary coding failure\\n"' \
  'exit 1' >"$TEST_DIR/fake-claude"
chmod +x "$TEST_DIR/fake-codex" "$TEST_DIR/fake-claude"

set +e
LOOP_CODEX_REMAINING=80 LOOP_CLAUDE_REMAINING=80 \
LOOP_CODEX_BIN="$TEST_DIR/fake-codex" \
LOOP_CLAUDE_BIN="$TEST_DIR/fake-claude" \
  "$TEST_DIR/repo/scripts/loop/drive.sh" 1 >"$TEST_DIR/fallback.log" 2>&1
rc=$?
set -e
[[ $rc -ne 0 ]]
grep -q 'codex exhausted quota' "$TEST_DIR/fallback.log"
grep -q 'falling back from codex to claude' "$TEST_DIR/fallback.log"
grep -q 'claude failed normally' "$TEST_DIR/fallback.log"

# No percentages means no provider is called and the driver exits cleanly.
"$TEST_DIR/repo/scripts/loop/drive.sh" 1 >"$TEST_DIR/closed.log" 2>&1
grep -q 'neither provider can pass the usage gate' "$TEST_DIR/closed.log"

printf 'loop driver integration tests: PASS\n'
