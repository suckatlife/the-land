// THROWAWAY three.js spike #2 — the "middle path". Same real sim + same globe,
// but instead of voxel boxes/cones the trees, mountains and buildings are
// PAINTERLY ART drawn to canvases and mapped onto billboarded quads, kept flat
// and low. The question: does the illustrated look survive on a real 3D sphere?
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateBiomeMap, BIOME_COLORS, type Biome } from './biomes';
import { createSimWorld, seedInitialCivs, step } from './sim';

const W = 96, H = 96;
const qp = new URLSearchParams(location.search);
const SEED = qp.get('seed') || '1b0ca8';
const DEVELOP_TICKS = Number(qp.get('ticks') || 6000);

const { biomes, elevation } = generateBiomeMap(W, H, SEED);
const world = createSimWorld(W, H);
seedInitialCivs(world, biomes, 1);
for (let i = 0; i < DEVELOP_TICKS; i++) step(world, biomes, elevation);

// --- Globe geometry --------------------------------------------------------
const R = 70, SPAN = 1.5;
const stepA = SPAN / (W - 1);
const tileW = stepA * R * 1.06;

function dirAt(r: number, c: number): THREE.Vector3 {
  const lon = (c / (W - 1) - 0.5) * SPAN;
  const lat = (r / (H - 1) - 0.5) * SPAN;
  return new THREE.Vector3(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)).normalize();
}
function buildingHeight(r: number, c: number, civId: number): number {
  const civ = world.civs.get(civId);
  if (!civ || !civ.cities.length) return 1.0;
  let best = Infinity, prom = 0.4;
  for (const city of civ.cities) { const d = Math.hypot(city.row - r, city.col - c); if (d < best) { best = d; prom = city.prominence; } }
  const t = Math.max(0, 1 - best / (7 * Math.max(0.3, prom)));
  return 0.8 + t * t * (0.8 + prom * 2.2);
}

// --- Painterly textures drawn to canvases ----------------------------------
function makeTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!; draw(ctx);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TREE_BROAD = makeTex(48, 64, (x) => {
  x.fillStyle = '#5a4632'; x.fillRect(22, 44, 4, 18);
  const blob = (cx: number, cy: number, r: number, col: string) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
  blob(24, 32, 14, '#3c6636'); blob(15, 36, 9.5, '#437138'); blob(33, 35, 9, '#539050'); blob(24, 22, 11.5, '#4a7a44'); blob(28, 30, 7, '#5aa05a');
});
const TREE_CONIF = makeTex(48, 64, (x) => {
  x.fillStyle = '#5a4632'; x.fillRect(22, 50, 4, 12);
  const tri = (cy: number, half: number, h: number, col: string) => { x.fillStyle = col; x.beginPath(); x.moveTo(24, cy - h); x.lineTo(24 - half, cy); x.lineTo(24 + half, cy); x.closePath(); x.fill(); };
  tri(52, 15, 18, '#33572f'); tri(42, 12.5, 16, '#3f6b3a'); tri(31, 10, 14, '#4f8a48');
});
const PEAK = makeTex(72, 72, (x) => {
  x.fillStyle = '#cdc7bc'; x.beginPath(); x.moveTo(36, 6); x.lineTo(8, 64); x.lineTo(36, 64); x.closePath(); x.fill();
  x.fillStyle = '#8b857a'; x.beginPath(); x.moveTo(36, 6); x.lineTo(64, 64); x.lineTo(36, 64); x.closePath(); x.fill();
  x.fillStyle = '#eef3f8'; x.beginPath(); x.moveTo(36, 6); x.lineTo(27, 22); x.lineTo(36, 19); x.lineTo(45, 22); x.closePath(); x.fill();
});
const HOUSE = makeTex(40, 44, (x) => {
  x.fillStyle = '#ffffff'; x.fillRect(9, 22, 22, 18);          // wall (tinted by instance colour)
  x.fillStyle = 'rgba(0,0,0,0.20)'; x.fillRect(20, 22, 11, 18); // shaded wall
  x.fillStyle = '#e8e8e8'; x.beginPath(); x.moveTo(5, 22); x.lineTo(20, 8); x.lineTo(35, 22); x.closePath(); x.fill(); // roof
  x.fillStyle = 'rgba(0,0,0,0.16)'; x.beginPath(); x.moveTo(20, 8); x.lineTo(35, 22); x.lineTo(20, 22); x.closePath(); x.fill();
});

// --- Scene -----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setClearColor(0xe8e2d4); // warm parchment, like the 2D build's sky
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-22, 30, 172);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, R);
controls.enableDamping = true;
controls.autoRotate = true; controls.autoRotateSpeed = 0.35;

// Soft, flat-ish light so the ground reads illustrated, not glossy.
const sun = new THREE.DirectionalLight(0xfff3df, 1.5); sun.position.set(-50, 70, 110); scene.add(sun);
scene.add(new THREE.HemisphereLight(0xf2ecdc, 0x9aa2a8, 1.0));

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(R - 0.3, 96, 96),
  new THREE.MeshStandardMaterial({ color: 0x7fb0d2, roughness: 0.95, metalness: 0 }),
));

// --- Ground tiles (flat colour quads on the sphere) ------------------------
const land: { r: number; c: number; biome: Biome }[] = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { if (biomes[r][c] !== 'water') land.push({ r, c, biome: biomes[r][c] }); }
const groundMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), land.length);
const dummy = new THREE.Object3D(); const zA = new THREE.Vector3(0, 0, 1);
land.forEach((t, i) => {
  const pos = dirAt(t.r, t.c).multiplyScalar(R);
  const n = pos.clone().normalize();
  dummy.position.copy(pos); dummy.quaternion.setFromUnitVectors(zA, n); dummy.scale.set(tileW, tileW, 1); dummy.updateMatrix();
  groundMesh.setMatrixAt(i, dummy.matrix);
  // forest sits on grass; the trees carry the colour (matches the 2D build)
  const col = t.biome === 'forest' ? BIOME_COLORS.grass : BIOME_COLORS[t.biome];
  groundMesh.setColorAt(i, new THREE.Color(col));
});
groundMesh.instanceMatrix.needsUpdate = true; if (groundMesh.instanceColor) groundMesh.instanceColor.needsUpdate = true;
scene.add(groundMesh);

// --- Billboarded painterly sprite layers -----------------------------------
interface Sprite { dir: THREE.Vector3; w: number; h: number }
function makeSpriteLayer(tex: THREE.CanvasTexture, sprites: Sprite[], colors?: number[]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    Math.max(1, sprites.length),
  );
  m.count = sprites.length;
  if (colors) sprites.forEach((_, i) => m.setColorAt(i, new THREE.Color(colors[i])));
  scene.add(m);
  return m;
}
const broad: Sprite[] = [], conif: Sprite[] = [], peaks: Sprite[] = [], houses: Sprite[] = [], houseCol: number[] = [];
function hash(r: number, c: number) { let h = (r * 73856093) ^ (c * 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
for (const t of land) {
  const dir = dirAt(t.r, t.c);
  if (t.biome === 'forest') (hash(t.r, t.c) < 0.5 ? conif : broad).push({ dir, w: tileW * 1.5, h: tileW * 2.0 });
  if (t.biome === 'rock') { const en = Math.min(1, Math.max(0, (elevation[t.r][t.c] - 0.55) / 0.45)); peaks.push({ dir, w: tileW * 2.4, h: tileW * (1.6 + en * 2.4) }); }
  const tile = world.tiles[t.r][t.c];
  if (tile.state === 'built' && tile.civId != null && t.biome !== 'rock') {
    const civ = world.civs.get(tile.civId);
    if (civ && civ.phase !== 'dead') { houses.push({ dir, w: tileW * 1.25, h: tileW * (1.0 + buildingHeight(t.r, t.c, tile.civId) * 0.5) }); houseCol.push(civ.color); }
  }
}
const layers: { mesh: THREE.InstancedMesh; sprites: Sprite[] }[] = [
  { mesh: makeSpriteLayer(TREE_BROAD, broad), sprites: broad },
  { mesh: makeSpriteLayer(TREE_CONIF, conif), sprites: conif },
  { mesh: makeSpriteLayer(PEAK, peaks), sprites: peaks },
  { mesh: makeSpriteLayer(HOUSE, houses, houseCol), sprites: houses },
];
layers.forEach(l => { if (l.mesh.instanceColor) l.mesh.instanceColor.needsUpdate = true; });

// Cylindrical billboarding: each quad stands up along its radial axis and turns
// to face the camera around it (so sprites read right from any orbit angle).
const _r = new THREE.Vector3(), _f = new THREE.Vector3(), _tc = new THREE.Vector3(), _p = new THREE.Vector3(), _b = new THREE.Matrix4();
function billboard(mesh: THREE.InstancedMesh, sprites: Sprite[]) {
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i], n = s.dir;
    _p.copy(n).multiplyScalar(R + s.h * 0.5);
    _tc.copy(camera.position).sub(_p).normalize();
    _r.crossVectors(n, _tc); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize();
    _f.crossVectors(_r, n).normalize();
    _b.makeBasis(_r, n, _f);
    dummy.quaternion.setFromRotationMatrix(_b); dummy.position.copy(_p); dummy.scale.set(s.w, s.h, 1); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

// --- HUD + loop ------------------------------------------------------------
let alive = 0; for (const civ of world.civs.values()) if (civ.phase !== 'dead') alive++;
document.getElementById('stat')!.innerHTML = `seed <b>${SEED}</b> · tick ${world.tick} · <b>${alive}</b> civs · `
  + `${broad.length + conif.length} trees · ${peaks.length} peaks · ${houses.length} buildings`;
addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

renderer.setAnimationLoop(() => {
  controls.update();
  for (const l of layers) billboard(l.mesh, l.sprites);
  renderer.render(scene, camera);
});
(window as any).__three = { scene, camera, renderer, world, controls };
