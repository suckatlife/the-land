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
- ~~City lights at night~~ — SHIPPED (Window 5)
- ~~Shallows + depth-blues~~ — SHIPPED (Window 5)
- ~~Era-flavored smoke~~ — SHIPPED (Window 5)
- ~~Rare celestial events~~ — SHIPPED (Window 5)
- ~~Wind made visible~~ — SHIPPED (Window 5)
- ~~Camera breathing~~ — SHIPPED (Window 5)
- ~~Rivers~~ — SHIPPED (Window 5, visual-only)
- Smaller: ocean tide breathing at coastlines, bird flocks at dawn/dusk, expedition wakes.

## Watchability brainstorm round 2 (2026-06-12 — "people doing things")
- **Roads** (top pick): paths between a civ's cities, strengthening with prominence, era-styled (trail -> road -> rail -> glowing thread); lamplight traces at night. Render-side.
- **Visible conflict**: emit conquest events, aggregate to "wars"; flickers/smoke at contested border tiles + stakes narration ("X and Y contest the river valley").
- **Boats**: small craft between coastal cities of a civ + fishing dots near shore; fills the empty ocean.
- **Wonders**: golden-age civs raise one monument (narrated, named), persists as special ruin after death. Small sim touch.
- **Births as arcs**: nomad band wanders ~30s before settling into the new civ (delay spawn, emit migration event). Sim touch.
- **Ghost echoes**: rare night shimmer of a dead civ's name over its ruins (uses nameMemory); ~hourly narration. Nearly free, most on-brand.
- **Traveling storms**: rare heavy drifter — dark cluster, rain streaks, night lightning; pairs with flood brewing.
- Small: night festivals (city lamps flare at full prominence), chronicle summary line every ~5 min, a whale surfacing in deep ocean.
- Recommended pairing: roads + visible conflict (knitting together / tearing apart).
