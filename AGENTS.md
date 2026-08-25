# AGENTS.md

## The round limit — read this first

**Two review rounds per pull request, then a human decides.** Not a guideline;
the loop does not end on its own.

    push 1  ->  review 1  ->  push 2 (repair)  ->  review 2  ->  STOP

Why it needs a hard number: the builder always has one more improvement it could
make, and an exhaustive reviewer re-reads the whole diff each time and therefore
always finds something new. Neither side ever runs out. On PR #36 that produced
five pushes and six reviews in forty-five minutes, none of it asked for.

**Builder, before every push:** run `scripts/loop/rounds.sh <pr>`. It exits
non-zero when the limit is reached. If it says stop, do not push. Post a comment
saying what you changed, what you did not address and why, and that it is
waiting on Lawrence. Then stop — no further commits on that PR until he replies.

Keep a line in the PR body reading `Round N of 2` so the state is visible from a
phone without opening anything.

**Reviewer, on round 2:** the second review is a **verdict on round 1**, not a
fresh hunt. Answer only: were the blocking findings addressed, and is this ready
for a human? New non-blocking observations go in one line at the end, marked as
"next PR", never as blocking. A reviewer that opens a new front on round 2
guarantees a round 3.

**Either agent may stop early.** If the remaining findings are cosmetic or you
disagree with them, say so and hand it over. Stopping is not failure; it is the
protocol working.

Instructions for coding agents working on The Land. Codex looks for this file
by name; Claude reads `CLAUDE.md`. Both should read both.

- **`CLAUDE.md`** — the front door: how the project works, and its
  non-negotiable invariants. Rewritten from source on 2026-08-21, so where it
  and any older document disagree, **`CLAUDE.md` wins.**
- **`STATE_2026-08-09.md`** — an August briefing, kept for its design rationale
  and its list of candidate next features. **Historical: its factual claims and
  constraints describe 2026-08-09, not today** — the "no analytics" constraint
  in it has already been overtaken.
- **`REMOTE.md`** — the rules for working while Lawrence is away. **Read this
  before starting any remote task.**
- **`HANDOFF.md`** — the running log. Read the last entry; append your own.

## Code Review Rules

When reviewing rather than building, report in three buckets: blocking defects,
non-blocking concerns, and whether it is ready for a human to look at. On a
second review of the same PR, see the round limit above: judge the round-1
findings, do not open new ones. Focus on:

- Does it hold the invariants in `CLAUDE.md`? (no Pixi in `sim.ts`; snapshot
  before mutate; the `fadedDeadCivs` repaint; era set at civ birth; seed
  determinism — the sim draws from a seeded stream, so `Math.random()` anywhere
  in `src/sim.ts` is a defect that silently breaks shared world links.)
- Does the diff do ONE thing, and does its description match what it does?
- Does it claim visual verification it could not have performed? A cloud runner
  has no display. Claims like "looks correct" from an agent are not evidence.
- Does `npm run build` pass? It typechecks with `noUnusedLocals`.
