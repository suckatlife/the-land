#!/usr/bin/env bash
# Half-automatic loop driver, for when Codex is the ChatGPT app rather than a
# CLI. The app cannot be triggered programmatically — a human has to send it a
# message — but everything on either side of that can be automated:
#
#   * Claude's turns run by themselves.
#   * When it becomes the app's turn, the prompt is put on your clipboard and
#     the terminal shouts. You paste it into ChatGPT. That is the only manual
#     act in the whole loop.
#   * The moment the app's turn lands in HANDOFF.md, Claude's next turn starts
#     on its own.
#
#   scripts/loop/watch.sh 6      # run six turns
#
# Install the codex CLI and use drive.sh instead if you want zero touches.
set -uo pipefail
ROUNDS="${1:-6}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
git rev-parse --abbrev-ref HEAD | grep -qx auto-loop || { echo "Not on auto-loop branch (git checkout auto-loop)"; exit 1; }

# Whose turn it is, read from the baton rather than kept in a variable, so the
# loop survives being stopped and restarted halfway through.
last_turn_no() { grep -oE '^## Turn ([0-9]+)' HANDOFF.md | tail -1 | grep -oE '[0-9]+' | sed 's/^0*//'; }
last_agent()   { grep -oE '^## Turn [0-9]+ — [a-z]+' HANDOFF.md | tail -1 | awk '{print $NF}'; }

for ((i=0; i<ROUNDS; i++)); do
  n=$(( $(last_turn_no) + 1 ))
  if [ "$(last_agent)" = claude ]; then AGENT=codex; else AGENT=claude; fi
  TURN=$(printf "%02d-%s" "$n" "$AGENT")
  PROMPT=$(sed "s/__TURN_ID__/$TURN/g" scripts/loop/prompt.txt)

  echo
  echo "══════════════ TURN $TURN ══════════════"
  if [ "$AGENT" = claude ]; then
    claude -p "$PROMPT" --permission-mode acceptEdits 2>&1 | tail -30
  else
    printf '%s' "$PROMPT" | clip.exe 2>/dev/null && CLIP=" (copied to clipboard — just paste)" || CLIP=""
    printf '\a'   # the terminal bell is the notification
    echo "┌───────────────────────────────────────────────────────────┐"
    echo "│  YOUR TURN TO NUDGE: paste this into the ChatGPT app$CLIP"
    echo "└───────────────────────────────────────────────────────────┘"
    echo "$PROMPT"
    echo
    echo "Waiting for turn $TURN to appear in HANDOFF.md … (Ctrl-C to stop)"
    # Poll the baton rather than the clock: the turn is done when the app has
    # written its entry, however long that takes.
    until grep -qE "^## Turn 0*$n " HANDOFF.md; do sleep 20; done
    printf '\a'
    echo "picked up turn $TURN from HANDOFF.md"
  fi
  echo "--- $TURN complete: $(git log --oneline -1) ---"
done

echo
echo "Loop finished."
echo "  review:  git log --oneline known-good-2026-08-18..HEAD"
echo "  bail:    git reset --hard known-good-2026-08-18"
