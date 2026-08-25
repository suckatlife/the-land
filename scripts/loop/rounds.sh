#!/usr/bin/env bash
# Is the builder still authorised to push to this PR?
#
# Rounds are a CHECKPOINT, not a cap. The default budget is two review rounds;
# when it runs out the builder stops and asks, and Lawrence decides whether the
# PR continues. He grants more by commenting "/continue" on the PR, which resets
# the budget. "/continue 4" grants four.
#
# Why a typed marker rather than "a comment from Lawrence": Claude pushes and
# comments through Lawrence's GitHub account, so author alone cannot tell his
# reply from the builder's own summary. "/continue" is a word the builder is
# forbidden to write, which makes the signal unambiguous.
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
  --jq '[.[] | select(.body | test("/continue"))] | last | .created_at // ""' 2>/dev/null | tail -1)
granted=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq '[.[] | select(.body | test("/continue"))] | last | (.body | capture("/continue\\s+(?<n>[0-9]+)") | .n) // ""' 2>/dev/null | tail -1)
budget="${granted:-$DEFAULT_BUDGET}"
[ -z "$budget" ] && budget="$DEFAULT_BUDGET"

rounds=$(gh api "repos/$REPO/pulls/$PR/reviews" --paginate \
  --jq "[.[] | select(.user.login == \"$REVIEWER\") | select(\"$since\" == \"\" or .submitted_at > \"$since\")] | length" 2>/dev/null | tail -1)
rounds=${rounds:-0}

if [ -n "$since" ]; then
  echo "PR #$PR — $rounds of $budget rounds used since the last /continue ($since)"
else
  echo "PR #$PR — $rounds of $budget rounds used (no /continue yet)"
fi

if [ "$rounds" -ge "$budget" ]; then
  cat <<'MSG'
STOP — checkpoint reached. Do not push again.
Post a comment with: what changed, what is still outstanding, and what you would
do with another round. Then wait. Lawrence replies "/continue" to authorise more.
MSG
  exit 1
fi
echo "OK to push — this will be round $((rounds + 1)) of $budget."
