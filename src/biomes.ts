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

// Tunable parameters. Mess with these to change the world's character.
const SEA_LEVEL = -0.5;       // -1..1, lower = more land
const SHORE_LEVEL = -0.3;      // sand band just above sea level
const MOUNTAIN_LEVEL = 0.55;  // above this is rock

const ELEVATION_SCALE = 0.07; // smaller = larger landmasses
const MOISTURE_SCALE = 0.09;  // smaller = larger climate zones
const ISLAND_FALLOFF = 0.6;   // 0 = no island shaping, 1 = strong falloff

// Map (elevation, moisture) to a biome.
function classify(elevation: number, moisture: number): Biome {
  if (elevation < SEA_LEVEL) return 'water';
  if (elevation < SHORE_LEVEL) return 'sand';
  if (elevation > MOUNTAIN_LEVEL) return 'rock';
  // Mid elevations: moisture decides.
  if (moisture > 0.3) return 'forest';
  if (moisture > -0.1) return 'grass';
  return 'fertile';  // dry but not desert — open meadowland
}

export function generateBiomeMap(width: number, height: number, seed: string): Biome[][] {
  // Two PRNGs from the same seed, with a salt so elevation and moisture
  // don't accidentally correlate.
  const elevationNoise: NoiseFunction2D = createNoise2D(mulberry32(seed + ':elevation'));
  const moistureNoise: NoiseFunction2D = createNoise2D(mulberry32(seed + ':moisture'));

  const map: Biome[][] = [];
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let row = 0; row < height; row++) {
    map[row] = [];
    for (let col = 0; col < width; col++) {
      let elevation = elevationNoise(col * ELEVATION_SCALE, row * ELEVATION_SCALE);
      const moisture = moistureNoise(col * MOISTURE_SCALE, row * MOISTURE_SCALE);

      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
      elevation -= dist * ISLAND_FALLOFF;

      map[row][col] = classify(elevation, moisture);
    }
  }
  return map;
}