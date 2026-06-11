// Headless observation harness — runs the sim without rendering and reports
// the event stream + pacing stats a viewer would experience.
// Usage: npx tsx scripts/observe.ts [seed] [ticks]
// Not part of the build; analysis tooling for the Fable suspense run.

import { generateBiomeMap } from '../src/biomes';
import { createSimWorld, step, seedInitialCivs, CATASTROPHE, type SimEvent, type SimWorld } from '../src/sim';

const seed = process.argv[2] ?? 'observe1';
const TICKS = Number(process.argv[3] ?? 54000); // 30 min of viewing at 30 tps
const TPS = 30;

const { biomes, elevation } = generateBiomeMap(96, 96, seed);
const world = createSimWorld(96, 96);
seedInitialCivs(world, biomes, 1);

function mmss(tick: number): string {
  const s = tick / TPS;
  return `${String(Math.floor(s / 60)).padStart(3)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
}

function civName(world: SimWorld, id: number): string {
  return world.civs.get(id)?.name ?? `#${id}`;
}

interface CivLife { born: number; declining?: number; died?: number; name: string; peak: number }
const lives = new Map<number, CivLife>();
const catastrophes: Array<{ tick: number; type: string; severity: number; affected: number[] }> = [];
let pressureSamples: Array<{ tick: number; p: number }> = [];
let eventCount = 0;

for (const c of world.civs.values()) lives.set(c.id, { born: 0, name: c.name, peak: 1 });

for (let t = 0; t < TICKS; t++) {
  const { events } = step(world, biomes, elevation);
  if (world.tick % 300 === 0) pressureSamples.push({ tick: world.tick, p: world.catastrophePressure });

  // track peaks
  if (world.tick % 100 === 0) {
    const counts = new Map<number, number>();
    for (const row of world.tiles) for (const tile of row) if (tile.civId != null) counts.set(tile.civId, (counts.get(tile.civId) ?? 0) + 1);
    for (const [id, n] of counts) { const l = lives.get(id); if (l && n > l.peak) l.peak = n; }
  }

  for (const ev of events) {
    eventCount++;
    switch (ev.kind) {
      case 'civ_born': {
        const c = world.civs.get(ev.civId)!;
        lives.set(ev.civId, { born: world.tick, name: c.name, peak: 1 });
        console.log(`${mmss(world.tick)}  BORN       ${c.name} (era ${c.era}, ambition ${c.maxSize})`);
        break;
      }
      case 'civ_declining':
        if (lives.get(ev.civId)) lives.get(ev.civId)!.declining = world.tick;
        console.log(`${mmss(world.tick)}  DECLINING  ${civName(world, ev.civId)}`);
        break;
      case 'civ_died': {
        const l = lives.get(ev.civId);
        if (l) l.died = world.tick;
        console.log(`${mmss(world.tick)}  DIED       ${civName(world, ev.civId)} (lived ${l ? mmss(world.tick - l.born) : '?'}, peak ${l?.peak})`);
        break;
      }
      case 'colony_founded':
        console.log(`${mmss(world.tick)}  COLONY     ${civName(world, ev.civId)}`);
        break;
      case 'breakaway':
        console.log(`${mmss(world.tick)}  BREAKAWAY  ${civName(world, ev.newCivId)} from ${civName(world, ev.parentId)}`);
        break;
      case 'city_fell':
        console.log(`${mmss(world.tick)}  CITY FELL  ${ev.cityName}${ev.wasCapital ? ' (CAPITAL)' : ''} of ${civName(world, ev.civId)} prom=${ev.prominence.toFixed(2)}`);
        break;
      case 'capital_moved':
        console.log(`${mmss(world.tick)}  CAP MOVED  ${civName(world, ev.civId)}: ${ev.oldCapitalName} -> ${ev.newCapitalName}`);
        break;
      case 'catastrophe': {
        catastrophes.push({ tick: world.tick, type: ev.catastropheType, severity: ev.severity, affected: ev.affectedCivIds });
        const tier = ev.severity >= CATASTROPHE.severitySevereThreshold ? 'SEVERE' : ev.severity >= CATASTROPHE.severityModerateThreshold ? 'moderate' : 'minor';
        console.log(`${mmss(world.tick)}  ********** CATASTROPHE ${ev.catastropheType} ${tier} sev=${ev.severity.toFixed(2)} affected=[${ev.affectedCivIds.map(id => civName(world, id)).join(', ')}]`);
        break;
      }
    }
  }
}

console.log('\n===== SUMMARY =====');
console.log(`seed=${seed} ticks=${TICKS} (${mmss(TICKS)} of viewing)  events=${eventCount}`);
console.log(`\nCatastrophes: ${catastrophes.length}`);
let last = 0;
for (const c of catastrophes) {
  console.log(`  ${mmss(c.tick)} ${c.type} sev=${c.severity.toFixed(2)} (gap ${mmss(c.tick - last)}) affected=${c.affected.length}`);
  last = c.tick;
}
console.log(`\nCiv lives (declining->died gap is the visible "dying window"):`);
for (const [, l] of lives) {
  const decl = l.declining != null && l.died != null ? mmss(l.died - l.declining) : l.declining != null ? 'declining...' : '—';
  console.log(`  ${l.name.padEnd(28)} born ${mmss(l.born)}  peak ${String(l.peak).padStart(3)}  ${l.died ? 'died ' + mmss(l.died) : 'alive'}  dying-window ${decl}`);
}
console.log(`\nPressure curve (sampled every 300 ticks = 10s):`);
const line = pressureSamples.filter((_, i) => i % 6 === 0).map(s => s.p.toFixed(2)).join(' ');
console.log(line);
