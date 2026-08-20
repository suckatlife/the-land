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
  | 'salt_flat'     // a flat pink/white mineral lake (Lake Retba)
  // Form-native wonders. A world of small islands losing the salt pans and
  // monoliths it could never host should gain something of its own, or watery
  // worlds are just poorer rather than different.
  | 'atoll'         // a reef ring round a shallow lagoon, out in open water
  | 'canyon'        // a winding gorge cut deep into high ground
  | 'dune_sea';     // a great field of wind-driven sand ridges

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
  atoll:         ['The Ring', 'Quietwater', 'The Drowned Crown', 'Lagoon of Glass'],
  canyon:        ['The Long Cut', 'Deepgash', 'The Riven Country', 'Shadowmouth'],
  dune_sea:      ['The Sand Sea', 'The Walking Dunes', 'Windrow', 'The Dry Ocean'],
};

// How far apart wonders must sit (Chebyshev tiles), and how far off the edge.
const MIN_SPACING = 14;
const EDGE_MARGIN = 8;

// How much land each kind needs under it. Suitability only ever judged the one
// tile a wonder sits on, while the renderer draws it across a radius — so on an
// archipelago a salt flat would land on a three-tile island and spill into the
// sea. These are the drawn radii from main.ts, with the share of that footprint
// that has to be dry ground.
const FOOTPRINT: Record<NaturalWonderKind, { radius: number; minLand: number; maxLand?: number }> = {
  volcano:       { radius: 4, minLand: 0.55 },  // a cone can rise straight out of the sea
  crater_lake:   { radius: 6, minLand: 0.70 },
  monolith:      { radius: 6, minLand: 0.80 },  // wants real ground around it
  rainbow_hills: { radius: 5, minLand: 0.80 },
  karst_spires:  { radius: 5, minLand: 0.30 },  // towers stand IN the water by design
  salt_flat:     { radius: 5, minLand: 0.85 },  // a pan is flat inland ground or nothing
  // maxLand: an atoll is a ring in OPEN WATER. Without an upper bound it would
  // drift onto a coast and read as a pond.
  atoll:         { radius: 4, minLand: 0.04, maxLand: 0.40 },
  canyon:        { radius: 6, minLand: 0.88 },  // needs a whole country to cut through
  dune_sea:      { radius: 6, minLand: 0.85 },
};

// Which wonders belong on which kind of world. A world of small islands has no
// business hosting a salt pan or a lone desert monolith; a drowned world is
// even more restricted. Forms not listed here get everything.
const FORM_WONDERS: Record<string, NaturalWonderKind[]> = {
  archipelago: ['volcano', 'karst_spires', 'crater_lake', 'atoll'],
  drowned:     ['volcano', 'karst_spires', 'atoll'],
  continent:   ['volcano', 'crater_lake', 'monolith', 'rainbow_hills', 'karst_spires', 'salt_flat', 'canyon'],
  highlands:   ['volcano', 'crater_lake', 'rainbow_hills', 'karst_spires', 'canyon'],
  barren:      ['volcano', 'monolith', 'rainbow_hills', 'salt_flat', 'canyon', 'dune_sea'],
  verdant:     ['volcano', 'crater_lake', 'monolith', 'rainbow_hills', 'karst_spires', 'canyon'],
};

// Share of a wonder's drawn footprint that is dry land.
function footprintLand(kind: NaturalWonderKind, row: number, col: number, biomes: Biome[][]): number {
  const { radius } = FOOTPRINT[kind];
  const h = biomes.length, w = biomes[0].length;
  let land = 0, total = 0;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr * dr + dc * dc > radius * radius) continue;
      const r = row + dr, c = col + dc;
      total++;
      if (r < 0 || r >= h || c < 0 || c >= w) continue;
      if (isLand(biomes[r][c])) land++;
    }
  }
  return total ? land / total : 0;
}

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
    case 'atoll':
      // A reef ring wants open water around it: a low coastal islet, the lower
      // and more surrounded the better.
      return coastal && e < 0.30 ? 1 - e : -1;
    case 'canyon':
      // Cut into raised, dry country — rock or the arid band, well inland.
      if (coastal) return -1;
      if (b === 'rock') return 1 + e;
      return (b === 'sand' || b === 'fertile') && e > 0.30 ? 0.7 + e : -1;
    case 'dune_sea':
      // Deep sand, away from the sea, the drier the better.
      return b === 'sand' && !coastal ? 1 - e : -1;
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
  form?: string,
): NaturalWonder[] {
  const rand = mulberry32(seed + ':naturalwonders');
  const h = biomes.length, w = biomes[0].length;
  const placed: NaturalWonder[] = [];

  // Volcano first (it's the showpiece and wants the best peak), then the rest.
  const all: NaturalWonderKind[] = [
    'volcano', 'crater_lake', 'monolith', 'rainbow_hills', 'karst_spires', 'salt_flat',
    'atoll', 'canyon', 'dune_sea',
  ];
  const allowed = form && FORM_WONDERS[form] ? FORM_WONDERS[form] : all;
  const order = all.filter((k) => allowed.includes(k));

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
      // Enough ground to actually stand on, not just a suitable centre tile.
      const fp = footprintLand(kind, row, col, biomes);
      if (fp < FOOTPRINT[kind].minLand) continue;
      const maxLand = FOOTPRINT[kind].maxLand;
      if (maxLand != null && fp > maxLand) continue;
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
