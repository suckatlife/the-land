
import { Graphics, Container } from 'pixi.js';
import { type Biome, BIOME_COLORS } from './biomes';

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// Convert grid (col, row) to screen (x, y) — the isometric projection.
export function gridToScreen(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2),
  };
}

// Draw one diamond-shaped tile at a given grid position into a container.
export function drawTile(container: Container, col: number, row: number, biome: Biome) {
  const { x, y } = gridToScreen(col, row);
  const color = BIOME_COLORS[biome];

  const tile = new Graphics();
  // Diamond shape: top, right, bottom, left
  tile.moveTo(0, -TILE_HEIGHT / 2);
  tile.lineTo(TILE_WIDTH / 2, 0);
  tile.lineTo(0, TILE_HEIGHT / 2);
  tile.lineTo(-TILE_WIDTH / 2, 0);
  tile.closePath();
  tile.fill(color);

  // Subtle outline for tile definition. Comment out if you want seamless.
  tile.stroke({ color: 0x000000, alpha: 0.08, width: 1 });

  tile.x = x;
  tile.y = y;
  container.addChild(tile);
}