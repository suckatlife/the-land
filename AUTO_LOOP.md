# AUTO_LOOP — the standing brief for Claude ↔ Codex turns

Read this file completely at the start of every turn. It is the contract.
It is not to be edited by either agent except where it explicitly says so.

## The mandate

You and another agent are alternating turns on The Land. Each turn: **watch the
world, then make one meaningful improvement, then write the handoff.** Not five
small ones. One thing a person would notice.

Read `CLAUDE.md` for how the project works and `STATE_2026-08-09.md` for where
it stands. `CLAUDE.md`'s invariants are non-negotiable.

## The turn, in order

1. **Look before you touch.**
   `scripts/loop/turn.sh before <turn-id>` — builds, serves, and shoots the
   world at 1, 5 and 10 minutes into `runs/<turn-id>/before/`.
   **Open the three frames and actually look at them.** The 1-minute frame is a
   near-empty neolithic world; 5 minutes is contested; 10 is late and dense.
   Most of what's worth fixing only shows in one of the three.
2. **Read `HANDOFF.md`** — the whole of the last entry, and skim the rest so you
   don't redo or undo something already tried. It is rotated, so "the rest" is
   the current week; `docs/archive/handoff/` holds everything before that and is
   worth a grep before you claim something is new.
3. **Choose one thing.** A feature, a fix, or a real improvement to something
   that already exists. Justify it from what you SAW, not from what sounds good.
4. **Build it.** Tuning constants first, architecture last.
5. **Prove it.**
   `scripts/loop/turn.sh after <turn-id>` — same three frames, into
   `runs/<turn-id>/after/`. The gate must pass. A failing gate means you do not
   hand off; you fix it or you revert your own change.
   The same run also writes `docs/turns/<turn-id>.jpg` — a before/after contact
   sheet, one image, both phases at every minute mark. **Commit it and embed it
   at the top of the PR body.** It is how the change gets reviewed from a phone
   without reading a diff, and it is the only artefact that shows what moved;
   a Vercel preview shows the world now and never the difference.
6. **Commit** on the loop branch, then **tag** the turn:
   `git tag turn-<NN>-<agent>` and push branch + tag.
   When the prompt says the outer automation owns git, leave the completed
   changes uncommitted in its isolated worktree. The driver validates, commits,
   tags, and pushes only after the gate passes.
7. **Append to `HANDOFF.md`** using the template at its top. Say what you saw,
   what you changed, what you verified, what you could NOT verify, and what you
   would look at next. Be honest about doubts — the next agent inherits them.

## Hard rules

- **Never touch `main`.** The loop lives on its own branch. `main` is what
  deploys to the live site; keeping the loop off it means the loop can never
  break production. Promotion to `main` is a human decision.
- **Never delete or move the `known-good-*` / `live-*` tags**, and never
  force-push a branch someone else's turn is tagged on.
- **Do not revert the other agent's work** unless it is actually broken, and if
  you do, say so explicitly in `HANDOFF.md` with the reason. Two agents quietly
  undoing each other is the main way a loop like this dies.
- **The build gate is not optional.** `npm run build` typechecks with
  `noUnusedLocals`; a red build never gets handed off.
- **No new runtime dependencies.** No network calls at runtime. No telemetry.
  (Standing project constraints — see `CLAUDE.md`.)
- **One turn, one change.** If you find three things, do one and write the other
  two into `HANDOFF.md` under "spotted, not done".
- **Backpressure: do not start new work while three or more pull requests are
  already waiting on Lawrence.** Count the open non-draft PRs before choosing a
  turn; at three or more, stop and say so rather than opening a fourth. The
  checkpoint in `scripts/loop/rounds.sh` bounds a single PR — this bounds the
  queue, and the bound is **review capacity, not agent behaviour**. A night that
  produces six PRs produces six *stale* PRs, diverging from each other and from
  `main`. Unreviewed work is not progress; it is inventory, and it rots. If the
  queue is full, shrink it instead: answer an outstanding review comment, rebase
  a PR that has fallen behind, or write a blocked question up so that answering
  it costs one reply.
- **Keep it small enough to review.** If a turn's diff is heading past ~400
  lines of source, stop and reconsider the scope.
- **Don't rewrite this file.** If a rule is wrong, argue for the change in
  `HANDOFF.md` and leave it to the human.

## Taste

The land is the protagonist; civilisations are weather. Painterly, not
photographic — soft edges, washes, muted palettes. Quiet wins. The acceptance
test is still: *can someone watch two minutes of calm and keep watching?*

If a change makes the world louder, busier or more saturated, it is probably
the wrong change.

## Turn ids

`NN-agent`, zero-padded, alternating: `01-claude`, `02-codex`, `03-claude`, …
