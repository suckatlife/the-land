import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

// A tiny deterministic PRNG. Takes a string seed, returns a function that
// produces numbers in [0, 1). Same seed = same sequence.
function mulberry32(seed: string): () => number {
  // Hash the seed string to a 32-bit integer.
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Biome = 'water' | 'sand' | 'grass' | 'forest' | 'fertile' | 'rock';

export const BIOME_COLORS: Record<Biome, number> = {
  water:   0x9ec8e6,  // pale washed blue
  sand:    0xeed9a8,  // warm cream
  grass:   0xa8d08d,  // soft pastel green
  forest:  0x6fa86f,  // deeper green
  fertile: 0xc8e0a0,  // brighter yellow-green
  rock:    0xbfb8ae,  // muted stone gray
};

// --- Tunable knobs ---
export const SEA_LEVEL   = 0.05;  // combined elevation threshold for water; raise = more ocean
export const SHORE_LEVEL = 0.18;  // sand band just above sea level
const MOUNTAIN_LEVEL = 0.65; // above this is rock

const CONTINENTAL_SCALE  = 0.025; // frequency of the big land-mass layer; smaller = broader continents
const DETAIL_SCALE       = 0.09;  // frequency of the coastline/island detail layer
const CONTINENTAL_WEIGHT = 0.65;  // how much the continental layer drives elevation
const DETAIL_WEIGHT      = 0.35;  // how much the detail layer contributes (weights should sum to 1)

const MOISTURE_SCALE = 0.09; // smaller = larger climate zones

// Land never reaches the grid boundary: elevation eases below sea level over
// the outer EDGE_FALLOFF tiles, so every landmass ends in natural coastline
// (no terrain sliced along the old diamond edge) and boundary water matches
// the deep ocean apron beyond it.
const EDGE_FALLOFF = 7;
const EDGE_DEPTH = 0.3; // how far below zero the very edge is pushed

// Continuous terrain sampler — the same noise the grid uses, usable beyond
// the grid bounds. Lets the renderer draw scenery terrain to the horizon
// (the sim never sees it).
export function makeTerrainSampler(seed: string): {
  elevationAt(row: number, col: number): number;
  moistureAt(row: number, col: number): number;
} {
  const continentalNoise = createNoise2D(mulberry32(seed + ':continental'));
  const detailNoise = createNoise2D(mulberry32(seed + ':detail'));
  const moistureNoise = createNoise2D(mulberry32(seed + ':moisture'));
  return {
    elevationAt: (row, col) =>
      continentalNoise(col * CONTINENTAL_SCALE, row * CONTINENTAL_SCALE) * CONTINENTAL_WEIGHT +
      detailNoise(col * DETAIL_SCALE, row * DETAIL_SCALE) * DETAIL_WEIGHT,
    moistureAt: (row, col) => moistureNoise(col * MOISTURE_SCALE, row * MOISTURE_SCALE),
  };
}

// Map (elevation, moisture) to a biome.
export function classify(elevation: number, moisture: number): Biome {
  if (elevation < SEA_LEVEL) return 'water';
  if (elevation < SHORE_LEVEL) return 'sand';
  if (elevation > MOUNTAIN_LEVEL) return 'rock';
  if (moisture > 0.3) return 'forest';
  if (moisture > -0.1) return 'grass';
  return 'fertile';
}

// Rivers: greedy descent from high ground to the sea, deterministic per seed.
// Purely visual — tiles remain land and the sim never sees them; main.ts
// draws the paths as polylines.
export function generateRivers(
  elevation: number[][],
  biomes: Biome[][],
  seed: string,
  count = 9,
): Array<Array<{ row: number; col: number }>> {
  const rand = mulberry32(seed + ':rivers');
  const height = elevation.length;
  const width = elevation[0].length;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];
  const used = new Set<number>();
  const rivers: Array<Array<{ row: number; col: number }>> = [];
  let attempts = 0;
  // Many sources pool in basins before reaching the sea (and are rejected),
  // so try generously to still find a good handful of sea-bound rivers.
  while (rivers.length < count && attempts++ < 2500) {
    let r = Math.floor(rand() * height);
    let c = Math.floor(rand() * width);
    if (elevation[r][c] < 0.30) continue; // sources rise in the hills
    const path = [{ row: r, col: c }];
    const seen = new Set([r * width + c]);
    let flowR = 0, flowC = 0; // current flow direction, for momentum
    for (let steps = 0; steps < 300 && biomes[r][c] !== 'water'; steps++) {
      const curE = elevation[r][c];
      let best = -1;
      let bestScore = Infinity;
      for (let d = 0; d < dirs.length; d++) {
        const nr = r + dirs[d][0], nc = c + dirs[d][1];
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        if (seen.has(nr * width + nc)) continue;
        const ne = elevation[nr][nc];
        // Water only flows downhill. A small tolerance lets it cross noisy
        // flats; anything meaningfully uphill is off-limits, so the river
        // STOPS at a basin instead of coiling around it (the spiral bug).
        if (ne > curE + 0.012) continue;
        // Prefer the steepest drop, biased toward continuing the current
        // heading — straight, gently-meandering channels, never tight coils.
        const align = (flowR | flowC) === 0 ? 0
          : (dirs[d][0] * flowR + dirs[d][1] * flowC);
        const score = ne - 0.05 * align + (rand() - 0.5) * 0.008;
        if (score < bestScore) { bestScore = score; best = d; }
      }
      if (best < 0) break; // pooled — no downhill exit (rejected unless at sea)
      flowR = dirs[best][0];
      flowC = dirs[best][1];
      r += flowR;
      c += flowC;
      seen.add(r * width + c);
      path.push({ row: r, col: c });
    }
    const end = path[path.length - 1];
    if (path.length < 10 || biomes[end.row][end.col] !== 'water') continue;
    let overlap = 0;
    for (const p of path) if (used.has(p.row * width + p.col)) overlap++;
    if (overlap > path.length * 0.25) continue;
    for (const p of path) used.add(p.row * width + p.col);
    rivers.push(path);
  }
  return rivers;
}

export function generateBiomeMap(
  width: number,
  height: number,
  seed: string,
): { biomes: Biome[][]; elevation: number[][] } {
  const continentalNoise: NoiseFunction2D = createNoise2D(mulberry32(seed + ':continental'));
  const detailNoise: NoiseFunction2D      = createNoise2D(mulberry32(seed + ':detail'));
  const moistureNoise: NoiseFunction2D    = createNoise2D(mulberry32(seed + ':moisture'));

  const biomes: Biome[][] = [];
  const elevation: number[][] = [];
  for (let row = 0; row < height; row++) {
    biomes[row] = [];
    elevation[row] = [];
    for (let col = 0; col < width; col++) {
      const continental = continentalNoise(col * CONTINENTAL_SCALE, row * CONTINENTAL_SCALE);
      const detail      = detailNoise(col * DETAIL_SCALE, row * DETAIL_SCALE);
      const edgeD = Math.min(row, col, height - 1 - row, width - 1 - col);
      const f = Math.min(1, edgeD / EDGE_FALLOFF);
      const ease = f * f * (3 - 2 * f);
      const elev = (continental * CONTINENTAL_WEIGHT + detail * DETAIL_WEIGHT) * ease
        - (1 - ease) * EDGE_DEPTH;
      const moisture    = moistureNoise(col * MOISTURE_SCALE, row * MOISTURE_SCALE);
      biomes[row][col]    = classify(elev, moisture);
      elevation[row][col] = elev;
    }
  }
  return { biomes, elevation };
}