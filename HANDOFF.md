# HANDOFF — the baton

Newest entry at the BOTTOM. Append, never rewrite history.
Protocol: `AUTO_LOOP.md`. Safety anchor: tag `known-good-2026-08-18`.

## Template (copy this)

```
## Turn NN — <agent> — <date>

**Watched:** what the 1/5/10-minute frames actually showed. Name specifics.
**Chose:** the one thing, and which frame made you choose it.
**Did:** the change, in a few lines. Files touched.
**Verified:** gate result, plus anything you checked by eye.
**Could not verify:** be honest. Anything only a human at full resolution can judge.
**Spotted, not done:** things you noticed and deliberately left.
**Next:** what you'd look at, for the agent taking over.
```

---

## Turn 00 — setup — 2026-08-18

**Watched:** nothing yet; this entry exists to start the chain.

**State at handoff:** branch `auto-loop`, cut from `codex/world-legacy`
(`d81d40c`). Anchors: `known-good-2026-08-18` (this exact state) and
`live-2026-08-18` (`32e323b`, what the live site was serving).

**Open question inherited from before the loop:** two commits are stranded on
`fable-run-atmosphere-2026-06-11` and are NOT in this line of development —
`f182b03` (ecological succession over ruins) and `16fdc83` (planetary
biography: per-world temperament and life arc). They were built, verified and
pushed, then `main` moved on via PR #1 without them. Whoever picks this up
should NOT silently rebuild either feature. Ask the human whether to merge
them in first.

**Next:** Turn 01 (claude) — watch first, then choose.

## Turn 01 — codex — 2026-08-18

**Watched:** The full before gate on `loop-01-codex-before`. At 1 minute the
world was still sparse (`tick 618`, era `0.03`, one living civ); at 5 minutes
the scene had only modestly filled in (`tick 2952`, era `0.41`, four civs); at
10 minutes it was visually still an early world despite the night register
(`tick 5493`, era `1.09`, six civs). The renderer reported 3 FPS, and all three
frames showed the same underlying problem: history was advancing at roughly
one third of the advertised 30 ticks/second.

**Chose:** Make the simulation clock independent of render FPS. The 5- and
10-minute frames made this the highest-value fix: a world advertised as lasting
10–17 minutes could take much longer on slow hardware, so viewers would never
reach the late-era variation on schedule.

**Did:** In `src/main.ts`, the fixed-step accumulator now uses Pixi's raw
`ticker.elapsedMS` instead of its animation-safe, 100ms-capped `deltaMS`.
`MAX_SIM_FRAME_MS = 1000` prevents an enormous catch-up burst after a suspended
tab. Visual animation and atmosphere still use capped `deltaMS`; only history's
clock changed.

**Verified:** `npm run build` passed before and after. Both 1/5/10-minute gates
passed with no page exceptions or console errors. The after run reached
`tick 1979` / era `0.21` at 1 minute, `tick 9276` / era `1.94` at 5 minutes,
and `tick 18369` / era `4.34` at 10 minutes. Those totals match wall-clock time
including the harness startup checks, and the frames now show the intended arc
from early settlement to a dense Modern world. Evidence is local under
`runs/01-codex/{before,after}/`.

**Could not verify:** The headless renderer dropped from roughly 3 FPS to 2 FPS
while doing the correct amount of simulation work. The gate stayed stable, but
only Lawrence's real GPU/hardware can establish whether the added per-frame
catch-up has a noticeable rendering cost. I also did not background the tab for
more than a second to exercise the safety ceiling directly.

**Spotted, not done:** The sparse first-minute composition still depends heavily
on the seed, and the clock/HUD is very small in the captured 1600×900 frames.
Neither was changed because this turn was deliberately about cadence only.

**Next:** Turn 02 (claude) — run the before gate from this commit and look for
the next visible weakness. Pay particular attention to whether real-time history
at 2–3 FPS creates event bursts or jarring visual catch-up; if it does, preserve
the wall-clock guarantee but consider amortizing tick work across frames rather
than reverting to capped time.
