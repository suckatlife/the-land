import { Application, Container } from 'pixi.js';
import { generateBiomeMap } from './biomes';
import { drawTile, TILE_HEIGHT } from './iso';

const GRID_SIZE = 48;

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

const world = new Container();
app.stage.addChild(world);

function centerWorld() {
  world.x = window.innerWidth / 2;
  world.y = window.innerHeight / 2 - (GRID_SIZE * TILE_HEIGHT) / 2;
}
centerWorld();

// --- Seed management ---

// Read seed from URL, then localStorage, then generate a random one.
function getInitialSeed(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('seed');
  if (fromUrl) return fromUrl;
  const fromStorage = localStorage.getItem('theLand:seed');
  if (fromStorage) return fromStorage;
  return randomSeed();
}

function randomSeed(): string {
  // 6 hex chars is plenty for dev — readable, short.
  return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

function saveSeed(seed: string) {
  localStorage.setItem('theLand:seed', seed);
  // Also reflect in URL so you can copy-paste / bookmark.
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState({}, '', url);
}

let currentSeed = getInitialSeed();
saveSeed(currentSeed);

// --- Render the world ---

function renderWorld(seed: string) {
  world.removeChildren();
  const biomeMap = generateBiomeMap(GRID_SIZE, GRID_SIZE, seed);
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      drawTile(world, col, row, biomeMap[row][col]);
    }
  }
}

renderWorld(currentSeed);

// --- HUD: seed display + reroll button ---

const hud = document.createElement('div');
hud.style.cssText = `
  position: fixed;
  top: 12px;
  left: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  background: rgba(255,255,255,0.7);
  padding: 6px 10px;
  border-radius: 4px;
  display: flex;
  gap: 8px;
  align-items: center;
  user-select: none;
`;
hud.innerHTML = `
  <span>seed: <strong id="seed-label"></strong></span>
  <button id="reroll" style="cursor:pointer">reroll</button>
  <button id="copy" style="cursor:pointer">copy</button>
`;
document.body.appendChild(hud);

const seedLabel = document.getElementById('seed-label')!;
const rerollBtn = document.getElementById('reroll')!;
const copyBtn = document.getElementById('copy')!;

function updateHud() {
  seedLabel.textContent = currentSeed;
}
updateHud();

rerollBtn.addEventListener('click', () => {
  currentSeed = randomSeed();
  saveSeed(currentSeed);
  renderWorld(currentSeed);
  updateHud();
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(currentSeed);
  copyBtn.textContent = 'copied!';
  setTimeout(() => (copyBtn.textContent = 'copy'), 1000);
});

// --- Resize ---
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  centerWorld();
});