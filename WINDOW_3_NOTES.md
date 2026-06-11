# WINDOW_3_NOTES — planetary curvature + fake perspective (2026-06-11)

Scrub live from the console: `__atmosphere.setCurvature(0..1)` and
`__atmosphere.setPerspective(0..1)`. Calibration screenshots are in
`curvature_calibration/` — flat (0), defaults, overshoot (1). Compare those
three before touching anything.

## The constants you'll most likely want to touch

All in `ATMOS.curve` in `src/atmosphere.ts`:

| Constant | What it does | My value | Notes |
|---|---|---|---|
| `curvature` | The 0..1 knob: how far the back/corners fall away | 0.55 | 0 = the old flat build exactly. 1 = deliberately too much. |
| `perspective` | The 0..1 knob: far-edge pinch + far-row squeeze | 0.45 | Independent of curvature; try scrubbing them separately. |
| `edgeHazeAlpha` | Corner-haze strength at curvature=1 | 0.55 | Set 0 to kill the haze entirely (pure geometric bend). |
| `edgeHazeSize` | Corner-haze radius, px | 340 | |
| `bowMaxFrac` | Calibrates what curvature=1 means (corner drop) | 0.085 | Rarely touch; rescale only if the whole knob range feels wrong. |
| `pinchMaxFrac` / `vertCompressFrac` | Calibrate perspective=1 | 0.16 / 0.05 | Same. |

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
