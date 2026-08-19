#!/usr/bin/env bash
# The driver: alternates Claude and Codex turns, hands-off.
#
#   scripts/loop/drive.sh 6        # six turns, starting with claude
#
# Run this from a PLAIN TERMINAL, not from inside an agent session.
# If the `codex` CLI isn't installed, the Codex turns pause and print exactly
# what to paste into Codex cloud, then wait for you to press enter.
set -uo pipefail
ROUNDS="${1:-4}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
git rev-parse --abbrev-ref HEAD | grep -qx auto-loop || { echo "Not on auto-loop branch. git checkout auto-loop"; exit 1; }

for ((n=1; n<=ROUNDS; n++)); do
  if (( n % 2 == 1 )); then AGENT=claude; else AGENT=codex; fi
  TURN=$(printf "%02d-%s" "$n" "$AGENT")
  PROMPT=$(sed "s/__TURN_ID__/$TURN/g" scripts/loop/prompt.txt)
  echo "=============== TURN $TURN ==============="

  if [ "$AGENT" = claude ]; then
    claude -p "$PROMPT" --permission-mode acceptEdits 2>&1 | tail -40
  elif command -v codex >/dev/null 2>&1; then
    codex exec "$PROMPT" 2>&1 | tail -40
  else
    echo "--- codex CLI not installed. Start this turn in Codex cloud with: ---"
    echo "$PROMPT"
    echo "--- press enter when Codex has pushed its turn ---"
    read -r _
    git pull --ff-only 2>&1 | tail -3
  fi

  if ! git diff --quiet "turn-$(printf "%02d" $((n-1)))"..HEAD 2>/dev/null && [ $n -gt 1 ]; then :; fi
  echo "--- $TURN done: $(git log --oneline -1) ---"
done
echo "Loop finished. Review with: git log --oneline known-good-2026-08-18..HEAD"
echo "Bail out with:  git reset --hard known-good-2026-08-18"
