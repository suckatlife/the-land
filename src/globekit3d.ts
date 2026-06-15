// THROWAWAY spike #3 — real Kenney CC0 models on the globe. Same sim, same
// sphere; trees/peaks/houses are now actual low-poly glTF geometry, instanced
// and placed by the sim. Real models = correct occlusion from any angle, no
// billboard hack. Goal: see the actual kit look and prove the load+instance
// pipeline end to end.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { generateBiomeMap, BIOME_COLORS, type Biome } from './biomes';
import { createSimWorld, seedInitialCivs, step } from './sim';

const W = 96, H = 96;
const qp = new URLSearchParams(location.search);
const SEED = qp.get('seed') || '1b0ca8';
const TICKS = Number(qp.get('ticks') || 6000);

const { biomes, elevation } = generateBiomeMap(W, H, SEED);
const world = createSimWorld(W, H);
seedInitialCivs(world, biomes, 1);
for (let i = 0; i < TICKS; i++) step(world, biomes, elevation);

// Big sphere, small cap → the same tile size sits on a gently-curved map (a
// shallow limb), much closer to the 2D build than a tight little planet.
const R = 150, SPAN = 0.72;
const tileW = (SPAN / (W - 1)) * R * 1.06;
function dirAt(r: number, c: number): THREE.Vector3 {
  // lat flips with row so the map's north (row 0) is up, not upside down.
  const lon = (c / (W - 1) - 0.5) * SPAN, lat = (0.5 - r / (H - 1)) * SPAN;
  return new THREE.Vector3(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)).normalize();
}
function hash(r: number, c: number) { let h = (Math.imul(r | 0, 73856093) ^ Math.imul(c | 0, 19349663)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// Centre the view on the land mass and bound panning to it (so you can't drift
// out over the empty ocean / round the back of the globe).
let _sr = 0, _sc = 0, _nl = 0;
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (biomes[r][c] !== 'water') { _sr += r; _sc += c; _nl++; }
const FOCUS_DIR = dirAt(_sr / _nl, _sc / _nl);
const FOCUS = FOCUS_DIR.clone().multiplyScalar(R);
let LAND_EXT = 0;
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (biomes[r][c] !== 'water') { const a = Math.acos(Math.min(1, dirAt(r, c).dot(FOCUS_DIR))); if (a * R > LAND_EXT) LAND_EXT = a * R; }

// --- Renderer / scene ------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setClearColor(0xcfe0ec);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe0ec);
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 1000);
// Fixed oblique framing of the continent cap, like the 2D view: the globe limb
// arcs across the top, the world fills the frame edge to edge. No free orbit —
// pan + zoom only — so all the life stays on the visible front of the planet.
// Look up at the cap from in front and below, so the globe's horizon arcs
// across the TOP of the frame (land receding up to it) — the 2D orientation —
// instead of curving away at the bottom (which read as upside down).
const camOff = new THREE.Vector3(0, -50, 86);
camera.position.copy(FOCUS).add(camOff);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(FOCUS);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.enableRotate = false;          // never spin the globe away
controls.screenSpacePanning = true;
controls.minDistance = 34;              // zoom in close
controls.maxDistance = camOff.length(); // zoomed out ≈ the 2D framing
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
// Bound panning to the inhabited land, not the open ocean / far side.
const PAN_LIMIT = LAND_EXT * 0.62;
function clampPan() {
  const off = controls.target.clone().sub(FOCUS); off.z = 0;
  if (off.length() > PAN_LIMIT) { const corr = off.clone().setLength(PAN_LIMIT).sub(off); controls.target.add(corr); camera.position.add(corr); }
}
const sun = new THREE.DirectionalLight(0xfff4e2, 2.0); sun.position.set(-50, 80, 90); scene.add(sun);
scene.add(new THREE.HemisphereLight(0xeef3fb, 0x6a7280, 0.95));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(R - 0.25, 96, 96), new THREE.MeshStandardMaterial({ color: 0x6ea6cf, roughness: 0.95, metalness: 0 })));

// --- Ground tiles (flat colour quads) --------------------------------------
const land: { r: number; c: number; biome: Biome }[] = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (biomes[r][c] !== 'water') land.push({ r, c, biome: biomes[r][c] });
const ground = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), land.length);
{ const d = new THREE.Object3D(), zA = new THREE.Vector3(0, 0, 1);
  land.forEach((t, i) => { const p = dirAt(t.r, t.c).multiplyScalar(R); const n = p.clone().normalize();
    d.position.copy(p); d.quaternion.setFromUnitVectors(zA, n); d.scale.set(tileW, tileW, 1); d.updateMatrix(); ground.setMatrixAt(i, d.matrix);
    ground.setColorAt(i, new THREE.Color(t.biome === 'forest' ? BIOME_COLORS.grass : BIOME_COLORS[t.biome])); });
  ground.instanceMatrix.needsUpdate = true; if (ground.instanceColor) ground.instanceColor.needsUpdate = true; scene.add(ground); }

// --- Model loading + instancing --------------------------------------------
const loader = new GLTFLoader();
const NAT = (n: string) => encodeURI(`/models/nature/Models/GLTF format/${n}.glb`);
const BLD = (n: string) => encodeURI(`/models/buildings/Models/GLB format/${n}.glb`);
const ANI = (n: string) => encodeURI(`/models/animals/Models/GLB format/${n}.glb`);
const WAT = (n: string) => encodeURI(`/models/watercraft/Models/GLB format/${n}.glb`);

interface Part { geometry: THREE.BufferGeometry; material: THREE.Material }
// Bake each mesh's local transform into its geometry so the parts can be
// instanced together; also return the model's footprint + base offset.
function prep(gltf: { scene: THREE.Object3D }): { parts: Part[]; size: THREE.Vector3; baseY: number } {
  const root = gltf.scene; root.updateWorldMatrix(true, true);
  const parts: Part[] = [];
  root.traverse((o: any) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push({ geometry: g, material: o.material }); } });
  const box = new THREE.Box3();
  parts.forEach(p => { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!); });
  const size = new THREE.Vector3(); box.getSize(size);
  return { parts, size, baseY: box.min.y };
}

const dummy = new THREE.Object3D();
const yA = new THREE.Vector3(0, 1, 0);
// Place an instanced model: targetW = desired footprint in world units.
function placeModel(prepped: { parts: Part[]; size: THREE.Vector3; baseY: number }, items: { r: number; c: number; s?: number; color?: number; aligned?: boolean }[], targetW: number, label: string) {
  const baseScale = targetW / Math.max(prepped.size.x, prepped.size.z, 0.001);
  const meshes = prepped.parts.map(p => new THREE.InstancedMesh(p.geometry, p.material, Math.max(1, items.length)));
  items.forEach((it, i) => {
    const n = dirAt(it.r, it.c);
    const s = baseScale * (it.s ?? 1);
    const sy = s * (it.sy ?? 1);
    // Stand perpendicular to the surface — pointing out from the planet's
    // centre — so everything follows the gentle curve of the globe.
    dummy.position.copy(n).multiplyScalar(R - prepped.baseY * sy);
    dummy.quaternion.setFromUnitVectors(yA, n);
    // Nature gets a random spin for variety; buildings/crops stay aligned so
    // towns and fields read as orderly rows, not a jumble.
    if (!it.aligned) dummy.rotateY(hash((it.r * 9) | 0, (it.c * 9) | 0) * Math.PI * 2);
    dummy.scale.set(s, sy, s);
    dummy.updateMatrix();
    meshes.forEach(m => m.setMatrixAt(i, dummy.matrix));
  });
  meshes.forEach((m, k) => {
    m.count = items.length; m.instanceMatrix.needsUpdate = true;
    if (items.some(it => it.color != null) && k === 0) { /* tint first part only */ items.forEach((it, i) => it.color != null && m.setColorAt(i, new THREE.Color(it.color))); if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    scene.add(m);
  });
  console.log(`[${label}] parts=${prepped.parts.length} size=${prepped.size.x.toFixed(2)}x${prepped.size.y.toFixed(2)}x${prepped.size.z.toFixed(2)} baseY=${prepped.baseY.toFixed(2)} scale=${baseScale.toFixed(3)} count=${items.length}`);
}

// Proximity to a civ's nearest city (1 at a city centre → 0 at the frontier).
function cityProx(r: number, c: number, civ: any): number {
  let best = Infinity, prom = 0.4;
  for (const city of civ.cities) { const d = Math.hypot(city.row - r, city.col - c); if (d < best) { best = d; prom = city.prominence; } }
  return Math.max(0, 1 - best / (7 * Math.max(0.3, prom)));
}
// Patchy field mask (smooth blobs), as in the 2D build.
function farmPatch(r: number, c: number): boolean {
  return (Math.sin(r * 0.45 + 1.7) + Math.sin(c * 0.5 - 0.6) + Math.sin((r + c) * 0.28) + Math.sin((r - c) * 0.33)) > 0.4;
}

function isBiome(r: number, c: number, b: Biome) { return r >= 0 && r < H && c >= 0 && c < W && biomes[r][c] === b; }
function rockCore(r: number, c: number) { let n = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isBiome(r + dr, c + dc, 'rock')) n++; return n / 9; }
function nearLand(r: number, c: number) { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (r + dr >= 0 && r + dr < H && c + dc >= 0 && c + dc < W && biomes[r + dr][c + dc] !== 'water') return true; return false; }

// Scatter n sub-tile positions within tile (r,c) — so each tile holds several
// small models (a stand of trees, a cluster of cottages) at the 2D build's
// scale, instead of one oversized model per tile.
function scatter(r: number, c: number, n: number, salt: number, spread: number) {
  const out: { r: number; c: number }[] = [];
  for (let i = 0; i < n; i++) {
    const hx = hash(r * 131 + i * 7 + salt, c * 57 + i * 13 + salt);
    const hy = hash(c * 131 + i * 9 + salt + 99, r * 57 + i * 11 + salt + 99);
    out.push({ r: r + (hx - 0.5) * spread, c: c + (hy - 0.5) * spread });
  }
  return out;
}
// Orderly sub-grid within a tile — for buildings/crops that should line up in
// neat rows rather than scatter randomly.
function grid(r: number, c: number, n: number, spread: number) {
  const g = Math.ceil(Math.sqrt(n));
  const out: { r: number; c: number }[] = [];
  for (let i = 0; i < n; i++) {
    const gx = i % g, gy = (i / g) | 0;
    out.push({ r: r + ((gx + 0.5) / g - 0.5) * spread, c: c + ((gy + 0.5) / g - 0.5) * spread });
  }
  return out;
}

// Collect placement lists from the sim at 2D-matched scale: small trees a few
// per forest tile, modest tile-sized peaks, dense clusters of tiny civ-coloured
// cottages in towns, small crops, herds, coastal boats.
const broad: any[] = [], pine: any[] = [], peaks: any[] = [], houses: any[] = [], crops: any[] = [], herd: any[] = [], boats: any[] = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const b = biomes[r][c];
  if (b === 'water') { if (nearLand(r, c) && hash(r, c + 31) < 0.02) boats.push({ r, c }); continue; }
  if (b === 'forest') {
    for (const p of scatter(r, c, 3 + Math.floor(hash(r, c) * 3), 1, 0.8))
      (hash((p.r * 4) | 0, (p.c * 4) | 0) < 0.5 ? pine : broad).push({ r: p.r, c: p.c, s: 0.8 + hash((p.c * 5) | 0, (p.r * 5) | 0) * 0.5 });
    continue;
  }
  if (b === 'rock') {
    const core = rockCore(r, c);
    for (const p of scatter(r, c, core > 0.45 ? 2 : 1, 2, 0.5)) peaks.push({ r: p.r, c: p.c, s: 0.8 + core * 0.5, sy: 1.0 + core * 0.7 });
    continue;
  }
  const tile = world.tiles[r][c];
  if ((tile.state === 'built' || tile.state === 'cleared') && tile.civId != null) {
    const civ = world.civs.get(tile.civId);
    if (!civ || civ.phase === 'dead') continue;
    const prox = cityProx(r, c, civ);
    if (prox > 0.4) {
      // Neat rows of cottages, aligned — an orderly town, not a jumble.
      for (const p of grid(r, c, 1 + Math.round(prox * 5), 0.82)) houses.push({ r: p.r, c: p.c, s: 0.95, color: civ.color, aligned: true });
    } else if ((b === 'grass' || b === 'fertile') && farmPatch(r, c)) {
      for (const p of grid(r, c, 4, 0.74)) crops.push({ r: p.r, c: p.c, aligned: true });
    }
  } else if ((tile.state === 'wild' || tile.state === 'ruin') && (b === 'grass' || b === 'fertile') && hash(r, c + 13) < 0.04) {
    for (const p of scatter(r, c, 2 + Math.floor(hash(r, c) * 3), 5, 0.65)) herd.push({ r: p.r, c: p.c, s: 0.8 + hash((p.r * 8) | 0, (p.c * 8) | 0) * 0.3 });
  }
}

const stat = document.getElementById('stat')!;
Promise.all([
  loader.loadAsync(NAT('tree_default')),
  loader.loadAsync(NAT('tree_pineDefaultA')),
  loader.loadAsync(NAT('rock_tallB')),
  loader.loadAsync(BLD('building-sample-house-a')),
  loader.loadAsync(NAT('crops_cornStageC')),
  loader.loadAsync(ANI('animal-cow')),
  loader.loadAsync(ANI('animal-deer')),
  loader.loadAsync(WAT('boat-sail-a')),
]).then(([treeB, treeP, rock, house, corn, cow, deer, boat]) => {
  placeModel(prep(treeB), broad, tileW * 0.42, 'broadleaf');
  placeModel(prep(treeP), pine, tileW * 0.40, 'pine');
  placeModel(prep(rock), peaks, tileW * 0.78, 'peak');
  placeModel(prep(house), houses, tileW * 0.34, 'house');
  placeModel(prep(corn), crops, tileW * 0.42, 'crops');
  const cowHerd = herd.filter((_, i) => i % 2 === 0), deerHerd = herd.filter((_, i) => i % 2 === 1);
  placeModel(prep(cow), cowHerd, tileW * 0.42, 'cows');
  placeModel(prep(deer), deerHerd, tileW * 0.42, 'deer');
  placeModel(prep(boat), boats, tileW * 0.95, 'boats');
  let alive = 0; for (const c of world.civs.values()) if (c.phase !== 'dead') alive++;
  document.querySelector('#hud')!.firstChild!.textContent = 'Kenney 3D kit · ';
  stat.innerHTML = `seed <b>${SEED}</b> · tick ${world.tick} · <b>${alive}</b> civs · ${broad.length + pine.length} trees · ${peaks.length} peaks · ${houses.length} houses · ${crops.length} fields · ${herd.length} herds · ${boats.length} boats`;
}).catch(e => { stat.textContent = 'LOAD ERROR: ' + e.message; console.error(e); });

addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
renderer.setAnimationLoop(() => { controls.update(); clampPan(); renderer.render(scene, camera); });
(window as any).__three = { scene, camera, renderer, world, controls };
