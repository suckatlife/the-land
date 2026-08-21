# WINDOW_4_NOTES — celestial light + stars (2026-06-11 afternoon)

Scrub live: `__atmosphere.setLightAzimuth(0..1)` / `setLightAltitude(0..1)`
(pass `null` to resume the cycle), `setStarRotation(0..1)`,
`setGlitterStrength(mult)`, `setStarBrightness(mult)`, and the existing
`setTimeOfDay`. Read the computed light any time with `__atmosphere.light()`.
Calibration shots (morning / noon / afternoon / dusk / moonrise / midnight /
dawn, plus omen-star and aftermath at night) are in `celestial_calibration/`.

## What shipped (all four ranked items; #5 stretch skipped)

1. **Directional light** — sun owns the day span of the cycle, moon the
   night; azimuth sweeps 0→1 across each, altitude is a sine arc, intensity
   passes through zero at the twilight handoffs so nothing ever pops. Warm
   low sun → neutral noon → silver moon. No disks anywhere.
2. **Water glitter / moon path** — a band of light on the ocean that slides
   with the light's azimuth, twinkling (two glint layers crossfading in
   counter-phase), stopping exactly at coastlines, bending with the planet.
   Narrower and quieter under the moon.
3. **Star field** — a rotating dome (one turn / 30 min) of ~4% visible
   sparse stars, brightness-varied, occasional faint blue/amber. Bright
   stars lead at dusk and linger into dawn. The brewing-asteroid omen star
   renders above the field and clearly dominates it (verified at night).
4. **Land directional response** — an additive gradient from the light's
   side; gone at noon (no direction) and at twilight (no light).

## Constants you'll most likely want to touch (`ATMOS` in atmosphere.ts)

| Constant | What it does | My value | Notes |
|---|---|---|---|
| `glitter.dayAlpha` / `nightAlpha` | Band strength | 0.45 / 0.30 | Scaled by light intensity; scrub `setGlitterStrength` live first. |
| `glitter.dayWidthFrac` / `nightWidthFrac` | Band width | 0.30 / 0.13 | Fraction of world width. |
| `glitter.twinkleSpeed` | Glint crossfade rate | 1.4 | Cycles/sec. |
| `celestial.sunRise` / `sunSet` | Day span of the cycle | 0.96 / 0.56 | In dayT; must bracket the dawn/dusk keyframes to feel right. |
| `celestial.sunColorLow/High`, `moonColor` | Light palette | warm/neutral/silver | |
| `celestial.moonIntensity` | How bright the night light is | 0.40 | |
| `stars.count` / `brightCount` | Field totals | 1300 / 110 | ~4% visible at once — tune by the *visible* feel. |
| `stars.rotationMinutes` | Sky rotation period | 30 | |
| `stars.poleX/poleY` | Celestial pole | 0.64 / 0.09 | Fraction of viewport. |
| `landLight.strength` | Directional land gradient | 0.10 | The most subtle system; 0 disables. |

## Ranked doubts

1. **Moon path may be too quiet.** At `moonIntensity 0.40 × nightAlpha 0.30`
   the silver path is barely-there. It's "moonlight, not sun" per the brief,
   but if it doesn't read on your monitor, `setGlitterStrength(1.5)` at night
   is the first test.
2. **Glitter strength at noon** is a taste call I made at 0.45 after seeing
   3× (too much) and 0.30 (too little). Judge in motion — the twinkle adds
   presence stills don't show.
3. **Headless software-rendering FPS dipped** (~3 → ~2.5) with the add-blend
   sprites + stencil mask. On GPU this is noise, but it's the same caveat as
   Window 3: one sanity check in your real browser, please.
4. **Land gradient** is felt-not-seen as designed, which means it's close to
   invisible. If you can't feel it either, raise `landLight.strength` to
   ~0.18 and see if the morning/evening light gains direction.

## Didn't ship

- Item 5 (ocean color variation by depth/latitude) — stretch rule; parked in
  IDEAS.md. The per-tile depth-blue is cheap to add at drawBiomes time if
  you want it next window.

## Mask saga (for the record)

A canvas-sprite alpha mask for the water silently failed inside the
world→RenderTexture pipeline (the canvas content was verified correct; the
masked layer just never showed). Switched to a Graphics stencil mask — the
same mechanism the limb mask already uses — and it worked immediately.
Sprite-as-mask inside a manually-rendered container is apparently not
trustworthy in this Pixi version; avoid it.
