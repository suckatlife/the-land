# PLAN — atmosphere run, 2026-06-11

## Hypothesis

The world reads as a board because nothing touches it from above: no sky, no
light temperature, no memory of damage. One new module (`src/atmosphere.ts`)
owning a sky gradient, a day/night glaze, and persistent painterly scars will
convert the existing muted palette into "a place" — and because all three are
keyframe/constant-driven, Lawrence can tune the entire look without reading
the system code.

## Window 1 moves (each commits)

1. **`src/atmosphere.ts` skeleton + sky layer.** Canvas-gradient sky texture
   behind the world, colors from a keyframed day-cycle palette (dawn / noon /
   dusk / night), regenerated only when colors actually change. Sky lerps
   toward the dread hue as dread rises — the sky joins the suspense system
   from day one.
2. **Day/night glaze.** A fullscreen multiply layer above the world (same
   pattern as the dread tint), color+alpha keyframed across the cycle:
   neutral noon (alpha→0), warm dawn/dusk, cool blue night with a hard
   legibility ceiling. One full cycle ≈ 6 minutes (tuneable), clock pauses
   with the sim. Building shadow direction: assessed, likely skipped as
   sprite-unfriendly — noted in WINDOW_1_NOTES.
3. **Persistent scars.** Sim: `catastrophe` event gains `radius`. Renderer:
   a scar layer inside the world above `simLayer`; each catastrophe spawns a
   seeded, painterly, blur-softened Graphics (asteroid scorch+crater,
   earthquake cracks, flood silt ring, plague pallor veil) that holds, then
   fades over minutes (per-type lifetime constants; plague lingers longest).
   Cap ~10 live scars; cleared on reroll/reset/skip.
4. **Smoke test + tune pass.** Manual catastrophe → brewing → omen → impact →
   scar lifecycle end-to-end; screenshot day-cycle keyframes and each scar
   type at +30s/+2min/+8min; check FPS. Then `WINDOW_1_NOTES.md` with the
   Lawrence-facing constants table, and the window-1 commit.

## Windows 2–3 (sketch, revisable)

- W2: drifting cloud/fog alpha fields (canvas-noise textures, slow
  translation), seasonal palette drift (15–30 min cycle modulating biome and
  sky keyframes), era atmosphere (extend ERA_TREATMENT's register to the new
  layers: clearer neolithic air, industrial haze), dread re-integration so
  sky+clouds carry the brewing color rather than just the ground multiply.
- W3: at most two of: tile-level wash variation, water ripple/grass motion,
  Ken-Burns drift toward brewing region, atmospheric perspective.

## Rules I'm holding myself to

- Painterly checklist on every visual: soft edge? muted? would a wash do it?
- Every magic number lives in the `ATMOS` constants block with a comment
  saying what changing it does.
- Tempting extras go to IDEAS.md, not the code.
- No src edits or git operations while a watch session is recording.

## Window 3 addendum — curvature (2026-06-11, after Lawrence's W1+2 review)

**Problem:** with a sky behind it, the hard diamond silhouette reads as a
stage set. **Fix:** subtle planetary curvature + cheap fake perspective.
Overshoot is the failure mode; ~5° max, felt not seen.

**Approach: render-to-texture + bent mesh** (the brief's "cheap and possibly
better" option), chosen over per-tile offsets after reading iso.ts: tiles are
thousands of individually-positioned Graphics with fixed local diamond
geometry, so per-tile curvature touches every consumer (tiles, overlays,
buildings, markers, labels via raw centroid math) and forces a full scene
rebuild on every scrub. The mesh route:

- The `world` container leaves the stage and renders each frame into a
  fixed-size RenderTexture (world-space capture, window-size independent).
- A `MeshPlane` (~24×16 vertices) draws that texture where the world used to
  sit. Curvature = vertex displacement: planetary drop ∝ distance² from the
  front-center anchor (back and corners fall away); perspective = horizontal
  pinch + vertical compression toward the back.
- Vertices change only when the knobs change → scrubbing is free;
  per-frame cost is one RT pass of a scene that was being rendered anyway.
- Everything in world space (scars, shockwave rings, cloud shadows, mist,
  labels, markers) bends together for free; screen-space layers (sky, glaze,
  dread tint/vignette, star, flash) are untouched.
- Shake moves the mesh instead of the world container.

Constants in `ATMOS.curve` (curvature, perspective, bowMaxFrac, pinchMaxFrac,
vertCompressFrac); scrubbers `__atmosphere.setCurvature/setPerspective`,
defaults mid-range, calibrated so 1.0 overshoots and 0 is the current build.

Verification: calibration screenshots (0 / default / 1) into
`curvature_calibration/`; smoke test all four scar types' positions, labels
on cities, sky relationship, suspense flow end-to-end.
