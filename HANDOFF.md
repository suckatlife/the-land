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

---

## Turn 04 — claude — 2026-08-19

**Watched:** `runs/04-claude/before/` at 1/5/10 min (tick 2018 / 9325 / 18419,
era 0.26 / 2.25 / 4.72, 3 → 10 → 7 civs, ice 0 → 0.02 → 0.56). The moon reads
as a proper full disc now and plague districts stay legible — both of Turn 03's
changes hold up. What stopped me was the HUD: at 5 minutes it read
**"The Beginning · 3,000 BCE"** with eraProgress at 2.25, and at 10 minutes it
*still* read "The Beginning · 3,000 BCE" with eraProgress at 4.72.

**Chose:** The deep-time readout. It is the one piece of always-on signage, and
it was telling the viewer that nothing had happened for ten minutes while
industrial cities stood on screen.

Measured the cause in a mature world rather than inferring it:

| | |
| --- | --- |
| eraProgress | 5.0 (top of the arc) |
| HUD | "The Middle Ages · 1,500 CE" |
| living civs | medieval:648, industrial:415, neolithic:321, industrial:256, industrial:122, medieval:109, industrial:88 |

`dominantEra` returned the era of the single largest civ. Because a civ's era is
fixed at birth and never advances while it lives (a `CLAUDE.md` invariant), one
big long-lived society pins the readout for the rest of the world's life — and
the year is anchored to that era, so the calendar froze with it. The era floor
in `sim.ts` is working correctly; new civs *were* being born industrial. Only
the reading was wrong.

**Did:** Two things — the second at Lawrence's explicit request.

1. **`dominantEra` now reads the world's age across civs**: the most advanced
   era holding at least `ERA_READOUT.share` (15%) of settled tiles, falling back
   to the largest civ when nothing qualifies. If a third of the world is
   industrial, the world is in the industrial age whatever the biggest single
   blob is. The rank ratchets and never regresses (`displayedEraRank`, reset per
   world): the year hangs off it, and a year counting down reads as a bug rather
   than as a dark age. The sim invariant is untouched — this is a reading fix,
   not an era-advancement change.
2. **The speed control now moves the whole world.** `timeScale` multiplied only
   the history accumulator, so 4x raced the centuries while the sun, seasons and
   weather stayed at 1x — the identical split Turn 02 fixed for slow frame
   rates, still sitting on the button three lines away. There is now one
   `worldClock`: real elapsed time, capped against stalls, multiplied by
   `timeScale`, frozen while paused. All **12** `performance.now()` lifetimes
   (battles, quiet zones, ruin decay, wonders, forced plague/faith) moved onto
   it together — they had to move as one or they would disagree with each other.
   Side effect, by construction rather than measured: a paused world is now
   genuinely still, where battles and quiet zones used to keep aging.

Also pinned the harness to one seed (`SEED=loop-standard`, overridable). Turns
02 and 03 each had to write "before and after used different seeds, so this is
not a real A/B"; the before/after 10-minute frames this turn are pixel-identical
terrain. Civ history still diverges — `sim.ts` uses unseeded `Math.random`.

**Verified:** Build clean. Both gates PASS, no page exceptions or console
errors. Era fix proven by forcing the exact pathology: largest civ set to
neolithic with 978 tiles, everyone else industrial — HUD reported
**"The Age of Industry · 1,810 CE"** where the old code would have said "The
Beginning". Speed fix measured at 4x: the day/night clock ran at **4.23x** wall
time, where before it would not have moved at all.

**Could not verify:** The after-frames do **not** themselves demonstrate the era
fix — that run collapsed to two small medieval civs by 10 minutes, so "The
Middle Ages" was the honest answer for it and the pathology never appeared. The
synthetic test is the real evidence. I also could not get a clean tick-rate
number at 4x: the world reached its ending and rerolled mid-measurement, which
is itself evidence history was running ~4x, but it is not the number I wanted.
And nothing here was seen on real hardware.

**Spotted, not done:**
- The industrial sky is *still* the strongest visual candidate, now flagged by
  both of us across three turns. I passed on it again only because a frozen
  deep-time readout struck me as a worse defect than a muddy one.
- `ERA_READOUT.share = 0.15` is a guess. It is one constant and it decides how
  eagerly the world claims a new age; worth an eye at full resolution.
- 15% share plus the ratchet means a single brief advanced civ can permanently
  promote the readout. That is deliberate (deep time ratchets) but it is a
  taste call, not an obvious truth.
- Per-frame eases and the two stranded commits, still unresolved since Turn 00.

**Next:** Turn 05 (codex) — the industrial sky is yours if you want it; it has
outlived three turns of "spotted, not done" and I would rather you took it than
that it kept being deferred. Note that `dominantEra` now drives the era air as
well as the text, so a world will reach industrial soot sooner than it used to —
check the 10-minute frame against `runs/04-claude/before/t10m.png` before
deciding how much of what you see is your change and how much is mine.

---

## Turn 05 — claude — 2026-08-19

**Type: VISUAL** (Turn 04 was systemic — clocks and readouts — so this turn
rotates). Taking the industrial sky, which had been "spotted, not done" for
three consecutive turns and was therefore mandatory.

**Note on the record:** three commits landed between Turn 04 and this turn with
no handoff entry and no turn tag — `dc1831a` (loop automation scripts),
`edf925c` (moon reflections, 8x playback), `b603b2f` (celestial reflections
aligned to the observer). All authored under Lawrence's git identity. Two of
them touch `src/atmosphere.ts`, next door to this change. I shot a fresh before
gate rather than reusing Turn 04's after frames because the code had moved.

**Watched:** `runs/05-claude/before/` (tick 2016 / 9320 / 18380, era 0.3 / 2.32
/ 4.73). The 10-minute frame reads "The Modern Age · 2,040 CE" — Turn 04's era
fix working in a live run, no longer stuck at "The Beginning". The 5-minute
frame is the one that mattered: a heavy red-brown dome with the sea desaturated
to grey-brown and the land muddy olive. Crucially the HUD said "The Ancient
World", so **that mud was not industrial air at all** — it was a dread lean
going through the same path. Codex saw the same thing in Turn 03 and called it
"a muted mauve morning".

**Chose:** The cause under all three sightings. The glaze is a fullscreen
**multiply**, so any strong atmospheric lean — era air, dread, dusk — could only
ever darken and desaturate the entire frame at once. Land and sea converge on a
single dull hue and the sea stops reading as water. Real haze does the opposite:
it lifts the dark end and lowers contrast. The industrial sky was one symptom of
a general defect, which is why retuning the industrial colour alone would not
have fixed it.

**Did:** `src/atmosphere.ts` + one line in `src/main.ts`.
- New **airlight** layer: fullscreen, `screen` blend, tinted to the era's air,
  alpha = `eraAirCur.amount * ATMOS.era.airlight` (0.55). It lifts the darks
  toward the air's colour instead of pressing everything down. `visible` is
  false whenever alpha is negligible, so the clear early ages never pay for it.
- The glaze presses down less now the lift carries the air: the era term in
  `glazeAlpha` goes from `amount * 0.5` to `amount * 0.28`.
- Retuned the heavy eras. Industrial was `0x99938a`, a dark olive — as a
  multiply that is a grey filter. Soot in daylight is a warm ash: `0xbcae98`,
  amount 0.15 → 0.17. Modern and post lightened to match.

**Verified:** Build clean, after gate PASS, no exceptions. The attributable
evidence is a controlled capture, not the gate frames: with every civ forced to
industrial and the day pinned to midday, the frame is legible warm haze — blue
sea, green land, the veil thickening toward the horizon — where the same
conditions previously produced an olive dome. Layer confirmed live and doing
work: one screen-blend layer, alpha 0.067, tint `dacdb7`.

**Could not verify:** The before/after 5-minute pair looks like a large
improvement — sea blue again under the same warm sky — but I do **not** claim it
as proof. Dread level differs between the two runs (`sim.ts` uses unseeded
`Math.random`), and at 5 minutes the era is classical, where the airlight is
only ~0.03 alpha. Most of that difference is probably the dice. The forced
industrial capture is the real evidence. Nothing seen on real hardware, and the
screen blend is one more fullscreen quad in the late eras — where the frame is
already most expensive. Only Lawrence's FPS counter can settle that.

**Spotted, not done:**
- Industrial may now be too *clean*. The brief wants "smokier, hazier" and the
  forced-midday frame reads like a hazy summer day. `ATMOS.era.moods.industrial.amount`
  and `ATMOS.era.airlight` are the two dials; I stopped rather than tune blind.
- **Dread still goes through the multiply only.** It is the strongest lean in
  the system (`dreadSkyBlend` 0.8) and it produced the worst frame this turn.
  Giving dread its own airlight — or deciding it *should* stay oppressive — is
  the obvious follow-on and I would take it next if it were a visual turn.
- Untagged commits landing outside the protocol (see above). Worth a human
  decision about whether the loop record is meant to be complete.
- The two stranded commits, unresolved since Turn 00.

**Next:** Turn 06 (claude, systemic by rotation).

---

## Turn 06 — claude — 2026-08-19

**Type: SYSTEMIC** (Turn 05 was visual). Taking frame-rate-coupled eases, which
were explicitly deferred in Turn 02 *and* Turn 04 — twice, so mandatory. It is
also the last unfinished piece of the clock family Turns 01, 02 and 04 worked
through.

**Watched:** Reused `runs/05-claude/after/` as the before frames — same commit,
same pinned seed, so re-shooting would only have re-derived them (rule 4). Those
frames are the ones described in Turn 05.

**Chose:** Every ease in `main.ts` was written as a per-FRAME fraction tuned at
60fps, so transitions converged in a fixed number of *frames* rather than in a
fixed amount of *time*. A tile crossfade meant to take about a third of a second
took roughly four seconds at 5fps. Turn 01 put history on wall-clock time, Turn
02 the atmosphere and story surfaces, Turn 04 the lifetimes and the speed
control — the eases were the last thing still measuring time in frames.

**Did:** One helper next to the world clock:

```
let easeFrames = 1;
function ease(rate: number) {
  return easeFrames === 1 ? rate : 1 - Math.pow(1 - rate, easeFrames);
}
```

`easeFrames` is set once per frame from `worldSeconds * 60`, clamped to [1, 90],
and the twelve ease sites now call `ease(...)`: tile colour/alpha/border, biome
crossfade and settle, building slot alpha, mid-floor alpha, roof slide, energy
farms, skylines, farmland growth. No function signatures changed.

At 60fps `easeFrames` is 1 and `ease(r)` returns `r` exactly, so a machine that
was already keeping up sees no change whatsoever — the same safety property as
Turns 02 and 04. And because `easeFrames` comes off the world clock, 4x now
settles transitions four times sooner as well.

**Verified:** Build clean, after gate PASS, no exceptions. Measured rather than
inferred: at 1x/5fps `easeFrames` 13.0 and `ease(0.15)` = 0.879; at 4x
`easeFrames` 60.0 and `ease(0.15)` = 1.0. The 5-minute after frame shows no
popping or snapped transitions.

**Could not verify:** Whether transitions now feel too fast on real hardware.
At 20–30fps `easeFrames` is 2–3, so eases run 2–3x quicker than they did — that
is the intended 60fps timing, but it is still a change to the feel of every
crossfade in the app and only Lawrence can judge it. `BIOME_FADE` and the
skyline fade-out use a linear step rather than an exponential ease, so I scaled
those by `easeFrames` directly; that is correct for a linear ramp but it is a
different formula in the same commit.

**Spotted, not done:**
- Dread still goes through the multiply only (from Turn 05 — first deferral).
- Industrial may now be too clean (from Turn 05 — first deferral).
- Untagged commits landing outside the protocol; needs a human decision.
- The two stranded commits, unresolved since Turn 00.

**Next:** Turn 07 (claude, visual by rotation). Dread's airlight is the natural
one — it is now the strongest remaining lean going through a darken-only path,
and Turn 05's frames showed it producing the worst frame of the run.

---

## Turn 07 — claude — 2026-08-19

**Type: VISUAL** (Turn 06 was systemic). Taking dread's darken-only path, listed
in both Turn 05 and Turn 06 — twice, so mandatory.

**Watched:** Reused `runs/06-claude/after/` (same commit, same seed) per rule 4.

**Chose:** Turn 05 gave the era's air a lift but left dread — the strongest lean
in the system — going through the multiply alone at up to 0.55 alpha over the
whole frame. Turn 05's own before-frame was the evidence: the worst frame of
that run was a sepia dome with the sea desaturated to grey-brown, and the HUD
said "The Ancient World", so it was dread doing it, not era air.

**Did:** `src/main.ts` only.
- `DREAD.tintMaxAlpha` 0.55 → 0.40.
- New `dreadLift`: fullscreen `screen` blend, tinted to the brewing hue lifted
  halfway to white, alpha = `curDread * DREAD.liftMaxAlpha` (0.20). Sits above
  the tint and below the vignette, so the edges still close in. Hidden whenever
  alpha is negligible — which is most of a world's life.

Dread should feel oppressive, not illegible; the sky's lean
(`ATMOS.dreadSkyBlend` 0.8) is untouched, so the mood is intact.

**Verified:** Build clean, gate PASS, no exceptions. True A/B at held dread 0.95
(pressure pinned at 0.97 so the catastrophe never lands): the same frame with
the screen layers on and off. The 5-minute after frame at "The Ancient World ·
500 CE" — the same seed and era as Turn 05's muddy before-frame — now has a
blue-teal sea and separated land under the same warm sky.

**Could not verify — and a correction to my own emphasis:** the A/B shows the
lift's contribution is **modest**. Most of the improvement in this turn comes
from dropping the multiply 0.55 → 0.40; the lift adds a warm separation on top.
I would have overstated the new layer if I had not shot the pair. Also, the
no-lift capture disabled every screen-blend layer, so it was "no lifts" vs "both
lifts" rather than dread's alone — at classical era the era airlight is tiny, so
this is close to but not exactly the isolated comparison. And nothing seen on
real hardware.

**Spotted, not done:**
- **I have now added two fullscreen screen-blend quads in three turns** (era
  airlight, dread lift) and measured neither one's fill cost. Both are gated to
  invisible when weak, but the late-era frame — already the most expensive — now
  carries one more blend whenever the air is heavy. This is the clearest thing I
  owe the project and could not do headlessly at 1–3 FPS.
- Industrial may be too clean (Turn 05, now twice).
- Untagged commits outside the protocol; the stranded commits. Both human calls.

**Next:** Turn 08 (claude, systemic by rotation).
