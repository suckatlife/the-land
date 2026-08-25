#!/usr/bin/env bash
# How many review rounds a PR has had, and whether the builder may push again.
#
# The loop is bounded by pushes, because the builder is the only party that
# pushes and the reviewer only fires on a push. So the builder checks this
# BEFORE pushing. Two rounds, then a human decides.
#
#   scripts/loop/rounds.sh 38
set -uo pipefail
PR="${1:?usage: rounds.sh <pr-number>}"
REPO="${REPO:-suckatlife/the-land}"
LIMIT="${ROUND_LIMIT:-2}"

reviews=$(gh api "repos/$REPO/pulls/$PR/reviews" --jq 'length' 2>/dev/null || echo 0)
commits=$(gh api "repos/$REPO/pulls/$PR/commits" --jq 'length' 2>/dev/null || echo 0)

echo "PR #$PR — reviews: $reviews, commits: $commits, limit: $LIMIT"
if [ "$reviews" -ge "$LIMIT" ]; then
  echo "STOP. The round limit is reached."
  echo "Do not push again. Post a summary comment and hand it to Lawrence."
  exit 1
fi
echo "OK to push: this will be round $((reviews + 1)) of $LIMIT."
