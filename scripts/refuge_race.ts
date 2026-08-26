// Issue #37 instrumentation: a `last_flight` has never become a `refuge_founded`.
// Four conditions gate that pathway (voyage survival, a settleable landfall,
// the parent civ being ALREADY DEAD at landfall, and the world not yet ending).
// The issue guessed the parent-death race binds; this measures which one does,
// per the lesson from #35 — measure first, then move the one constant.
//
// Fidelity mirrors scripts/wonder_gate.ts: the sim gets the same natural-wonder
// settlement pull and volcano positions main.ts gives it, the same land-target
// nudge, and stops before the staged ending rather than running raw to endTick.
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
// Same tail cut as wonder_gate.ts: the last (35 + 15) seconds are the staged
// ending, not ordinary life. Refuges are explicitly blocked once `world.ending`
// is set, so counting that window would measure a rule, not a race.
const ENDING_TAIL_TICKS = Math.round((35 + 15) * 30);

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
  : Array.from({ length: 24 }, (_, i) => `refuge-${i}`);
// Optional overrides, so the launch gate can be swept without editing sim.ts
// between runs: argv[3] = lastFlightMinDecline, argv[4] = lastFlightChance.
if (process.argv[3]) SIM.lastFlightMinDecline = parseFloat(process.argv[3]);
if (process.argv[4]) SIM.lastFlightChance = parseFloat(process.argv[4]);

type Outcome = 'refuge' | 'colony' | 'lost';
// Why a voyage that never landed ended. advanceExpeditions() checks these in
// order — off the grid, too old, the per-tick loss roll — and only then looks
// for a landing, so `nowhere` means it was over land with every candidate tile
// water, rock, or already someone's.
//
// `nowhere` only names a real branch on code that DROPS such a voyage. Once
// that is fixed, an unusable shore cannot end a voyage at all, and anything
// still labelled `nowhere` is a loss-roll death that happened to land on a tick
// when the ship was over unusable ground — read those as `drowned`. The label
// is kept so before/after runs stay directly comparable.
type Cause = 'edge' | 'aged' | 'drowned' | 'nowhere' | '-';
interface Flight {
  seed: string;
  civId: number;
  launchTick: number;
  voyage: number;          // ticks survived
  outcome: Outcome;
  parentDeathTick: number | null;  // null = parent outlived the measured world
  landfallTick: number | null;
  cause: Cause;
  strengthAtLaunch: number;
}
const flights: Flight[] = [];

// sim.ts keeps effectiveStrength() private; this is its line-for-line twin
// (max(0, vitality + fortune)), used only to read the world, never to drive it.
const strengthOf = (civ: { vitality: number; fortune: number }) =>
  Math.max(0, civ.vitality + civ.fortune);

// How much life is left in a declining civ at a given strength? The last flight
// currently launches anywhere in the decline; if a tighter bar reliably means
// "death is near", moving that bar is the one constant that shortens the race.
const BANDS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];
const bandRemaining: number[][] = BANDS.map(() => []);

// Reproduces advanceExpeditions()' own checks against the world as it stands
// after the tick, in the same order, to name the branch that dropped a voyage.
function causeOf(
  world: ReturnType<typeof createSimWorld>, biomes: ReturnType<typeof generateBiomeMap>['biomes'],
  exp: { row: number; col: number; age: number; civId: number },
): Cause {
  const ir = Math.round(exp.row), ic = Math.round(exp.col);
  if (ir < 0 || ir >= world.height || ic < 0 || ic >= world.width) return 'edge';
  if (exp.age > SIM.expeditionMaxAge) return 'aged';
  if (biomes[ir][ic] === 'water' || exp.age <= 5) return 'drowned';
  for (const [tr, tc] of [[ir, ic], [ir - 1, ic], [ir + 1, ic], [ir, ic - 1], [ir, ic + 1]]) {
    if (tr < 0 || tr >= world.height || tc < 0 || tc >= world.width) continue;
    if (biomes[tr][tc] === 'water' || biomes[tr][tc] === 'rock') continue;
    const target = world.tiles[tr][tc];
    if (target.civId !== exp.civId && (target.state === 'wild' || target.state === 'ruin')) return 'drowned';
  }
  return 'nowhere';
}

for (const seed of seeds) {
  const { biomes, elevation, form } = terrainFor(seed);
  const world = createSimWorld(GRID, GRID, seed);
  seedInitialCivs(world, biomes, 1);
  const nat = placeNaturalWonders(biomes, elevation, seed, form);
  setVolcanoes(world, nat.filter(w => w.kind === 'volcano').map(w => ({ row: w.row, col: w.col })));
  setWonderSites(world, nat.map(w => ({ row: w.row, col: w.col, pull: WONDER_PULL[w.kind], radius: WONDER_RADIUS[w.kind] })));
  const TICKS = worldFateForSeed(seed, SIM.worldCycleTicks).endTick - ENDING_TAIL_TICKS;

  type Exp = (typeof world.expeditions)[number];
  // Expedition objects are reused by identity across ticks (advanceExpeditions
  // re-pushes the survivors), so identity tracks one voyage end to end.
  const tracked = new Map<Exp, { civId: number; launchTick: number; strength: number }>();
  // Sampled every 10 ticks: a declining civ's strength, paired with its death
  // tick once the world has finished running.
  const decl = new Map<number, Array<{ t: number; s: number }>>();
  const deathTick = new Map<number, number>();
  const open: Flight[] = [];

  for (let t = 0; t < TICKS; t++) {
    const before = world.expeditions.filter(e => e.desperate);
    const { events } = step(world, biomes, elevation);

    for (const civ of world.civs.values()) {
      if (civ.phase === 'dead' && !deathTick.has(civ.id)) deathTick.set(civ.id, t);
      if (civ.phase === 'declining' && t % 10 === 0) {
        let tr = decl.get(civ.id);
        if (!tr) { tr = []; decl.set(civ.id, tr); }
        tr.push({ t, s: strengthOf(civ) });
      }
    }

    // A last_flight event means maybeLaunchExpeditions just pushed its voyage.
    for (const e of events) {
      if (e.kind !== 'last_flight') continue;
      const exp = world.expeditions.find(x => x.desperate && x.civId === e.civId && !tracked.has(x));
      if (exp) tracked.set(exp, {
        civId: e.civId, launchTick: t,
        strength: strengthOf(world.civs.get(e.civId)!),
      });
    }

    const alive = new Set(world.expeditions);
    for (const exp of before) {
      if (alive.has(exp)) continue;
      const meta = tracked.get(exp);
      if (!meta) continue;          // launched before tracking began; not possible, but cheap
      tracked.delete(exp);
      const name = world.civs.get(meta.civId)?.name;
      const refuge = events.some(e => e.kind === 'refuge_founded' && e.parentName === name);
      const colony = events.some(e => e.kind === 'colony_founded' && e.desperate && e.civId === meta.civId);
      const outcome: Outcome = refuge ? 'refuge' : colony ? 'colony' : 'lost';
      const f: Flight = {
        seed, civId: meta.civId, launchTick: meta.launchTick, voyage: exp.age, outcome,
        parentDeathTick: deathTick.get(meta.civId) ?? null,
        landfallTick: outcome === 'lost' ? null : t,
        cause: outcome === 'lost' ? causeOf(world, biomes, exp) : '-',
        strengthAtLaunch: meta.strength,
      };
      flights.push(f);
      if (f.parentDeathTick === null) open.push(f);   // may still die later this world
    }
  }
  // A parent that died after its flight resolved still matters: the margin is
  // how much LATER the death was, so fill it in once the world is finished.
  for (const f of open) f.parentDeathTick = deathTick.get(f.civId) ?? null;
  for (const [cid, tr] of decl) {
    const d = deathTick.get(cid);
    if (d === undefined) continue;
    for (const pt of tr) {
      const b = BANDS.findIndex(x => pt.s < x);
      if (b >= 0) bandRemaining[b].push(d - pt.t);
    }
  }
}

// Sharding: running seeds in parallel processes and aggregating raw records
// keeps a 24-world sweep to a few minutes without changing any per-world result.
if (process.env.RAW) {
  for (const f of flights) console.log(JSON.stringify(f));
  for (let i = 0; i < BANDS.length; i++) {
    for (const r of bandRemaining[i]) console.log(JSON.stringify({ band: BANDS[i], remaining: r }));
  }
  process.exit(0);
}

const by = (o: Outcome) => flights.filter(f => f.outcome === o);
const med = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN;

console.log(`seeds=${seeds.length} last_flights=${flights.length}`);
for (const o of ['refuge', 'colony', 'lost'] as Outcome[]) {
  const g = by(o);
  console.log(`  ${o.padEnd(7)} ${String(g.length).padStart(3)}  ` +
    `${(100 * g.length / (flights.length || 1)).toFixed(0).padStart(3)}%  median voyage ${med(g.map(f => f.voyage))}`);
}

// The race, stated as the number the fix has to move: at each landfall that
// became a desperate colony instead of a refuge, how many ticks SHORT of the
// parent's death was it? Positive = the flight landed too early.
const colonies = by('colony');
const margins = colonies
  .filter(f => f.parentDeathTick !== null)
  .map(f => f.parentDeathTick! - f.landfallTick!);
const outlived = colonies.filter(f => f.parentDeathTick === null).length;
console.log(`\ncolony landfalls: ${colonies.length}` +
  `  parent died later: ${margins.length}  parent never died in-world: ${outlived}`);
if (margins.length) {
  const sorted = [...margins].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  console.log(`  ticks short of the parent's death: ` +
    `min ${sorted[0]}  p25 ${pct(0.25)}  median ${pct(0.5)}  p75 ${pct(0.75)}  max ${sorted[sorted.length - 1]}`);
  for (const w of [200, 400, 800, 1600, 3200]) {
    console.log(`    would flip if the voyage outlasted ${String(w).padStart(4)} more ticks: ` +
      `${margins.filter(m => m <= w).length}/${margins.length}`);
  }
}

const lost = by('lost');
if (lost.length) {
  console.log(`\nlost voyages: ${lost.length}  median age ${med(lost.map(f => f.voyage))}` +
    `  aged out (>${SIM.expeditionMaxAge}): ${lost.filter(f => f.voyage > SIM.expeditionMaxAge).length}`);
  console.log(`  parent already dead when lost: ` +
    `${lost.filter(f => f.parentDeathTick !== null && f.parentDeathTick <= f.launchTick + f.voyage).length}`);
  for (const c of ['drowned', 'edge', 'nowhere', 'aged'] as Cause[]) {
    const g = lost.filter(f => f.cause === c);
    if (!g.length) { console.log(`  ${c.padEnd(8)}   0`); continue; }
    console.log(`  ${c.padEnd(8)} ${String(g.length).padStart(3)}  median age ${med(g.map(f => f.voyage))}`);
  }
}
