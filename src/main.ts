import { Application, Container, type Graphics } from 'pixi.js';
import { generateBiomeMap } from './biomes';
import { drawTile, drawStateOverlay, TILE_HEIGHT } from './iso';
import { createSimWorld, step, tileOverlayColor, seedInitialCivs, type SimWorld } from './sim';

const GRID_SIZE = 48;
const TICKS_PER_SECOND = 30;

const app = new Application();
await app.init({
  width: window.innerWidth,
  height: window.innerHeight,
  background: '#e8e2d4',
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
  antialias: true,
});
document.body.appendChild(app.canvas);

const biomeLayer = new Container();
const simLayer = new Container();
const world = new Container();
world.addChild(biomeLayer);
world.addChild(simLayer);
app.stage.addChild(world);

function centerWorld() {
  world.x = window.innerWidth / 2;
  world.y = window.innerHeight / 2 - (GRID_SIZE * TILE_HEIGHT) / 2;
}
centerWorld();

// --- Seed management ---
function getInitialSeed(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('seed');
  if (fromUrl) return fromUrl;
  const fromStorage = localStorage.getItem('theLand:seed');
  if (fromStorage) return fromStorage;
  return randomSeed();
}
function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}
function saveSeed(seed: string) {
  localStorage.setItem('theLand:seed', seed);
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState({}, '', url);
}

let currentSeed = getInitialSeed();
saveSeed(currentSeed);

// --- World state ---
let biomeMap = generateBiomeMap(GRID_SIZE, GRID_SIZE, currentSeed);
let simWorld: SimWorld = createSimWorld(GRID_SIZE, GRID_SIZE);
seedInitialCivs(simWorld, biomeMap, 1);
let overlaySprites: (Graphics | null)[][] = Array.from({ length: GRID_SIZE }, () =>
  Array(GRID_SIZE).fill(null)
);
let running = true;

function drawBiomes() {
  biomeLayer.removeChildren();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      drawTile(biomeLayer, col, row, biomeMap[row][col]);
    }
  }
}

function clearSimLayer() {
  simLayer.removeChildren();
  overlaySprites = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function refreshTileOverlay(row: number, col: number) {
  const old = overlaySprites[row][col];
  if (old) {
    simLayer.removeChild(old);
    old.destroy();
    overlaySprites[row][col] = null;
  }
  const tile = simWorld.tiles[row][col];
  const colorInfo = tileOverlayColor(tile, simWorld);
  if (!colorInfo) return;
  overlaySprites[row][col] = drawStateOverlay(
    simLayer,
    col,
    row,
    colorInfo.color,
    colorInfo.alpha
  );
}

function resetWorld(newSeed: string) {
  currentSeed = newSeed;
  saveSeed(newSeed);
  biomeMap = generateBiomeMap(GRID_SIZE, GRID_SIZE, newSeed);
  simWorld = createSimWorld(GRID_SIZE, GRID_SIZE);
  seedInitialCivs(simWorld, biomeMap, 1);
  clearSimLayer();
  drawBiomes();
  // Render the seeded civs' initial tiles
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (simWorld.tiles[row][col].state !== 'wild') {
        refreshTileOverlay(row, col);
      }
    }
  }
  updateHud();
}

function resetSimOnly() {
  simWorld = createSimWorld(GRID_SIZE, GRID_SIZE);
  seedInitialCivs(simWorld, biomeMap, 1);
  clearSimLayer();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (simWorld.tiles[row][col].state !== 'wild') {
        refreshTileOverlay(row, col);
      }
    }
  }
}

drawBiomes();
// Render the initial seeded civs
for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    if (simWorld.tiles[row][col].state !== 'wild') {
      refreshTileOverlay(row, col);
    }
  }
}

// --- Tick loop ---
let accumulator = 0;
const tickInterval = 1 / TICKS_PER_SECOND;

app.ticker.add((ticker) => {
  if (!running) return;
  accumulator += ticker.deltaMS / 1000;
  while (accumulator >= tickInterval) {
    accumulator -= tickInterval;
    const changes = step(simWorld, biomeMap);
    for (const { row, col } of changes) {
      refreshTileOverlay(row, col);
    }
    // When a civ transitions to 'dead', its still-built tiles change 
    // color (toward gray). The per-tile `changes` list won't include 
    // them because their *state* didn't change. So once a tick we 
    // refresh all owned tiles of any dead civ. Cheap because there 
    // are at most a handful of dead civs.
    for (const civ of simWorld.civs.values()) {
      if (civ.phase === 'dead' && civ.phaseAge === 1) {
        // Just died this tick — refresh all its tiles.
        for (let row = 0; row < GRID_SIZE; row++) {
          for (let col = 0; col < GRID_SIZE; col++) {
            if (simWorld.tiles[row][col].civId === civ.id) {
              refreshTileOverlay(row, col);
            }
          }
        }
      }
    }
  }
  updateHud();
});

// --- HUD ---
const hud = document.createElement('div');
hud.style.cssText = `
  position: fixed; top: 12px; left: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px;
  background: rgba(255,255,255,0.78); padding: 6px 10px; border-radius: 4px;
  display: flex; gap: 10px; align-items: center; user-select: none;
`;
hud.innerHTML = `
  <span>seed: <strong id="seed-label"></strong></span>
  <button id="reroll" style="cursor:pointer">reroll</button>
  <button id="reset-sim" style="cursor:pointer">reset sim</button>
  <button id="pause" style="cursor:pointer">pause</button>
  <span>tick: <strong id="tick-label">0</strong></span>
  <span>civs: <strong id="civ-label">0</strong></span>
`;
document.body.appendChild(hud);

const seedLabel = document.getElementById('seed-label')!;
const tickLabel = document.getElementById('tick-label')!;
const civLabel = document.getElementById('civ-label')!;

function updateHud() {
  seedLabel.textContent = currentSeed;
  tickLabel.textContent = String(simWorld.tick);
  let alive = 0;
  let total = 0;
  for (const civ of simWorld.civs.values()) {
    total++;
    if (civ.phase !== 'dead') alive++;
  }
  civLabel.textContent = `${alive} alive / ${total} total`;
}
updateHud();

document.getElementById('reroll')!.addEventListener('click', () => {
  resetWorld(randomSeed());
});
document.getElementById('reset-sim')!.addEventListener('click', () => {
  resetSimOnly();
});
const pauseBtn = document.getElementById('pause')!;
pauseBtn.addEventListener('click', () => {
  running = !running;
  pauseBtn.textContent = running ? 'pause' : 'resume';
});

// --- Resize ---
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  centerWorld();
});