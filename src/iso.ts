
import { Graphics, Container } from 'pixi.js';
import { type Biome, BIOME_COLORS } from './biomes';

export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;

// Convert grid (col, row) to screen (x, y) — the isometric projection.
export function gridToScreen(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2),
  };
}

// Redraw an existing biome Graphics in-place with a new color (for mutation animation).
export function redrawBiomeTile(g: Graphics, color: number) {
  g.clear();
  g.moveTo(0, -TILE_HEIGHT / 2);
  g.lineTo(TILE_WIDTH / 2, 0);
  g.lineTo(0, TILE_HEIGHT / 2);
  g.lineTo(-TILE_WIDTH / 2, 0);
  g.closePath();
  g.fill(color);
  g.stroke({ color: 0x000000, alpha: 0.08, width: 1 });
}

// Draw one diamond-shaped tile at a given grid position into a container.
// Returns the Graphics so the caller can track it for later mutation.
export function drawTile(container: Container, col: number, row: number, biome: Biome): Graphics {
  const { x, y } = gridToScreen(col, row);
  const g = new Graphics();
  g.x = x;
  g.y = y;
  redrawBiomeTile(g, BIOME_COLORS[biome]);
  container.addChild(g);
  return g;
}

export function drawStateOverlay(
  container: Container,
  col: number,
  row: number,
  color: number,
  alpha: number
): Graphics {
  const { x, y } = gridToScreen(col, row);

  const tile = new Graphics();
  tile.moveTo(0, -TILE_HEIGHT / 2);
  tile.lineTo(TILE_WIDTH / 2, 0);
  tile.lineTo(0, TILE_HEIGHT / 2);
  tile.lineTo(-TILE_WIDTH / 2, 0);
  tile.closePath();
  tile.fill({ color, alpha });

  tile.x = x;
  tile.y = y;
  container.addChild(tile);
  return tile;
}

// Linearly interpolate between two hex colors. t in 0..1.
export function lerpColor(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}

export function redrawOverlay(
  g: Graphics,
  color: number,
  alpha: number,
  borderColor: number,
  borderAlpha: number,
  borderWidth: number,
) {
  g.clear();
  g.moveTo(0, -TILE_HEIGHT / 2);
  g.lineTo(TILE_WIDTH / 2, 0);
  g.lineTo(0, TILE_HEIGHT / 2);
  g.lineTo(-TILE_WIDTH / 2, 0);
  g.closePath();
  g.fill({ color, alpha });
  if (borderAlpha > 0.01 && borderWidth > 0) {
    g.stroke({ color: borderColor, alpha: borderAlpha, width: borderWidth });
  }
}

export function drawStateOverlayPersistent(
  container: Container,
  col: number,
  row: number
): Graphics {
  const { x, y } = gridToScreen(col, row);
  const g = new Graphics();
  g.x = x;
  g.y = y;
  container.addChild(g);
  return g;
}

// RGB packed color → HSL components (h, s, l each in 0..1).
export function rgbToHsl(color: number): [number, number, number] {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

// HSL (0..1 each) → RGB packed color.
export function hslToRgb(h: number, s: number, l: number): number {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

