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

## The constants you'll most likely want to touch

All in `ATMOS.curve` in `src/atmosphere.ts`:

| Constant | What it does | My value | Notes |
|---|---|---|---|
| `curvature` | The 0..1 knob: how far the wings rise toward the horizon arc | 0.62 | 0 = the old flat diamond exactly. 1 = flat-topped dome (too much; far columns stretch ~35%). |
| `perspective` | The 0..1 knob: far-row bunching + far-edge pinch | 0.45 | Independent of curvature; scrub separately. |
| `remapMax` | How far curvature=1 travels from tent to arc | 0.55 | The master range of the knob. |
| `arcSagFrac` | Horizon arc droop from apex to sides | 0.11 | Smaller = flatter horizon line; larger = rounder dome. |
| `arcPower` | Arc shape | 1.7 | 2 = flat crown diving at the ends, 1 = conical. |
| `apexRoundFrac` | How wide the apex rounds into a crown | 0.45 | The "it's actually a curve" knob — smaller brings the point back. |
| `vertCompressFrac` | Far rows bunch toward the horizon (t^(1+this)) | 0.35 | The fake-perspective depth feel. |
| `pinchMaxFrac` | Far-edge horizontal narrowing | 0.16 | |
| `edgeFeatherAlpha` / `edgeFeatherWidth` | Sky-tinted wash on the far shorelines | 0.5 / 42 | Kills the ruled-line reading. 0 = off. |
| `edgeHazeAlpha` / `edgeHazeSize` | Corner-haze strength / radius (world px) | 0.55 / 500 | Now world-space — bends with the mesh. |

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
