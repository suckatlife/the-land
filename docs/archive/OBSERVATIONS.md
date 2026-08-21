# OBSERVATIONS — atmosphere run, 2026-06-11

Start-of-run read, after the suspense run (see that branch's FABLE_RUN_SUMMARY)
and a 6-minute re-orientation watch (screenshots in /tmp/watch/re_*.png,
including a manual catastrophe with +5s/+30s/+60s aftermath shots).

## Repo state note

The brief says the suspense branch was merged to main; it wasn't — main is
still at the pre-suspense checkpoint. This branch forks from
`fable-run-2026-06-10`'s tip so all suspense mechanics are present, per the
hard constraint. Worth resolving the merge before this branch lands.

## What calm looks like now

- The world floats on a flat cream page (`background: '#e8e2d4'`). There is no
  sky, no horizon, no sense of air. The iso diamond reads as a game board on
  paper — precisely the "board, not place" problem the brief names.
- Light is constant and shadowless: eternal flat noon. Nothing in the visual
  field moves on its own except tile-state lerps and the occasional expedition
  dot. Between events, nothing drifts, nothing breathes.
- The dread system is the *only* atmospheric register. When pressure is low
  (most of the time, especially the ~5-minute calm after a catastrophe), the
  world is at its flattest exactly when the brief's 2-minute-calm test would
  be administered.
- The palette substrate is actually friendly to washes: biome colors are
  already muted, civ tints are ~50% alpha overlays, era treatments desaturate.
  A unifying glaze over the whole sheet should harmonize rather than fight.

## The aftermath problem, measured

Manual catastrophe, screenshots at +5s/+30s/+60s: at +5s the epicenter ring
is already nearly gone (it fades in ~2.5s by design); at +30s the only trace
is ruin-tinted tiles that read identically to ordinary decay-ruins anywhere
else on the map; at +60s nothing distinguishes the impact zone at all. A
viewer who blinked has no way to point at where it hit. Lawrence's complaint
reproduces exactly.

## Render architecture notes for the work

- Layering is friendly: a sky layer slots in at stage index 0 behind the
  `world` container; a scar layer slots inside `world` above `simLayer`
  (scars must sit over civ tints to be visible where catastrophes actually
  hit) and below `buildingLayer`.
- The dread tint/vignette are fullscreen multiply/normal layers on the stage.
  A day/night glaze can use the same pattern — one fullscreen multiply over
  sky and land together is coherent (a unifying wash), with the sky palette
  tuned knowing the glaze sits on top.
- `catastrophe` events don't currently carry the blast radius (computed
  internally in `applyCatastrophe`); scars need it — small additive sim
  change.
- The watch/screenshot/observe tooling from the suspense run all still works
  and is the iteration loop for this run too.

## Risks

- Taste risk is the named one: hues/alphas/rates are all guesses until
  Lawrence tunes. Mitigation: every value in clearly-named grouped constants.
- Banding in sky gradients at these subtle color distances; mitigate with
  canvas-gradient textures rather than rect stacks.
- Night must not destroy legibility — the multiply ceiling at night is the
  most dangerous single constant for the screensaver use case.
