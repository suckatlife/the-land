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

---

## Turn 08 — claude — 2026-08-19

**Type: SYSTEMIC** (Turn 07 was visual). Fourth and final turn of this run.

**Watched:** Reused `runs/07-claude/after/` (same commit, same seed) per rule 4.

**Chose:** The sim's unseeded randomness. I have caveated it in three separate
handoff entries — "before and after used different seeds, so this is not a real
A/B" — and Codex wrote the same caveat in Turn 03. It also reaches the viewer:
there is a **share** button, and until now a shared seed reproduced only the
coastlines. The same seed grew the same map and then a completely different
civilisation on it.

**Did:** Seeded history off the world seed.
- `sim.ts`: a module-level `simRand`, reset per world by `resetSimRandom(seed)`
  from `createSimWorld(w, h, seed)`, and **54 `Math.random()` sites** replaced
  with `rand()`. `mulberry32` was already exported from `biomes.ts`, where the
  terrain has always been seeded — history simply never used it.
- `names.ts`: the same treatment for its 3 sites (`resetNameRandom`, called
  from `resetSimRandom`). This was found by the test, not by reading: with only
  `sim.ts` seeded, two runs of one seed produced **identical** civ counts, built
  and ruin tile counts — and completely different civilisation names.
- `main.ts`: the three `createSimWorld` call sites pass `currentSeed`.

**Verified:** Build clean, gate PASS, no exceptions. Determinism proven at an
identical tick — dismissing the doorway and pausing in a single `evaluate` so no
live tick can slip between them, then three skips to exactly tick 15000:

| run | tick | civs | built | ruin | names |
| --- | --- | --- | --- | --- | --- |
| A | 15000 | 19 | 1990 | 1202 | Ashgrimcross / Blackfoundry / Duncaershire… |
| B | 15000 | 19 | 1990 | 1202 | *identical* |
| other seed | 15000 | — | — | — | differs |

Two earlier attempts at this test failed for reasons worth recording: the first
compared runs that had drifted to different tick counts (15170 vs 15129), the
second to a one-tick difference. Neither was a determinism failure — both were
the test being wrong.

**Could not verify:** That a full 17-minute world replays identically. I proved
it to tick 15000 through the skip path; live play adds renderer-driven events
(the debug menu, forced catastrophes) that legitimately perturb the stream. Also
untested: whether any *renderer* behaviour still feeds back into sim ordering.
And the harness still samples by wall-clock, so before/after frames still land
on slightly different ticks (2038 vs 2022) — a future turn could sample by tick
and finally get pixel-comparable pairs.

**Spotted, not done:**
- **The fill cost of the two screen-blend layers I added in Turns 05 and 07 is
  still unmeasured.** This is the thing I most owe the project and cannot do at
  1–3 FPS headless.
- Industrial may be too clean (Turn 05).
- Untagged commits outside the protocol; the two stranded commits. Human calls.

---

# State of the loop — after Turns 05–08 (claude, self-rotating)

**Shipped:** 05 airlight, so heavy skies lift instead of only darkening ·
06 eases measured in time rather than frames · 07 dread darkens less and
scatters more · 08 history seeded from the world seed.

Turns 01–08 have now closed one complete theme. Every clock in the world runs on
wall time (01, 02), scales with the speed control (04), and settles in real
seconds (06); the world's age is read honestly (04); the atmosphere lifts as
well as presses (05, 07); and a seed now reproduces a world (08).

**Still deferred, and honestly:** the fill cost of my own two new layers;
whether industrial is now too clean; per-turn frames that still land on
different ticks.

**Needs Lawrence, not an agent:**
1. The two stranded commits (`f182b03` succession, `16fdc83` biography) —
   unresolved since Turn 00, eight turns ago. Someone will rebuild one.
2. Untagged commits landing outside the protocol — is the loop record meant to
   be complete or not?
3. **Repairs vs features.** Eight turns have produced eight repairs and zero
   features. That is what "make it better" plus a screenshot gate reliably
   selects for. The camera, succession, planetary biography — none will happen
   until the brief names them.
4. Everything visual here was judged at 1600x900 headless at 1–3 FPS. The three
   atmosphere turns need one real look.

---

## Product analytics handoff - codex - 2026-08-19

This work is outside the automated visual loop above.

**State:** Branch `codex/privacy-analytics-feedback`, commit `9fb767a` (`Add
privacy-conscious product analytics`), based on live `main` commit `4f34f14`.
The branch is committed and clean, but has not been pushed, merged, or deployed.

**Implemented:**

- Added a typed analytics wrapper in `src/analytics.ts` using
  `@vercel/analytics`. All product call sites go through `trackEvent`, so the
  provider can be replaced without touching the simulation UI again.
- Tracks one visit per browser-tab session with new/returning status; 1-, 5-,
  and 10-minute visible engagement; successful native/clipboard shares;
  successful fullscreen changes; successful Stay Awake changes; PWA install;
  Chronicle toggles; and manual/automatic new-world generation.
- Strips query parameters and fragments from every analytics URL, so seeds and
  viewing options are not sent. Sends no Chronicle text, world data, account
  data, or persistent user ID. Do Not Track and Global Privacy Control disable
  analytics entirely.
- Updated `public/privacy/index.html` with the analytics disclosure.
- Added a small feedback link under About, leading to `/support/`.
- Documented the event contract and privacy rules in `ANALYTICS.md`.

**Verified:** `npm run build` passes. `npm audit --omit=dev` reports zero
vulnerabilities. `git diff --check` passes. Built output contains the privacy
and feedback changes, and every requested event has an audited call site.

**Could not verify:** A complete browser click-through. The Linux Playwright
browser is missing `libnspr4.so`, and the Codex in-app browser connection is
currently blocked by the WSL sandbox-helper error. Do not describe this as
fully browser-tested until you run it yourself.

**Important provider decision:** Vercel Web Analytics is cookie-free and a good
fit, but Vercel currently restricts custom events to Pro/Enterprise. Before
shipping, determine Lawrence's Vercel plan:

1. If Pro/Enterprise: enable Web Analytics in the Vercel project, deploy this
   branch, then verify pageviews and every custom event in the dashboard.
2. If Hobby: do not pay for Pro solely for this. Keep the `trackEvent` contract
   and switch only `src/analytics.ts` to a privacy-restricted provider such as
   PostHog: autocapture off, session recording off, person profiles never,
   memory-only analytics persistence, DNT/GPC respected, and no seed/URL query
   data. This requires a project key and host environment variables. Update the
   privacy page and dependency list if the provider changes.

**Browser verification checklist:**

- First tab session emits one `visit_started`; reload does not emit another;
  a later fresh session reports `returning`.
- Engagement emits exactly once at 1, 5, and 10 visible minutes and pauses while
  the document is hidden.
- Native share and clipboard fallback count only after success.
- Fullscreen and Stay Awake count only successful state changes.
- `appinstalled` and first standalone launch count a PWA installation only once.
- Chronicle and new-world events have no duplicate handlers.
- Inspect outgoing pageviews/events from a URL containing `?seed=...#...` and
  confirm the transmitted URL contains neither query nor fragment.
- With DNT or GPC enabled, confirm no analytics script or event is sent.

**Potential follow-up:** Analytics currently initializes on the main world
experience. The static About, Privacy, Terms, and Support pages are not included
in pageview tracking. Decide deliberately whether those pages matter before
expanding coverage.

### Ready-to-use Claude prompt

> Continue The Land from the product analytics handoff at the bottom of
> `HANDOFF.md`. Read `CLAUDE.md`, `ANALYTICS.md`, and the full new handoff
> entry before changing anything. Start on branch
> `codex/privacy-analytics-feedback` at commit `9fb767a`; do not discard or
> recreate the existing work. Review the diff for privacy and event-quality
> issues, determine whether the Vercel project is Hobby or Pro, and follow the
> provider decision recorded in the handoff. Then run the complete browser
> verification checklist, fix any failures or duplicate events, and update both
> `ANALYTICS.md` and the Privacy page if implementation details change. Keep
> seeds, shared URLs, Chronicle text, persistent identities, autocapture, and
> session recording out of analytics. Build and test before committing. Do not
> push, merge, or deploy until Lawrence explicitly authorizes it. Finally,
> append your own concise entry to `HANDOFF.md` describing what you reviewed,
> changed, verified, could not verify, and recommend next.

---

## Remote review trigger — claude — 2026-08-21

Outside the visual loop; docs only (`REMOTE.md`, PR #6).

**Did:** Recorded how Codex gets started. Neither agent can start the other.
Codex's *Auto review* (chatgpt.com/codex/settings/code-review, desktop only)
is set to **On every push**, so it reviews the first push and any repair push
unasked; drafts are a signal to Lawrence, not to Codex, so the builder pushes
once, when the change is whole. The repair step stays manual on purpose:
Claude auto-fix + Codex review-on-push would close a loop with no human in it.

**Verified:** The push trigger works, and PR #6 was itself the test. Nothing
arrived on open or on the first three pushes; the first `@codex review` got no
reply; the second, 43 min later, produced a review in 3 min — and then the
next push was reviewed **automatically** 4 min later, unasked (review
`4994365177` on commit `2de2dc9`; no `@codex` comment after 14:20Z). So *On
every push* is live and the comment fallback works.

A correction worth keeping, since it is the failure this repo exists to catch:
the first version of this entry said the push trigger was "not yet shown
working". That was true when written and false twenty minutes later, and the
event that disproved it was the review of the commit containing the claim.

**Could not verify:** Why the first hour was silent. An unconnected repo and a
silent rate limit (credits use off) are indistinguishable from GitHub. If
reviews stop again, check connection **and** quota before changing the trigger.

**Next:** Nothing further to test here. Codex's banner lists "Mark a draft as
ready" as a trigger, so *On PR open* + undrafting stays the documented
alternative if review quota ever needs conserving.

---

## Doc archaeology — claude — 2026-08-21

Issue #7, part one of the consolidation. No `src/` changes.

**Archived** (via `git mv`, so blame survives) into `docs/archive/`: the seven
`WINDOW_*_NOTES`, `RUN_LOG`, `FABLE_RUN_SUMMARY`, `BRIEF`, `OBSERVATIONS`,
`JOURNAL`, `PLAN`, `STATE_2026-06-10` — 14 files, ~1,400 lines. Added
`docs/archive/README.md` explaining what the folder is and, specifically, that
`BRIEF.md` is where the project's aesthetic direction and its two acceptance
tests are actually written down. That is why none of this was deleted: the June
material was read in August to answer "what is this project for" when the code
could not say.

**Rewrote `CLAUDE.md`** (84 lines describing a four-module June project → 138
lines describing this one). Every claim was checked against source rather than
carried over from the old file or from `STATE_2026-08-09.md`:

- module table counted with `wc -l` (main.ts is 8421 lines, not the 1527 the old
  file implied)
- time registers read from the constants (`worldCycleTicks` 30000,
  `ATMOS.day.cycleSeconds` 360, `season` 1200, `ticksPerSecond` 30)
- every invariant grep-verified as still present: 0 Pixi imports in `sim.ts`,
  **0 `Math.random()` in `sim.ts`**, `resetSimRandom` present, `fadedDeadCivs`
  present, `maxDecaysPerCivPerTick` present, `snapshot` present
- documented what did not exist in June: world form and `CivBehaviour`, the
  seeded character, ice, succession, quiet zones, endings, analytics, the
  single world clock, and the doorway that holds the sim at tick 0

**Verified:** `npm run build` passes. No files under `src/` touched.

**Could not verify:** nothing visual — this turn changed no rendering. The
performance claims carried into `CLAUDE.md` (fill-bound, not object-bound;
sprite batching measured twice as a non-issue) are inherited from earlier
sessions and were not re-measured here.

**Spotted, not done:**
- `IDEAS.md` still lists shipped features as ideas (ice ages, succession,
  planetary biography). Its own small turn.
- `STATE_2026-08-09.md` predates the world-form work and is now partly stale. It
  either needs a refresh or should be archived once `CLAUDE.md` carries the load.
- `HANDOFF.md` is past 700 lines and grows every turn. It needs a rotation
  policy — current sprint in root, older entries to `docs/archive/` — or it
  becomes the next file nobody reads.
- `DEPENDENCY_NOTES.md` is 6 lines and predates both PostHog and Playwright
  being added.

**Also, after review:** Codex found that rewriting `CLAUDE.md` was only half
the job — `AGENTS.md` and `STATE_2026-08-09.md` both still said STATE supersedes
`CLAUDE.md`, on the grounds that `CLAUDE.md` "describes a much smaller, older
version", which this turn made false. Worse, STATE lists "no
telemetry/ads/analytics" as a *hard constraint*, and analytics shipped in PR #3;
an agent following the documented precedence could have deleted a merged
feature to satisfy it. Precedence flipped in `AGENTS.md`, historical banner
added to STATE, the stale constraint annotated rather than rewritten (the file
is a dated record), and STATE's pointer to `STATE_2026-06-10.md` repaired to its
new archive path.

**Spotted, not done — a real code bug, found by Codex while reviewing this
doc PR:** `maybeGhost` (12s), `updateFestival` (45s) and `checkWarQuiet` (45s)
in `src/main.ts` still timestamp their lifetimes with `Date.now()`, so they run
while the world is paused and ignore the speed control. Turn 04 moved 12
`performance.now()` lifetimes onto `worldClock` and missed these because they
use a different call. Not fixed here — this PR touches no `src/`. The claim in
`CLAUDE.md` has been narrowed to match reality instead.

**Next:** Turn B — the master plan for shipping publicly and monetizing, now
that the foundation says true things. Codex's commercial analysis (pricing, the
soft-launch sequence, the argument against ads) should be an input to it, not
re-derived.

---

## Remote review trigger — the missed fix — claude — 2026-08-21

Outside the visual loop; docs only. A repair of PR #6, which merged without it.

**What happened:** Codex's third review of PR #6 found a real hole in the
guardrail that PR added. "Build, then push once" plus a fresh branch means the
only push happens *before* the PR exists — and the trigger is a push to an
**open** PR, so nothing fires. Opening the draft did not produce a review
either, so there was no second path to the first review. The fix was written
and pushed to `agent/handoff-signal` 18 minutes after PR #6 had already been
merged, so it went nowhere. This PR lands it.

**Did:** `REMOTE.md` only. Step 2 and the draft-PR guardrail now say: open the
draft PR early, from the first commit, then land the finished change on it in
one push. Keeps the one-push property that avoids spending review quota on
half-built work; guarantees the push has an open PR to trigger on.

**Verified:** Nothing to build — docs. The ordering claim is from this repo's
own observed behaviour, recorded in the entry above.

**Worth knowing:** an agent reported this fix as "pushed to the PR" when the
PR was already closed. Check `merged_at` before reporting a push as landed;
`updated_at` on a merged PR equals the merge time and reads like an update.

**Also in this PR — two new guardrails, both earned today:**

- *One agent per working copy.* Two sessions shared this checkout. One
  committed while the other had switched branches underneath it, so the commit
  landed on the wrong branch; the first session then read its own commit in a
  diff and twice reported that the other PR already contained the fix. It did
  not. Caught by comparing `origin/<branch>` refs directly.
- *Confirm a push actually landed.* `git push` exiting 0 proved nothing here —
  it had pushed a different branch. Check `git rev-parse origin/<branch>`, and
  check `merged_at` before calling anything landed.

**Next:** Nothing pending. The trigger work is complete once this merges.

---

## Ask for the review, every time — claude — 2026-08-21

Docs only, `REMOTE.md`. Prompted by Lawrence after noticing PR #10 had gone
unreviewed.

**Why:** the contract said Codex reviews on every push and Lawrence does
nothing. Across today that held for one 86-minute window out of three-plus
hours: 6 automatic reviews between 14:18 and 15:44, and nothing before or
after, across 9 pushes. **PR #9 merged having never been reviewed at all**,
and the agent that pushed it did not notice — it read the silence as "no
findings" rather than "no review", which is exactly the failure this file
already warns about and still walked into.

Counted properly from the API, after two goes at it by estimate that Codex
caught as inconsistent: **10 explicit requests produced 5 reviews**; 6 more
reviews arrived automatically, all between 14:18 and 15:44.

The failures cluster: PR #11 was answered 3 times out of 3 (16:21, 16:29,
16:38) while PR #10 had four consecutive requests ignored (16:18–16:30) in the
same minutes. So this is **not** a plain global rate limit — a single PR can go
dark while another is reviewed normally. #10 is the only PR touching
`src/main.ts` (8.4k lines); a diff Codex struggles with is the better suspect.
That does not change the rule, but it does change what to check first.

**Did:** Made the comment the primary trigger rather than the fallback. Step 3
of the loop, the builder's obligations, and the draft-PR guardrail now all say
the builder comments `@codex review` on every push that lands **finished**
work — the first complete push and each repair push — but not on the
draft-opening push, which step 2 makes deliberately incomplete. Then it
confirms a review by **Codex** exists at the current head, since that API
endpoint lists every reviewer.
Replaced the "the push trigger works" claim — written this morning off two
observations — with the full day's table, which does not support it.

**Verified:** Nothing to build. The table is from the GitHub API: review
timestamps per PR against push timestamps.

**Corrected in review:** the first version of this rule said to comment and not
wait, and claimed the comment "has never failed". Codex pointed out that my own
evidence table recorded an ignored request, so the rule as written could still
let an unreviewed PR reach the gate — the exact failure it was meant to stop.
While fixing that, a second request went unanswered live, on PR #10's `39d1360`.
So the rule is now ask **and confirm**: check that a review exists whose
`commit_id` is the current head, comment again after ~5 minutes, and escalate
rather than proceed if a second request is also ignored. The gate section now
tells Lawrence to check for a review against the commit he is merging.

**Next:** Nothing pending. If the automatic trigger becomes reliable the rule
costs one redundant comment per push, which is the right side to err on.

---

## The last Date.now() lifetimes — claude — 2026-08-21

**Type: SYSTEMIC.** Closes the clock family opened in Turn 01.

**Chose:** Not chosen from frames — handed over. Codex found it while reviewing
the `CLAUDE.md` rewrite (#8): the new front door claimed "a paused world is
genuinely still", and it was not. The claim was narrowed there and the bug
recorded; this is the repair.

**Did:** `src/main.ts`. Turn 04 moved twelve `performance.now()` lifetimes onto
`worldClock`; these were missed because they call `Date.now()` — a different
function, the same bug, a few lines away. Since the ticker returns early while
paused, nothing ran *during* a pause; the damage landed on **resume**, when
`Date.now()` had jumped the full pause and a lifetime was already expired.

Moved, with thresholds converted from ms to world seconds: `maybeGhost` (12s),
`updateFestival` (45s, and its `Math.sin(now/280)` pulse → `/0.28`), and the
war-narration block — which turned out to hold **four** coupled timers, not the
one named in review: `warHeat.lastTs`, `warHeat.narratedAt`,
`lastWarNarrationTs`, `WAR_GLOBAL_GAP_MS` at 45/60/150s. They had to move as a
unit or they would disagree with each other, exactly as Turn 04 found.

Two epoch artefacts preserved on purpose: `lastWarNarrationTs` starts at
`-Infinity` (at 0 on a zero-based clock it would gate the first war line for
60s), and `narratedAt === 0` stays the never-narrated sentinel.

**Left on `Date.now()` deliberately:** `worldStartedAt`/`observedMs` and the
archive's `endedAt` — real viewing time and a persisted timestamp. The event
log's lifetime, dedup window and civ-mention highlight stay on the wall clock
too, but for a narrower reason than I first wrote: the dedup window governs how
often a *person* sees a repeated line, and at 8x a world-clock lifetime would
cull a line after 1.2 wall seconds, which is unreadable.

**A correction to that rationale, found in review:** I first justified it as
"a paused world should still let a line finish fading while someone reads it".
That is false. `updateEventLog()` and `updateBars()` are called at
`src/main.ts:7453-7454`, *after* the `if (!running) return` at 7017, so during
a pause the log does not fade — it freezes, and the first resumed tick culls
everything older than `LOG_LIFETIME_MS` (9.5 s) at once. The wall clock is
still the right choice for readability at speed, but the pause behaviour is
freeze-then-cull, not graceful fade.

**Verified:** Build clean. Measured headless against the built bundle through a
new `__clocks()` handle — running 3s → world +3.08s / wall +3125ms; **paused
6s → world +0.27s / wall +6345ms**; resumed 2s → world +2.02s / wall +2296ms.
World time is frozen across the pause; the 0.27s is the frames between the
reading and the click landing. Speed-control compression follows by
construction (`worldSeconds *= timeScale`) and was measured in Turn 04.

The harness needed the no-sudo WSL recipe again: `apt-get download libnspr4
libnss3 libasound2t64` into `/tmp/pwlibs`, `dpkg -x`, then run with
`LD_LIBRARY_PATH=/tmp/pwlibs/extract/usr/lib/x86_64-linux-gnu`. Ephemeral — it
needs redoing after a reboot, and it is what blocked Codex's analytics
click-through.

**Could not verify:** Anything visual. The festival and ghost are night
surfaces; whether a festival that now gets its full 45 s of *world* time reads
well at 4x is a preview judgement. One pre-existing console 404, unrelated.

**A regression this turn introduced, caught in review:** mixing a world-time
threshold with a wall-time gate re-created the very bug being fixed.
`checkWarQuiet` fires at 45 *world* seconds, but `pushNarration`'s dedup window
is `NARRATION_GAP_MS.low` = 6 *wall* seconds — so at 8x the quiet line arrives
5.6 wall seconds after the last one, is refused, and `warHeat.delete(k)` threw
the entry away regardless, losing the "border falls quiet" follow-up for good.
Now the entry is kept and retried when narration is refused, bounded by
`QUIET_RETRY_UNTIL_SEC` (120) so `warHeat` cannot grow without bound. Worth
remembering: converting a timer to world time means auditing every wall-time
gate it talks to.

**Spotted, not done:**
- **The event log culls on resume.** Pause for longer than 9.5 s and every
  visible narration line vanishes on the first resumed tick — the same
  freeze-then-expire shape this turn fixed elsewhere. Three ways out and they
  are a taste call, not an obvious truth, so I left it: move it to `worldClock`
  (pause holds, but at 8x lines last 1.2 wall seconds); drive the chrome from
  an *ungated* ticker so it fades normally even while paused (probably the
  right answer, and the largest change); or accept it. Lawrence's call.
- The verification was a throwaway script. This project has now had four clock
  bugs (Turns 01, 02, 04, this one) and each was verified ad hoc. A permanent
  `scripts/verify-clocks.mjs` would be proportionate; left out to keep this
  diff to one change.
- `STATE_2026-08-09.md` is now demoted but still lists candidate features; a
  future turn should decide whether it is refreshed or archived.

**Next:** Turn B — the shipping/monetization plan, unchanged from #8's entry.

---

## Clean reviews are comments, not reviews — claude — 2026-08-21

Docs only, `REMOTE.md`. A correction to the entry two above, which shipped with
a bug in its own verification method.

**What went wrong:** I reported PR #10 as unreviewed across four ignored
`@codex review` requests, escalated it in the PR, and built a theory that
Codex chokes on large `src/main.ts` diffs. All of it was false. Lawrence caught
it: Codex had reviewed #10 twice at its exact head and found nothing.

Two counting bugs, both mine:

1. **Codex answers in two places.** With findings it posts a *review* object
   with inline comments. With none it posts an ordinary *issue comment* —
   "Codex Review: Didn't find any major issues" — and creates no review object.
   My confirmation query read `/pulls/<n>/reviews` only, so every clean review
   read as no review. The rule I had just merged encoded this, which means it
   would have reported "unreviewed" on every clean PR from then on.
2. **I counted Codex's answers as my unanswered questions.** I found requests by
   grepping comment bodies for `@codex review`; Codex's own replies quote that
   string in their collapsible footer, so its two answers were tallied as two
   more ignored requests by me.

**Corrected numbers:** 11 explicit requests, **10 answered**. The single failure
was the first, at 13:32, before the connector was working. The automatic trigger
remains unreliable — 6 reviews, all inside one 86-minute window — and #9 still
merged unreviewed, so the ask-and-confirm rule stands. But the "silence
clusters on one PR / big diffs jam Codex" claim is withdrawn; there is no
evidence for it.

**Did:** `REMOTE.md` now documents both response shapes with a query for each,
notes that a review against an earlier commit and the "create an environment for
this repo" setup message are not answers, and says to filter requests on
`.user.login` rather than by grepping for the trigger string. Retracted the
false escalation comment on #10 in place.

**The lesson, which is the same one this file keeps teaching:** I verified
against my instrument instead of against the thing. The instrument had never
been checked against a known-clean review, so its silence meant nothing — and I
reported that silence as fact three times before being corrected.

**Next:** Nothing pending.

---

## Plan — apocalypses that end a world — claude — 2026-08-21

Proposal only, no code. `docs/plans/world-endings.md`. Lawrence asked for the
reset to stop being anticlimactic and for several distinct apocalypses, and
asked for options as a plan for Codex to review.

**The diagnosis, which is sharper than "it feels flat":** `beginWorldEnding()`
is five lines. At `endTick` the world is *replaced* — `resolveWorldEnding()`
classifies it retrospectively, `resetWorld()` swaps it, and the viewer gets
0.7s of black and a 1.8s fade. Nothing is unmade. No tile changes state, no civ
falls. `WORLD_ENDINGS` is a caption applied after the fact, so a world that
never flooded can be titled *The Drowned World*.

**The scale problem, measured:** the map is 9,216 tiles and `severeRadius` 32
already covers ~35% of it. A bigger circle cannot read as an apocalypse — it
has to differ in kind, global by construction, and slow enough to watch.

**Proposed:** a four-act ending (omen ~40s / onset ~12s / unmaking ~35s /
**silence ~15s**) in world-seconds so it obeys pause and the speed control;
six candidate endings of which only three are disasters; and phase 1 that ships
the *shape* for every world with no new apocalypse at all.

**Two things I want argued with in review**, both flagged in the doc: whether
"slow and large, not fast and bright" genuinely reconciles an apocalypse with
the brief's calm test or is a rationalisation; and whether holding a dead world
for 15 seconds is the best second in the sequence or just dead air.

**Also noted:** `garden`, `exodus` and `world_empire` should never explode.
Making every ending spectacular would turn spectacle into wallpaper and cost
the calm test, so the plan keeps a quiet end.

**Two P1s from review, both real holes in the design, both verified in source
before accepting:**

1. *Civs do not die just because you hit them.* `sim.ts:1853` clamps every
   catastrophe to a 0.05 vitality floor, `decliningDuration` is 1500 ticks
   (~50 world-seconds, longer than acts 3 and 4 together), and a declining civ
   can rally. So reusing the catastrophe path would have produced an apocalypse
   that visibly destroys the land while every civ survives it. New §5a gives
   the apocalypse a terminal path — and states that the goal is not "everything
   dies" but "whatever deaths it causes complete before act 4".
2. *Locking the kind early would corrupt the archive.* Moving the
   `resolveWorldEnding()` call to 85% would snapshot `epitaph` and
   `highestEra`, which `archiveCurrentWorld()` persists — so the Chronicle
   would describe the world as it was *before* its own ending. New §8a splits
   `commitEndingKind()` at 85% from the full resolution at the true end.

Both were failures of the same kind: assuming reuse of existing machinery gives
behaviour the machinery was explicitly written not to give.

**A third round, and one self-inflicted wound worth recording:** review found
that committing the ending kind at "~85% of life" breaks the short worlds —
`lifeFraction` bottoms out at 0.58, so the shortest world is 17,400 ticks (580s)
and 85% leaves 87 seconds for a 102-second sequence. A fixed *fraction* was the
wrong parameterisation for a fixed-*duration* sequence; the commit tick is now
derived as `endTick - SEQUENCE_TICKS - margin`. Review also caught that the
quiet ending needs a scheduled fade for exactly the reason the apocalypse needs
a terminal path, and that `commitEndingKind` cannot score `drowned` without the
biome map.

Separately: my own edit script silently dropped a block — it wrote the file
without applying that replacement — so two open questions were missing from the
previous commit and I did not notice until re-reading the file. Assert on every
replacement, and diff the result rather than trusting the script exited 0.

**Round four — the most valuable one.** Four findings, and one of them broke
the plan's selection mechanism outright: `WorldEndingKind` has no earthquake
member and one `ash` member, so The Shaking was unreachable and Impact vs
Supervolcano was undecidable. The plan now separates `ApocalypseKind` (what
happens, committed at `commitTick`) from `WorldEndingKind` (what the card says),
joined by an explicit map, with `sundered` proposed as an eighth title.

Also: the ember guarantee (`sim.ts:1600-1615`) pads protected civs up to
`emberCount` and skips them for both tile damage and vitality — so late in a
world, when one or two civs remain, *every* civ is immune to *every* hit and the
proposed terminal threshold could never fire. It becomes a per-apocalypse
survivor count. Birth paths keep running during the ending, so a civ founded in
act 3 outlives it. And repeated fragment events would inflate
`severeCatastrophes`, archiving one impact as "10 great disasters" — the
epitaphs interpolate those counts.

The pattern across all four rounds is one mistake repeated: **assuming existing
machinery will do something it was explicitly written not to do.** The vitality
floor, the ember guarantee, the decline timer and the birth loop are all working
as designed; the plan just wanted them to behave differently at the end of the
world.

**Round five** closed the last of the "existing machinery won't do that" family:
`maybeBreakaway()` is a *fourth* birth path that inserts a rising civ directly
every 15 ticks; `world.brewing` and `stepVolcanoes()` keep firing, so an
ordinary flood could arrive mid-Impact; the ember guarantee is recomputed per
hit so a *count* lets survivor identity drift, and the apocalypse needs a
persistent survivor set chosen from its own geometry; and a single-valued
cause→title map cannot reach four different quiet titles, so the commit returns
the pair.

Five rounds, thirteen findings, none of them cosmetic. The plan is worth more
than the code it will produce — every one of these would have been found in
implementation instead, at much higher cost.

**Process note, and it is the important part of this entry:** for six rounds I
applied every review finding directly. On a *plan* PR every finding is a design
decision, and `CLAUDE.md` says Lawrence is the taste/design lead — so I made
about thirteen of his decisions for him without asking once, including inventing
an eighth ending title and deciding what a `garden` world does in its last act.
He stopped me. The rule that was missing: **on a proposal, review findings are
input to a decision, not instructions to execute.** Summarise them and ask.

The final round was applied with his explicit go-ahead, including two calls he
asked me to make and mark as mine: cause-before-title selection (§8a-ter) and
moving the `{apocalypse, ending}` commitment into phase 1, which makes phase 1
bigger than the original sketch.

**Review is closed at his direction** after one final round — 18 findings over
6 rounds with no sign of convergence, and the remaining gaps are cheaper to find
during implementation than to keep enumerating on paper.

**Next:** phase 1, if the shape survives his read.

**Spotted, not done:** the review loop's non-convergence is itself worth
thinking about. Every round's fixes surfaced the next layer, because the plan
kept proposing to reuse machinery that was written to do something else. That is
a property of this codebase's ending path, not of the reviewer.

---

## Phase 1 — the ending becomes a sequence — claude — 2026-08-21

Implements phase 1 of `docs/plans/world-endings.md`. `sim.ts`, `endings.ts`,
`main.ts`.

**Before:** at `endTick` the world was *replaced* — classify retrospectively,
swap, 0.7s black, 1.8s fade. 2.5 seconds, and nothing was ever unmade.

**Did.** A world now spends its last ~102 world-seconds ending, in acts derived
from `endTick` rather than a life fraction (`lifeFraction` bottoms out at 0.58,
so the shortest world is 17,400 ticks and a fixed fraction would leave it less
time than the sequence needs):

| act | opens at | length |
| --- | --- | --- |
| commit | `endTick − 3360` | — |
| omen | `endTick − 3060` | 40s |
| onset | | 12s |
| unmaking | | 35s |
| silence | `endTick − 450` | 15s |

- **`sim.ts`** gains one field, `ending: EndingState | null`, and one exported
  function, `beginEnding()`. While it is set the sim holds everything that would
  make the world bigger or busier: all four birth paths (spawn roll, pending
  settlements, `maybeBreakaway`, desperate refuge founding), both in-cycle
  catastrophe systems (`brewing`/`applyCatastrophe` and `stepVolcanoes`), and
  the rally. Scheduled falls emit `civ_died` themselves, because the phase loop
  has already run by then and the event would otherwise never fire — taking the
  narration, the history count and the `fadedDeadCivs` repaint with it.
- **`endings.ts`** splits `commitEndingKind()` (scoring only, at the commit
  tick) from `resolveWorldEnding()` (at the true end, taking the committed
  title). The epitaph, era and survivor counts are therefore measured *after*
  the ending, so the archive describes it instead of predicting it. Adds
  `ApocalypseKind` — the title vocabulary cannot select a sequence, since `ash`
  is two different causes and four titles share `quiet` — with its own seeded
  affinity, an `APOCALYPSE_ENDINGS` legality map, a `SHIPPED_APOCALYPSES` gate
  so a committed cause always has something to run, and the missing earthquake
  counter in `WorldHistory`.
- **`main.ts`** stages the acts, speaks one omen line per ending, and builds the
  `rewilded` fade schedule: living civs ordered smallest-first and given death
  ticks spread across the unmaking, deterministic (tile count then id, no RNG).

**Verified** headless against the built bundle, via a new `__ending()` handle:

- Acts land where they should — `endTick` 18092 → omen 15032, silence 17642,
  commit 14732.
- **Nothing is born after the commit**: civ count never rose, and
  `pendingSettlements` stayed 0.
- **The fade completes before the silence**: 15 civs at commit, all 15
  scheduled, last pending death at tick 21868 against a silence opening at
  21949 — and `livingCivs` was **0 across every sample of the silence**. The
  held beat now holds a world that has actually ended.
- **Determinism**: the same seed twice committed to the same
  `{apocalypse, ending}`.
- No page exceptions in any run.

**Could not verify:** anything visual. Whether 15 seconds of an empty world
reads as weight or as dead air is the open question from the plan and only the
preview can answer it. Also unmeasured: frame cost, though this phase adds no
new render layer.

**Known gap, by design:** phase 1 stages act 3 for `rewilded` only. A `garden`
run observed civs falling 7 → 3 during its ending through ordinary decline,
which contradicts *"an age learned how to remain"* — `advanceCivPhase()` still
kills regardless. Phase 2 owns that, along with `exodus`'s launches and
`world_empire`'s consolidation.

**Three bugs found in review, all mine, all fixed:**

1. *Omens still fired during the ending.* `beginEnding()` cleared
   `world.brewing`, but the block above it recreated one as pressure crossed a
   threshold and emitted ordinary omen events — so a committed ending could be
   narrated over by an unrelated flood or asteroid. The guard stopped the
   impact, not the warning. Both blocks are gated now.
2. *The `skip 5k` button skipped the whole ending.* Its handler called `step()`
   5,000 times without the new checkpoints, so births and catastrophes ran
   through the ending window and the world then committed at or past `endTick`
   and was replaced immediately. The commit/omen/turnover checks are now one
   `endingCheckpoints()` called from both loops.
   **This also corrected my own verification:** I had seen the commitment fire
   at tick 15114 against a commit tick of 14732 and dismissed 382 ticks of
   lateness as "skip granularity". It was this bug. Re-measured with a skip
   deliberately straddling the commit: `startedTick` is now **exactly**
   `commitTick`, lateness **0**, the world survives the skip, and
   `simWorld.brewing` stayed null through every sample of the ending.
3. *`__forceEnding` was not one-shot* — it survived `resetWorld()` and forced
   every later world, which would quietly invalidate any multi-world
   reachability or determinism probe. Consumed on use now.

**Next:** Lawrence watches a turnover on the preview. If the shape reads, phase
2 is the cheap apocalypses (supervolcano, long winter) plus the three remaining
quiet gestures.

---

## Ending follow-ups — claude — 2026-08-21

Closes the five findings in issue #15, all from the review of #14.

**The P1 mattered most.** For `garden`, `exodus` and `world_empire` the silence
was not silent: those endings have no staged act 3, so `endingCheckpoints()`
went straight from the omen to the turnover and civs kept expanding,
conquering, founding cities and narrating through the beat that is the whole
point of the sequence. My verified "livingCivs 0 across every sample of the
silence" had been measured on `rewilded`, the only ending with a staged act 3 —
so the claim was true of a quarter of the cases and I reported it as general.

**Did.** `EndingState` gains `silent`; `beginSilence()` sets it at the act-4
boundary for *every* ending, and `step()` then returns
`{changes: [], events: [], biomeChanges: []}` immediately. Time still passes —
the sky and the turnover clock run off `worldClock` in the renderer — but the
world itself is finished.

The other four:

- Scheduled civs are held from ordinary death until their tick
  (`advanceCivPhase(..., holdDeath)`). A civ whose decline timer expired during
  the omen used to vanish before act 3 and out of the smallest-first order.
- The skip now passes its events to `rememberWorldEvents()`. A skipped ending
  was archiving an epitaph that undercounted its own deaths.
- An omen spoken during a skip is re-spoken after the post-skip log reset;
  `endingOmenSpoken` is latched, so it would otherwise never be seen.
- The archive persists `apocalypse` alongside the title. Invisible while only
  `quiet` ships, but the moment impact and ashfall both produce `ash`, saved
  worlds could not say which ran.

**Verified:** build clean. Headless on the previously-failing case — a forced
`garden` ending — `silent` true through 24 samples of act 4, tick advancing 421
while built (2029), ruin (619) and living (4) were all constant. The world is
genuinely still. No page exceptions.

**Could not verify:** still nothing visual. And the "held from ordinary death"
path is asserted from the code rather than measured; it needs a civ whose
decline timer happens to expire mid-omen, which I could not force.

**A sixth finding, and the fix was incomplete without it:** freezing `step()`
only froze the *sim*. The ticker still ran `updateFires`, `updatePlagues`,
floods, droughts, volcanoes, festivals and `maybeChronicle` in `main.ts` —
several of which mutate `biomeMap` or `simWorld.tiles` (fire turns forest to
grass, plague turns built tiles to ruins) or push narration of their own. The
silence could still visibly and permanently change. Those systems are now gated
on the silent state; atmosphere, light and the drawing passes continue.

My first test passed only because that run happened to have no fire or plague
in flight — a gap in the test, not evidence. Re-measured by forcing a plague,
fire, flood, drought and eruption ~260 ticks before act 4: built and ruin counts
were **visibly moving right up to the boundary**, then held at 541 / 1793 / 6882
across 15 samples while the tick advanced 397. `__dbg` now exposes the debug
spawns so this case stays testable.

Two narrator paths survived even that: `maybeGhost` pushes a line about
shepherds at the ruins, and the celestial-event callback narrates comets,
eclipses and auroras. Both are gated now — but only their *voices*. The ghost
name still appears and the comet still crosses the sky, because a remembered
name and a light moving against the stars are exactly what a silence should
contain. Act 4 adds no story; it can still be looked at.

Three more, and the first is the same lesson a fourth time: **succession is
tick-driven.** `decaySoilMarks()` and `drawSuccession()` run off `simWorld.tick`,
which deliberately keeps advancing through act 4, so ruins were sprouting and
soil marks fading several times during the held snapshot. Gated. Also: the
post-skip omen replay could fire *inside* the silence, and a world the viewer
abandoned mid-ending (`left_behind`) was being archived with an apocalypse that
never ran — the cause is now persisted only for an ending that actually
resolved.

**The pattern across all of them:** "hold the world" is not one switch. The sim,
the renderer's world systems, the narrators, and the tick-derived land systems
are four separate populations, and each had to be found on its own. Anything
keyed to `simWorld.tick` is suspect during act 4 by construction.

**A fifth and sixth system, and the fifth is the one my test was structurally
unable to see.** `ruinAge` advances from `worldSeconds` in the building
animation loop: ruin decay runs 30 seconds plus stagger, and the last scheduled
death lands under 35 seconds before act 4, so buildings kept greying,
collapsing and being reclaimed straight through the aftermath. **Tile counts
stayed constant the whole time** — the tiles were already ruins — so every
freeze test I ran passed while the screen was still visibly changing. Counting
tiles was the wrong instrument for a claim about stillness.

Also `checkWarQuiet()`, which crosses its own 45-second threshold and narrates
"the border falls quiet" — a seventh narrator, found only because two surviving
civs is a common way for `garden` to end.

**Eighth system: farm growth.** Fields kept growing into view during act 4 —
again invisible to a tile-count check. Held.

**Deliberately not held:** the in-flight tile-colour, building-alpha and biome
crossfades. Those are transitions *already committed* before the boundary, and
freezing them mid-fade would leave half-drawn tiles standing through the
aftermath, which looks broken rather than still. Letting a fade finish is not
the world changing. That is a judgement call and the opposite one is defensible.

**Systems nine, ten and eleven:** the blight ramp (driven by `cycleFrac`, which
keeps climbing through act 4, so the land kept draining toward grey), the
ice-memory repaint (`iceMemoryFade()` off `simWorld.tick`, so the pale ground
kept fading), and `maybeNameConstellations()` — an eighth narrator.

**The honest state of this PR:** eleven systems held across seven review rounds,
and each round still found more. Everything keyed to `simWorld.tick`,
`worldClock`, `worldSeconds` or `cycleFrac` is a candidate by construction, and
there is no list of them. A future turn wanting real confidence should invert
the approach — a single `worldIsHeld()` consulted by the clocks themselves,
rather than a growing set of call-site guards found one review at a time.

**Next:** the copy pass (Lawrence's next brief).

---

## Plan — a copy pass — claude — 2026-08-21

Proposal only, no copy changed. `docs/plans/copy-pass.md`, plus
`scripts/copy-audit.py`, the script the numbers came from.

**Measured before proposing.** Audited every page and every user-facing string
literal against the evidenced tells rather than guessing.

**The lexical tells are not here.** Zero hits across all five pages from the
407-word measured excess-vocabulary list (Kobak et al., Science Advances 2025):
no *delve*, *tapestry*, *testament*, *seamless*, *realm*. Zero puffery, zero
"not X, but Y". Worth stating plainly, because the brief assumed there would be
something to strip.

**The tells that are here are rhythmic:**

| surface | lines | mean | SD |
| --- | --- | --- | --- |
| all five pages | 65 | 14.4 | 6.3 |
| **ending descriptions** | **7** | **15.0** | **1.2** |
| in-world narration | 127 | 8.9 | 2.8 |

The seven ending cards have a standard deviation of **1.2 words** — same
length, same two-sentence shape, on the most important screen in the app. The
narration, by contrast, is the healthiest prose in the project and should be
left alone.

**And the seven `ENDING_OMENS` lines I wrote this afternoon fail their own
test:** four of seven are the same "…, and …" two-clause shape. Parallelism
saturation, in copy I added hours ago.

**The proposal is mostly about what not to do.** No word blacklist, no
punctuation changes, no touching Terms — its flat rhythm is correct for legal
copy. The em-dash tell is a fading model artifact and the spaced-vs-unspaced
claim is folklore; the Oxford comma claim has no corpus evidence; and thinning
adjectives pushes prose *toward* the AI profile, since humans measurably use
more of them. Detectors false-positive on non-native and deliberately spare
writing at 61%, and this project's voice is spare by design.

**Could not verify:** whether any of the proposed copy is *better*. Three
doorway options are offered rather than one, because that is a taste call and
it belongs to Lawrence.

**Three corrections from review, all of them to my own accuracy:**

- The audit ran against **114** style words, not the 407 the document claimed.
  The 114 are the high-value subset with the largest measured frequency shifts,
  and the result was zero, so widening it would not change the conclusion — but
  the number as written was wrong.
- Only the HTML audit script was committed; the `src/` one, which produced the
  ending-card and narration figures, was not. Both are in `scripts/` now.
- The ending descriptions are **not** all two sentences: `long_winter` and
  `world_empire` are single sentences. That correction sharpens the finding
  rather than weakening it — those two reach the same 15 words by a different
  construction, so the uniformity is in *length*, not sentence count, and
  varying sentence count alone will not fix it.

**A fourth correction, and the sharpest one:** the "127 narration lines, SD 2.8"
figure was neither narration nor a clean population. The script dropped every
string containing `${...}`, which silently excluded most real narration, while
sweeping in unrelated UI strings like the archive's "No worlds..." message. So
the number used to justify leaving that surface alone did not measure it.

Rewritten to report three populations honestly: ending cards (7, SD 1.2),
narration provably reaching `pushNarration()` (17, SD 3.2), and every
sentence-shaped literal in `main.ts` (218, SD 2.7). The conclusion survives —
both prose subsets scatter roughly twice as widely as the ending cards — but it
now rests on a measurement that says what it means.

**And then review killed the headline finding outright, correctly.** The
SD 1.2 I led with was the spread of *whole-card lengths*, not sentence lengths —
while the tell being invoked is explicitly about sentences, and the HTML audit
split sentences properly. Measured comparably, the ending cards score **3.4**,
running from four words ("Roots opened the roads.") to fifteen. That is *more*
varied than the rest of the app's prose (2.4), not less.

So the honest result of the whole exercise is a negative one: **this project has
no measurable AI-writing tells — not lexically, not rhythmically, on any
surface.** The card-length uniformity is real but it is a craft observation, and
the document had dressed it as evidence of machine copy.

Worth keeping as a lesson: I compared two numbers produced by two different
methods and did not notice. The HTML audit split sentences; the src audit
measured whole literals. Same column header, different quantity.

**Then review made me actually widen the word list, and that was worth doing.**
Pulled the real dataset (900 words, 410 typed style) and found two things a
subset had hidden: the measured list contains `this`, `their` and `while` —
pronouns whose frequency shifted *in biomedical abstracts*, so raw membership is
the wrong test and the audit now reports the 394 content-bearing words; and
**`tapestry` and `testament`, the two most-cited tells in popular writing, are
not in the measured dataset at all.** The folklore vocabulary and the evidenced
vocabulary are different sets.

Also added the doorway to the audit, which neither script had been reading —
it is a multiline tagged template in `main.ts`, invisible to both the HTML block
parser and the single-line literal regex. The document had been proposing three
rewrites of copy it had never measured. It audits clean (5 sentences, SD 5.0).

And narration lines beginning with a substitution (`${civ.name} begins to
falter.`) were being dropped by the leading-capital requirement, which was most
of `narrateEvent()`'s table: 290 sentences became 331.

**Next:** review, then apply whichever options survive — but the case for
changing anything is now much weaker than when this started, and that should be
said out loud rather than buried.

---

## The copy pass, applied — claude — 2026-08-22

Applies `docs/plans/copy-pass.md`. `src/main.ts`, `src/endings.ts`,
`public/about/`, `public/privacy/`. No sim changes.

**Doorway** — option B from the plan, Lawrence's pick being "make the change"
against a recommendation of B. Kept the hover hint that B dropped: losing a
discoverability affordance is a product decision, not a copy one, and nothing in
the brief asked for it.

**Ending cards** — all seven sat in a 13–17 word band. Now 6 to 24. Sentence SD
**3.4 → 5.6**.

**Omen lines** — three of the four `…, and …` shapes split into two sentences.
One remains, which is the point: the device is fine, saturation was the problem.

**About** — the tricolon of near-synonyms ("a second screen, an idle display, or
a few minutes of close observation") replaced.

**Privacy** — "to understand whether the experience is useful" became "so I can
tell whether anyone is actually watching". This is the only first-person
sentence on the site and the most reversible change here.

**The audit caught me making it worse.** My first doorway rewrite scored
**SD 0.8** — flatter than the 2.5 it was replacing, which was the entire reason
the doorway was on the list. Four sentences of 7, 9, 7 and 8 words. Rewritten
with real variance: 3, 7, 8, 24 → **SD 8.0**. The script earned its place in the
repo on its first real use, against its own author.

**And I had largely edited the wrong text.** `resolveWorldEnding()` replaces a
card's `description` with a generated **epitaph** for five of the seven endings
— world_empire, exodus, rewilded, and ash/drowned whenever their event counts
are non-zero. So the descriptions I varied are often not what a viewer reads.
The epitaphs had exactly the same uniformity problem (five templates, all two
sentences, all 15–16 words) and are now 4 to 31 words, **SD 8.7**. They are also
a population in the audit script now, so the surface cannot be missed again.

**Verified:** build clean. Measured before/after with the committed scripts.
Pages unchanged at SD 6.6 (the About edit is one sentence in 82).

**One correction where accuracy outranked voice:** the Privacy rewrite said the
site "counts visits and a handful of button presses". It also emits
`engagement_reached` at 1, 5 and 10 visible minutes (`src/analytics.ts:72-92`),
so that understated the passive tracking — on the one page where understating is
a real problem rather than a stylistic one. It now names the time on screen too.

**Could not verify:** whether any of it is *better*. Every line here is a taste
call. The two I would query first are `garden`'s "That turned out to be the hard
part" — a dry joke against a painterly brief — and the first-person Privacy
sentence.

---

## Mobile, part one — claude — 2026-08-23

The two unambiguous defects from the launch-readiness look. `src/style.css`,
`src/main.ts`. Tap-to-inspect is deliberately **not** here — it is a design
question for Lawrence, not something to assume.

**Found by measuring the live site on phone viewports**, not by reading code:

- **~200px of the control bar was off-screen.** `scrollWidth - clientWidth` was
  **203** on iPhone 13 and **200** on Pixel 5. The bar had `overflow-x: auto`,
  so it technically scrolled — but the scrollbar is hidden by design and the
  chrome idles at 12% opacity, so **share, stay awake and fullscreen were
  invisible with nothing to suggest they existed.** Share is the growth
  mechanism.
- **The doorway told every visitor to hover.** `matchMedia('(hover: hover)')` is
  false on both devices, and the field guide is explicitly disabled for
  `pointerType === 'touch'`. So the instruction was impossible *and* the feature
  behind it absent. That line was mine, shipped the day before.

**Did:** the bar wraps below 720px instead of scrolling, and the doorway builds
its aside from `matchMedia('(hover: hover)')` — the sentence is simply omitted
on touch rather than promising something that does not exist yet.

**Verified:** on iPhone 13 and Pixel 5 — 8 buttons, **0 off-screen**, scroll
overflow **203 → 0**, bar 86px in two rows. Desktop unchanged: one row, 43px,
`nowrap`, hover sentence intact.

**One knock-on caught in review:** the archive panel sat 62px from the bottom,
sized for a one-row bar, so wrapping put it over the bar's first row of
controls. Now 110px with the max-height adjusted to match. Verified: archive
bottom 554 against a bar top of 566 on iPhone 13, and 617 against 629 on
Pixel 5 — **0px overlap**, panel still fully on screen.

**Two more from review, and the second killed my fixed offset:** at 320px the
bar wraps to *three* rows (124px), not two, so `bottom: 110px` overlapped again.
No fixed number is safe. `main.ts` now publishes the measured bar height as
`--controls-height` (ResizeObserver plus a resize listener) and the archive
positions against it. And `canHover` had to mirror the CSS exactly — the
inspector is hidden at `(max-width: 720px), (hover: none)`, so a **narrow
desktop window** has a pointer and no inspector, and was still being told to
hover.

**Verified across five viewports** — iPhone 13, Pixel 5, 320×568 touch, 700×800
desktop, 1440×900 desktop. Bar heights 86 / 86 / 124 / 48 / 43px, the CSS
variable tracking each exactly; **0 off-screen buttons and 0px archive overlap
everywhere**; and the hover sentence present only where the inspector actually
renders (1440 only).

**And the safe-area inset**, which matters precisely because this is an
installable PWA: the bar sits at `max(12px, env(safe-area-inset-bottom))`, and
on an installed iPhone that is 34px — so a flat 24px clearance put the archive
10px over the controls again. Both the offset and the max-height now carry the
same inset term. No change without an inset (12px gap on iPhone 13 viewport,
0px overlap; desktop unaffected).

**Could not verify:** real-device performance, and the safe-area case itself —
a headless viewport reports no inset, so that fix rests on the arithmetic rather
than a measurement. It wants one look at the installed PWA. My harness is software-rendered,
so its FPS says nothing about a phone. Still needs Lawrence's hardware.

**Spotted, not done — the actual mobile question:** the field guide is the thing
that makes the world legible and touch has no path to it. And the portrait
framing shows a fragment of coastline rather than a world, which undercuts the
"glance at it" pitch. Both are design calls.

---

## Plan — the landscape comparison — claude — 2026-08-23

Proposal and research brief, no code. `docs/plans/landscape.md`.

**Why:** the named-lives plan (#22) reasoned from a single comparable — WorldBox
— and Lawrence's read was that a named person may not suit a passive
screensaver. That is #22's own first open question answered, and it exposed the
real problem: **one neighbour is not a landscape.** #22 is parked, not closed;
the observation behind it (identity is one bit deep) survives even if
personhood is the wrong answer to it.

**The framing the document argues for**, and the part most worth keeping: two
axes, agency and simulation depth. The Land is **zero agency, high depth**, which
is a thin corner — most high-depth simulations are games, and most zero-agency
software is shallow motion. So the productive question is not "what does WorldBox
have" but **"which pleasures of a deep simulation survive the removal of all
agency, and which are pleasures *of* agency wearing a simulation's clothes?"** A
feature can be excellent in WorldBox and worthless here because its payoff was
"I did that."

**Stated precisely, from the code:** 23 event kinds, 5 catastrophes, 7 endings,
96×96, 10–17 minutes, ~13.7k lines. Eight controls, **none of which affect what
happens** — they govern playback and the window. Rerolling is the only influence
and it is total rather than partial.

**Five candidate gaps, held loosely:** identity is one bit deep (colour only);
nothing accumulates for the viewer; the camera never moves; the history is
announced but never kept; and watching a world to its end is unrewarded.

**§7 is a research brief rather than a review request.** Codex is asked to search
independently and to treat §§3–5 as claims to test — explicitly including
whether the zero-agency constraint is a feature or a mistake. Corroboration is
the less useful outcome.

**Second pass: research folded in, and it changed the document.** Five findings
worth carrying:

- **WorldBox's failure mode is the most useful result.** Its negative reviews
  cluster on "you've seen everything after half an hour", and runs *"almost
  always end with a boredom-killing nuclear bomb"*. **The nuke is a boredom
  valve — the player manufacturing an event because watching ran out.** Our
  scheduled apocalypse is that valve, automated, which makes the endings work a
  genuine advantage over our closest cousin rather than a nicety.
- **Civ's most-mourned removed feature is a non-interactive timelapse** that
  players rebuilt as a mod. An intensely interactive game misses the part with
  no interaction in it.
- **Kaplan's soft vs hard fascination** replaced my two-axis framing with a
  better test: *can a viewer think about something else while watching?* Games
  are standardly classed as hard fascination and therefore non-restorative; the
  no-score/no-agency constraints are what keep this on the soft side.
- **You cannot curate seeds, so watchability is set by the worst worlds** — and
  the headless fast-forward already exists to hunt degenerate ones.
- **Eno's *On Land* liner notes from 1982** are almost verbatim this project's
  thesis, and argue operationally against a figure/ground split in the
  rendering.

**A correction to advice I had already given:** I recommended itch.io with a tip
jar as the first commercial move. itch **cannot sell a browser build** — HTML5
titles take donations only, by their own documentation. That needs fixing in
`docs/plans/shipping.md` (#21) too.

**Also: competitors now exist.** IMAGINERY (browser civ sim, "you don't manage
anything", deterministic seeds, documentary camera), GODSIM (persistent 24/7
world, free to watch, **pay to drop your own civ**), AEON. None has traction —
which validates the form and warns that the form is not a moat.

**Lawrence's direction, mid-draft: agency is optional.** New §11 works it
through, and the research is specific: supportive in three places (Townscaper is
a goalless toy *with* agency at 95%; soft fascination is about attention being
demanded, not input being possible; GODSIM already ships watch-free/pay-to-
participate) with one sharp warning — **agency is how WorldBox players kill
their own boredom, and it must not be allowed to replace the apocalypse.** The
document now separates *camera agency* (nearly free, solves the framing problem,
probably the best next feature) from *world agency* (should be setup-shaped —
gardener, not god — which keeps us inside Björk & Juul's "setup-only" category).

**Third pass closed three review findings, and one of them turned out to be a
product bug rather than a documentation error.** Codex challenged the line "a
seed reproduces a world exactly", which four documents and the share button had
been leaning on. It is false: `CLAUDE.md`'s invariant covers `sim.ts`, but the
**renderer writes to the sim** — `maybeOutbreak()` picks a plague with two
unseeded `Math.random()` calls and `plagueRuin()` then rewrites
`simWorld.tiles`. Six renderer systems do this. **Two people opening the same
link get different histories.** Filed as #25 with the two honest options: extend
the seeded stream into the renderer's world-mutating systems, or narrow the
promise the share button makes.

Also corrected: **Boatmurdered was the wrong evidence** for agency-free
storytelling — it is a succession fortress, players actively taking turns, so it
is emphatically agency-*full*. The claim survives on narrower ground (worldgen
and legends are non-interactive by construction) but the thing direction 1 rests
on — whether legends is loved or merely admired — remains unverified. And
"nothing accumulates for the viewer" was overstated: the archive already keeps
ten worlds with epitaphs. The real gap is event-level history and cross-world
continuity.

**Next:** Lawrence's read; Codex's independent research once a Codex cloud
environment exists for the repo.

---

## Turn B — the shipping plan, drafted — claude — 2026-08-23

Answers issue #20. `docs/plans/shipping.md` plus a correction to `ANALYTICS.md`.
No code, no commitments.

**The blocking check is closed.** `ANALYTICS.md` had carried an open contingency
since #3: if the Vercel project were on Hobby, every `trackEvent` would be a
silent no-op and the Privacy page would describe events that never fire. Queried
the Vercel API with the CLI's own credentials: the team is on **`pro`** and Web
Analytics is **enabled** on the project. So the analytics works, the Privacy page
is accurate, and the plan has a feedback loop. `ANALYTICS.md` now says so instead
of asking.

**Review then caught me closing it too far, and the follow-up was the more
interesting result.** Eligibility and configuration are not delivery. A headless
run against the live site loaded the insights script (200) and then sent
nothing — no pageview, no custom event, `window.vaq` left holding two undrained
entries. That reads exactly like a broken integration, and I was a step from
reporting it as one. The script's own second function is
`navigator.webdriver || navigator.userAgent.includes("Headless")`: **Vercel
Analytics deliberately refuses to send from automated browsers.** The silence
was the product working.

Which means **no headless harness can ever confirm delivery here** — this one or
a later one. It is now the single prerequisite in the plan that explicitly needs
a human, with the one-minute DevTools recipe written down. Worth remembering as
a general shape: an instrument that is designed to ignore you produces the same
output as a thing that is broken.

I could not read the traffic itself either — the overview endpoint is not
public — so current numbers are unknown to me and visible to Lawrence.

**The plan's substance**, briefly, since it is meant to be read rather than
summarised: launch as a moment rather than a state, on the grounds that
"shipped" has come to mean "one more fix" and only a date stops that; free with
the existing quiet support link and no paid tier, because there is nothing worth
putting behind one and building something worse to have something to sell is the
failure mode; **no ads, argued once and properly** — the brief banned them, they
are structurally opposed to a product whose proposition is giving attention
back, the economics never arrive at this scale, and they would cost the privacy
position; a three-stage soft launch ordered by *purpose* rather than reach; and
a primary metric of **10-minute engagement as a share of visits**, because that
is the product's own thesis under test.

It also proposes a **stopping condition**, which is the part I expect to be
argued with: a few hundred people and a non-zero 10-minute rate counts as
finished, and the project stops being measured. Written because without one this
is an indefinite obligation, and §7 asks directly whether that is fiction.

**Could not verify:** anything about Lawrence's networks, appetite, or the
actual traffic. Every strategic claim here is reasoning from what the repo and
the API can prove, and §7 lists the five places where the answer is genuinely
his rather than mine.

**Next:** his read, then whichever stage of §4 he wants.
