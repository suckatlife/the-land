# FABLE_RUN_SUMMARY — suspense run, 2026-06-10

Branch: `fable-run-2026-06-10`. All work committed. Target dimension: **suspense**.

## 1. What I tried (including dead ends)

**Built observation tooling before touching anything.** `scripts/observe.ts`
runs the sim headless for 30 viewer-minutes and prints the event stream with
timestamps plus pacing statistics; `scripts/screenshot.mjs` /
`scripts/watch_session.mjs` drive the live app in headless Chromium
(playwright, dev-dep only) and capture screenshots + the narrated log + the
pressure trace. I could not have made the key discovery by reading code.

**The key discovery: every civ lived exactly ~57 seconds.** `advanceCivPhase`
re-rolled its random phase-duration *every tick*, so each phase ended at the
distribution's minimum. The intended ±60% variation collapsed to zero
variance. Fixed by rolling once on phase entry (`Civ.phaseDuration`), plus a
15% "golden age" long tail on the stable phase and a longer declining phase.
Lifespans went from uniform 57s to a 1m30s–7m41s spread, dying windows from a
fixed 11s to 20–80s. This was the prerequisite for everything else: jeopardy
requires protagonists, protagonists require differentiated lifespans.

**Surfaced `catastrophePressure` as a complete dread→release loop:**

- *Brewing*: pressure crossing 0.5 pre-rolls the coming catastrophe's type and
  severity into `world.brewing`, so foreshadowing is honest — the disaster that
  arrives is the one foretold.
- *Omens*: events at pressure 0.62/0.80/0.93, narrated from 72 lines flavored
  by type × stage × the leading civ's era (neolithic worlds get "The auguries
  fail", modern ones "The hospitals stop publishing their numbers"). Omen
  depth predicts magnitude: minor events get one murmur, severe ones escalate
  through all three stages — the narrator never cries wolf.
- *Ambient dread*: a multiply tint + vignette over the whole scene eases up
  with pressure, hued by the brewing type (plague pallor, asteroid dusk, flood
  silver, earthquake dust), ceiling scaled by severity. A brewing asteroid
  hangs a brightening star in the sky. Dread drains slower than it broke —
  the air clearing is the relief.
- *Release*: per-type impact punctuation (amber flash, ground shake, cold
  surge, dark pulse), severity-scaled, plus an expanding shockwave ring at
  the epicenter in world space — the release has a *where*, not just a when.
- *Aftermath*: `spared` events narrate the two nearest untouched civs — the
  near-miss made legible ("In Vehl-Em, only the dishes rattled").
- *Cadence*: pressure build is modulated by a slow random-walk noise so
  catastrophes stopped arriving every 2 minutes like a metronome.

**Jeopardy and uncertainty mechanics:** declining civs' name labels dim (the
light going out); a rare `rally` lets a declining civ pull back to stable once
(a decline is no longer a guaranteed death sentence); a dying civ may send a
`last_flight` expedition, and if the homeland dies mid-voyage the refugees
found a successor nation on landfall, narrated as such.

**Quiet:** the event log was running at ~85 lines/minute — pure noise. Cut by:
dead civs' cities now crumble silently, routine colonies narrate 30% of the
time, tiny civs' capital shuffles don't narrate, low-priority lines yield if
the log was written in the last 4.5s, and cadence knobs (expeditions,
breakaways) came down. Omens/catastrophes/relief get distinct log styling.

**Audio:** procedural Web Audio (no assets, no deps) — a detuned low drone
that rises and opens with dread, a distant bell at the final omen, a bass
thump on impact. Muted by default; the AudioContext is suspended while muted.

**Dead ends / scars:** the first atmosphere pass was invisible — multiply
tints with light colors are inherently gentle, and I only caught it by
measuring applied alphas via a debug handle (`window.__atmos`) and comparing
forced-maximum screenshots. Headless Chromium in WSL2 needed system libs
extracted from .debs into /tmp (no sudo); documented in DEPENDENCY_NOTES.
Also fixed in passing: the manual catastrophe button desynced the civ index
(missing `noteTileChange`/sprite refresh), and refugee voyages weren't drawn
after their parent died.

## 2. What works now that didn't before

- Civilizations have *biographies*: short tragic lives next to seven-minute
  empires with golden ages. You can learn a name and watch it endure.
- The world tells you something is coming: the light goes wrong, the log
  mutters era-appropriate unease, a star brightens — then the thing arrives,
  punctuated, and the air clears over the survivors.
- Near-misses exist and are narrated; declines are visible (dimming labels,
  30–80s dying windows) and genuinely uncertain (rallies).
- Quiet exists. An omen line now lands in stillness instead of scrolling away.

## 3. What I learned about the project

- **The sim's randomness was lying.** Re-rolling thresholds per tick collapses
  distributions to their minimum. Worth auditing other per-tick rolls for the
  same shape (fortune is fine — it's a walk, not a threshold).
- **Suspense was mostly a pacing problem, not a feature problem.** The pressure
  variable, the event channel, the ember system — all the affordances existed.
  What was missing was variance (lifespans, cadence) and surface (visuals,
  narration). The brief's instinct was right.
- **Render-side subtlety needs measurement.** "Looks fine in code" multiply
  blends can be visually absent; screenshot-diff against forced maxima before
  trusting any atmospheric effect.
- The headless observe harness changes the development loop entirely — pacing
  claims ("too frequent", "too uniform") become measurable in 30 seconds.

## 4. Three creative directions next

1. **Atmosphere as deep time** (the planned next run): day/night and seasonal
   color drift on the biome layer, weather fronts as drifting alpha fields,
   and the dread system reads as one voice in a larger sky — right now dread
   is the *only* atmospheric register, so calm has no texture of its own.
2. **Chronicle threads**: the sim already has name memory and era inheritance;
   a lightweight "chronicle" that tracks a civ's notable beats (founding,
   golden age, the omen it ignored, the rally, the fall) could narrate
   *callbacks* — "Where Kalon stood, the grass grows different." Story
   continuity for almost no new sim machinery.
3. **Let the viewer's eye be led**: the camera never moves. A slow Ken-Burns
   drift toward the brewing region during stage-2/3 omens (and back out after)
   would make the foreshadowing spatial — you'd *see* where it's coming
   without any UI. Cheap in Pixi (tween world container position/scale).

## 5. Honest self-assessment of the 10-minute test

*(Method: 12-minute unattended headless watch at natural pacing, sampling
pressure/dread/brewing every 15s with screenshots every 90s, plus staged
screenshot verification of each dread tier and the impact effects.)*

The watched session, as a viewer would have experienced it: five minutes of
calm world-building (an empire passing 1,000 tiles, cities falling and being
named); a brewing begins at 5:00 and the world warms and darkens over 2½
minutes toward a catastrophe that turns out to be a fizzle — the air clears;
four more minutes of calm; then at 11:00 a *severe* asteroid begins brewing,
the star comes out, and the dusk deepens hard. That arc — false alarm, calm,
then the real thing using the tell you just learned — is textbook suspense
structure, and it emerged from the mechanics rather than being scripted.
(Post-watch I tuned fizzles quieter, so the false alarm whispers rather than
shouts.)

Whether a viewer *feels* tension is not something I can verify from inside a
headless browser. But the structural requirements of the brief — a tell the
viewer can learn, jeopardy with time to root (20–80s dying windows, dimming
labels), uncertainty with both outcomes possible (rallies, near-misses,
spared lines) — are all present and verified working at natural pacing. My
honest estimate: one genuine "uh oh" moment in 10 minutes is very likely,
especially for asteroid sequences (the star is the strongest single tell);
three are not guaranteed, because plague/flood/earthquake foreshadowing is
mostly tonal and a glance-viewer may only register it on the second cycle.

Caveats for Lawrence's eye: (a) dread tint ceilings (`DREAD` in main.ts) are
my taste call — verified legible at severe, but you may want them gentler;
(b) median lifespan ~3min is a big pacing change from the (buggy) 57s world —
the whole sim breathes slower now; (c) audio is unreviewed by any human ear.
