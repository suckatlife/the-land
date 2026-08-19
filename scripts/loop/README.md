# Automatic Claude / Codex turns

The driver alternates the two CLIs without a copy/paste handoff. It is
deliberately conservative: it spends neither provider below a 15% reserve,
runs at most four successful turns or three hours per invocation, and gives
any one agent at most 45 minutes.

## One-time setup

Install and authenticate both CLIs **inside WSL**, where this repository lives:

```bash
claude login
codex login
```

Then launch from the `auto-loop` branch:

```bash
scripts/loop/start.sh 4
```

The launcher asks once for each plan's remaining percentage, never between
turns. The driver budgets 20 percentage points per attempted turn by default,
so a provider at 34% will not run: 34 - 20 would cross the 15% reserve. Change
that conservative allowance only if you have evidence for a better number:

```bash
LOOP_ESTIMATED_TURN_PERCENT=12 scripts/loop/start.sh 4
```

The CLIs do not currently expose subscription remaining-percent data in a
stable structured command. The driver refuses to guess. If you have a trusted
local command that prints only a number from 0 through 100, it can replace the
one-time snapshot:

```bash
LOOP_CLAUDE_USAGE_CMD="$HOME/bin/claude-percent" \
LOOP_CODEX_USAGE_CMD="$HOME/bin/codex-percent" \
scripts/loop/drive.sh 4
```

Static percentages are launch-time snapshots. Enter fresh values for every
invocation; do not reuse old shell exports after more usage or a plan reset.

## Failure behavior

- Every attempt gets a temporary branch and worktree under `.loop-worktrees/`.
  A failed or interrupted agent cannot dirty `auto-loop`.
- Success requires all six observation frames, a HANDOFF entry, a
  product-surface change, a clean diff, no more than 400 changed source lines,
  and a passing build.
- The driver then commits, tags, fast-forwards `auto-loop`, and pushes that
  branch and tag. It never checks out or pushes `main`.
- Only an explicit quota/rate-limit message marks a provider exhausted and
  permits the other provider to take the turn. Auth errors, timeouts, build
  failures, and ordinary coding failures stop the loop.
- If Codex is exhausted, Claude can continue until its own gate would cross 15%
  (and vice versa). If neither passes, the loop exits without another call.
- Prompts, complete output, driver builds, and copied evidence live under
  `.loop-runs/<timestamp>/`. Failed worktrees are preserved and printed.

Useful overrides:

```bash
LOOP_AGENT_LIMIT_SECONDS=2700
LOOP_TOTAL_LIMIT_SECONDS=10800
LOOP_RESERVE_PERCENT=15
LOOP_CLAUDE_MODEL=sonnet
LOOP_CLAUDE_BIN=/path/to/claude
LOOP_CODEX_BIN=/path/to/codex
```
