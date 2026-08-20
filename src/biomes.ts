import { createNoise2D } from 'simplex-noise';

// A tiny deterministic PRNG. Takes a string seed, returns a function that
// produces numbers in [0, 1). Same seed = same sequence.
export function mulberry32(seed: string): () => number {
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

const MOISTURE_SCALE = 0.09; // smaller = larger climate zones

// Land never reaches the grid boundary: elevation eases below sea level over
// the outer EDGE_FALLOFF tiles, so every landmass ends in natural coastline
// (no terrain sliced along the old diamond edge) and boundary water matches
// the deep ocean apron beyond it.
const EDGE_DEPTH = 0.3; // how far below zero the very edge is pushed

// --- World form -------------------------------------------------------------
// Every world used to be generated from one fixed set of constants, so the only
// thing that changed between worlds was where the coastlines fell. These are
// those constants, per world, so a seed can produce a thousand islands, one
// supercontinent, a drowned world or a range-covered one.
//
// Sea level is deliberately NOT here: SEA_LEVEL is a fixed threshold that
// sim.ts compares against in a dozen places (floods, rifts, deltas, land
// bridges). Raising the land instead of lowering the sea gets the same worlds
// without touching any of that.
export interface TerrainProfile {
  continentalScale: number;   // smaller = broader landmasses; larger = scattered islands
  detailScale: number;        // coastline roughness
  continentalWeight: number;  // 0..1; the detail layer takes the remainder
  reliefGain: number;         // amplitude — higher lifts peaks AND deepens ocean
  elevationOffset: number;    // raises or drowns the whole world
  moistureScale: number;      // smaller = larger climate zones
  moistureBias: number;       // wetter (forest) or drier (open ground)
  landReach: number;          // how far land holds out inside the grid; 1 = the rim itself
  edgeSoftness: number;       // width of the coastal fade at landReach
  outerGapTiles: number;      // ocean margin beyond the grid before land resumes
  outerGapSoftness: number;   // how sharply that outer land comes back
}

export const DEFAULT_TERRAIN: TerrainProfile = {
  continentalScale: CONTINENTAL_SCALE,
  detailScale: DETAIL_SCALE,
  continentalWeight: CONTINENTAL_WEIGHT,
  reliefGain: 1,
  elevationOffset: 0,
  moistureScale: MOISTURE_SCALE,
  moistureBias: 0,
  landReach: 0.82,
  edgeSoftness: 0.16,
  outerGapTiles: 16,
  outerGapSoftness: 10,
};

// ONE elevation function, valid at any coordinate — inside the grid or far
// beyond it. This is what keeps the played area from announcing itself: the
// simulated diamond and the scenery around it are literally the same function,
// so there is no boundary to blend and no moat to hide. The land fades out
// where landReach says it does, which for a continental world can be past the
// edge of the frame entirely.
export function makeTerrain(
  seed: string,
  width: number,
  height: number,
  profile: TerrainProfile = DEFAULT_TERRAIN,
) {
  const continentalNoise = createNoise2D(mulberry32(seed + ':continental'));
  const detailNoise = createNoise2D(mulberry32(seed + ':detail'));
  const moistureNoise = createNoise2D(mulberry32(seed + ':moisture'));
  const cx = (width - 1) / 2, cy = (height - 1) / 2;
  const detailWeight = 1 - profile.continentalWeight;

  // The simulated world is an island by design: land fades out before the grid's
  // rim, so a coastline — not a cut edge — is what bounds the playable area, and
  // settlement can never reach the boundary because there is no land there.
  //
  // Beyond the rim the same land RESUMES after an ocean margin. Those outer
  // masses are drawn from the identical noise and profile, so they read as more
  // of the same planet, but a gap of open sea keeps them visibly separate and
  // unreachable. Continuous land across the boundary was the wrong answer: it
  // puts cities against an invisible wall and, for island worlds, it wiped the
  // outer land out entirely.
  const shoreEase = (row: number, col: number): number => {
    const d = Math.max(Math.abs(col - cx) / cx, Math.abs(row - cy) / cy);
    if (d <= 1) {
      const t = (profile.landReach + profile.edgeSoftness - d) / profile.edgeSoftness;
      const f = Math.max(0, Math.min(1, t));
      return f * f * (3 - 2 * f);
    }
    // Outside: open water for outerGapTiles, then the world picks up again.
    const tilesOut = (d - 1) * cx;
    const g = Math.max(0, Math.min(1, (tilesOut - profile.outerGapTiles) / profile.outerGapSoftness));
    return g * g * (3 - 2 * g);
  };
  const elevationAt = (row: number, col: number): number => {
    const continental = continentalNoise(col * profile.continentalScale, row * profile.continentalScale);
    const detail = detailNoise(col * profile.detailScale, row * profile.detailScale);
    const raw = (continental * profile.continentalWeight + detail * detailWeight) * profile.reliefGain
      + profile.elevationOffset;
    const ease = shoreEase(row, col);
    return raw * ease - (1 - ease) * EDGE_DEPTH;
  };
  const moistureAt = (row: number, col: number): number =>
    moistureNoise(col * profile.moistureScale, row * profile.moistureScale) + profile.moistureBias;

  return { elevationAt, moistureAt };
}

// Back-compatible sampler: the renderer's scenery uses this, and it now shares
// the grid's profile AND its falloff, so beyond-grid terrain has the same
// character as the world it surrounds.
export function makeTerrainSampler(
  seed: string,
  width = 96,
  height = 96,
  profile: TerrainProfile = DEFAULT_TERRAIN,
): {
  elevationAt(row: number, col: number): number;
  moistureAt(row: number, col: number): number;
} {
  return makeTerrain(seed, width, height, profile);
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
  // The world's form and temperament. Defaults reproduce the original world.
  profile: TerrainProfile = DEFAULT_TERRAIN,
): { biomes: Biome[][]; elevation: number[][] } {
  const terrain = makeTerrain(seed, width, height, profile);

  const biomes: Biome[][] = [];
  const elevation: number[][] = [];
  for (let row = 0; row < height; row++) {
    biomes[row] = [];
    elevation[row] = [];
    for (let col = 0; col < width; col++) {
      const elev = terrain.elevationAt(row, col);
      biomes[row][col] = classify(elev, terrain.moistureAt(row, col));
      elevation[row][col] = elev;
    }
  }
  return { biomes, elevation };
}

// How much of the world is habitable ground. A form that drowns or freezes the
// map produces a world where no civilisation can ever spawn — seventeen minutes
// of nothing happening — so generation checks this and the caller corrects.
export function landFraction(biomes: Biome[][]): number {
  let land = 0, total = 0;
  for (const row of biomes) for (const b of row) { total++; if (b !== 'water') land++; }
  return total ? land / total : 0;
}