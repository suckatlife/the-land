# CLAUDE.md

Front door for agents working on this repository. Everything here was verified
against the source on 2026-08-21; where a number appears, it was counted rather
than copied.

Also read `AGENTS.md` (shared rules and review criteria) and, before any remote
work, `REMOTE.md` (the multi-agent contract). `HANDOFF.md` is the running log —
read the last entry.

## What this is

A deep-time diorama: a 96×96 isometric world where civilizations rise, spread,
fight, cross oceans and fall over geological time. **Not a game** — no win
condition, no player, nothing to optimise. Closer to a screensaver you glance
at. **The land is the protagonist; civilizations are weather.**

The aesthetic direction is painterly, not photographic: soft edges over hard
ones, washes over gradients, muted palettes, atmosphere over precision. Quiet
wins. If a change makes the world louder, busier or more saturated, it is
probably the wrong change. (`docs/archive/BRIEF.md` is where this is set out at
length.)

## Modules

| File | Lines | Role |
| --- | ---: | --- |
| `src/main.ts` | 8421 | Pixi bootstrap, the layer stack, the tick loop, ~40 story/render subsystems, HUD, debug handles |
| `src/sim.ts` | 2470 | The simulation. **No Pixi imports, ever.** Tiles, civs, cities, eras, catastrophes, world character, ice |
| `src/atmosphere.ts` | 1627 | Sky, day/night, weather, seasons, scars, celestial bodies, planetary curvature |
| `src/biomes.ts` | 279 | Seeded terrain, the `TerrainProfile` that gives each world its form, rivers |
| `src/endings.ts` | 260 | How a world ends, and the archive of past worlds |
| `src/naturalWonders.ts` | 220 | Permanent seed-placed landmarks, filtered by world form |
| `src/iso.ts` | 149 | Iso projection, diamond drawing, colour helpers |
| `src/analytics.ts` | 136 | Product analytics behind one `trackEvent` wrapper (see `ANALYTICS.md`) |
| `src/audio.ts` | 128 | Procedural Web Audio. No files, no libraries |
| `src/names.ts` | 92 | Per-era syllable pools; names evolve across eras |

`src/counter.ts` is Vite scaffolding and unused.

## The fact that governs new visual work

The `world` container does **not** draw to the screen. Every frame it renders
into a `RenderTexture`, which is drawn through a bent `MeshPlane` whose vertices
map the world's silhouette onto a horizon arc — which is why the diamond reads
as a planet's limb.

So: **anything in world space bends with the planet for free** (terrain, scars,
roads, armies, boats, labels, ground weather). **Anything in screen space does
not** (sky, glaze, dread tint, vignette, stars). Pick a side deliberately.

Performance is **fill-bound, not object-bound**. Hiding ~11k building sprites
changes nothing measurable; the RT pass plus the curvature mesh is roughly half
the frame. Sprite batching has been measured twice and is not the bottleneck.

## Invariants (all verified present)

- **No Pixi in `sim.ts`.** The renderer stays decoupled.
- **Seed determinism.** `sim.ts` draws from a seeded stream (`resetSimRandom`).
  There are currently **zero** `Math.random()` calls in it, and it must stay
  that way: one reintroduces silent divergence and breaks shared world links.
- `step()` reads an immutable `snapshot` of the grid, writes the live tile.
- The **`fadedDeadCivs`** repaint pass — the per-tile change list misses
  dead-civ tiles, so their fade is driven separately.
- `SIM.maxDecaysPerCivPerTick`, capital protection, breakaway throttle,
  name-memory radius, seed persistence.
- **Era is fixed at civ birth** and never advances while a civ lives. The world
  age shown in the HUD is read across civs, not from one.

## Time registers

| Register | Value | Knob |
| --- | --- | --- |
| Sim tick | 30/sec | `ticksPerSecond` (`main.ts`) |
| Day/night | 360 s | `ATMOS.day.cycleSeconds` |
| Seasonal year | 1200 s | `ATMOS.season.cycleSeconds` |
| World life → cataclysm | 30000 ticks | `SIM.worldCycleTicks` |

All of them run on **one clock**: a single per-frame `worldSeconds`, capped by
`MAX_SIM_FRAME_MS` (1000) against stalls and multiplied by the speed control, so
2x/4x/8x compresses the whole diorama rather than only its history. Lifetimes
(battles, quiet zones, ruin decay) are timestamped against that clock, not
`performance.now()`, so a paused world is genuinely still.

## World character

Each world's seed rolls a character in `sim.ts`: a **temperament** (cold, wet,
dry, volcanic, fertile, restless, placid) scaling ice, storms, fire, drought,
flood, volcanism and catastrophe pressure; a **life arc** bending those across
the world's lifetime; a **form** (archipelago, continent, highlands, drowned,
verdant, barren) driving a `TerrainProfile`; a **`CivBehaviour`** so geography
shapes its people — a continent grows one large empire, an archipelago grows
many small seafaring ones; and a **starting era**, so roughly one world in five
opens later than the stone age.

Terrain generation is guarded: an extreme form can drown the map, so land
fraction is measured and the world nudged until it is habitable.

## Where the knobs live

`SIM`, `CATASTROPHE`, `CITY` in `sim.ts`; `ATMOS` in `atmosphere.ts` (with
sub-blocks for composition, day, curve, weather, season, celestial, stars,
storm, era, scar); `DENSITY`, `QUALITY`, `HIERARCHY`, `SUCCESSION`, `QUIET`,
`ICE`, `GROUND`, `DEPTH` and per-subsystem blocks in `main.ts`.

**Tune constants before reaching for architecture.** It is nearly always the
right first move here.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc` typecheck then `vite build`. **This is the gate.** It
  enforces `noUnusedLocals`/`noUnusedParameters`, so dead bindings break it.
- `npm run preview` — serve the built bundle

No test runner and no linter beyond TypeScript.

## Watching it

In-page handles: `__sim`, `__atmos`, `__atmosphere`, `__world`, `__terrain`,
`__hier`, `__succ`, `__wonders`, `__war`, `__perf`, `__rt`. URL params `?seed=`,
`?mres=`, `?rt=`. The HUD's `skip 5k` button fast-forwards 5000 ticks.

The world opens behind a doorway; **the sim holds at tick 0 until it is
dismissed**, which has repeatedly fooled headless harnesses into reporting a
dead world. `scripts/loop/` has the Playwright harness that handles this.

Judging city- and unit-scale visuals headlessly does not work — there is no
camera zoom, the whole globe is always in frame, and units are a few pixels.
Verify that the code path runs, then hand the visual call to a human.

## Working style

Lawrence is the taste lead; agents implement. Small diffs, not whole files.
When he describes a feeling ("looks like noise", "too scattered"), treat it as a
symptom to diagnose, not a literal spec. Separate sim-correctness from
render-correctness when debugging — a rendering artifact once masqueraded as a
sim bug for several sessions.
