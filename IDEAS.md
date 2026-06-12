# IDEAS — parking lot for beyond-brief features (per Lawrence's instruction)

- (add here during the run)
- Seasonal day-length: bias the day clock so winter nights run longer (small change in sampleDay; ~10 lines).
- Per-biome seasonal tint (forests amber harder than grass in autumn) — needs per-tile tint pass, prototype with a second biome-layer tint group.
- Cloud *bodies* (pale shapes) over open water only — over land they fought the buildings.
- Chronicle threads from the suspense run's summary (callbacks to fallen civs) — story run material.
- Frame-rate-coupled eases (label fade 0.08/frame, tile EASE 0.15/frame, etc.) — convert to time-based (per-second) easing so slow machines aren't slower to settle. Mechanical, low-risk, touches many constants.
- Curvature could subtly breathe with dread (the world feels smaller when something is coming) — one line in applyCurve, but flagged as possibly too clever.
- Ocean color variation by depth (per-tile blues from elevation at drawBiomes time) — Window 4 stretch item, unshipped.
- Star reflections on water at deep night (Van Gogh Rhone) — a few glints aligned under bright stars.

## Visual-interest brainstorm (2026-06-11 evening, Lawrence asked)
- **City lights at night** (top pick): additive glow over settlements keyed to building density × nightness; era-flavored quality (hearth embers → lamplight → industrial orange grids → modern cool sprawl). Night becomes the "life" register; catastrophes read as lights going dark.
- **Shallows + depth-blues**: pale shallow-water rim along coasts + per-tile depth variation from existing elevation. Fixes the flat ocean; gives glitter texture to catch.
- **Era-flavored smoke** from large cities (hearth → chimneys → industrial haze feeding era-air).
- **Rare celestial events**: comet (non-catastrophe omen, ambiguous narration), lunar eclipse (30s dimming), winter aurora. Plug into omen/narration machinery.
- **Wind made visible**: small fast cousin of cloud shadows — brightness waves over grass/forest.
- **Camera breathing**: ±2% slow drift/scale; optional drift toward brewing regions (suspense tie-in).
- **Rivers** (big, terrain-level): elevation→sea waterlines; glint in directional light; natural borders, city sites, river names for the story run.
- Smaller: ocean tide breathing at coastlines, bird flocks at dawn/dusk, expedition wakes.
