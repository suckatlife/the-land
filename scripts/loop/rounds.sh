#!/usr/bin/env bash
# Is the builder still authorised to push to this PR?
#
# Rounds are a CHECKPOINT, not a cap. The default budget is two review rounds;
# when it runs out the builder stops and asks, and Lawrence decides whether the
# PR continues. He grants more by commenting "@claude continue" on the PR, which
# resets the budget. "@claude continue 4" grants four.
#
# The marker is "@claude continue". It has to be a typed phrase rather than
# "a comment from Lawrence", because Claude pushes and comments through his
# GitHub account and author alone cannot tell his reply from the builder's own
# summary. The builder is forbidden to write it.
#
# It deliberately does NOT start with a slash. "/continue" led the comment, and
# Claude Code parses a leading /word as a slash command, so the instruction
# evaporated: the runner woke, ran for three seconds and pushed nothing. The
# mention form triggers the workflow AND authorises in one phrase, and
# "@claude\s+continue" is specific enough that ordinary prose does not match it.
# Bare "/continue" is still accepted so older comments keep working.
#
# Uses gh's built-in jq only — standalone jq is not installed here.
#
#   scripts/loop/rounds.sh 38
set -uo pipefail
PR="${1:?usage: rounds.sh <pr-number>}"
# Repo is detected from the checkout, so this script is portable between
# projects. REPO=owner/name overrides it.
REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)}"
if [ -z "$REPO" ]; then echo "Cannot determine repo. Set REPO=owner/name." >&2; exit 2; fi
REVIEWER="${REVIEWER:-chatgpt-codex-connector[bot]}"
DEFAULT_BUDGET="${ROUND_LIMIT:-2}"

# Most recent /continue: its timestamp, and any number it granted.
since=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq '[.[] | select(.body | test("@claude\\s+continue"; "i") or test("/continue"))] | last | .created_at // ""' 2>/dev/null | tail -1)
granted=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq '[.[] | select(.body | test("@claude\\s+continue"; "i") or test("/continue"))] | last | (.body | capture("(?:@claude\\s+continue|/continue)\\s+(?<n>[0-9]+)"; "i") | .n) // ""' 2>/dev/null | tail -1)
budget="${granted:-$DEFAULT_BUDGET}"
[ -z "$budget" ] && budget="$DEFAULT_BUDGET"

rounds=$(gh api "repos/$REPO/pulls/$PR/reviews" --paginate \
  --jq "[.[] | select(.user.login == \"$REVIEWER\") | select(\"$since\" == \"\" or .submitted_at > \"$since\")] | length" 2>/dev/null | tail -1)
rounds=${rounds:-0}

if [ -n "$since" ]; then
  echo "PR #$PR — $rounds of $budget rounds used since the last "@claude continue" ($since)"
else
  echo "PR #$PR — $rounds of $budget rounds used (no "@claude continue" yet)"
fi

if [ "$rounds" -ge "$budget" ]; then
  cat <<'MSG'
STOP — checkpoint reached. Do not push again.
Post a comment with: what changed, what is still outstanding, and what you would
do with another round. Then wait. Lawrence replies "@claude continue" to authorise more.
MSG
  exit 1
fi
echo "OK to push — this will be round $((rounds + 1)) of $budget."
