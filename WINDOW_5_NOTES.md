# WINDOW_5_NOTES — the visual-life batch (2026-06-11 evening)

All eight brainstorm ideas you approved, implemented in one pass. Constants
live in three places by domain: `OCEAN` / `LIGHTS` / `SMOKE` in main.ts
(terrain + civilization surfaces), `ATMOS.shimmer` / `ATMOS.camera` /
`ATMOS.events` in atmosphere.ts (air + sky). Debug:
`__atmosphere.triggerCelestial('comet'|'eclipse'|'aurora')`.

## What shipped

1. **Ocean depth + shallows** — water pales toward every coastline and
   deepens offshore, straight from the existing elevation data. (`OCEAN`)
2. **Rivers** — deterministic per seed, hills to sea, visual-only (the sim
   never sees them; civ balance untouched). Tapering strokes that tint
   toward the celestial light. 6–9 per seed.
3. **City lights at night** — the big one. Era-colored: hearth embers →
   lamplight → industrial soot-orange → modern cool → post violet. Driven by
   building density; rebuilt every city cadence so catastrophes read as
   lights going dark within a second. (`LIGHTS`)
4. **Era smoke** — puffs from prominent cities riding the atmosphere wind;
   industrial smokes hardest and darkest. (`SMOKE`)
5. **Wind shimmer** — faint bright waves crossing the land, masked to
   terrain. (`ATMOS.shimmer`)
6. **Camera breathing** — ±1.2% stage-scale over 150s, leaning in with
   dread. (`ATMOS.camera`)
7. **Rare celestial events** — comet / lunar eclipse / winter aurora, each
   narrated once as wonder (not warning), mean intervals 7–12 min with
   cooldowns. (`ATMOS.events`)
8. **Bird flocks** — a V of dots crossing at dawn/dusk, roughly every few
   minutes of eligible light.

Resolved differently: expedition wakes (trail dots already exist), tide
breathing (needs per-tile repaints every frame — poor value; in IDEAS.md).

## The constants you'll most likely want to touch

| Constant | What it does | My value |
|---|---|---|
| `LIGHTS.maxAlpha` / `eraColors` | Night-light strength and the era voice | 0.9 / table |
| `LIGHTS.densityFloor` | How far into the hinterland lights reach | 0.16 |
| `OCEAN.shallowColor` / `depthRange` | The coast-water look | 0xbfdfd6 / 0.16 |
| `SMOKE.eraStyle` | Smoke color/density per era | industrial darkest |
| `ATMOS.shimmer.alpha` | Wind visibility on land | 0.055 |
| `ATMOS.camera.breathAmp` | Lens breath | 0.012 (set 0 to disable) |
| `ATMOS.events.*MeanSec` | Celestial event rarity | 420–720s |
| river stroke in `drawRivers` (main.ts) | River weight/color | 0x6fa8c8, 1–3.4px |

## Ranked doubts

1. **City-light rebuild cost**: every ~0.7s it redraws up to a few thousand
   circles. Fine in testing, but it's the one new cost that scales with
   civilization size — if you ever see a rhythmic hitch on big worlds,
   raise the rebuild cadence or `densityFloor`.
2. **Smoke at thumbnail scale** is nearly invisible (by design — it reads at
   full screen). If you want it present-er, `SMOKE.eraStyle[].alpha` up.
3. **Rivers cross civ territory tints** and can momentarily look like
   borders. I like the ambiguity; you may not.
4. **Camera breathing + screenshots**: stills are now taken mid-breath, so
   two screenshots may differ by ~1% scale. `breathAmp: 0` if it bothers
   comparisons.
5. Headless software-renderer FPS is within noise of the pre-batch baseline
   (~2.5); the usual caveat — one real-GPU sanity check, please.

## Post-review additions (your three notes)

1. **No more sliced land**: a terrain edge falloff (biomes.ts, `EDGE_FALLOFF`
   = 7 tiles) eases elevation below sea level at the grid boundary, so every
   landmass ends in natural coastline and boundary water flows into the deep
   apron. **Heads-up: this changes every seed's map near the edges** — your
   bookmarked seeds will look slightly different at the borders.
   (True land-to-the-horizon would need scenery terrain beyond the sim grid,
   where civs could visibly never spread — an invisible wall reads worse
   than a coastline, so I chose the falloff. Revisit if you disagree.)
2. **Deep ocean**: `OCEAN.deepColor` (0x76a6cf) is the new third stop and the
   apron color; `depthRange` 0.30 controls how fast the sea darkens.
3. **Story-connected HUD**: civ names are civ-colored in the log and panel
   (same color as the map label and bar); narrated events ping their map
   location with a soft ring; each panel row shows the civ's capital and
   flashes for ~6s when the civ is mentioned. Top 8 shown, rest collapse.
