# Plan — a camera that moves

**Status:** proposal, for review. Nothing built.
**Scope:** where the world is looked at from. No sim changes, no new interaction
in phase 1.

**Why now:** three threads converge on it. Mobile in portrait shows a fragment
of coastline rather than a world (#19 fixed the controls, not the framing);
`docs/plans/landscape.md` §11 concludes camera agency is *"nearly free, cannot
manufacture spectacle, cannot break determinism"*; and Lawrence's *"agency is
optional"* points at exactly this — choosing where to look costs the passive
viewer nothing. A competitor, IMAGINERY, has already shipped it as a
*"documentary camera."*

---

## 1. What the camera is today

**Fixed.** Verified in the code:

| | |
| --- | --- |
| `world.x` / `world.y` | set **once** at init (`main.ts:1148-1149`), never touched again |
| `world.scale` | set once to `captureScale` |
| `app.stage.scale` | the breathing — a slow ~1.0× pulse, not a camera |
| `worldPlane.x` / `.y` | moved **only** for catastrophe shake |

So there is no camera abstraction to extend; there is a static transform and one
clean place to put one.

## 2. The pipeline decides the approach

```
world container ──► worldRT (RenderTexture, fixed WORLD_CAPTURE rect)
                      └─► worldPlane (MeshPlane, 110×36, curvature applied)
                            └─► app.stage
```

Three possible insertion points, and only one is right:

**a. Move `worldPlane`** — pans the *already-curved image*. Cheapest, and shake
already does it. **Wrong for a camera:** the curvature and its horizon are baked
relative to the plane, so panning slides the globe's edge off-screen. The planet
would stop being a planet.

**b. Move the `world` container before capture — recommended.** Changes *which
part of the world* lands in the fixed capture rect. The curvature stays anchored
to the screen, so the horizon holds still and the land moves beneath it — which
is what looking at a different part of a planet should look like.

**c. `app.stage.scale`** — scales the sky too. Not a camera.

## 3. The gotcha, found while reading

**`depthHazeSprite` is a child of `world`** (`main.ts:1100`) and positioned at
`WORLD_CAPTURE.x0/y0`. Pan the world and the depth haze pans with it — but haze
belongs to the *horizon*, not to the land. It would slide around like a stain.

It needs to be counter-offset by the camera, or reparented out of `world` and
composited separately. This is exactly the kind of thing that would have been
found three days into implementation instead.

## 4. Cost — the unusual part

**This does not touch the fill budget.** Same render-texture size, same draw
calls, same layer count; a camera is a transform on an existing container.

That matters because the standing performance worry — two unmeasured
screen-blend layers in the most expensive frame — does not apply here. **A
camera is one of the few things on the roadmap that is free at the pixel level.**

*Zoom is the exception:* `worldRT` is sized to `WORLD_CAPTURE × captureScale`, so
zooming in magnifies a fixed-resolution texture. `magFilter` is already
`nearest`, so it would go crunchy rather than blurry — arguably fine for pixel
art, but it is a real limit and an argument for **panning without zooming** in
phase 1.

## 5. Determinism

A camera is pure rendering: it reads the sim and never writes to it, so seeds
still reproduce worlds exactly.

**But the honest guarantee changes.** Two viewers of one seed would see the same
*world* and possibly a different *view of it*, if the camera's choices depend on
anything frame-timed. Either make the camera's decisions a function of world
time only — deterministic, and the better option — or state plainly that the
view is not part of what a seed reproduces. This is the same distinction #22
ran into between a seeded sim and non-deterministic narration.

## 6. The real risk: soft fascination

`docs/plans/landscape.md` §3, from Kaplan: **soft fascination** leaves mental
space for reflection; **hard fascination** captures attention completely, and is
why games are classed as non-restorative. The test is *can a viewer think about
something else while watching?*

**A camera that chases every event fails that test.** If the frame snaps to each
war and eruption, the viewer starts tracking the camera — anticipating cuts,
following the story — and the piece converts to hard fascination. That would be
a real loss, not a trade.

**So the camera should drift, not chase.** It moves slowly and continuously,
biased *gently* toward where activity is, and often arrives after the interesting
thing has already happened. Being slightly late is correct — it preserves the
research's other finding, that **waiting is what makes an arrival an event**.

**Design rule: the camera should never make a viewer feel they are being shown
something.** If it reads as direction, it is too fast or too accurate.

## 7. What phase 1 should do

Two things, both independent of event awareness:

**a. Fit the world to the viewport.** The actual mobile fix. At 390×664 the
current framing shows a fragment; the camera should frame the *world*, adapting
to aspect ratio. This alone is worth shipping and involves no motion at all.

**b. A slow drift.** A wandering path across the world with long dwells, on
`worldClock` so it obeys pause and the speed control like everything else. No
event awareness yet — this establishes the motion vocabulary and lets the speed
be judged before anything depends on it.

Phase 2 adds a gentle bias toward activity. Phase 3 is optional manual control —
drag to look, tap to identify — which is also the touch answer to the field guide
being pointer-only.

## 8. Verification

Headless, against the built bundle:

1. **Portrait framing** — at 390×664 assert the visible world spans a defined
   share of the map, not a fragment. This is the mobile regression test that
   does not currently exist.
2. **Speed ceiling** — sample camera position per frame and assert movement per
   world-second stays under a threshold. The single most important number here.
3. **Pause and speed** — the camera freezes when paused and compresses at 4x,
   like every other clock (this project has fixed that bug four times).
4. **Act 4** — assert whatever we decide in §9.4, because the silence took
   eleven systems to enforce and this would be the twelfth.
5. **Frame cost** — FPS before and after, to confirm §4's claim rather than
   assert it.

What cannot be verified headlessly: whether the motion is *pleasant*. That is
the whole feature, and it needs the preview.

## 9. Open questions

1. **How slow?** The entire risk lives here. My instinct is far slower than
   feels right when tuning — a full traverse over minutes, not seconds.
2. **Drift or dwell?** Continuous slow motion, or long stillnesses with slow
   moves between them? Stillness suits the register; motion suits the framing
   problem.
3. **Should it ever show the whole world?** An occasional pull-back is an
   establishing shot and it is how a viewer learns the shape of a world — but it
   is also the most "directed" thing the camera could do.
4. **Does it move during the ending?** Act 4 holds a dead world in silence. A
   camera drifting over it might be the best moment in the piece, or the thing
   that breaks the stillness eleven systems were gated to protect.
5. **Zoom at all?** §4 says the render texture makes zoom crunchy. Pan-only is
   cheaper, safer, and probably enough.
6. **Portrait and landscape want different framings.** Should a phone see a
   smaller area at the same tile size, or the same area smaller?
