import type { Biome } from './biomes';
import { ERAS_ORDERED, eraRank, type Era, type SimEvent, type SimWorld } from './sim';

export type WorldEndingKind =
  | 'drowned'
  | 'long_winter'
  | 'ash'
  | 'rewilded'
  | 'world_empire'
  | 'exodus'
  | 'garden';

export interface WorldEndingProfile {
  kind: WorldEndingKind;
  title: string;
  eyebrow: string;
  description: string;
  archiveLabel: string;
}

export const WORLD_ENDINGS: Record<WorldEndingKind, WorldEndingProfile> = {
  drowned: {
    kind: 'drowned',
    title: 'The Drowned World',
    eyebrow: 'the waters did not recede',
    description: 'Old roads end at the shore. The last cities keep their lights above a rising sea.',
    archiveLabel: 'drowned',
  },
  long_winter: {
    kind: 'long_winter',
    title: 'The Long Winter',
    eyebrow: 'the thaw never came',
    description: 'The warm country narrowed to a few valleys, and every surviving fire became a capital.',
    archiveLabel: 'froze',
  },
  ash: {
    kind: 'ash',
    title: 'The World of Ash',
    eyebrow: 'the sky remembered the fire',
    description: 'Empires vanished beneath dark weather. New peoples made homes among the blackened stones.',
    archiveLabel: 'burned',
  },
  rewilded: {
    kind: 'rewilded',
    title: 'The Green Silence',
    eyebrow: 'the land outlived its makers',
    description: 'Roots opened the roads. Forest and grass crossed the old borders without learning their names.',
    archiveLabel: 'returned to the wild',
  },
  world_empire: {
    kind: 'world_empire',
    title: 'The World Empire',
    eyebrow: 'one banner reached every shore',
    description: 'For a brief age the maps had no edges, only provinces—and one name spoken everywhere.',
    archiveLabel: 'was unified',
  },
  exodus: {
    kind: 'exodus',
    title: 'The Great Departure',
    eyebrow: 'the cities looked upward',
    description: 'The last launches rose beyond the weather. Their lights remained in orbit after the streets went dark.',
    archiveLabel: 'was left for the stars',
  },
  garden: {
    kind: 'garden',
    title: 'The Garden World',
    eyebrow: 'an age learned how to remain',
    description: 'Cities grew quieter instead of larger. The old wilderness returned, this time by invitation.',
    archiveLabel: 'found a balance',
  },
};

export interface WorldHistory {
  born: number;
  died: number;
  conquests: number;
  wonders: number;
  rallies: number;
  catastrophes: number;
  severeCatastrophes: number;
  floods: number;
  volcanoes: number;
  asteroids: number;
  initialWaterFraction: number;
}

export interface WorldFate {
  endTick: number;
  affinity: WorldEndingKind;
}

export interface ResolvedWorldEnding extends WorldEndingProfile {
  epitaph: string;
  dominantCivName: string | null;
  livingCivilizations: number;
  cities: number;
  highestEra: Era;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: string, salt: string): number {
  let x = hashSeed(`${seed}:${salt}`) || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0x100000000;
}

export function worldFateForSeed(seed: string, referenceTicks: number): WorldFate {
  const kinds = Object.keys(WORLD_ENDINGS) as WorldEndingKind[];
  // Some worlds end before the technological arc is complete. This is the
  // simplest way to stop every history converging on the same future skyline.
  const lifeFraction = 0.58 + seededUnit(seed, 'lifespan') * 0.39;
  return {
    endTick: Math.round(referenceTicks * lifeFraction),
    affinity: kinds[Math.floor(seededUnit(seed, 'ending-affinity') * kinds.length)],
  };
}

export function waterFraction(biomes: Biome[][]): number {
  let water = 0;
  let total = 0;
  for (const row of biomes) {
    for (const biome of row) {
      total++;
      if (biome === 'water') water++;
    }
  }
  return total > 0 ? water / total : 0;
}

export function createWorldHistory(biomes: Biome[][]): WorldHistory {
  return {
    born: 0,
    died: 0,
    conquests: 0,
    wonders: 0,
    rallies: 0,
    catastrophes: 0,
    severeCatastrophes: 0,
    floods: 0,
    volcanoes: 0,
    asteroids: 0,
    initialWaterFraction: waterFraction(biomes),
  };
}

export function rememberWorldEvents(history: WorldHistory, events: SimEvent[]) {
  for (const event of events) {
    if (event.kind === 'civ_born') history.born++;
    else if (event.kind === 'civ_died') history.died++;
    else if (event.kind === 'conquest') history.conquests++;
    else if (event.kind === 'wonder_built') history.wonders++;
    else if (event.kind === 'rally') history.rallies++;
    else if (event.kind === 'catastrophe') {
      history.catastrophes++;
      if (event.severity >= 0.7) history.severeCatastrophes++;
      if (event.catastropheType === 'flood') history.floods++;
      if (event.catastropheType === 'volcano') history.volcanoes++;
      if (event.catastropheType === 'asteroid') history.asteroids++;
    }
  }
}

function highestEra(world: SimWorld): Era {
  let rank = Math.max(0, Math.min(ERAS_ORDERED.length - 1, Math.floor(world.eraProgress)));
  for (const civ of world.civs.values()) rank = Math.max(rank, eraRank(civ.era));
  return ERAS_ORDERED[rank];
}

export function resolveWorldEnding(
  world: SimWorld,
  biomes: Biome[][],
  history: WorldHistory,
  fate: WorldFate,
): ResolvedWorldEnding {
  let built = 0;
  let ruins = 0;
  let wild = 0;
  let land = 0;
  const territory = new Map<number, number>();
  for (let row = 0; row < world.height; row++) {
    for (let col = 0; col < world.width; col++) {
      if (biomes[row][col] === 'water') continue;
      land++;
      const tile = world.tiles[row][col];
      if (tile.state === 'built' || tile.state === 'cleared') built++;
      else if (tile.state === 'ruin') ruins++;
      else wild++;
      if (tile.civId != null) territory.set(tile.civId, (territory.get(tile.civId) ?? 0) + 1);
    }
  }

  const living = [...world.civs.values()].filter((civ) => civ.phase !== 'dead');
  const cities = living.reduce((sum, civ) => sum + civ.cities.length, 0);
  const era = highestEra(world);
  const eraValue = eraRank(era);
  const dominant = living
    .map((civ) => ({ civ, tiles: territory.get(civ.id) ?? 0 }))
    .sort((a, b) => b.tiles - a.tiles)[0] ?? null;
  const dominantShare = dominant && built > 0 ? dominant.tiles / built : 0;
  const waterGain = Math.max(0, waterFraction(biomes) - history.initialWaterFraction);
  const builtShare = land > 0 ? built / land : 0;
  const ruinShare = land > 0 ? ruins / land : 0;
  const wildShare = land > 0 ? wild / land : 0;

  const scores: Record<WorldEndingKind, number> = {
    drowned: history.floods * 1.8 + waterGain * 28 + (waterFraction(biomes) > 0.48 ? 1.2 : 0),
    long_winter: world.iceExtent * 7 + world.iceMax * 0.8 + (builtShare < 0.16 ? 0.8 : 0),
    ash: history.volcanoes * 1.7 + history.asteroids * 1.15 + history.severeCatastrophes * 1.1 + ruinShare * 3,
    rewilded: wildShare * 2.8 + ruinShare * 2 + (living.length === 0 ? 4 : 0) + history.died * 0.12,
    world_empire: dominantShare * 5 + (living.length === 1 ? 2.6 : 0) + history.conquests * 0.025 + (eraValue >= 3 ? 0.8 : 0),
    exodus: (era === 'post' ? 4.2 : 0) + Math.min(2, cities / 8) + (living.length > 0 ? 0.6 : 0),
    garden: Math.min(2.4, living.length * 0.42) + builtShare * 2.5 + (1 - ruinShare) * 1.3
      + (eraValue >= 4 ? 1.1 : 0) - history.severeCatastrophes * 0.7,
  };

  // The fate is a light thumb on the scale, never strong enough to turn an
  // obviously ruined world into a paradise. It makes close outcomes diverge.
  scores[fate.affinity] += 1.15;
  if (eraValue < 5) scores.exodus -= 1.4;
  if (dominantShare < 0.46 || built < 100) scores.world_empire -= 1.6;
  if (history.floods === 0 && waterGain < 0.015) scores.drowned -= 1.2;
  if (history.volcanoes === 0 && history.asteroids === 0) scores.ash -= 1.0;
  if (living.length >= 3 && builtShare > 0.18) scores.rewilded -= 1.2;

  const kind = (Object.keys(scores) as WorldEndingKind[])
    .sort((a, b) => scores[b] - scores[a])[0];
  const profile = WORLD_ENDINGS[kind];

  let epitaph = profile.description;
  if (kind === 'world_empire' && dominant) {
    epitaph = `${dominant.civ.name} joined the known world beneath one banner. For a time, there were no foreign shores.`;
  } else if (kind === 'exodus' && dominant) {
    epitaph = `${dominant.civ.name} sent the last lights upward. The cities below became constellations seen from orbit.`;
  } else if (kind === 'rewilded' && history.died > 0) {
    epitaph = `${history.died} civilizations passed away. In the end, the roads belonged to roots and rain.`;
  } else if (kind === 'ash' && history.severeCatastrophes > 0) {
    epitaph = `${history.severeCatastrophes} great disasters remade the land. The survivors measured history from the last dark sky.`;
  } else if (kind === 'drowned' && history.floods > 0) {
    epitaph = `${history.floods} great floods moved the shoreline inland. The old capitals became names for reefs.`;
  }

  return {
    ...profile,
    epitaph,
    dominantCivName: dominant?.civ.name ?? null,
    livingCivilizations: living.length,
    cities,
    highestEra: era,
  };
}
