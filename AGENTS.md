# AGENTS.md

Instructions for coding agents working on The Land. Codex looks for this file
by name; Claude reads `CLAUDE.md`. Both should read both.

- **`CLAUDE.md`** — how the project works, and its non-negotiable invariants.
- **`STATE_2026-08-09.md`** — current state; supersedes `CLAUDE.md` where they
  disagree (`CLAUDE.md` describes a much smaller, older version of this project).
- **`REMOTE.md`** — the rules for working while Lawrence is away. **Read this
  before starting any remote task.**
- **`HANDOFF.md`** — the running log. Read the last entry; append your own.

## Code Review Rules

When reviewing rather than building, report in three buckets: blocking defects,
non-blocking concerns, and whether it is ready for a human to look at. Focus on:

- Does it hold the invariants in `CLAUDE.md`? (no Pixi in `sim.ts`; snapshot
  before mutate; the `fadedDeadCivs` repaint; era set at civ birth; seed
  determinism — the sim draws from a seeded stream, so `Math.random()` anywhere
  in `src/sim.ts` is a defect that silently breaks shared world links.)
- Does the diff do ONE thing, and does its description match what it does?
- Does it claim visual verification it could not have performed? A cloud runner
  has no display. Claims like "looks correct" from an agent are not evidence.
- Does `npm run build` pass? It typechecks with `noUnusedLocals`.
