# WINDOW_7_NOTES — geology + sky (2026-06-12)

Volcanoes, the geology pack, constellations, and meteor showers. Test any of
it instantly: volcano/rift via `__sim.brewing = {type:'volcano'|'earthquake',
severity:0.8, omenStage:3}; __sim.catastrophePressure = 1.01`, sky via
`__atmosphere.triggerCelestial('meteors')` and
`__atmosphere.nameConstellation()`.

## What shipped

1. **Volcanoes** — fifth catastrophe type (20% of the roll). Erupts from rock
   peaks scored by nearby settlement; tight burn core, permanent rock cone,
   ash ring that turns surviving open land *fertile* (civs re-settle the
   slopes on their own). Fully wired into omens / dread / impact / scars —
   the volcano scar (basalt flows + dying ember) is the longest-lived.
2. **Rifting** — severe earthquakes now tear the land along a line; the sea
   pours in tile by tile (progressive terraform queue) until both ends reach
   water. Civs that lose ≥5 tiles take the vitality hit; severed halves
   become breakaway nations via existing machinery.
3. **Island birth** — rare (~every 20+ min): steam on open water, then a
   shoal pales the sea, sand emerges, a rock cone tops it. Narrated at start
   and completion; the island is genuinely colonizable.
4. **Land bridges** — rare: a narrow strait lifts into a sand causeway;
   separated civilizations suddenly share a border.
5. **Crater lakes** — severe asteroids permanently carve a water-filled
   center ringed with rock. Old worlds stay readable by their wounds.
6. **Constellations** — the first civ of each post-neolithic era names one
   (max 6/world): faint lines joining bright stars, rotating with the dome.
7. **Meteor showers** — fourth celestial event; quiet streaks over ~2
   minutes of deep night.

Parked: sea-level epochs (continuous global reclassification fights the
biome-cache optimization for the subtlest payoff of the set — in IDEAS.md).

## Knobs

| Knob | Where | Value |
|---|---|---|
| Volcano share of catastrophes | `rollCatastropheType` (sim.ts) | 20% |
| Ash-ring fertility | volcano branch in `applyCatastrophe` | non-minor only, outer ring |
| Rift width / speed | rift generator (`wOff` ±1, `perTick` 0.8) | 3 tiles wide, ~2.5s per 2 tiles |
| Island / bridge rarity | geology rolls in `step()` | 0.000025 / 0.00002 per tick |
| Island rise time | `perTick: 0.06` | ~30s |
| Constellation cap / look | `nameConstellation` (atmosphere) | 6, alpha 0.5 lines |
| Meteor rate | `ATMOS.events.meteors*` | mean 6 min, 2 min duration |

## Ranked doubts

1. **Rift fairness**: a rift through a healthy civ's heartland is the most
   brutal event in the sim now (worse than severe plague for a coastal civ).
   I capped its vitality consequence at one declining-push per civ, but
   watch whether severe earthquakes now feel disproportionately cruel —
   the lever is the rift width (`wOff`) or making rifts a fraction of
   severe quakes rather than all of them.
2. **Terraform vs. masks**: every carved tile triggers the water-mask
   rebuild and biome-cache update per frame while active (~10-30s). Fine in
   testing (transient 3.0→2.0 FPS in software rendering), but it's the one
   new cost that runs sustained — if it stutters on GPU, batch the mask
   rebuild to every ~10 biomeChanges.
3. **Ash fertility is invisible in the moment** (fertile tint is subtle
   under the scar). It pays off minutes later when settlement returns —
   trust it, or brighten BIOME_COLORS.fertile.
4. **One geology process at a time** (shared queue) — deliberate, so the
   world never feels like it's boiling. Rifts therefore block island
   births for their duration.
