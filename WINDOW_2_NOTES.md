# WINDOW_2_NOTES — weather, seasons, era atmosphere (2026-06-11)

All in `ATMOS` in `src/atmosphere.ts`, alongside Window 1's blocks. Console
scrubbers: `__atmosphere.setTimeOfDay(t)` and `__atmosphere.setSeasonOfYear(t)`
(seasons: 0 spring → 0.25 summer → 0.5 autumn → 0.75 winter).

## Constants you'll most likely want to touch

| Constant | What it does | My value | Notes |
|---|---|---|---|
| `weather.shadowAlpha` | Cloud-shadow depth in calm | 0.11 | I kept these shy; they read as slow change, not objects. Raise to ~0.16 if you want visible clouds at a glance. |
| `weather.fogAlpha` | Mist strength | 0.09 | Multiplied by season + era + dawn/dusk. |
| `weather.baseWind` | Drift speed (px/s) | 9 | The whole sky crosses the world in ~5 min. |
| `weather.cloudCount` / `fogCount` | Density | 7 / 3 | Cheap to raise. |
| `season.cycleSeconds` | Year length | 1200 | Brief range 15–30 min. |
| `season.keyframes` | The year's palette | 4 keys | Each: cast color+amount (glaze/sky lean), biomeTint (the land itself), fogMult. Winter is the boldest; soften `castAmount`/`biomeTint` there first if it's too much. |
| `era.moods` | The air of each age | 6 entries | Industrial is the strongest statement (soot, 1.4× mist). |
| `dreadSkyBlend` | Sky takes the brewing hue | 0.8 | Raised from 0.55 now that the sky is the dread's main carrier. |
| `DREAD.tintMaxAlpha` (main.ts) | Ground dread multiply | 0.55 | Lowered from 0.85 — sky+wind carry the rest. |

## What shipped

- **Weather**: cloud shadows (multiply, fall on land *and* buildings; city
  markers and labels stay above) and large mist banks, drifting on one shared
  wind that wanders slowly and **rises with dread** — before a catastrophe the
  shadows deepen and everything moves faster. Mist thickens at dawn and dusk
  (cos^10 bump on the day clock), in autumn/winter, and in smoky eras.
- **Seasons**: the glaze and sky lean toward a seasonal cast, and the terrain
  layer itself is tinted (one-line `Container.tint` — ambered autumn, pale
  winter). Continuous interpolation, add keyframes freely.
- **Era air**: dominant-era mood eased over 30s; verified neolithic vs
  industrial reads as clearer vs sootier without being announced.
- **Dread as weather**: sky leads, wind responds, ground multiply reduced.
  The "storm gathering" state (severe brewing, late afternoon) is now the
  single most atmospheric image in the build.

## Doubts / seams

- Cloud shadows are deliberately timid; in stills they're nearly invisible,
  in motion they read. Judge in motion before raising them.
- Fog banks occasionally park over the corner panels' area of the canvas; the
  panels are DOM and stay legible, but if it bothers you, shrink
  `DRIFT.maxY`/`maxX` in atmosphere.ts (not in ATMOS — deliberate, it's
  geometry not taste).
- Season `biomeTint` tints water along with land (it's one layer). It reads
  as the sea cooling in winter, which I like, but it's a side effect, not a
  choice you made.
- No weather→sim coupling (brief said purely visual) and no per-biome
  seasonal logic (forests amber but so does everything else, proportionally).

## Open questions

1. Want a visible *cloud body* layer (pale shapes over the sea/sky edges) in
   addition to shadows? I left it out — over land it fought the buildings.
2. Winter currently shortens nothing — day length is constant across the
   year. Coupling them (longer nights in winter) is ~10 lines in `sampleDay`
   if you want it; I parked it in IDEAS.md to stay in scope.
