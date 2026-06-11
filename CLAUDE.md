# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## What this is

A deep-time diorama: a 96×96 isometric world where civilizations rise,
spread, fight, colonize across oceans, and fall over deep time. NOT a
game with a win condition. NOT a city-builder. Closer to a screensaver
you glance at. The LAND is the protagonist; civilizations are weather.

## Architecture

- `src/sim.ts` — pure simulation, no rendering. Civs, tiles, eras,
  expeditions, breakaway colonies. All tunable constants live in the
  `SIM` object at the top.
- `src/iso.ts` — isometric rendering helpers (tile drawing, color lerp).
- `src/biomes.ts` — seeded simplex-noise terrain generation.
- `src/names.ts` — era-flavored procedural civ names.
- `src/main.ts` — Pixi setup, tick loop, smooth tile transitions, HUD,
  bar graph. The renderer is intentionally decoupled from the sim.

## Working style I prefer

- I'm the taste/design lead; you implement. I make visual judgments by
  watching the sim; you handle the code.
- Show me small diffs, not whole files. I dislike pasting.
- Concise, copy-pastable outputs. Don't over-explain implementation.
- When I describe a feeling ("looks like noise," "deaths too sudden"),
  treat it as a design signal to diagnose, not a literal spec.
- Separate sim-correctness from render-correctness when debugging — a
  past bug fooled us for sessions because it was a rendering artifact,
  not a sim flaw.
- Tuning constants in SIM is cheap; reach for that before architecture.


## Commands

- `npm run dev` — Vite dev server with HMR.
- `npm run build` — `tsc` typecheck (no emit) then `vite build`. The TS step enforces `noUnusedLocals`/`noUnusedParameters`, so dead bindings break the build.
- `npm run preview` — preview the built bundle.

There is no test runner and no linter configured beyond TypeScript itself.

## Architecture

A single-page Pixi.js v8 app that runs an emergent civilization simulation on an isometric grid. There is no backend, no router — `index.html` loads `src/main.ts` which boots everything.

### Module layout (`src/`)

- **`biomes.ts`** — Pure terrain generation. Two simplex-noise channels (elevation + moisture) seeded from a string via a `mulberry32` PRNG, with a radial island-falloff applied to elevation. `generateBiomeMap(w, h, seed)` is deterministic for a given seed.
- **`iso.ts`** — Isometric projection (`gridToScreen`), diamond tile drawing, and persistent-overlay Graphics primitives used by `main.ts` to animate per-tile color/alpha.
- **`sim.ts`** — The simulation. No rendering, no Pixi imports — keep it that way; the renderer is intentionally decoupled. Owns `SimWorld`, `Civ`, tile states (`wild | cleared | built | ruin`), civ phases (`rising | stable | declining | dead`), and eras. `step(world, biomes)` advances one tick and returns the changed tiles.
- **`names.ts`** — Per-era syllable pools; `generateName(era)` and `evolveName(oldName, era)` for successor civs.
- **`main.ts`** — Pixi bootstrap, two-layer scene (`biomeLayer` under `simLayer`), the tick loop, the tile-overlay animation system, the HUD, and the civ bar panel.

### Tick loop and rendering

`main.ts` runs the sim at a fixed `TICKS_PER_SECOND = 30` using a `deltaMS` accumulator inside `app.ticker.add`. Each tick:

1. `step()` mutates `simWorld` and returns `{row, col}[]` of state-changed tiles.
2. For each change, `refreshTileOverlay` sets a new `(targetColor, targetAlpha)` on a persistent `Graphics` per tile and adds the key to `animatingTiles`.
3. Every frame, animating tiles lerp toward their targets (`EASE = 0.15`), and `redrawOverlay` rewrites the diamond. When alpha reaches 0 the sprite is destroyed.

There is a subtle case the per-tile change list misses: when a civ transitions to `'dead'`, its already-`built` tiles need to repaint to the faded color even though their `state` didn't change. `main.ts` handles this with the `fadedDeadCivs` set — once per civ death, all its tiles are explicitly re-overlayed. Preserve this if refactoring the change-tracking.

### Sim model essentials

- The world is a 2D `SimTile[][]` plus a `Map<civId, Civ>` and an `Expedition[]` queue. Civs are agents with `constitution`, `fortune`, `vitality`, `phase`, `era`, and an `maxSize` ambition cap.
- `step()` reads from an immutable `snapshot` of `{state, civId}` taken at the top of the tick to avoid order-dependence within a tick — when adding new tile interactions, read the snapshot, write the live tile.
- Decay candidates are collected per civ and then capped via `SIM.maxDecaysPerCivPerTick` so one civ can't lose many tiles in a single tick.
- The capital (`originRow`/`originCol`) is protected from decay as long as the civ has more than one tile. Many balance knobs depend on `coreRadius` distance from the capital.
- Era-aware features: ruins remember `ruinEra`; new civs spawning near old ruins inherit/advance era (`inheritedEraFor`); place names persist within `nameMemoryRadius` and `evolveName` carries roots across eras.
- Breakaway-colony detection (`findCivClusters`) runs only every 15 ticks because it flood-fills the whole map.
- All balance constants live in the `SIM` object near the top of `sim.ts` — tune there rather than scattering magic numbers.

### Seed persistence

`main.ts` reads the seed from (in order) `?seed=` URL param → `localStorage['theLand:seed']` → random. `saveSeed` writes both back. "Reroll" regenerates terrain + sim; "Reset sim" keeps terrain. Keep the URL/localStorage round-trip working when touching HUD code.

## Environment notes

Dev environment is WSL2. The `JOURNAL.md` records ad-hoc session notes — feel free to append, but it is not a spec.
