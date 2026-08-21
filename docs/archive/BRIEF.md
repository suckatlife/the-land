# Fable Run Brief — the-land, atmosphere run, 2026-06-11

**Date queued:** [fill in]
**Expected duration:** Multi-window — 2-3 consecutive 5-hour windows, with checkpoints between
**Priority:** focused — atmosphere dimension, with one carryover from the suspense run
**Model:** Claude Fable 5
**Branch:** `fable-run-atmosphere-<YYYY-MM-DD>` (do not commit to main)

## Important: this run overrides parts of CLAUDE.md (same as last time)

The standing `CLAUDE.md` describes a collaborative working mode where Lawrence is at the keyboard. That mode is suspended for this run. After this run completes, CLAUDE.md's normal mode resumes.

For this run specifically:
- **You are making taste calls.** Lawrence won't be at the keyboard during work sessions but will review between windows.
- **Working on a branch.** Commit frequently. No main commits, no remote push.
- **Architecture changes are permitted** if they advance the experiential goal.

**Document precedence:** `STATE_2026-06-10.md` is authoritative on current code state. `CLAUDE.md` has drifted in significant ways. Where they disagree, STATE wins. CLAUDE.md's hard-won invariants — snapshot-before-mutate, `fadedDeadCivs` repaint, `maxDecaysPerCivPerTick`, capital protection, breakaway throttle, era-inheritance at birth, name-memory radius, seed persistence, "no Pixi in sim.ts" — remain non-negotiable.

## What just happened (carry-over context)

The previous Fable run (branch `fable-run-2026-06-10`, merged into main as of [fill in]) shipped a suspense subsystem: brewing catastrophes, omens, ambient dread tint+vignette, impact punctuation, spared/rally/last-flight mechanics, narration throttling, procedural Web Audio. Read `FABLE_RUN_SUMMARY.md` from that run for the full picture and the three creative-next-direction recommendations. The atmosphere direction (recommendation #1) is what this brief addresses.

**One piece of carryover feedback from Lawrence's morning review:** the suspense work landed — there's a real sense of dread now — but *the impact location is still hard to see visually*. The shockwave ring at the epicenter fires but doesn't persist. After a catastrophe, you can't easily look at the world and see where it hit. **This is part of this run, not a separate fix.** The reason: persistent catastrophe scars are themselves atmosphere — they're how the world wears its history. Fold the fix into the atmosphere work, don't bolt it on.

## The brief

Atmosphere. The world needs to feel like *a place* rather than a board.

After the suspense run, dread is the only atmospheric register the world has — the air gets heavy before catastrophes and clears after. The rest of the time, the world is visually flat: cheerful daylight, no sky, no weather, no time of day, no sense that the land lives between events. The dread system should be one voice in a larger atmospheric chorus, not a soloist.

This is the most aesthetically loaded dimension of the three. Lawrence is a watercolor and ink painter, and his taste here will be the final filter. Your job is to build the system; Lawrence will tune the palettes between windows.

### Aesthetic anchors

- **Painterly, not photographic.** This is a watercolor/ink-trained eye. Soft edges over hard edges, washes over gradients, atmosphere over precision. Think Tang dynasty landscapes, Annie Dillard's deep-time prose, the muted palettes of Studio Ghibli's quieter scenes (not the bright fantasy ones), early Miyazaki's *Future Boy Conan* skies. Avoid: hyper-saturated fantasy, anime-bright, "epic" lighting, photorealism.
- **Light as a medium.** The sky isn't a backdrop, it's a layer that touches everything. Light has color temperature. Shadow has color too. A noon scene and a dusk scene should differ in *what color the shadows are*, not just brightness.
- **Calm has texture of its own.** The world between catastrophes needs to be visually interesting. Drift, motion, slow change, ambient detail. A still world is a flat world.
- **Time at multiple scales.** Day/night is fast (minutes). Seasons are slow (10s of minutes). Eras are slower still (the world's *climate* changes over geological time). All three should be present and felt without being announced.
- **The land remembers.** Catastrophe scars persist. Old ruins fade slowly. A river that flooded leaves silt. A region that suffered plague stays pale for a long time. The world's history is written on its surface.

### Brief test

A new viewer opens the screensaver. They watch for 2 minutes in absolute calm — no catastrophes, no events of consequence. **Are they still looking?** That's the test. If the viewer can sit in calm and find the world beautiful enough to keep watching, atmosphere has landed.

A secondary test for the catastrophe-scar work: after a catastrophe, the viewer should be able to point at the screen and say "that's where it hit" for at least 30 seconds after impact.

## Window structure

This is a multi-window run. Each window is self-contained — if you stop after window 1, the project is in a coherent state. If you stop after window 2, even more so. Window 3 is polish.

Between windows, Lawrence will watch the build, possibly tune palette/timing constants, and write notes to `INTER_WINDOW_NOTES.md` for you to read at the start of the next window. Treat those notes as priority input — they're the taste-lead correcting your taste-calls.

### Window 1: Foundations + catastrophe aftermath

**Goal:** The world has a sky, time of day, and visible scars where catastrophes hit. Ship this even if windows 2-3 never happen.

Specifically:
1. **A sky layer.** Currently there's no sky — the iso world floats on a flat background. Add a sky as its own Pixi layer behind the biome layer. The sky's color is driven by time-of-day and brewing state.
2. **Day/night cycle.** Slow — one full day-night cycle over ~5-8 minutes of viewing time. The world tint shifts (cool blue at night, warm gold at dawn/dusk, neutral at noon). Shadows on building sprites change direction subtly across the day if cheap to do; if not, skip and note.
3. **Persistent catastrophe scars.** Each catastrophe leaves visible aftermath at and near the epicenter:
   - *Asteroid*: dark scorch ring + crater center, fades over many minutes
   - *Earthquake*: cracked-earth texture overlay on tiles in the radius
   - *Flood*: silt/water-staining tint that recedes slowly
   - *Plague*: pale washed-out tint over the affected civ's tiles, lingers longest
   The scars should be obvious enough that a viewer can spot recent catastrophes at a glance, *and* should fade — slowly — so the world isn't progressively coated in damage.

Window 1 ends when these three things work and are tuned to "Lawrence will judge taste, but the systems are in." Write `WINDOW_1_NOTES.md` with: what's tuneable (which constants Lawrence might want to adjust), what you wish you could have done differently, and any open questions for him.

### Window 2: Weather + seasonal drift

**Goal:** The world has weather and seasons. Atmosphere has texture between catastrophes.

Specifically:
1. **Weather as drifting alpha fields.** Cloud cover, rain bands, fog patches that move slowly across the world. Not gameplay-affecting — purely visual. They cast soft shadows or color shifts beneath them. The dread system can integrate (gathering clouds before a flood, dust on the horizon before earthquake) but doesn't have to.
2. **Seasonal drift.** A slow cycle (15-30 minutes per "season-year") that shifts the world palette — colder/warmer hues, shorter/longer days, biome color drift. This is the "deep time" register — slower than day/night, faster than eras.
3. **Era × atmosphere coupling.** Each era has a characteristic atmospheric mood. Neolithic worlds have clearer air, primordial light. Industrial-era worlds are smokier, hazier. Modern worlds slightly washed-out. The biome color modulation by era already exists (see STATE) — extend it to atmosphere.
4. **Integration with the dread system.** Currently dread tint is multiply-blended over everything. With a real sky and weather, dread should *recolor the sky and clouds* in addition to (or instead of) tinting the ground. The dread is now part of the atmosphere it was previously the only voice of.

Window 2 ends when the world feels alive in calm. Write `WINDOW_2_NOTES.md`.

### Window 3: Polish, depth, ambient detail (optional)

**Goal:** Push from "works" to "beautiful." This window is genuinely optional — only run it if windows 1+2 came out well and Lawrence wants more. The brief here is loose because the right work depends on what's already shipped.

Possible directions (pick at most 2):
- **Directional lighting.** Buildings cast soft shadows; cliffs/hills get subtle lit/shadowed faces.
- **Ambient tile detail.** Subtle texture variation at the tile level — not a uniform color, but a wash. Sparingly used motion (wind in grasslands, ripples in water, smoke from large cities).
- **Ken-Burns drift toward brewing region.** From Fable's earlier suggestion: during stage-2/3 omens, the camera drifts gently toward the brewing region and back out after impact. Spatial foreshadowing.
- **Atmospheric perspective.** Distant tiles slightly hazier/cooler than near tiles. Adds depth.

Write `WINDOW_3_NOTES.md`.

## Permissions

Same shape as the suspense run, with one expansion. For a multi-window run, larger interventions are appropriate:

- **PixiJS remains primary.** Stay in it. Filters, blend modes, custom shaders, additional layers, particle containers are all in.
- **Three.js or WebGL shader pipelines are permitted in this run** if a *specific* effect genuinely needs them and you can wedge it in as an overlay layer (not a renderer replacement). Document any such move in `WINDOW_X_NOTES.md` with reasoning. If you're not sure it's worth it, it isn't.
- **External assets (sky textures, cloud sprites, weather sounds):** allowed under the same licensing rules. Kenney, OpenGameArt CC0, Freesound CC0/attribution, Wikimedia public domain, NASA imagery. Store in `public/sprites/external/<source>/` or `public/audio/external/<source>/` with `LICENSE.txt`. Log in `DEPENDENCY_NOTES.md`.
- **AI-generated images/textures:** allowed if API credentials already exist in `.env`. Do not set up new accounts. For atmosphere work this could be high-leverage — sky textures, cloud masks, weather overlays. Log every generation.
- **Audio:** muted by default (already established). Ambient weather sounds (distant thunder, wind, rain on different surfaces) would be on-brief if added — but defer to last if at all.
- **New JS/TS dependencies:** flag in `DEPENDENCY_NOTES.md` before installing.

## Hard constraints

- **Branch only.** All work on `fable-run-atmosphere-<YYYY-MM-DD>`. No main commits, no force-pushes, no history rewrites.
- **No network calls in production code.** Offline-capable at runtime.
- **No telemetry, ads, analytics, monetization.** None.
- **No remote push without instruction.**
- **Preserve all suspense-run mechanics.** Brewing, omens, ambient dread, impact punctuation, rallies, last flights, spared events — none of this can break. If you change the rendering layer architecture (likely with the sky layer), the existing dread tint+vignette must continue to work.
- **Preserve seed persistence, the `fadedDeadCivs` repaint, the snapshot-before-mutate pattern.** These are listed in the suspense brief and remain non-negotiable.
- **Performance budget:** the project runs at 30 ticks/sec with smooth tile transitions. Atmosphere additions cannot tank framerate. If a new effect drops FPS noticeably, simplify or cut it. Test on the same hardware Lawrence uses (the dev machine you're running on).

## Definition of done (per window)

### Window 1 done when:
- Sky layer exists and is drawn beneath biome
- Day/night cycle is implemented and visibly affects world color
- All four catastrophe types leave persistent visible scars at impact location
- Scars fade slowly over time (per-type fade rate is a tuneable constant in a clearly-marked block)
- Existing suspense mechanics still work (smoke-test: trigger a manual catastrophe, see brewing → omen → impact → scar lifecycle works end-to-end)
- `WINDOW_1_NOTES.md` written
- Commit at end with message `Window 1: sky, day/night, catastrophe scars`

### Window 2 done when:
- Weather drifts visibly across the world (clouds, fog, or both)
- Seasonal drift cycles over ~15-30 minutes of viewing
- Each era has a distinguishable atmospheric character
- Dread system has been re-integrated to use the new atmospheric layers (not just multiply tint over everything)
- `WINDOW_2_NOTES.md` written
- Commit at end with message `Window 2: weather, seasons, era atmosphere`

### Window 3 done when:
- Pick at most 2 directions from the list, ship them, write `WINDOW_3_NOTES.md`, commit `Window 3: <what you did>`

## Outputs expected on the branch (cumulative)

- The improved code itself, committed by window
- `OBSERVATIONS.md` — initial read of current state at start of run (after reading suspense-run materials)
- `PLAN.md` — your hypothesis and approach (revisable per window)
- `RUN_LOG.md` — append-only ship's log across all windows, dated entries with terse summaries
- `DEPENDENCY_NOTES.md` — every new dep, asset, AI-generated image (cumulative across windows)
- `WINDOW_1_NOTES.md`, `WINDOW_2_NOTES.md`, `WINDOW_3_NOTES.md` — per-window summaries with tuneable constants Lawrence might want to adjust
- `FABLE_RUN_SUMMARY.md` — final write-up after the last window you complete (sections 1-5 same as suspense run summary, plus a per-window breakdown)
- `INTER_WINDOW_NOTES.md` — Lawrence may add to this between windows. **Read it first when starting a new window.**
- `QUESTIONS.md` — only if you encounter something genuinely needing Lawrence's call

## Resuming after a window ends

When a usage window expires mid-work:
1. Commit whatever's in progress with `WIP: <what you were doing>` so it's preserved
2. End the session

When starting the next window (could be hours or days later):
1. Read `CLAUDE.md`, `STATE_2026-06-10.md`, this `BRIEF.md`
2. Read `INTER_WINDOW_NOTES.md` if it exists — Lawrence may have left direction
3. Read your own `RUN_LOG.md`, `PLAN.md`, and the latest `WINDOW_X_NOTES.md`
4. Run the build, watch for at least 5 minutes to re-orient
5. Decide: continue the current window's work, or move to the next window
6. Resume

## A note from Lawrence

Atmosphere is the hardest of the three dimensions because it's the most taste-driven. The suspense run worked because suspense is mechanical — buildup, jeopardy, uncertainty, release. Atmosphere is just *taste*. You're going to make hundreds of small decisions (this hue, this opacity, this fade rate, this cloud speed) that I'll judge by feel, not by spec.

You can't get this right alone. The structure of this brief — multi-window with checkpoints — is designed so we can collaborate across the run: you build the systems, I tune the values, we converge.

What I want from you: build the *systems* well. Make the constants tuneable, group them logically, name them well, comment them clearly. Make `WINDOW_X_NOTES.md` actually useful for me to skim — flag the values I'm most likely to want to adjust. If you can give me 10 well-organized constants to play with and a system that responds beautifully to them, you've succeeded even if your initial values are off.

The painterly reference is real, not decorative. If you find yourself reaching for bright saturated colors, hard edges, or "epic" effects, pull back. Quiet wins.

Also: if at any point during this run you see something in the code or the watched experience that would make a beautiful small feature beyond the brief, *don't* add it. Add it to `IDEAS.md` and we'll do it later. Atmosphere will tempt you with infinite small additions; stay focused on the window goals.

Good luck. See you between windows.
