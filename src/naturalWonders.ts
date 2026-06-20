import { mulberry32, type Biome } from './biomes';

// Natural wonders: permanent, seed-placed LAND features that predate and
// outlast every civilization. The land is the protagonist; these are its
// landmarks. Pure placement — deterministic for a given seed, no rendering.
// main.ts draws them as overlays on top of the terrain (the sim never sees
// them, exactly like rivers).

export type NaturalWonderKind =
  | 'volcano'       // a smoking cone that glows and fountains — the live one
  | 'crater_lake'   // a deep round caldera lake ringed in rock
  | 'monolith'      // a lone red sandstone mass on arid flats (Uluru)
  | 'rainbow_hills' // banded mineral rock (Zhangye Danxia)
  | 'karst_spires'  // vertical limestone towers rising from coastal water
  | 'salt_flat';    // a flat pink/white mineral lake (Lake Retba)

export interface NaturalWonder {
  row: number;
  col: number;
  kind: NaturalWonderKind;
  name: string;
  // A stable per-wonder phase so animation (smoke drift, shimmer) differs
  // between two wonders of the same kind without needing per-frame randomness.
  phase: number;
}

// Evocative name pools — a deterministic pick gives each instance some
// character without a full procedural namer. Kept terse and mythic.
const NAME_POOLS: Record<NaturalWonderKind, string[]> = {
  volcano:       ['The Forge', 'Emberthroat', 'The Smoking Mount', 'Cinderhorn', 'The Old Anger'],
  crater_lake:   ['The Sky Well', 'Deepmere', 'The Drowned Cauldron', 'Stillwater Crown'],
  monolith:      ['The Red Watcher', 'Sunstone', 'The Lone Mass', 'Heartrock'],
  rainbow_hills: ['The Painted Hills', 'Dawnbands', 'The Stripe Lands', 'Kindled Rock'],
  karst_spires:  ['The Stone Fleet', 'Drowned Teeth', 'The Risen Spires', 'Sea-Fang Bay'],
  salt_flat:     ['The Rose Mirror', 'Saltbloom', 'The Pink Pan', 'Brightpan'],
};

// How far apart wonders must sit (Chebyshev tiles), and how far off the edge.
const MIN_SPACING = 14;
const EDGE_MARGIN = 8;

function isLand(b: Biome): boolean {
  return b !== 'water';
}

// Per-kind suitability for a tile. Returns a score (higher = better) or -1 if
// the tile can't host this kind at all. Placement picks the best-scoring of a
// random sample, so wonders land on characteristic terrain, not just anywhere.
function suitability(
  kind: NaturalWonderKind,
  row: number,
  col: number,
  biomes: Biome[][],
  elevation: number[][],
  coastal: boolean,
): number {
  const b = biomes[row][col];
  const e = elevation[row][col];
  switch (kind) {
    case 'volcano':
      // High standalone rock — the more elevated, the more it dominates.
      return b === 'rock' ? 1 + e : -1;
    case 'crater_lake':
      // Also high rock, but rewards being a touch lower than a volcano peak so
      // the two read differently when both land.
      return b === 'rock' ? 1 + (0.8 - Math.abs(e - 0.7)) : -1;
    case 'monolith':
      // Arid flats inland — sand or the dry 'fertile' band, away from the sea.
      return (b === 'sand' || b === 'fertile') && !coastal ? 1 - e : -1;
    case 'rainbow_hills':
      // Mid-elevation bare ground: rock or sand, the redder/drier the better.
      if (b === 'rock') return 0.8;
      if (b === 'sand') return 0.6;
      return -1;
    case 'karst_spires':
      // Coastal land — the towers rise where land meets open water.
      return coastal && (b === 'grass' || b === 'forest' || b === 'sand') ? 1 : -1;
    case 'salt_flat':
      // A drying mineral pan on low INLAND flats — penalise the coast so it
      // sits in the land rather than spilling into the sea.
      return (b === 'sand' || b === 'fertile') ? 1 - e - (coastal ? 0.8 : 0) : -1;
  }
}

function isCoastal(row: number, col: number, biomes: Biome[][]): boolean {
  const h = biomes.length, w = biomes[0].length;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= h || c < 0 || c >= w) continue;
      if (biomes[r][c] === 'water') return true;
    }
  }
  return false;
}

// Deterministically place a handful of natural wonders. Each kind is attempted
// once; if no suitable, well-spaced site exists it's simply skipped, so sparse
// or watery worlds get fewer wonders rather than badly-placed ones.
export function placeNaturalWonders(
  biomes: Biome[][],
  elevation: number[][],
  seed: string,
): NaturalWonder[] {
  const rand = mulberry32(seed + ':naturalwonders');
  const h = biomes.length, w = biomes[0].length;
  const placed: NaturalWonder[] = [];

  // Volcano first (it's the showpiece and wants the best peak), then the rest.
  const order: NaturalWonderKind[] = [
    'volcano', 'crater_lake', 'monolith', 'rainbow_hills', 'karst_spires', 'salt_flat',
  ];

  for (const kind of order) {
    // Sample candidate tiles, keep the best-scoring that clears spacing/edge.
    let best: { row: number; col: number; score: number } | null = null;
    for (let tries = 0; tries < 1200; tries++) {
      const row = EDGE_MARGIN + Math.floor(rand() * (h - 2 * EDGE_MARGIN));
      const col = EDGE_MARGIN + Math.floor(rand() * (w - 2 * EDGE_MARGIN));
      if (!isLand(biomes[row][col])) continue;
      const coastal = isCoastal(row, col, biomes);
      const score = suitability(kind, row, col, biomes, elevation, coastal);
      if (score < 0) continue;
      // Spacing: keep every wonder clear of the others.
      let tooClose = false;
      for (const p of placed) {
        if (Math.max(Math.abs(p.row - row), Math.abs(p.col - col)) < MIN_SPACING) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      if (!best || score > best.score) best = { row, col, score };
    }
    if (!best) continue;
    const pool = NAME_POOLS[kind];
    const name = pool[Math.floor(rand() * pool.length)];
    placed.push({ row: best.row, col: best.col, kind, name, phase: rand() * Math.PI * 2 });
  }

  return placed;
}
