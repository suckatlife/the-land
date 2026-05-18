import { Application, Container } from 'pixi.js';
import { generateBiomeMap } from './biomes';
import { drawTile, TILE_HEIGHT } from './iso';

const GRID_SIZE = 48;

const app = new Application();

await app.init({
  width: window.innerWidth,
  height: window.innerHeight,
  background: '#e8e2d4',  // soft warm off-white, "paper" feel
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
  antialias: true,
});

document.body.appendChild(app.canvas);

// A container holds the whole world. We move this around to "pan" the view.
const world = new Container();
app.stage.addChild(world);

// Center the world on screen. The middle tile of a 48×48 grid is (24, 24),
// which in iso coords sits at screen (0, 24*TILE_HEIGHT) = (0, 768).
// We offset the world container so that middle lands at viewport center.
world.x = window.innerWidth / 2;
world.y = window.innerHeight / 2 - (GRID_SIZE * TILE_HEIGHT) / 2;

// Generate biomes and draw tiles.
const biomeMap = generateBiomeMap(GRID_SIZE, GRID_SIZE);

// IMPORTANT: draw in (row, col) order so closer tiles cover farther ones.
// In iso, "closer to viewer" = higher row + col. Row-major top-to-bottom
// works because Pixi draws in insertion order.
for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    drawTile(world, col, row, biomeMap[row][col]);
  }
}

// Optional: handle window resize so it stays centered.
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  world.x = window.innerWidth / 2;
  world.y = window.innerHeight / 2 - (GRID_SIZE * TILE_HEIGHT) / 2;;
});