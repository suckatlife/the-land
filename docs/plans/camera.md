# Plan — a camera that moves

**Status:** proposal, for review. Nothing built.
**Scope:** where the world is looked at from. No sim changes, no new interaction
in phase 1.

**Why now:** three threads converge on it. Mobile in portrait shows a fragment
of coastline rather than a world (#19 fixed the controls, not the framing);
the landscape research concludes camera agency is *"nearly free, cannot
manufacture spectacle, cannot break determinism"*; and Lawrence's *"agency is
optional"* points at exactly this — choosing where to look costs the passive
viewer nothing. A competitor, IMAGINERY, has already shipped it as a
*"documentary camera."*

**Note on citations:** this plan leans on `docs/plans/landscape.md`, which is
**not merged** — it is PR #23. Every reference to it below is unverifiable until
that lands, and if #23 is reshaped, §6 here goes with it.

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
composited separately.

**And it is not alone — the ocean apron is worse.** `drawOceanApron()`
(`main.ts:1998`) draws exactly the `WORLD_CAPTURE` rectangle, and the RT render
clears everything outside it. Pan the world and the apron moves with it,
**uncovering a transparent strip along one texture edge — sky or stars showing
through inside the planet.** Counter-offsetting the haze does not help.

So the rule is broader than one sprite: **layers that are fixed to the capture
rect must stay fixed while the camera moves.** Either keep them stationary, add
enough overscan to cover the pan, or bound the camera so the uncovered region is
never reached. Auditing which layers are capture-fixed and which are world-fixed
is a phase 1 task, and this plan does not yet have that list.

## 3a. Every screen-space projection needs the camera offset

Moving `world` moves what is *drawn*, but not what the code *believes* is on
screen. `toTex()` (`main.ts:1223`) converts world coordinates to texture
coordinates using **only** `WORLD_CAPTURE` and `captureScale` — it does not read
the container transform:

```ts
const toTex = (wx, wy) => ({
  x: (wx - WORLD_CAPTURE.x0) * captureScale,
  y: (wy - WORLD_CAPTURE.y0) * captureScale,
});
```

So during any nonzero pan, everything projected through it detaches from its
ground: space elevators and rocket launches drawn in screen space, the
inspector's hit-testing, and — easy to miss — **narration anchors**
(`main.ts:792`), which point at the map.

**The contract must carry the whole camera, not just the offset.** §7a requires
a zoom-out, so the camera is a *scale and* a translation. If the scale is applied
to the `world` container but `toTex` keeps using the fixed `captureScale`, the
rendered tiles move to the new magnification while every overlay and cached hit
point stays at the old one. Whatever transform the camera applies has to be the
same transform the projection consumes.

**For the live projections it is one choke point.** `tileToSky` and
`worldPointToSky` both go through `toTex`, and there are **23 call sites**
between them. Adding the camera offset inside `toTex` fixes all of them at once;
missing it breaks all of them at once, silently, as things floating in the wrong
place.

**But hit-testing is cached, and `toTex` alone does not reach it.**
`rebuildInspectorProjection()` (`main.ts:8185`) projects **every tile — 9,216 of
them —** into screen space once and refreshes only on resize. `inspectWorldAt()`
then searches that cache. With a moving camera the drawing moves and the
hit-testing does not, so the field guide would identify whatever *used* to be
under the pointer.

Naive per-frame rebuilding is not the answer either: that is 9,216 projections
every frame, in the frame this project is already fill-bound in. Three options:

- **Throttle the rebuild** — every N frames. Simple; leaves hit-testing slightly
  stale, which for a passive inspector is probably imperceptible.
- **Project on demand** — reproject only candidate tiles at query time, since
  queries happen on pointer move rather than per frame.
- **Cache in texture space instead of screen space — cheapest if it works.**
  A camera pan is a uniform translation *in texture space*, so a texture-space
  cache stays valid under a subtraction. The catch is that `atmos.project` (the
  curvature) is **non-linear**, so this requires inverting it once per query
  rather than projecting 9,216 times. **Whether the curvature is cheaply
  invertible is a prototype question, not a known.**

This belongs in phase 1 alongside the `toTex` change, not as a follow-up.

## 4. Cost — the unusual part

**This does not touch the fill budget.** Same render-texture size, same draw
calls, same layer count; a camera is a transform on an existing container.

That matters because the standing performance worry — two unmeasured
screen-blend layers in the most expensive frame — does not apply here. **A
camera is one of the few things on the roadmap that is free at the pixel level.**

**Zoom needs splitting in two, and an earlier draft of this plan got it wrong.**

- **Zooming *in* magnifies** a fixed-resolution texture. `magFilter` is
  `nearest`, so it goes crunchy rather than blurry — arguably fine for pixel art,
  but a real limit. **Avoid.**
- **Zooming *out*** is where an earlier draft of this plan was wrong. I claimed
  `minFilter: linear` makes it safe. **It does not apply.** That filter governs
  sampling of the *completed* render texture; scaling the `world` container
  before capture rasterizes its children smaller **into an unchanged RT**, so the
  minifier never runs. Scaling `worldPlane` *would* invoke it — but that shrinks
  the already-curved planet against a limb anchored to the screen, which is the
  §3 failure in another form.

**So there is no known-safe zoom path yet**, and §7a's portrait fit depends on
one. That makes it the first thing to prototype rather than a detail to settle
later — see §9.5.

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

**a. Fit the world to the viewport — and this cannot be done by panning.**
The plane is `3200 × 0.68 =` **2176px** wide. A 390px portrait viewport can only
ever *crop* a different part of that; panning cannot make more of the map
visible. An earlier draft of this plan prescribed pan-only in §4 and then asked
phase 1 to "frame the world", which is a contradiction.

**And §4 shows the zoom-out path is not yet known-safe either.** Scaling the
`world` container before capture bypasses the RT minifier entirely; scaling
`worldPlane` invokes it but shrinks the curved planet against a screen-anchored
limb. Both leave the same open question: how a smaller world relates to a **fixed
horizon**.

**So phase 1a is a prototype before it is a feature.** That is a change from an
earlier draft, which called the viewport fit shippable on its own. It may still
be — but only once one of the two scaling paths is shown to work.

This alone is worth shipping and involves no motion at all.

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
5. **How does a minified world sit inside a fixed limb?** §7a's portrait fit
   requires zooming out, and the curvature is anchored to the screen. Does the
   horizon scale with the world, or does the world shrink inside it? This is the
   one open question that is a prototype rather than a preference.
6. **Portrait and landscape want different framings.** Should a phone see a
   smaller area at the same tile size, or the same area smaller?
