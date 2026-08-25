# AGENTS.md

## The round checkpoint — read this first

**After two review rounds on a pull request, stop and ask.** Not a cap on how
many rounds a PR may have — a cap on how many happen **without Lawrence
deciding**. He is the one who says keep going.

    push 1 -> review 1 -> push 2 (repair) -> review 2 -> CHECKPOINT

Why it needs a number: the builder always has one more improvement it could
make, and an exhaustive reviewer re-reads the whole diff each pass and so always
finds something new. Neither side runs out. PR #36 reached five pushes and six
reviews in forty-five minutes, none of it asked for.

**Builder, before every push:** run `scripts/loop/rounds.sh <pr>`. It exits
non-zero at the checkpoint. If it says stop, do not push. Instead comment with:

- what changed this round
- what is still outstanding
- **what you would do with another round** — so the reply can be one word

Then stop. No further commits on that PR until Lawrence replies.

**Lawrence resumes a checkpointed PR by commenting `@claude continue`.** One
comment does both jobs: `@claude` wakes the workflow, and `/continue` is what
`rounds.sh` reads as authorisation for another two rounds (`@claude continue 4` grants
four).

**Never lead the instruction with a slash.** The marker used to be `/continue`,
and Claude Code parses a leading `/word` as a slash command — so the request
evaporated, the runner woke, ran three seconds and pushed nothing, twice.
`@claude continue` avoids the collision and does both jobs in one phrase.

**The instruction must still say what to continue.** A woken runner has no memory of the
previous session — it reads the PR and nothing else. Either the builder's
checkpoint comment already says what it would do next (which is why stating that
is required), and `@claude continue` means "do that"; or the resume comment
carries the instruction itself:

> `@claude continue — address Codex's outstanding findings, one pass, then stop.`

A bare `@claude continue` on a PR with no stated next step wakes Claude, gets
"I'll analyze this and get back to you", and finishes in zero seconds having
done nothing. Observed on PR #36.

Plain `/continue` with no `@claude` grants the rounds but wakes nothing — it is
permission without a trigger, and the PR sits there. That is a fine thing to do
deliberately, when he means to start the turn from the Claude app himself, and a
confusing thing to do by accident. The builder must **never write
`/continue` itself** — Claude comments through Lawrence's GitHub account, so
that marker is the only thing that distinguishes his authorisation from the
builder's own summary.

Keep a line in the PR body reading `Round N of 2` so the state is visible from a
phone without opening anything.

**Reviewer, on round 2:** the second review is a **verdict on round 1**, not a
fresh hunt. Answer only: were the blocking findings addressed, and is this ready
for a human? New non-blocking observations go in one line at the end, marked
"next PR", never as blocking. A reviewer that opens a new front on round 2
guarantees a round 3.

**Either agent may stop early.** If what remains is cosmetic, or you disagree
with it, say so and hand over. Stopping is the protocol working.

## Code Review Rules

When reviewing rather than building, report in three buckets: blocking defects,
non-blocking concerns, and whether it is ready for a human to look at. On a
second review of the same PR, see the checkpoint above: judge the round-1
findings, do not open new ones. Focus on:

- Does it hold the invariants in `CLAUDE.md`? (no Pixi in `sim.ts`; snapshot
  before mutate; the `fadedDeadCivs` repaint; era set at civ birth; seed
  determinism — the sim draws from a seeded stream, so `Math.random()` anywhere
  in `src/sim.ts` is a defect that silently breaks shared world links.)
- Does the diff do ONE thing, and does its description match what it does?
- Does it claim visual verification it could not have performed? A cloud runner
  has no display. Claims like "looks correct" from an agent are not evidence.
- Does `npm run build` pass? It typechecks with `noUnusedLocals`.
