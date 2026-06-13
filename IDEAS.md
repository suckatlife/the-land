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
- ~~Roads~~ — SHIPPED (Window 6)
- ~~Visible conflict~~ — SHIPPED (Window 6)
- ~~Boats~~ — SHIPPED (Window 6)
- ~~Wonders~~ — SHIPPED (Window 6)
- ~~Births as arcs~~ — SHIPPED (Window 6)
- ~~Ghost echoes~~ — SHIPPED (Window 6)
- ~~Traveling storms~~ — SHIPPED (Window 6)
- Small: night festivals (city lamps flare at full prominence), chronicle summary line every ~5 min, a whale surfacing in deep ocean.
- Recommended pairing: roads + visible conflict (knitting together / tearing apart).

## Brainstorm round 3 (2026-06-12 — real-world mirrors + more)
NOTE: briefs carry a hard "no network calls in production" constraint — items marked [net] need Lawrence to explicitly relax it (proposed shape: optional ?live=1, keyless fetch ~15min, silent offline fallback, data in only).
- **Real date → season sync** (no network): phase-lock the land's year to the real calendar via system clock.
- **Real moon phase** (no network): pure math from the date; drives moon-path brightness + night darkness. No disks.
- **Real solar time** (no network): optional mode phase-locking dawn/dusk to local sunrise/sunset (24h day — changes the register, mode not default).
- **[net] Local weather → land weather** (top pick if network allowed): Open-Meteo keyless; real rain → mist/storms, real wind → world wind, overcast → cloud shadows, temperature → seasonal cast. The screensaver shares your sky.
- **[net] USGS quakes → tremor omens**: real M5+ events fire harmless tremor omens + tiny shake.
- **[net] Stocks → fortune**: weakest idea (markets closed most hours, keys needed, modernity leaks into the deep-time texture). Tasteful version if insisted: hidden scalar nudging global fortune drift, never narrated in market terms.
- ~~Volcanoes~~ — SHIPPED (Window 7)
- ~~Constellations~~ — SHIPPED (Window 7)
- ~~Meteor showers~~ — SHIPPED (Window 7)
- **Ice ages**: multi-season ice creep from the north (visual veil; optional sim pressure on northern civs). The slowest register.
- Recommended: date-sync + moon phase immediately (no rule change); weather only, if the network door opens.

## Brainstorm round 4 (2026-06-12 — geology: the land changes shape)
Machinery note: flood/earthquake already mutate elevation + biomes live; renderer + masks handle terrain change. These are event designs, not new plumbing.
- ~~Continental rifting~~ — SHIPPED (Window 7)
- ~~Volcanic island birth~~ — SHIPPED (Window 7)
- ~~Land bridges~~ — SHIPPED (Window 7)
- ~~Crater lakes~~ — SHIPPED (Window 7)
- ~~Volcanic fertile slopes~~ — SHIPPED (Window 7, part of volcanoes)
- **Sea-level epochs**: slow global rise/fall over tens of minutes; coastlines breathe, isthmuses drown and return.
- **River work**: deltas grow fertile at mouths; floods can re-route rivers (visual avulsion).
- Constraint: scenery beyond the sim grid stays static — geology happens in the known world.
- Suggested pack: rifting + island birth + land bridges + crater lakes + fertile ash (+ sea-level epochs as the slow heartbeat). Pairs with already-liked: volcanoes, constellations, meteor showers.
