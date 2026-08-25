// Issue #35 instrumentation: which wonder-gate condition actually binds?
// Runs the sim headlessly (no renderer, so no ambient fires/plagues — the
// seeded stream only) for N seeds to the full world life and counts, per
// civ-tick, how often each gate condition holds alone and jointly.
import { generateBiomeMap, landFraction } from '../src/biomes';
import {
  createSimWorld, rollCharacter, seedInitialCivs, step, SIM,
  setVolcanoes, setWonderSites,
} from '../src/sim';
import { placeNaturalWonders, type NaturalWonderKind } from '../src/naturalWonders';
import { worldFateForSeed } from '../src/endings';

const GRID = 96;
const LAND_TARGET = { min: 0.20, max: 0.70, step: 0.02, tries: 12 };
// Mirrors main.ts: the sim receives the natural wonders' settlement influence
// and volcano positions (WONDER_PULL / WONDER_RADIUS / syncSimWonders), and a
// world dies at its seed-rolled fate, the last ENDING_SEQUENCE ticks of which
// are the staged ending rather than ordinary life. Duplicated here because
// main.ts cannot be imported without a DOM.
const WONDER_PULL: Record<NaturalWonderKind, number> = {
  volcano: -4, crater_lake: 3, monolith: 2, rainbow_hills: 1.5, karst_spires: 1.5, salt_flat: 2,
  atoll: 3, canyon: -2, dune_sea: -3,
};
const WONDER_RADIUS: Record<NaturalWonderKind, number> = {
  volcano: 5, crater_lake: 8, monolith: 7, rainbow_hills: 6, karst_spires: 6, salt_flat: 6,
  atoll: 6, canyon: 8, dune_sea: 9,
};
const ENDING_SEQUENCE_TICKS = Math.round((40 + 12 + 35 + 15) * 30);

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

const seeds = process.argv[2]
  ? process.argv[2].split(',')
  : Array.from({ length: 20 }, (_, i) => `gate-${i}`);
// Optional second arg: override wonderMinFortune, to compare thresholds
// without editing the source between runs.
if (process.argv[3]) SIM.wonderMinFortune = parseFloat(process.argv[3]);

let totals = {
  civTicks: 0, stable: 0, noWonder: 0, size: 0, fortune: 0,
  allButRoll: 0, wonders: 0, civs: 0,
};
// Candidate fortune thresholds: joint open-ticks (stable ∧ size ∧ f>th, wonder
// ignored so this measures the raw window) per threshold, to calibrate a fix.
const CAND = [0.02, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12];
const candOpen = new Array(CAND.length).fill(0);
const perSeed: string[] = [];
const maxSizes: number[] = [];

let totalTicks = 0;
for (const seed of seeds) {
  const { biomes, elevation, form } = terrainFor(seed);
  const world = createSimWorld(GRID, GRID, seed);
  seedInitialCivs(world, biomes, 1);
  const nat = placeNaturalWonders(biomes, elevation, seed, form);
  setVolcanoes(world, nat.filter(w => w.kind === 'volcano').map(w => ({ row: w.row, col: w.col })));
  setWonderSites(world, nat.map(w => ({ row: w.row, col: w.col, pull: WONDER_PULL[w.kind], radius: WONDER_RADIUS[w.kind] })));
  // Ordinary life ends where the staged ending begins; count nothing after.
  const TICKS = worldFateForSeed(seed, SIM.worldCycleTicks).endTick - ENDING_SEQUENCE_TICKS;
  totalTicks += TICKS;

  let civTicks = 0, stable = 0, size = 0, fortune = 0, allButRoll = 0, wonders = 0;
  const civMax = new Map<number, number>();
  // Longest run of consecutive gate-open ticks for any civ, to see whether the
  // open state is a sustained window or a flicker.
  let openRun = 0, maxOpenRun = 0;

  for (let t = 0; t < TICKS; t++) {
    const { events } = step(world, biomes, elevation);
    for (const e of events) if (e.kind === 'wonder_built') wonders++;

    const counts = new Map<number, number>();
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const cid = world.tiles[r][c].civId;
      if (cid != null) counts.set(cid, (counts.get(cid) || 0) + 1);
    }
    let anyOpen = false;
    for (const civ of world.civs.values()) {
      if (civ.phase === 'dead') continue;
      civTicks++;
      const tc = counts.get(civ.id) || 0;
      civMax.set(civ.id, Math.max(civMax.get(civ.id) || 0, tc));
      const cStable = civ.phase === 'stable';
      const cSize = tc >= SIM.wonderMinSize;
      const cFortune = civ.fortune > SIM.wonderMinFortune;
      if (cStable) stable++;
      if (cSize) size++;
      if (cFortune) fortune++;
      if (cStable && cSize && cFortune && !civ.wonder) { allButRoll++; anyOpen = true; }
      if (cStable && cSize) {
        for (let i = 0; i < CAND.length; i++) if (civ.fortune > CAND[i]) candOpen[i]++;
      }
    }
    openRun = anyOpen ? openRun + 1 : 0;
    if (openRun > maxOpenRun) maxOpenRun = openRun;
  }

  const sizes = [...civMax.values()].sort((a, b) => b - a);
  maxSizes.push(...sizes);
  totals.civTicks += civTicks; totals.stable += stable; totals.size += size;
  totals.fortune += fortune; totals.allButRoll += allButRoll;
  totals.wonders += wonders; totals.civs += civMax.size;
  perSeed.push(
    `${seed} form=${form} life=${TICKS} civs=${civMax.size} wonders=${wonders} ` +
    `openTicks=${allButRoll} maxRun=${maxOpenRun} top3size=${sizes.slice(0, 3).join('/')}`
  );
}

console.log(perSeed.join('\n'));
const f = (n: number) => (n / totals.civTicks * 100).toFixed(2) + '%';
console.log(`\n--- ${seeds.length} seeds, ${Math.round(totalTicks / seeds.length)} avg life ticks ---`);
console.log(`civ-ticks=${totals.civTicks} civs=${totals.civs} wonders=${totals.wonders}`);
console.log(`stable:          ${f(totals.stable)}`);
console.log(`size>=${SIM.wonderMinSize}:       ${f(totals.size)}`);
console.log(`fortune>${SIM.wonderMinFortune}:   ${f(totals.fortune)}`);
console.log(`all-but-roll:    ${f(totals.allButRoll)} (${totals.allButRoll} ticks)`);
console.log(`expected wonders at chance=${SIM.wonderChance}: ${(totals.allButRoll * SIM.wonderChance).toFixed(3)}`);
console.log(`\nper-threshold windows (stable ∧ size, per world):`);
for (let i = 0; i < CAND.length; i++) {
  const perWorld = candOpen[i] / seeds.length;
  console.log(`  f>${CAND[i]}: ${f(candOpen[i])} of civ-ticks, ${perWorld.toFixed(0)} open ticks/world → E[wonders] @0.00015=${(perWorld * 0.00015).toFixed(2)} @0.0005=${(perWorld * 0.0005).toFixed(2)} @0.001=${(perWorld * 0.001).toFixed(2)}`);
}
const sorted = maxSizes.sort((a, b) => b - a);
console.log(`civ max-size percentiles: p50=${sorted[Math.floor(sorted.length * 0.5)]} p90=${sorted[Math.floor(sorted.length * 0.1)]} p99=${sorted[Math.floor(sorted.length * 0.01)]} max=${sorted[0]}`);
