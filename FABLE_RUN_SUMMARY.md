# FABLE_RUN_SUMMARY — atmosphere run, 2026-06-11

Branch: `fable-run-atmosphere-2026-06-11`, forked from the suspense branch tip
(see Repo state note below). Windows 1 and 2 completed in the first usage
window; Window 3 (curvature, re-briefed after your review) completed in the
second. The suspense run's summary lives in git history on
`fable-run-2026-06-10`.

**Repo state note:** the brief says the suspense branch was merged to main;
it wasn't — main is still at the pre-suspense checkpoint. This branch
contains all suspense work. Suggested order when you're happy: merge
`fable-run-2026-06-10` to main, then this branch.

## Per-window breakdown

### Window 1 — sky, day/night, catastrophe scars (`WINDOW_1_NOTES.md`)
- `src/atmosphere.ts` with everything tuneable in the `ATMOS` block.
- The world now sits *in* a sky: scaled to 0.68, top vertex at 16% screen
  height (the diamond used to overflow the viewport — a sky was geometrically
  impossible; this is the biggest taste call of the run, and it's two
  constants to undo).
- 6-minute day/night: canvas-gradient sky + a fullscreen multiply "glaze"
  (one light over sky and land), 8 keyframes, legibility cap at night.
- Persistent scars per catastrophe type — seeded, blur-softened painterly
  washes (scorch+crater / fissures / silt that recedes / plague pallor that
  lingers 13 minutes), severity-scaled via the blast radius now carried on
  the catastrophe event. The carryover complaint ("can't see where it hit")
  is fixed: scars are pointable for minutes, verified at +45s and beyond.

### Window 2 — weather, seasons, era atmosphere (`WINDOW_2_NOTES.md`)
- Cloud shadows and mist banks drifting on a shared wandering wind; mist
  thickens at dawn/dusk and in cold seasons and smoky eras.
- A 20-minute seasonal year: cast on the light, tint on the land itself
  (ambered autumn, pale winter), fog density swing.
- Era air: the leading civ's era eases the atmosphere over 30s — neolithic
  clarity, industrial soot, modern wash, post violet.
- Dread re-integrated as weather: the sky carries the brewing hue
  (`dreadSkyBlend` 0.8), wind and cloud-shadow depth rise with dread, the
  ground multiply came down from 0.85 to 0.55.

### Window 3 — planetary curvature + fake perspective (`WINDOW_3_NOTES.md`)
- The world renders into a fixed RenderTexture and is drawn through a 32×22
  mesh whose vertices remap the upper silhouette onto a horizon arc: the
  apex stays, the diamond's wings rise to meet the curve, the far surface
  bunches toward the horizon (t^e perspective), the front stays pinned. This
  shape went through two revisions driven by Lawrence's live review — see
  "What I tried" below. Corner hazes and a shoreline feather (both
  world-space, horizon-tinted) melt the edges into the air.
- Scrubbers: `__atmosphere.setCurvature(0..1)` / `setPerspective(0..1)`;
  defaults 0.55/0.45. Calibrated per the brief: 0 is pixel-identical to the
  old build, 1 is deliberately too much. Calibration screenshots in
  `curvature_calibration/`.
- Everything in world space (scars, rings, weather, markers, labels) bends
  together by construction; the sim and all world-space math are untouched.
- Verified: scar positions for all four types, labels on cities, suspense
  flow end-to-end, production build. One open item: an FPS sanity check on
  real GPU hardware (the headless software renderer pays ~35% for the RT
  pass; a GPU should not — see WINDOW_3_NOTES doubt #1).

## 1. What I tried (including dead ends)

The first sky pass was invisible — the iso diamond overflowed the viewport on
every axis, so "a sky behind the world" rendered as nothing. The composition
change (shrink + seat the world) was the unlock for the entire run. The first
scar pass compounded per-blotch alpha with envelope alpha to ~0.04 effective
— invisible; caught by screenshot, fixed by ~2.5× on the blotch values.
Cloud *bodies* over land were tried mentally and rejected (they fight the
buildings); shadows + mist carry the weather instead. Building shadow
direction across the day was assessed and skipped (flat sprites, no cheap
believable version).

Window 3: per-tile curvature (the brief's "cheap and likely correct" option)
was rejected after reading iso.ts — tiles are thousands of individually
positioned Graphics, so per-tile offsets touch every consumer and force a
full scene rebuild on every scrub; the mesh route bends the finished image
instead and scrubs for free. Mid-window scare: city markers and labels
appeared to vanish on a mature world — an hour of probing showed they were
rendering correctly all along (small at 0.68 world scale, plus a pre-existing
frame-rate-coupled label fade that crawls in the 3.5fps software-rendered
headless browser). The debug handle `window.__layers` stays — it earned it.

The curve itself took three shapes, two of them corrected by Lawrence's live
review — a case study in why the scrub-and-review loop exists. v1 (radial
distance² drop) calibrated beautifully at 1600×900 and was invisible at his
window size: all its curvature lived at the side corners, exactly what
narrower framings crop out. v2 (apex-concentrated limb) bent visibly but
kept the diamond's tent silhouette, just tilted — and exposed a fog-clipping
artifact that drew a false horizon arc above the land, which Lawrence read
as the design intent: "the world should go up to the curve." He was right,
so v3 makes that literal: a silhouette remap that pulls each column's upper
edge onto a horizon arc — the wings rise, the far surface compresses, and
the visible top of the world IS the horizon. The artifact (fog banks
clipping at the texture's straight top edge) is fixed by fading fog near
the apex.

## 2. What works now that didn't before

Calm has texture: light moves through a day, mist gathers and burns off,
seasons turn the land, the age of the world is in the air. Catastrophes leave
marks you can point at for minutes. Dread is one voice in an atmospheric
chorus rather than a soloist — and the "severe brewing at dusk/night" states
are the most beautiful images the project has produced.

## 3. What I learned about the project

- The viewport crop was silently constraining everything atmospheric; check
  geometry before palettes.
- `Container.tint` (Pixi v8) makes whole-layer color drift nearly free —
  seasons needed one line, not a per-tile pass.
- Subtle multiply washes are invisible sooner than intuition says; verify
  against forced maxima in screenshots, always (same lesson as the suspense
  run's dread tint — it generalizes).
- The unified-glaze model (sky and land under one light) is doing a lot of
  painterly work for very little code; future atmosphere features should join
  it rather than add independent tints.

## 4. Three creative directions next

1. **Window 3 as briefed** — my picks would be atmospheric perspective
   (distant tiles hazier/cooler; cheap, adds depth everywhere) and the
   Ken-Burns drift toward brewing regions (completes the suspense-atmosphere
   marriage).
2. **The land remembers, deeper**: scars currently fade out entirely; a
   second stage where severe scars dry into near-permanent faint marks
   (the crater stays as a ring of differently-colored tiles) would give deep
   time a geology.
3. **Story run**: with atmosphere in place, the chronicle/callback thread
   from the suspense summary ("Where Kalon stood, the grass grows different")
   now has a visual register to anchor to — narration + a lingering scar +
   name memory in one place.

## 5. Honest self-assessment against the brief test

*Window 3's test — does the silhouette stop reading as a hard diamond?* At
defaults, side-by-side with flat: yes — the corners dissolve into sky, the
edges barely bow, and nothing announces "planet." At a glance the stills are
near-identical to the old build, which the brief defines as probably correct.
My honest caveat: the corner haze carries more of the silhouette work than
the geometric bend at default strength — if you turn the haze off expecting
the bend alone to soften the points, it won't; the knobs to reconcile that
are in WINDOW_3_NOTES doubt #3.

*Two minutes of absolute calm — are they still looking?* From the final
natural-pacing watch: within any 2-minute window the viewer gets visible
light movement (a fifth of a day), drifting mist, and usually a season edge
or a scar somewhere in view. It is no longer a still board; whether it's
*beautiful* is your eye's call, and every value that decides it is in `ATMOS`
with a scrub handle (`__atmosphere.setTimeOfDay` / `setSeasonOfYear`). The
scar test passes with margin: impact sites are pointable well past 30
seconds — plague sites for 13 minutes. My own doubts, ranked: cloud shadows
may be too timid in stills (judge in motion), winter may be a step too bold,
and the noon sky is empty until clouds get bodies or texture.

## Window 4 — celestial light + stars (2026-06-11 afternoon)

**1. What I tried:** All four ranked deliverables shipped: a CelestialLight
state (sun/moon windows over the day cycle, intensity through zero at
twilight); water glitter/moon path as a world-space twinkle band masked to
water; a rotating star dome (bright stars lead at dusk); a directional land
gradient. Dead ends: a canvas-sprite alpha mask for the water silently
failed inside the render-texture pipeline (content verified correct — the
mechanism is untrustworthy there); switched to a Graphics stencil mask, the
same mechanism the limb uses, worked immediately. First star pass was
invisible: the scatter dome was huge relative to the visible sky band (~2
stars in view) — fixed by sizing field totals to the ~4% visible fraction.

**2. What works now:** the surface moves between events. Glitter slides and
twinkles across the ocean through the day, hands off to a quiet silver moon
path at night; stars come out one population at a time and the sky visibly
turns; the light has a side, and the world knows it. The omen star still
owns the night when an asteroid brews — verified over the full field.

**3. What I learned:** sprite-as-mask inside a manually rendered container
is not trustworthy in this Pixi version; Graphics stencil masks are. Visible
star density must be budgeted against the *visible band*, not the dome.

**4. Directions next:** star reflections on water (Van Gogh's Rhône); ocean
depth-blues (parked stretch item); the retune pass Lawrence has been
accumulating (winter, cloud bodies, noon sky, moon path strength).

**5. Self-assessment vs the test** (*watch a day-to-night transition for 5
minutes — can you see motion?*): yes by construction now — the band slides
visibly across the ocean within any 2 minutes of day, glints twinkle at
1.4 Hz, dusk brings stars in two waves while the glitter dims and silvers,
and the dome turns ~12° during the watch. My honest caveats: the moon path
and land gradient are at the quiet edge of perceptible (deliberately — both
have scrubbers), and all tuning was done through a software-rendered
headless browser; the twinkle cadence deserves one look at real 60fps.
