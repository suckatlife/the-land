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

// What actually *happens* at the end, as distinct from what the card says.
// The title vocabulary (WorldEndingKind) cannot select this: it has no
// earthquake, and its single `ash` covers both an impact and a supervolcano.
export type ApocalypseKind =
  | 'quiet'
  | 'impact'
  | 'ashfall'
  | 'deluge'
  | 'shaking'
  | 'freeze';

// Which titles are legal for which cause. `quiet` reaches four, which is why
// the cause is chosen first and the title second — a single-valued map in the
// other direction would leave three cards unreachable.
export const APOCALYPSE_ENDINGS: Record<ApocalypseKind, WorldEndingKind[]> = {
  quiet:   ['rewilded', 'garden', 'exodus', 'world_empire',
            // Reachable without a staged act 3; see SHIPPED_APOCALYPSES.
            'drowned', 'long_winter', 'ash'],
  impact:  ['ash'],
  ashfall: ['ash'],
  deluge:  ['drowned'],
  shaking: ['ash'],
  freeze:  ['long_winter'],
};

// A cause is selectable only once its sequence exists, so a committed cause
// always has something to run. Phase 1 ships the shape, not a disaster.
//
// This had a consequence nobody noticed until #32: because `quiet` reaches only
// four of the seven titles, `drowned`, `long_winter` and `ash` became
// UNREACHABLE the moment this gate shipped — a world that flooded could never be
// called The Drowned World again. That is a regression, not a design.
//
// Fixed by separating the two things the gate was conflating. A cause still may
// not be committed unless its sequence exists, but a *title* does not need a
// bespoke act 3 to be earned: every ending already has a card, an epitaph and
// the omen-and-silence shape. Disaster titles are therefore reachable through
// `quiet` until their own sequences ship, at which point they move.
export const SHIPPED_APOCALYPSES: ApocalypseKind[] = ['quiet'];

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
    description: 'Old roads end at the shore.',
    archiveLabel: 'drowned',
  },
  long_winter: {
    kind: 'long_winter',
    title: 'The Long Winter',
    eyebrow: 'the thaw never came',
    description: 'The warm country narrowed to a few valleys. Every surviving fire became a capital, and the people who kept one were counted rich.',
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
    description: 'Roots opened the roads. Nothing came to fix them.',
    archiveLabel: 'returned to the wild',
  },
  world_empire: {
    kind: 'world_empire',
    title: 'The World Empire',
    eyebrow: 'one banner reached every shore',
    description: 'For a brief age the maps had no edges, only provinces—and one name spoken everywhere, in accents that no longer knew they were foreign.',
    archiveLabel: 'was unified',
  },
  exodus: {
    kind: 'exodus',
    title: 'The Great Departure',
    eyebrow: 'the cities looked upward',
    description: 'The last launches rose beyond the weather. Their lights stayed in orbit long after the streets below went dark.',
    archiveLabel: 'was left for the stars',
  },
  garden: {
    kind: 'garden',
    title: 'The Garden World',
    eyebrow: 'an age learned how to remain',
    description: 'Cities stopped growing. That turned out to be the hard part.',
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
  earthquakes: number;
  initialWaterFraction: number;
}

export interface WorldFate {
  endTick: number;
  affinity: WorldEndingKind;
  // Its own draw, not derived from `affinity`: that is a title, and titles
  // cannot express cause-level divergence (`ash` is two different causes,
  // four titles collapse to `quiet`, nothing maps to a shaking).
  causeAffinity: ApocalypseKind;
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
  const causes = Object.keys(APOCALYPSE_ENDINGS) as ApocalypseKind[];
  return {
    endTick: Math.round(referenceTicks * lifeFraction),
    affinity: kinds[Math.floor(seededUnit(seed, 'ending-affinity') * kinds.length)],
    causeAffinity: causes[Math.floor(seededUnit(seed, 'cause-affinity') * causes.length)],
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
    earthquakes: 0,
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
      if (event.catastropheType === 'earthquake') history.earthquakes++;
    }
  }
}

function highestEra(world: SimWorld): Era {
  let rank = Math.max(0, Math.min(ERAS_ORDERED.length - 1, Math.floor(world.eraProgress)));
  for (const civ of world.civs.values()) rank = Math.max(rank, eraRank(civ.era));
  return ERAS_ORDERED[rank];
}

interface EndingMetrics {
  built: number;
  ruins: number;
  land: number;
  living: number;
  cities: number;
  era: Era;
  eraValue: number;
  dominantName: string | null;
  dominantShare: number;
  waterGain: number;
  builtShare: number;
  ruinShare: number;
  wildShare: number;
}

// One pass over the map. Called twice in a world's life — once at the commit
// tick to choose the ending, once at the true end to describe it — and the two
// answers are expected to differ, because the ending happens in between.
export function measure(world: SimWorld, biomes: Biome[][], history: WorldHistory): EndingMetrics {
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
  const dominant = living
    .map((civ) => ({ civ, tiles: territory.get(civ.id) ?? 0 }))
    .sort((a, b) => b.tiles - a.tiles)[0] ?? null;
  const era = highestEra(world);

  return {
    built,
    ruins,
    land,
    living: living.length,
    cities: living.reduce((sum, civ) => sum + civ.cities.length, 0),
    era,
    eraValue: eraRank(era),
    dominantName: dominant?.civ.name ?? null,
    dominantShare: dominant && built > 0 ? dominant.tiles / built : 0,
    waterGain: Math.max(0, waterFraction(biomes) - history.initialWaterFraction),
    builtShare: land > 0 ? built / land : 0,
    ruinShare: land > 0 ? ruins / land : 0,
    wildShare: land > 0 ? wild / land : 0,
  };
}

// Which *title* fits the world. Unchanged scoring, extracted so the commit and
// the final resolution cannot drift apart.
// Exported for the balance instrument: #32 found the ending was decided by
// whichever unbounded counter grew fastest, and that was only diagnosable by
// reading the raw scores rather than the winner.
export function scoreEndings(
  world: SimWorld,
  biomes: Biome[][],
  history: WorldHistory,
  fate: WorldFate,
  m: EndingMetrics,
): Record<WorldEndingKind, number> {
  // Every term below is bounded to roughly 0-5, and that is the whole point.
  //
  // The original table mixed *counts* with *shares*. Shares are fractions of the
  // map and cannot exceed 1; counts accumulate over a 10-17 minute world and
  // reach the thousands. Measured over 30 seeds: conquests 5,000-12,000,
  // volcanoes 1-8, deaths 18-37 — against share terms topping out near 2. Counts
  // therefore always won, and the ending was decided by whichever counter grew
  // fastest rather than by what the world became. It was world_empire 30/30 on
  // conquests; capping that alone merely handed the landslide to ash on
  // volcanoes, 27/30. Each count is now saturated against a plausible ceiling
  // before its weight is applied.
  const sat = (n: number, ceiling: number) => Math.min(1, n / ceiling);
  const scores: Record<WorldEndingKind, number> = {
    drowned: sat(history.floods, 3) * 3.4 + Math.min(1, m.waterGain * 25) * 2.5
      + (waterFraction(biomes) > 0.48 ? 1.2 : 0),
    long_winter: world.iceExtent * 3 + world.iceMax * 3.4 + (m.builtShare < 0.16 ? 0.8 : 0),
    ash: sat(history.volcanoes, 6) * 2.2 + sat(history.asteroids, 2) * 1.5
      + sat(history.severeCatastrophes, 3) * 1.2 + m.ruinShare * 3,
    rewilded: m.wildShare * 2.8 + m.ruinShare * 2 + (m.living === 0 ? 4 : 0)
      + sat(history.died, 30) * 1.5,
    // conquests is counted per captured TILE, so a 10-17 minute world reaches
    // the thousands — 17,240 in one measured seed. At 0.025 apiece that was 431
    // points against a table where every other term is 0-5, so this ending won
    // 30 of 30 seeds. Capped, and rescaled so it takes a genuinely warlike world
    // to earn the full value rather than any world at all.
    world_empire: m.dominantShare * 5 + (m.living === 1 ? 2.6 : 0)
      + sat(history.conquests, 2500) * 1.2 + (m.eraValue >= 3 ? 0.8 : 0),
    exodus: (m.era === 'post' ? 2.8 : 0) + Math.min(2, m.cities / 8) + (m.living > 0 ? 0.6 : 0),
    garden: Math.min(1.8, m.living * 0.35) + m.builtShare * 2.5 + (1 - m.ruinShare) * 0.8
      + (m.eraValue >= 4 ? 1.1 : 0) - sat(history.severeCatastrophes, 3) * 1.4,
  };

  // The fate is a light thumb on the scale, never strong enough to turn an
  // obviously ruined world into a paradise. It makes close outcomes diverge.
  scores[fate.affinity] += 1.15;
  if (m.eraValue < 5) scores.exodus -= 1.4;
  if (m.dominantShare < 0.46 || m.built < 100) scores.world_empire -= 1.6;
  // An empire with nobody in it is not one. A measured world with living === 0
  // and dominantShare === 0 was still titled "one banner reached every shore",
  // on conquest count alone.
  if (m.living === 0) scores.world_empire = -Infinity;
  if (history.floods === 0 && m.waterGain < 0.015) scores.drowned -= 1.2;
  if (history.volcanoes === 0 && history.asteroids === 0) scores.ash -= 1.0;
  if (m.living >= 3 && m.builtShare > 0.18) scores.rewilded -= 1.2;
  return scores;
}

// Which *cause* the world has earned. Separate from the titles: `ash` is two
// different causes and four titles share `quiet`, so a title score cannot
// select a sequence.
function scoreCauses(
  world: SimWorld,
  history: WorldHistory,
  fate: WorldFate,
  m: EndingMetrics,
): Record<ApocalypseKind, number> {
  const scores: Record<ApocalypseKind, number> = {
    // Every world can end quietly; the disasters have to be earned past it.
    quiet: 1.6,
    impact: history.asteroids * 1.6,
    ashfall: history.volcanoes * 1.6,
    deluge: history.floods * 1.5 + m.waterGain * 24,
    shaking: history.earthquakes * 1.4,
    freeze: world.iceExtent * 6 + world.iceMax * 0.8,
  };
  scores[fate.causeAffinity] += 1.15;
  return scores;
}

/**
 * Commit the world to how it will end, early enough for the ending to be
 * staged. Returns the cause *and* the title together: choosing the cause first
 * and the title from its legal set is what keeps all four quiet titles
 * reachable. Only causes whose sequence has shipped are selectable.
 *
 * This deliberately does NOT produce the epitaph, era or survivor counts —
 * those describe the world *after* its ending and belong to resolveWorldEnding.
 */
export function commitEndingKind(
  world: SimWorld,
  biomes: Biome[][],
  history: WorldHistory,
  fate: WorldFate,
): { apocalypse: ApocalypseKind; ending: WorldEndingKind } {
  const m = measure(world, biomes, history);
  const causeScores = scoreCauses(world, history, fate, m);
  const apocalypse = SHIPPED_APOCALYPSES
    .slice()
    .sort((a, b) => causeScores[b] - causeScores[a])[0] ?? 'quiet';

  const endingScores = scoreEndings(world, biomes, history, fate, m);
  const legal = APOCALYPSE_ENDINGS[apocalypse];
  const ending = legal.slice().sort((a, b) => endingScores[b] - endingScores[a])[0];
  return { apocalypse, ending };
}

/**
 * Describe the world as it finally is. `committed` is the title chosen at the
 * commit tick; passing it keeps the card honest about what the viewer watched.
 * Everything else here — epitaph, era, survivors — is measured now, after the
 * ending has run, which is why the commit does not snapshot them.
 */
export function resolveWorldEnding(
  world: SimWorld,
  biomes: Biome[][],
  history: WorldHistory,
  fate: WorldFate,
  committed?: WorldEndingKind,
): ResolvedWorldEnding {
  const m = measure(world, biomes, history);
  const kind = committed ?? (Object.keys(scoreEndings(world, biomes, history, fate, m)) as WorldEndingKind[])
    .sort((a, b) => {
      const scores = scoreEndings(world, biomes, history, fate, m);
      return scores[b] - scores[a];
    })[0];
  const profile = WORLD_ENDINGS[kind];

  let epitaph = profile.description;
  if (kind === 'world_empire' && m.dominantName) {
    epitaph = `${m.dominantName} joined the known world beneath one banner, and for a time there were no foreign shores — only provinces, and a very long list of names for the same road.`;
  } else if (kind === 'exodus' && m.dominantName) {
    epitaph = `${m.dominantName} sent the last lights upward.`;
  } else if (kind === 'rewilded' && history.died > 0) {
    epitaph = `${history.died} civilizations passed away. The roads belonged to roots and rain.`;
  } else if (kind === 'ash' && history.severeCatastrophes > 0) {
    epitaph = `${history.severeCatastrophes} great disasters remade the land. Afterwards the survivors dated everything from the last dark sky, as though the world had agreed to start again.`;
  } else if (kind === 'drowned' && history.floods > 0) {
    epitaph = `${history.floods} great floods moved the shoreline inland. The old capitals are names for reefs now.`;
  }

  return {
    ...profile,
    epitaph,
    dominantCivName: m.dominantName,
    livingCivilizations: m.living,
    cities: m.cities,
    highestEra: m.era,
  };
}
