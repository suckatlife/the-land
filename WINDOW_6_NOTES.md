# WINDOW_6_NOTES — people doing things (2026-06-12)

All ten ideas from the second brainstorm, shipped. Net framerate went *up*
(see Performance below). Constants by domain: `ROAD_STYLE` / war-heat
thresholds / `SMOKE`-style story knobs in main.ts; `ATMOS.storm` in
atmosphere.ts; `SIM.wonder*` and `SIM.migrationTicks` in sim.ts.

## What shipped

1. **Roads** — each city connects to its nearest older sibling (a growing
   tree per civ), A* over land, era-styled: barely-there trails → tan roads
   → dark industrial lines → pale glowing post-era threads.
2. **Visible conflict** — conquest flips flicker orange with a smoke smudge;
   sustained contact (8 flips) narrates "X and Y contest their border," and
   45 quiet seconds later "the border falls quiet."
3. **Boats** — up to 6 craft on cached water routes between coastal cities
   (hull in civ color, faint wake), fishing dots bobbing near prominent
   harbors.
4. **Wonders** — rare golden-age monuments at capitals (`SIM.wonderChance`),
   narrated by era title (Standing Stones / Lighthouse / Cathedral / Great
   Engine / Spire / Beacon), spire dims to ruin tone after the civ dies.
5. **Births as arcs** — the spawn roll now starts a visible nomad band that
   wanders ~30s toward the site ("A band crosses the steppe…") before the
   name appears.
6. **Ghost echoes** — on some nights a dead name shimmers over its ruins for
   ~12s; rarely the narrator mentions it.
7. **Traveling storms** — one cell at a time crosses on the wind: dark
   cluster, rain streaks, lightning flickers at night (`ATMOS.storm`).
8. **Festivals** — a city reaching full prominence flares its lamps for 45s
   one night, narrated.
9. **Chronicle** — every ~5 min: "The age continues: 6 nations share the
   land, Igi first among them."
10. **Whale** — surfaces in deep ocean once in a long while; spout, ripple
    ring, gone. Unnarrated on purpose.

## Performance (you asked me to watch it)

Two optimizations shipped alongside, and they more than paid for the batch:
the biome layer (9k tile Graphics + 20k scenery-water polys) and the scenery
land (20k polys) are now **cached as textures** — re-rendered only while
flood/quake tiles animate — and the expedition layer stops redrawing when
empty. Headless software-renderer FPS on a mature world: **2.0 before the
batch → 3.0 after, with all ten systems running.** On your GPU the cache
savings should be proportionally similar (it removes ~30k draw-call
vertices per frame from the world render pass).

## Ranked doubts

1. **War narration frequency** depends on how often big civs share borders —
   if it chatters on crowded maps, raise the 8-flip threshold or the 90s
   re-narrate cooldown in `noteConquest`.
2. **Roads recompute** only for new city pairs (cached), but a civ with many
   cities draws many polylines every 0.7s rebuild. Fine in testing; if it
   ever matters, rebuild roads on a slower cadence.
3. **Neolithic roads at 0.18 alpha** are nearly invisible (by intent — paths
   come with civilization). If you want them readable from the start, raise
   `ROAD_STYLE.neolithic.alpha`.
4. **Wonder rarity**: `wonderChance 0.00015` ≈ one per few golden ages. I'd
   rather they feel mythic than common, but it's one number.
5. **Ghost/festival/chronicle cadences** are guesses (240s roll / once per
   city / 9000 ticks); all single constants near their functions.
