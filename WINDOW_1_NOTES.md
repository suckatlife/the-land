# WINDOW_1_NOTES — sky, day/night, catastrophe scars (2026-06-11)

Everything below lives in `ATMOS` at the top of `src/atmosphere.ts`. The
fastest way to tune by eye: open the console and scrub time with
`__atmosphere.setTimeOfDay(0.52)` (0 dawn → 0.25 noon → 0.52 dusk → 0.80 deep
night), and force a scar with the red `catastrophe` button.

## The constants you'll most likely want to touch

| Constant | What it does | My value | Notes |
|---|---|---|---|
| `composition.worldScale` | Size of the world in the frame | 0.68 | **The biggest taste call I made.** The diamond used to overflow the screen (no sky possible). 1.0 + `horizonFrac: 0` restores full-bleed. |
| `composition.horizonFrac` | Where the diamond's top vertex sits | 0.16 | Higher = more sky above the land. |
| `day.cycleSeconds` | Full day-night cycle length | 360 | Brief said 5–8 min. |
| `day.keyframes` | The whole look of the day | 8 keys | Each key: sky top/horizon colors + glaze color/alpha. Add/move/remove freely — interpolation handles any t-sorted list. The glaze is a multiply wash over sky+land together (one light). |
| `day.glazeCap` | Legibility floor at night | 0.55 | Night can't get darker than this. |
| `dreadSkyBlend` | How much the sky joins the dread | 0.55 | 0 = sky ignores brewing catastrophes. |
| `scar.<type>.lifeMs` | Scar persistence | 5–13 min | Plague lingers longest (13 min) by design. |
| `scar.<type>.alpha` | Scar strength | 0.4–0.6 | Multiplied by a severity boost. |
| `scar.colors.*` | Scar palette | umber/clay/bone | Named per material, not per effect. |
| `scar.blur` | Watercolor edge softness | 3 | px of blur on scar art. |

## What shipped

- Sky as a canvas-gradient sprite behind the world; regenerates only when its
  colors move perceptibly. Sky leans toward the brewing catastrophe's hue as
  dread rises, composing with time-of-day (a severe flood brewing at night is
  the best-looking state in the build, in my view).
- Day/night glaze: fullscreen multiply over sky+land, keyframed; the clock
  pauses with the sim; starts at mid-morning on load.
- Scars: each catastrophe leaves a seeded, blur-softened wash at the epicenter
  (scorch+crater / fissures+dust / silt ring that recedes / pale plague veil).
  Hold-then-fade envelope, per-type lifetimes, capped at 10 live, cleared on
  reroll/reset/skip. Severity scales both size (via the sim's real blast
  radius, now carried on the event) and opacity.

## What I skipped and why

- **Building shadow direction across the day** (brief said "if cheap"): not
  cheap — buildings are flat textured sprites with no shadow pass; a believable
  directional shadow means either skewed duplicate sprites (ugly at iso angles)
  or a real lighting pass. The glaze's color temperature carries the time-of-day
  feeling without it. Revisit in Window 3 as "directional lighting" if wanted.
- **Scars surviving skip-5k**: skipped ticks don't render their events, so
  skip clears scars rather than showing stale ones.

## Known seams / my doubts

- `worldScale` shrinks in-world text (civ/city labels) too. Readable at 0.68
  on a 1600×900 view, but if you go smaller, `LABEL.minFontSize`/`maxFontSize`
  in main.ts may want a bump.
- The noon sky is the weakest keyframe — pale ivory-blue, slightly empty. It
  will improve when Window 2 puts clouds in it; I didn't pre-tune around an
  empty sky.
- Earthquake fissures read as a dark smudge at standard zoom; the crack
  structure only shows on closer inspection. Acceptable as a wash; widen
  `quakeCrack` strokes if you want them to read as cracks at distance.
- Performance: headless software-rendering FPS is unchanged by the atmosphere
  additions (the sim's tick accumulator makes the world advance correctly
  regardless). Worth one sanity check in your real browser; nothing here
  renders per-frame except two fullscreen quads and the scar fade alphas.

## Open questions for you

1. Is 0.68/0.16 the right seat for the world, or do you want it larger with
   less sky (e.g. 0.78/0.10)?
2. Should night bottom out darker (glazeCap up to ~0.65) now that the log and
   HUD live outside the canvas?
3. Plague veil currently whitens; an alternative reading is *desaturation*
   (grey rather than pale). Whitening was cheaper and reads at distance — but
   it's a taste call you may want to reverse.
