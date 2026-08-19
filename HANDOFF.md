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

---

## Turn 02 — claude — 2026-08-19

**Watched:** `runs/02-claude/before/` at 1/5/10 min (tick 2096 / 9189 / 18238,
era 0.25 / 1.94 / 4.46, 2→7→8 civs, ice 0 → 0.02 → 0.57, 2 FPS). 1 minute: a
bright clear morning, sparse settlement. 5 minutes: the best of the three — blue
sea, land reading clearly, settlement spread across three landmasses. 10
minutes: the Age of Industry under a flat olive-khaki sky, still broad daylight.

**A correction, because it would mislead you otherwise:** my first look at a
1-minute frame showed a flat lilac wash with a heavy vignette, and I nearly
built this turn around it. That frame came from an ABORTED gate run where the
sim never started (tick 0) — it was an artifact of the broken harness, not of
the build. The real 1-minute frame is a clear morning. I checked dread as the
suspected cause and it was not that either: at 60–90s pressure was only
0.15–0.29 with nothing brewing. The finding below came from measurement
instead.

**Chose:** Put the whole world back on one clock. Turn 01 correctly moved
history off Pixi's `deltaMS` (capped at 100ms to protect animation after a
stall) and onto raw `elapsedMS`, so a world lasts its advertised 10–17 real
minutes. But only history moved. The sky, seasons, weather, scars, camera
breathing, ruin decay and every story surface stayed on the capped clock, so
below 10 FPS they fell behind history.

Measured at 3 FPS over 85s, before the change:

| clock | rate vs wall clock |
| --- | --- |
| history | 1.05x |
| day/night, seasons, weather | **0.37x** |

A six-minute day was taking sixteen real minutes. That is why the 10-minute
before-frame was still in daylight: the world had reached the industrial age
having lived through barely half a day.

**Did:** `src/main.ts`, 19 lines. One `frameMS = Math.min(ticker.elapsedMS,
MAX_SIM_FRAME_MS)` computed once per frame and used for the sim accumulator
(unchanged behaviour), `updateAtmosphere`, `atmos.update`, the `dtSec` that
drives every story surface, camera breathing, and ruin decay. No
`ticker.deltaMS` remains in the main tick callback.

The safety property that makes this cheap: **above 10 FPS a frame is already
under the 100ms cap, so `elapsedMS` and `deltaMS` are identical and this is a
no-op.** It engages only where the divergence actually exists. Codex's
wall-clock fix and its `MAX_SIM_FRAME_MS` ceiling are preserved exactly.

Also fixed the harness, which had failed three runs in a row and is the
instrument every turn depends on: `observe.mjs` now waits for the doorway
button as ATTACHED rather than visible (the intro card animates in, so
Playwright's visibility check timed out on a perfectly real button) and clicks
it through `evaluate`; and the abort path now prints the collected page errors
instead of swallowing them, which is what hid the cause for two runs.

**Verified:** Both gates PASS, no page exceptions or console errors. Clock
ratios re-measured after the change: day/night **0.37x → 1.05x**, history
**1.05x → 1.05x** (unchanged). Tick totals at the three marks are within 1% of
the before run (2016 / 9308 / 18405), so history's cadence did not shift. The
10-minute after-frame is now night — moon, stars, city lights and smoke over
the industrial island — where the before-frame at the same age was still in
daylight. `runs/02-claude/{before,after}/`.

**Could not verify:** Nothing about real hardware. On a machine above 10 FPS
this change is inert by construction, so its entire benefit lands on slow
renderers and on this headless harness — I could not show it helps Lawrence's
own machine, because it should not do anything there. I also did not test a
backgrounded tab, so the 1000ms ceiling is still unexercised in practice (Turn
01 flagged the same gap). And the before/after runs used different seeds, so
composition differences between frames are not attributable to the change —
only the day-phase difference is, and that one is arithmetic.

**Spotted, not done:**
- The industrial-era sky is a flat olive-khaki over roughly a third of the
  frame (`ATMOS.era.moods.industrial.air = 0x99938a`). It is doing its job —
  soot — but reads as mud rather than as haze with light in it. This is the
  least painterly thing in the three before-frames and would be a good visual
  turn for someone.
- The `viewer-controls` bar sits visible along the bottom edge in every frame.
  The idle fade is supposed to take the chrome down after 4s; it does not seem
  to reach this element.
- Frame-rate-coupled eases (`EASE = 0.15`/frame, farm growth, alpha lerps) are
  still per-frame rather than per-second, so they settle slower on slow
  machines. Pre-existing and listed in `IDEAS.md`; deliberately out of scope.
- The two stranded commits from before the loop are still unmerged and
  unresolved (see Turn 00). Still worth a human decision before someone
  rebuilds succession or planetary biography from scratch.

**Next:** Turn 03 (codex) — the clocks are consistent now, so the frames you
get are trustworthy for the first time. Two suggestions, either is a good turn:
the industrial sky above, or the `viewer-controls` bar that never fades. If you
touch timing at all, re-run the clock check — it is three lines of
`page.evaluate` around `__atmosphere.timeOfDay()` and `__sim.tick` over ~90s,
and it is now the cheapest way to catch a regression in this area.
---
## Turn 03 — codex — 2026-08-19

**Watched:** The full before gate at 1/5/10 minutes. At 1 minute the world was
a balanced sunny composition (tick 2018, era 0.28, two civs); at 5 minutes it
had shifted into a muted mauve morning (tick 9311, era 2.29, eight civs); at 10
minutes it was a mature night world (tick 18396, era 4.74, four civs). That
night frame exposed two concrete visual failures: the phased moon read as a
tiny clipped white mark, and a large plague had replaced a central inhabited
district with an almost solid black tile mass. The before gate otherwise
reported no console errors or page exceptions.

**Chose:** Make plague look like an event happening *to* a place instead of a
rendering failure. The 10-minute frame made this the clearest meaningful
improvement. Lawrence separately and explicitly asked for the moon to stay
full, so that scoped cleanup accompanies the one loop-selected change.

**Did:** In `src/main.ts`, plague districts now receive a lighter,
tile-varied olive wash with a faint inner haze and brighter drifting motes. The
terrain, roads, buildings, and coastline remain legible through a mature
outbreak. In `src/atmosphere.ts`, removed the lunar phase accumulator and all
lens-shadow geometry; the existing glow, full disk, and subtle maria remain.

**Verified:** `npm run build` passed. The full after gate passed with no
problems at tick 2022 / 9302 / 18427 (era 0.26 / 2.15 / 4.62) at 1/5/10
minutes. The 10-minute night frame clearly shows a round full moon rather than
the clipped crescent. A separate debug-driven test advanced seed `842c59` to
tick 14444 with nine living civilizations, forced a plague, waited for its
spread, and captured it with zero page errors: afflicted land remained
readable and the black-map-hole effect was gone. Evidence is local under
`runs/03-codex/{before,after}/`; the targeted frame is
`/tmp/turn03-plague.png` for this session.

**Could not verify:** The before and after gates use different seeds, so their
compositions are not a pixel-for-pixel A/B test. The forced outbreak is a
deterministic functional check of the new renderer, but only Lawrence's display
can settle whether the new miasma should be a little stronger or weaker at full
resolution. Headless performance remained in the inherited 1–3 FPS range.

**Spotted, not done:** Claude's industrial-sky observation remains valid; the
olive air can still read as mud in daylight. The viewer controls *did* fade
correctly in all six valid frames this turn, so I could not reproduce that
item. Per-frame eases and the two stranded ecology/planetary-biography commits
remain unresolved as recorded above.

**Next:** Turn 04 (claude) — start from tag `turn-03-codex` and watch first.
The industrial atmosphere is still the strongest already-observed visual
candidate. If the new run exposes something more disruptive, trust the frames
and document why it displaced that candidate.
