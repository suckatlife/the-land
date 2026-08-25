// Issue #27 calibration: run worlds headlessly and census archetypes and
// traits. The archetype thresholds in archetypeFor() are only right if all
// four kinds actually occur, and the behaviour multipliers are only real if
// the archetypes measurably diverge — this script checks both.
import { generateBiomeMap, landFraction } from '../src/biomes';
import {
  createSimWorld, rollCharacter, seedInitialCivs, step, beginEnding, beginSilence, SIM,
  type CivArchetype, type CivTrait,
} from '../src/sim';
import { worldFateForSeed, endingActTicks } from '../src/endings';

const GRID = 96;
const LAND_TARGET = { min: 0.20, max: 0.70, step: 0.02, tries: 12 };
// Matches main.ts's `ticksPerSecond` (not exported — it's a render-loop
// constant, not a sim one). Production stages the world's last ~102 seconds
// as an ending: births, catastrophes, expeditions and breakaways are
// suppressed from `commit` on, and step() goes fully silent from `silence`
// on. Running raw simulation straight to endTick instead would count
// behavior from a window players never actually see.
const TICKS_PER_SECOND = 30;

function terrainFor(seed: string) {
  const character = rollCharacter(seed);
  const profile = { ...character.terrain };
  let result = generateBiomeMap(GRID, GRID, seed, profile);
  for (let i = 0; i < LAND_TARGET.tries; i++) {
    const land = landFraction(result.biomes);
    if (land >= LAND_TARGET.min && land <= LAND_TARGET.max) break;
    profile.elevationOffset += land < LAND_TARGET.min ? LAND_TARGET.step : -LAND_TARGET.step;
    result = generateBiomeMap(GRID, GRID, seed, profile);
  }
  return { ...result, form: character.form };
}

const seeds = Array.from({ length: 12 }, (_, i) => `arch-${i}`);
const ARCHES: CivArchetype[] = ['maritime', 'highland', 'sylvan', 'plains'];
const TRAITS: CivTrait[] = ['survivor', 'refugee', 'iceborn'];

const archCount: Record<string, number> = {};
const traitCount: Record<string, number> = {};
// Behavioural divergence per archetype: colonies founded over water, and the
// largest extent each civ reached.
const colonies: Record<string, number> = {};
const civsOf: Record<string, number> = {};
const sizeSum: Record<string, number> = {};
for (const a of ARCHES) { archCount[a] = 0; colonies[a] = 0; civsOf[a] = 0; sizeSum[a] = 0; }
for (const t of TRAITS) traitCount[t] = 0;

// Biome fractions in the archetype radius around every founding site, so the
// thresholds can be set from the actual distribution rather than guessed.
const waterFracs: number[] = [], rockFracs: number[] = [], forestFracs: number[] = [];
function foundingFracs(biomes: string[][], row: number, col: number) {
  let water = 0, rock = 0, forest = 0, total = 0;
  for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
    const r = row + dr, c = col + dc;
    if (r < 0 || r >= GRID || c < 0 || c >= GRID || dr * dr + dc * dc > 16) continue;
    total++;
    if (biomes[r][c] === 'water') water++;
    else if (biomes[r][c] === 'rock') rock++;
    else if (biomes[r][c] === 'forest') forest++;
  }
  waterFracs.push(water / total); rockFracs.push(rock / total); forestFracs.push(forest / total);
}
let iceAdvances = 0, iceRetreats = 0, icebornCandidates = 0, lastFlights = 0, refugesFounded = 0;

for (const seed of seeds) {
  const { biomes, elevation } = terrainFor(seed);
  const world = createSimWorld(GRID, GRID, seed);
  seedInitialCivs(world, biomes, 1);
  const TICKS = worldFateForSeed(seed, SIM.worldCycleTicks).endTick;
  const acts = endingActTicks(TICKS, TICKS_PER_SECOND);
  const civMax = new Map<number, number>();
  let advTick: number | null = null;
  let endingBegun = false;
  let silenced = false;

  for (let t = 0; t < TICKS; t++) {
    if (!endingBegun && t >= acts.commit) { endingBegun = true; beginEnding(world, new Map()); }
    if (!silenced && t >= acts.silence) { silenced = true; beginSilence(world); }
    const { events } = step(world, biomes, elevation);
    for (const e of events) {
      if (e.kind === 'colony_founded') {
        const c = world.civs.get(e.civId);
        if (c) colonies[c.archetype]++;
      } else if (e.kind === 'civ_born') {
        const c = world.civs.get(e.civId);
        if (c) foundingFracs(biomes, c.originRow, c.originCol);
      } else if (e.kind === 'ice_advance') { iceAdvances++; advTick = world.tick; }
      else if (e.kind === 'ice_retreat') {
        iceRetreats++;
        for (const c of world.civs.values()) {
          if (c.phase !== 'dead' && advTick != null && c.birthTick < advTick) icebornCandidates++;
        }
      }
      else if (e.kind === 'last_flight') lastFlights++;
      else if (e.kind === 'refuge_founded') refugesFounded++;
    }
    if (t % 50 === 0) {
      const counts = new Map<number, number>();
      for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
        const cid = world.tiles[r][c].civId;
        if (cid != null) counts.set(cid, (counts.get(cid) || 0) + 1);
      }
      for (const [id, n] of counts) civMax.set(id, Math.max(civMax.get(id) || 0, n));
    }
  }

  for (const civ of world.civs.values()) {
    archCount[civ.archetype]++;
    civsOf[civ.archetype]++;
    sizeSum[civ.archetype] += civMax.get(civ.id) || 0;
    if (civ.trait) traitCount[civ.trait]++;
  }
}

const totalCivs = Object.values(archCount).reduce((a, b) => a + b, 0);
console.log(`--- ${seeds.length} seeds, ${totalCivs} civs ---`);
console.log('archetypes:');
for (const a of ARCHES) {
  const n = archCount[a];
  console.log(`  ${a.padEnd(9)} ${n} (${(n / totalCivs * 100).toFixed(1)}%)  colonies/civ=${(colonies[a] / Math.max(1, n)).toFixed(2)}  avg peak size=${(sizeSum[a] / Math.max(1, n)).toFixed(0)}`);
}
console.log('traits:');
for (const t of TRAITS) console.log(`  ${t.padEnd(9)} ${traitCount[t]} (${(traitCount[t] / totalCivs * 100).toFixed(1)}% of civs)`);
console.log(`trait pathways: ice_advance=${iceAdvances} ice_retreat=${iceRetreats} iceborn-candidates=${icebornCandidates} last_flight=${lastFlights} refuge_founded=${refugesFounded}`);
const q = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
for (const [name, a] of [['water', waterFracs], ['rock', rockFracs], ['forest', forestFracs]] as const) {
  console.log(`founding ${name}: p25=${q(a, 0.25).toFixed(2)} p50=${q(a, 0.5).toFixed(2)} p75=${q(a, 0.75).toFixed(2)} p90=${q(a, 0.9).toFixed(2)}`);
}
