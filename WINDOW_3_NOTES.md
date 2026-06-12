# WINDOW_3_NOTES — planetary curvature + fake perspective (2026-06-11)

Scrub live from the console: `__atmosphere.setCurvature(0..1)` and
`__atmosphere.setPerspective(0..1)`. Calibration screenshots are in
`curvature_calibration/` — flat / default / overshoot triples at two window
sizes (`narrow_*` = 1330×916 like your morning screenshot, `wide_*` =
1600×900). Compare a triple before touching anything.

**Post-review revisions (two rounds):**

1. Your "no bend visible" report: the first curve shape put all its curvature
   at the side corners, which narrower windows crop out of view.
2. Your "the world should go up to the curve" note became the design. The
   curvature knob is now a **silhouette remap**: each column's upper edge is
   pulled toward a horizon arc through the apex — the diamond's wings *rise*
   to meet the curve, the far surface compresses toward the horizon, the
   front edge stays pinned. The visible top of the world is the horizon.
   (The floating arc you saw was also a bug — fog banks clipping at the
   world texture's top edge — now fixed; fog fades near the apex.)
3. Your "it's not a curve" report: the silhouette was a 32-column polyline
   and the apex kept its kink through the partial lerp. The mesh is now
   110×36 and the apex point rounds into a crown (`apexRoundFrac`), so the
   top edge is one continuous smooth limb.
4. Your "seam in the center / arc of a globe" report: the seam was the
   compression rate jumping at the center column (the mapping compressed
   from the diamond's true, kinked edge). The mapping now uses the smooth
   softened edge everywhere — seamless.
5. Your mockup became the construction. The world now has **no diamond
   boundary at all**: an ocean apron extends the sea (with its grid) past
   the terrain in every direction, and a screen-space **circular limb mask**
   clips the world at a true circle through the apex — the silhouette is a
   planet's limb by construction at any window size, and the far world
   genuinely disappears behind the horizon, like your mockup's upper-left.
   The haze band lies along the limb arc, tinted to the live sky. Scars,
   labels, weather, dread all render inside the cap unchanged.

## The constants you'll most likely want to touch

All in `ATMOS.curve` in `src/atmosphere.ts`:

| Constant | What it does | My value | Notes |
|---|---|---|---|
| `curvature` | The 0..1 knob: how planetary | 0.62 | Drives the limb circle's sag AND the interior surface bend. Below 0.05: mask + ocean apron disappear, the flat diamond returns. |
| `perspective` | The 0..1 knob: far-row bunching + far-edge pinch | 0.45 | Independent of curvature; scrub separately. |
| `limbSagMax` | Horizon arc drop at the frame edge at curvature=1 | 0.80 | Fraction of half-width. The single biggest "globe-ness" number. |
| `limbHazeAlpha` / `limbHazeWidth` | Haze band lying along the limb | 0.55 / 64 | Tinted live to the horizon color. |
| `composition.horizonFrac` (main seat) | How much sky above the horizon | 0.24 | Raised from 0.16 to match your mockup's framing. |
| `remapMax` | Interior surface bend toward the horizon | 0.35 | Gentler now — the limb mask owns the silhouette; this just curves the surface. |
| `vertCompressFrac` | Far rows bunch toward the horizon (t^(1+this)) | 0.35 | The fake-perspective depth feel. |
| `pinchMaxFrac` | Far-edge horizontal narrowing | 0.16 | |
| `arcSagFrac` / `arcPower` / `apexRoundFrac` | Interior bend shape | 0.11 / 1.7 / 0.45 | Rarely touch now. |

## How it works (so the knobs make sense)

The world container renders into a fixed RenderTexture each frame and is
drawn through a bent 32×22 mesh. The bend is a planetary drop ∝ distance²
from the front-center of the view — the back edge and the far corners fall
away; the front stays pinned and crisp. Perspective pinches the far edge
narrower and squeezes the far rows. Three soft corner hazes (tinted live to
the sky's horizon color, including the dread lean) melt the diamond's points
into the air; they scale with the curvature knob so 0 really is the old
build. Mesh vertices update only when a knob moves — per-frame cost is one
render-texture pass.

Because the bend is applied to the rendered world as a whole, everything in
world space — scars, shockwave rings, cloud shadows, mist, markers, labels —
curves together by construction. Nothing in the sim or the world-space math
changed.

## Verification done

- `0_flat_current_build.png` is pixel-identical to the pre-curvature build
  (the RT path is faithful).
- All four catastrophe types leave scars at the right spots through the mesh;
  brewing → omen → impact → scar flow intact; manual button path intact.
- City markers and name labels confirmed sitting on their cities (zoomed
  crop), bending with the world.
- Sky/glaze/dread/vignette are screen-space and untouched; shake moves the
  mesh; `setTimeOfDay`/`setSeasonOfYear` scrubbers still work.

## Ranked doubts

0. **Far-column tile stretch.** The remap vertically stretches the columns
   near the side corners (~20% at default, worst at the extreme wings). I
   couldn't see it at a glance in stills; if it bothers you in motion, lower
   `curvature` or `remapMax` — the stretch scales with them.
1. **Performance is the one thing I couldn't verify on real hardware.** In
   the software-rendered headless browser the RT pass costs ~35% of frame
   time (5.5 → 3.5 FPS there). On a GPU this should be a cheap extra pass —
   the world was being rendered every frame anyway — but please sanity-check
   FPS in your browser; if it stutters, the RT `resolution` cap (currently
   min(devicePixelRatio, 2)) is the first lever.
2. **Default may be too subtle in stills.** Per the brief that's the correct
   failure direction, and side-by-side with flat the difference is clear.
   If you want a touch more presence, nudge `curvature` toward 0.65 before
   touching anything else.
3. **The corner haze is doing a lot of the silhouette work.** The geometric
   bend alone (haze 0) leaves the corners sharp at default strength. If you
   dislike the haze, the honest alternative is more curvature, not less haze.
4. Labels fade in over a few dozen *frames* (pre-existing frame-rate-coupled
   easing, exposed by slow renderers, invisible at 60fps). Parked in
   IDEAS.md.

## Out of scope, noted in passing (for the retune pass)

Winter cast strength, cloud bodies / empty noon sky, and the
frame-rate-coupled eases (labels, tile lerps) — none touched, per the brief.
