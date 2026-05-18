export type Biome = 'grass' | 'forest' | 'water' | 'sand' | 'rock' | 'fertile';

export const BIOME_COLORS: Record<Biome, number> = {
  grass:   0xa8d08d,  // soft pastel green
  forest:  0x6fa86f,  // deeper green, slight blue undertone
  water:   0x9ec8e6,  // pale washed blue
  sand:    0xeed9a8,  // warm cream
  rock:    0xbfb8ae,  // muted stone gray
  fertile: 0xc8e0a0,  // yellow-green, brighter than grass
};

export function generateBiomeMap(width: number, height: number): Biome[][] {
  const biomes: Biome[] = ['grass', 'forest', 'water', 'sand', 'rock', 'fertile'];
  const weights = [0.45, 0.20, 0.15, 0.08, 0.07, 0.05]; // grass-heavy

  const map: Biome[][] = [];
  for (let row = 0; row < height; row++) {
    map[row] = [];
    for (let col = 0; col < width; col++) {
      const r = Math.random();
      let acc = 0;
      for (let i = 0; i < biomes.length; i++) {
        acc += weights[i];
        if (r < acc) {
          map[row][col] = biomes[i];
          break;
        }
      }
    }
  }
  return map;
}