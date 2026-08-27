#!/usr/bin/env bash
# One turn's mechanical half: prepare the environment, run the world, shoot it,
# and gate the result. Agents call this at the START of a turn (to look before
# touching anything) and again at the END (to prove they didn't break it).
#
#   scripts/loop/turn.sh before 03-claude
#   scripts/loop/turn.sh after  03-claude
#
# Exits non-zero if the build fails or the page throws — a failing gate means
# DO NOT hand off.
set -uo pipefail
PHASE="${1:?usage: turn.sh <before|after> <turn-id>}"
TURN="${2:?usage: turn.sh <before|after> <turn-id>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
OUT="runs/$TURN/$PHASE"
mkdir -p "$OUT"

# WSL2 has no system browser libs and no sudo; they live in an ephemeral /tmp
# dir that does not survive a reboot. Re-extract them if they've gone.
LIBS=/tmp/pwlibs/extract/usr/lib/x86_64-linux-gnu
if [ ! -d "$LIBS" ]; then
  echo "== fetching browser libs (no sudo needed) =="
  mkdir -p /tmp/pwlibs && (cd /tmp/pwlibs \
    && apt-get download libnspr4 libnss3 libasound2t64 >/dev/null 2>&1 \
    && for d in *.deb; do dpkg -x "$d" extract/; done)
fi
export LD_LIBRARY_PATH="$LIBS"

echo "== typecheck + build =="
if ! npm run build > "$OUT/build.log" 2>&1; then
  echo "BUILD FAILED — see $OUT/build.log"; tail -20 "$OUT/build.log"; exit 1
fi
echo "build ok"

# A fresh dev server on a per-turn port, so a stale one from an earlier turn
# can never serve old code (this has fooled us before).
MINUTES="${MINUTES:-1,5,10}"
MINUTES_EXPANDED="${MINUTES//,/ }"
PORT=$(( 5300 + RANDOM % 200 ))
npm run dev -- --port "$PORT" --strictPort > "$OUT/dev.log" 2>&1 &
DEV_PID=$!
trap 'kill $DEV_PID 2>/dev/null' EXIT
for i in $(seq 1 40); do
  grep -q "Local:" "$OUT/dev.log" 2>/dev/null && break
  sleep 0.5
done
grep -q "Local:" "$OUT/dev.log" || { echo "DEV SERVER FAILED"; tail -10 "$OUT/dev.log"; exit 1; }
echo "== observing http://localhost:$PORT (${MINUTES:-1,5,10} min marks) =="

# shellcheck disable=SC2086
# ONE fixed seed for every turn and both phases. Turns 02 and 03 each had to
# write "before and after used different seeds, so the compositions are not a
# real A/B" — with a fixed seed the terrain is identical, so a difference
# between the frames is the change rather than the dice. (Civ history still
# diverges: sim.ts uses unseeded Math.random. Terrain, coastlines and the
# natural wonders are what become comparable.)
SEED="${SEED:-loop-standard}"
node scripts/loop/observe.mjs "http://localhost:$PORT/?seed=$SEED" "$OUT" ${MINUTES_EXPANDED} 2>&1 | tee "$OUT/observe.log"
STATUS=${PIPESTATUS[0]}

echo
echo "== $PHASE gate for $TURN: $([ $STATUS -eq 0 ] && echo PASS || echo FAIL) =="
echo "frames + logs in $OUT"

# One reviewable image, and only in the `after` phase, where there is a before to
# compare against. The six raw frames stay in gitignored runs/ — six 900KB PNGs
# per turn is not something a public repo should carry. The sheet is ~175KB,
# renders inline in a PR on a phone, and puts before directly above after at the
# same minute mark, which is the comparison actually being made.
#
# Non-fatal by design: the gate is the build and the observe run. A compositing
# failure must not turn a passing turn into a failing one, but it says so loudly
# rather than leaving you wondering where the image went.
if [ "$PHASE" = "after" ] && [ "$STATUS" -eq 0 ] && [ -d "runs/$TURN/before" ]; then
  if node scripts/loop/contact_sheet.mjs "runs/$TURN"; then
    mkdir -p docs/turns
    cp "runs/$TURN/contact-sheet.jpg" "docs/turns/$TURN.jpg"
    echo "== commit docs/turns/$TURN.jpg and embed it in the PR body =="
  else
    echo "== contact sheet FAILED (non-fatal) — the gate result above still stands =="
  fi
fi

exit $STATUS
