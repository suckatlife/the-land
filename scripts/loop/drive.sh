#!/usr/bin/env bash
# Fully automatic Claude <-> Codex loop with strict usage and failure gates.
# See scripts/loop/README.md before the first run.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/loop/lib.sh"

REQUESTED_TURNS="${1:-4}"
MAX_TURNS=4
MAX_ATTEMPTS=8
TOTAL_LIMIT_SECONDS="${LOOP_TOTAL_LIMIT_SECONDS:-10800}"
AGENT_LIMIT_SECONDS="${LOOP_AGENT_LIMIT_SECONDS:-2700}"
RESERVE_PERCENT="${LOOP_RESERVE_PERCENT:-15}"
ESTIMATED_TURN_PERCENT="${LOOP_ESTIMATED_TURN_PERCENT:-20}"
CLAUDE_MODEL="${LOOP_CLAUDE_MODEL:-sonnet}"

die() { printf 'auto-loop: %s\n' "$*" >&2; exit 1; }

[[ "$REQUESTED_TURNS" =~ ^[1-9][0-9]*$ ]] || die "turn count must be a positive integer"
(( REQUESTED_TURNS <= MAX_TURNS )) || die "at most $MAX_TURNS successful turns may run per invocation"
loop_validate_percent "$RESERVE_PERCENT" || die "LOOP_RESERVE_PERCENT must be between 0 and 100"
loop_validate_percent "$ESTIMATED_TURN_PERCENT" || die "LOOP_ESTIMATED_TURN_PERCENT must be between 0 and 100"

cd "$ROOT"
[[ "$(git branch --show-current)" == auto-loop ]] || die "run this only from the auto-loop branch"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || die "the auto-loop worktree must be clean"

mkdir -p "$ROOT/.loop-runs"
exec 9>"$ROOT/.loop-runs/driver.lock"
flock -n 9 || die "another loop driver is already running"

RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
RUN_DIR="$ROOT/.loop-runs/$RUN_ID"
STATE_DIR="$RUN_DIR/usage"
mkdir -p "$STATE_DIR"
START_EPOCH="$(date +%s)"

loop_init_static_usage claude "$STATE_DIR"
loop_init_static_usage codex "$STATE_DIR"

LAST_TAG="$(git tag --list 'turn-[0-9][0-9]-*' --sort=-version:refname | head -1)"
if [[ "$LAST_TAG" =~ ^turn-([0-9]+)-(claude|codex)$ ]]; then
  NEXT_NUMBER=$((10#${BASH_REMATCH[1]} + 1))
  if [[ "${BASH_REMATCH[2]}" == claude ]]; then NEXT_AGENT=codex; else NEXT_AGENT=claude; fi
else
  NEXT_NUMBER=1
  NEXT_AGENT=claude
fi

declare -A EXHAUSTED=( [claude]=0 [codex]=0 )
SUCCESSFUL=0
ATTEMPTS=0

copy_evidence() {
  local worktree="$1" turn="$2" attempt_dir="$3"
  if [[ -d "$worktree/runs/$turn" ]]; then
    mkdir -p "$attempt_dir/evidence"
    cp -a "$worktree/runs/$turn/." "$attempt_dir/evidence/"
  fi
}

provider_gate() {
  local agent="$1" remaining minimum
  if (( EXHAUSTED[$agent] == 1 )); then
    printf '%s is unavailable: its CLI reported quota/rate-limit exhaustion\n' "$agent" >&2
    return 1
  fi
  if ! remaining="$(loop_remaining "$agent" "$STATE_DIR")"; then
    printf '%s is unavailable: remaining usage is unknown (fail closed)\n' "$agent" >&2
    return 1
  fi
  minimum="$(loop_add_percent "$RESERVE_PERCENT" "$ESTIMATED_TURN_PERCENT")"
  if ! loop_percent_ge "$remaining" "$minimum"; then
    printf '%s is unavailable: %s%% remains; need %s%% (%s%% reserve + %s%% turn allowance)\n' \
      "$agent" "$remaining" "$minimum" "$RESERVE_PERCENT" "$ESTIMATED_TURN_PERCENT" >&2
    return 1
  fi
  printf '%s' "$remaining"
}

select_agent() {
  local preferred="$1" alternate remaining
  if remaining="$(provider_gate "$preferred")"; then
    SELECTED_AGENT="$preferred"
    SELECTED_REMAINING="$remaining"
    return 0
  fi
  if [[ "$preferred" == claude ]]; then alternate=codex; else alternate=claude; fi
  if remaining="$(provider_gate "$alternate")"; then
    SELECTED_AGENT="$alternate"
    SELECTED_REMAINING="$remaining"
    printf 'falling back from %s to %s\n' "$preferred" "$alternate" >&2
    return 0
  fi
  return 1
}

run_agent() {
  local agent="$1" worktree="$2" prompt_file="$3" log_file="$4" bin rc
  if [[ "$agent" == claude ]]; then
    bin="${LOOP_CLAUDE_BIN:-claude}"
    command -v "$bin" >/dev/null 2>&1 || { printf 'Claude CLI not found: %s\n' "$bin" >"$log_file"; return 127; }
    set +e
    (
      cd "$worktree"
      timeout --signal=TERM --kill-after=30 "$AGENT_LIMIT_SECONDS" \
        "$bin" -p "$(<"$prompt_file")" --model "$CLAUDE_MODEL" \
        --permission-mode acceptEdits --output-format json
    ) 2>&1 | tee "$log_file"
    rc=${PIPESTATUS[0]}
  else
    bin="${LOOP_CODEX_BIN:-codex}"
    command -v "$bin" >/dev/null 2>&1 || { printf 'Codex CLI not found: %s\n' "$bin" >"$log_file"; return 127; }
    set +e
    timeout --signal=TERM --kill-after=30 "$AGENT_LIMIT_SECONDS" \
      "$bin" exec --json --sandbox workspace-write -C "$worktree" - \
      <"$prompt_file" 2>&1 | tee "$log_file"
    rc=${PIPESTATUS[0]}
  fi
  set -e
  return "$rc"
}

finalize_turn() {
  local agent="$1" turn="$2" worktree="$3" branch="$4" attempt_dir="$5"
  local tag="turn-$turn" source_lines

  [[ -n "$(git -C "$worktree" status --porcelain --untracked-files=normal)" ]] || {
    printf 'agent exited successfully but made no changes\n' >&2; return 1;
  }
  grep -qE "^## Turn 0*${turn%%-*} — $agent —" "$worktree/HANDOFF.md" || {
    printf 'HANDOFF.md has no entry for %s\n' "$turn" >&2; return 1;
  }
  for phase in before after; do
    for minute in 01 05 10; do
      [[ -s "$worktree/runs/$turn/$phase/t${minute}m.png" ]] || {
        printf 'missing frame: %s/%s/t%sm.png\n' "$turn" "$phase" "$minute" >&2; return 1;
      }
    done
  done
  [[ -s "$worktree/docs/turns/$turn.jpg" ]] || {
    printf 'missing contact sheet: docs/turns/%s.jpg\n' "$turn" >&2; return 1;
  }
  git -C "$worktree" diff --check || return 1
  git -C "$worktree" diff --quiet HEAD -- src public index.html && {
    printf 'turn did not change the product surface\n' >&2; return 1;
  }
  source_lines="$(git -C "$worktree" diff --numstat HEAD -- src public index.html | \
    awk '{ if ($1 ~ /^[0-9]+$/) n += $1; if ($2 ~ /^[0-9]+$/) n += $2 } END { print n+0 }')"
  (( source_lines <= 400 )) || {
    printf 'source diff is %s lines; protocol limit is 400\n' "$source_lines" >&2; return 1;
  }
  (cd "$worktree" && npm run build) | tee "$attempt_dir/driver-build.log" || return 1

  git -C "$worktree" add -A || return 1
  git -C "$worktree" commit -m "Turn ${turn%%-*}: automated $agent turn" || return 1
  git -C "$worktree" tag "$tag" || return 1
  copy_evidence "$worktree" "$turn" "$attempt_dir"

  git -C "$ROOT" merge --ff-only "$branch" || return 1
  git -C "$ROOT" push origin auto-loop "refs/tags/$tag" || return 1
  git -C "$ROOT" worktree remove "$worktree" || return 1
  git -C "$ROOT" branch -d "$branch" || return 1
}

printf 'Auto-loop %s: up to %s turns, %sm total, %sm per agent, %s%% reserve\n' \
  "$RUN_ID" "$REQUESTED_TURNS" "$((TOTAL_LIMIT_SECONDS / 60))" \
  "$((AGENT_LIMIT_SECONDS / 60))" "$RESERVE_PERCENT"
printf 'Logs: %s\n' "$RUN_DIR"

while (( SUCCESSFUL < REQUESTED_TURNS && ATTEMPTS < MAX_ATTEMPTS )); do
  elapsed=$(( $(date +%s) - START_EPOCH ))
  if (( elapsed + AGENT_LIMIT_SECONDS > TOTAL_LIMIT_SECONDS )); then
    printf 'Stopping cleanly: another full agent allowance would exceed the total runtime cap.\n'
    break
  fi
  if ! select_agent "$NEXT_AGENT"; then
    printf 'Stopping cleanly: neither provider can pass the usage gate.\n'
    break
  fi

  AGENT="$SELECTED_AGENT"
  TURN="$(printf '%02d-%s' "$NEXT_NUMBER" "$AGENT")"
  ATTEMPTS=$((ATTEMPTS + 1))
  ATTEMPT_DIR="$RUN_DIR/attempt-$(printf '%02d' "$ATTEMPTS")-$TURN"
  WORKTREE="$ROOT/.loop-worktrees/$RUN_ID-$ATTEMPTS-$TURN"
  BRANCH="auto-loop-attempt-$RUN_ID-$ATTEMPTS-$TURN"
  mkdir -p "$ATTEMPT_DIR" "$ROOT/.loop-worktrees"

  printf '\n========== TURN %s (usage snapshot %s%%) ==========\n' "$TURN" "$SELECTED_REMAINING"
  git worktree add -b "$BRANCH" "$WORKTREE" auto-loop
  if [[ -d "$ROOT/node_modules" && ! -e "$WORKTREE/node_modules" ]]; then
    ln -s "$ROOT/node_modules" "$WORKTREE/node_modules"
  fi
  sed -e "s/__TURN_ID__/$TURN/g" -e "s|__WORKTREE__|$WORKTREE|g" \
    "$ROOT/scripts/loop/prompt-auto.txt" >"$ATTEMPT_DIR/prompt.txt"

  loop_charge_static "$AGENT" "$STATE_DIR" "$ESTIMATED_TURN_PERCENT"

  if run_agent "$AGENT" "$WORKTREE" "$ATTEMPT_DIR/prompt.txt" "$ATTEMPT_DIR/agent.log"; then
    if finalize_turn "$AGENT" "$TURN" "$WORKTREE" "$BRANCH" "$ATTEMPT_DIR"; then
      SUCCESSFUL=$((SUCCESSFUL + 1))
      NEXT_NUMBER=$((NEXT_NUMBER + 1))
      if [[ "$AGENT" == claude ]]; then NEXT_AGENT=codex; else NEXT_AGENT=claude; fi
      printf '%s completed and pushed.\n' "$TURN"
    else
      copy_evidence "$WORKTREE" "$TURN" "$ATTEMPT_DIR"
      printf 'Stopping: %s failed validation. Worktree preserved at %s\n' "$TURN" "$WORKTREE" >&2
      exit 1
    fi
  else
    RC=$?
    copy_evidence "$WORKTREE" "$TURN" "$ATTEMPT_DIR"
    if loop_is_quota_error "$ATTEMPT_DIR/agent.log"; then
      EXHAUSTED[$AGENT]=1
      printf '%s exhausted quota (exit %s). Partial worktree: %s\n' "$AGENT" "$RC" "$WORKTREE" >&2
      printf 'The next attempt will use the other provider if its usage gate passes.\n'
      continue
    fi
    if loop_is_auth_error "$ATTEMPT_DIR/agent.log"; then
      printf 'Stopping: %s is not authenticated. Worktree: %s\n' "$AGENT" "$WORKTREE" >&2
    elif (( RC == 124 || RC == 137 )); then
      printf 'Stopping: %s reached its time cap. Worktree: %s\n' "$AGENT" "$WORKTREE" >&2
    else
      printf 'Stopping: %s failed normally (exit %s); no fallback. Worktree: %s\n' "$AGENT" "$RC" "$WORKTREE" >&2
    fi
    exit 1
  fi
done

printf '\nLoop finished: %s successful turn(s), %s attempt(s).\n' "$SUCCESSFUL" "$ATTEMPTS"
printf 'Run record: %s\n' "$RUN_DIR"
