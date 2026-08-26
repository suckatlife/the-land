// The rally gate, measured. `rallyChance`/`rallyMinFortune` carry the comment
// "keep rare (~1 in 10 declines)", but the same arithmetic that made the wonder
// gate unreachable (#35) applies here: fortune is a mean-reverting walk with
// stationary sigma ~= 0.046, so a 0.1 bar is a ~2.2-sigma ask that must ALSO
// coincide with a 0.0002/tick roll, for as long as the decline happens to last.
// This measures the real rate, and reports what the open window actually is, so
// a fix moves the one condition that binds rather than the one that reads worst.
//
// Fidelity mirrors scripts/wonder_gate.ts: natural-wonder settlement pull and
// volcano positions as main.ts supplies them, the land-target nudge, and a stop
// before the staged ending (`world.ending` blocks rallies outright).
import { generateBiomeMap, landFraction } from '../src/biomes';
import {
  createSimWorld, rollCharacter, seedInitialCivs, step, SIM,
  setVolcanoes, setWonderSites,
} from '../src/sim';
import { placeNaturalWonders, type NaturalWonderKind } from '../src/naturalWonders';
import { worldFateForSeed } from '../src/endings';

const GRID = 96;
const LAND_TARGET = { min: 0.20, max: 0.70, step: 0.02, tries: 12 };
const WONDER_PULL: Record<NaturalWonderKind, number> = {
  volcano: -4, crater_lake: 3, monolith: 2, rainbow_hills: 1.5, karst_spires: 1.5, salt_flat: 2,
  atoll: 3, canyon: -2, dune_sea: -3,
};
const WONDER_RADIUS: Record<NaturalWonderKind, number> = {
  volcano: 5, crater_lake: 8, monolith: 7, rainbow_hills: 6, karst_spires: 6, salt_flat: 6,
  atoll: 6, canyon: 8, dune_sea: 9,
};
// Production does NOT run ordinary life to endTick. main.ts's
// endingCheckpoints() calls commitEnding() at `omen - 300` — that is
// endTick - ((40+12+35+15) * 30) - 300 = endTick - 3360 — and commitEnding()
// calls beginEnding(), which sets `world.ending` there and then. Both the
// rally (`!world.ending`) and the refuge (`if (world.ending) break`) are
// blocked from that tick onward, so every tick past it is one the app can
// never fire in. Measuring through it inflates the eligible window by ~1860
// ticks per world and biases any constant calibrated from it.
const ENDING_ACTS_SECONDS = 40 + 12 + 35 + 15;
const ENDING_COMMIT_MARGIN_TICKS = 300;
const ENDING_TAIL_TICKS = Math.round(ENDING_ACTS_SECONDS * 30) + ENDING_COMMIT_MARGIN_TICKS;

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
  : Array.from({ length: 20 }, (_, i) => `rally-${i}`);
if (process.argv[3]) SIM.rallyMinFortune = parseFloat(process.argv[3]);
if (process.argv[4]) SIM.rallyChance = parseFloat(process.argv[4]);

// Candidate fortune bars. For each, count the ticks a decline spends above it
// while still ELIGIBLE (declining, never rallied) — the true open window.
const CAND = [0.0, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1];
const openTicks = new Array(CAND.length).fill(0);

// One episode = one civ's eligible decline, start to finish.
interface Episode { ticks: number; open: number[] }
const episodes: Episode[] = [];
let rallies = 0, declines = 0;

for (const seed of seeds) {
  const { biomes, elevation, form } = terrainFor(seed);
  const world = createSimWorld(GRID, GRID, seed);
  seedInitialCivs(world, biomes, 1);
  const nat = placeNaturalWonders(biomes, elevation, seed, form);
  setVolcanoes(world, nat.filter(w => w.kind === 'volcano').map(w => ({ row: w.row, col: w.col })));
  setWonderSites(world, nat.map(w => ({ row: w.row, col: w.col, pull: WONDER_PULL[w.kind], radius: WONDER_RADIUS[w.kind] })));
  const TICKS = worldFateForSeed(seed, SIM.worldCycleTicks).endTick - ENDING_TAIL_TICKS;

  const openEp = new Map<number, Episode>();

  for (let t = 0; t < TICKS; t++) {
    const { events } = step(world, biomes, elevation);
    for (const e of events) {
      if (e.kind === 'rally') rallies++;
      if (e.kind === 'civ_declining') declines++;
    }
    for (const civ of world.civs.values()) {
      const eligible = civ.phase === 'declining' && !civ.hasRallied;
      let ep = openEp.get(civ.id);
      if (!eligible) {
        if (ep) { episodes.push(ep); openEp.delete(civ.id); }
        continue;
      }
      if (!ep) { ep = { ticks: 0, open: new Array(CAND.length).fill(0) }; openEp.set(civ.id, ep); }
      ep.ticks++;
      for (let i = 0; i < CAND.length; i++) {
        if (civ.fortune >= CAND[i]) { ep.open[i]++; openTicks[i]++; }
      }
    }
  }
  for (const ep of openEp.values()) episodes.push(ep);
}

const totalEligible = episodes.reduce((s, e) => s + e.ticks, 0);
const durs = episodes.map(e => e.ticks).sort((a, b) => a - b);
const pct = (p: number) => durs.length ? durs[Math.min(durs.length - 1, Math.floor(p * durs.length))] : NaN;

console.log(`seeds=${seeds.length}  declines=${declines}  rallies=${rallies}  ` +
  `observed rate = 1 in ${rallies ? (declines / rallies).toFixed(0) : '∞'}` +
  `   (bar=${SIM.rallyMinFortune} chance=${SIM.rallyChance})`);
console.log(`eligible decline episodes=${episodes.length}  eligible ticks=${totalEligible}`);
console.log(`  episode length: min ${durs[0]}  p25 ${pct(0.25)}  median ${pct(0.5)}  p75 ${pct(0.75)}  max ${durs[durs.length - 1]}`);

// Expected rallies per decline for each (bar, chance) pair, computed from the
// per-episode open-tick counts actually observed: 1 - (1-chance)^openTicks.
console.log(`\nexpected rallies per decline (from measured open windows):`);
const CHANCES = [0.0002, 0.0005, 0.001, 0.002, 0.005];
console.log(`  bar   openTicks%   ` + CHANCES.map(c => String(c).padStart(8)).join(''));
for (let i = 0; i < CAND.length; i++) {
  const share = (100 * openTicks[i] / (totalEligible || 1)).toFixed(1);
  const cells = CHANCES.map(c => {
    const exp = episodes.reduce((s, e) => s + (1 - Math.pow(1 - c, e.open[i])), 0);
    const rate = exp / (episodes.length || 1);
    return (rate >= 0.001 ? `1 in ${(1 / rate).toFixed(0)}` : '  never').padStart(8);
  });
  console.log(`  ${String(CAND[i]).padEnd(6)}${share.padStart(6)}%    ` + cells.join(''));
}
