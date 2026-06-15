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

const R = 70, SPAN = 1.5;
const tileW = (SPAN / (W - 1)) * R * 1.06;
function dirAt(r: number, c: number): THREE.Vector3 {
  const lon = (c / (W - 1) - 0.5) * SPAN, lat = (r / (H - 1) - 0.5) * SPAN;
  return new THREE.Vector3(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)).normalize();
}
function hash(r: number, c: number) { let h = (r * 73856093) ^ (c * 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

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
const CAP = new THREE.Vector3(0, 0, R);
camera.position.set(0, 52, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, R);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.enableRotate = false;          // never spin the globe away
controls.screenSpacePanning = true;
controls.minDistance = 26;              // zoom in close
controls.maxDistance = 92;              // zoomed out ≈ the 2D framing (whole continent fills the frame)
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
// Keep the pan target near the cap so you can't wander into empty space.
const PAN_LIMIT = 46;
function clampPan() {
  const off = controls.target.clone().sub(CAP); off.z = 0;
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
function placeModel(prepped: { parts: Part[]; size: THREE.Vector3; baseY: number }, items: { r: number; c: number; s?: number; color?: number }[], targetW: number, label: string) {
  const baseScale = targetW / Math.max(prepped.size.x, prepped.size.z, 0.001);
  const meshes = prepped.parts.map(p => new THREE.InstancedMesh(p.geometry, p.material, Math.max(1, items.length)));
  items.forEach((it, i) => {
    const n = dirAt(it.r, it.c);
    const s = baseScale * (it.s ?? 1);
    const sy = s * (it.sy ?? 1); // vertical stretch (dramatic peaks)
    dummy.position.copy(n).multiplyScalar(R - prepped.baseY * sy); // sit base on the surface
    dummy.quaternion.setFromUnitVectors(yA, n);
    dummy.rotateY(hash(it.r, it.c) * Math.PI * 2); // spin for variety
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

// Collect placement lists from the sim: forests, dramatic peaks, towns
// (clustered at cities, civ-coloured), crop fields, wild herds, coastal boats.
const broad: any[] = [], pine: any[] = [], peaks: any[] = [], houses: any[] = [], crops: any[] = [], herd: any[] = [], boats: any[] = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const b = biomes[r][c];
  if (b === 'water') {
    // a few boats on coastal water
    if (nearLand(r, c) && hash(r, c + 31) < 0.018) boats.push({ r, c, s: 0.9 });
    continue;
  }
  if (b === 'forest') { (hash(r, c) < 0.5 ? pine : broad).push({ r, c, s: 0.85 + hash(r, c + 7) * 0.4 }); continue; }
  if (b === 'rock') { const core = rockCore(r, c); peaks.push({ r, c, s: 1.1 + core * 0.6, sy: 2.0 + core * 2.4 }); continue; }
  const tile = world.tiles[r][c];
  if ((tile.state === 'built' || tile.state === 'cleared') && tile.civId != null) {
    const civ = world.civs.get(tile.civId);
    if (!civ || civ.phase === 'dead') continue;
    const prox = cityProx(r, c, civ);
    if (prox > 0.5) houses.push({ r, c, s: 0.75 + prox * 0.5, color: civ.color });
    else if ((b === 'grass' || b === 'fertile') && farmPatch(r, c)) crops.push({ r, c });
  } else if ((tile.state === 'wild' || tile.state === 'ruin') && (b === 'grass' || b === 'fertile') && hash(r, c + 13) < 0.03) {
    herd.push({ r, c, s: 0.85 }); // animals roaming the open and reclaimed wild
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
  placeModel(prep(treeB), broad, tileW * 1.4, 'broadleaf');
  placeModel(prep(treeP), pine, tileW * 1.3, 'pine');
  placeModel(prep(rock), peaks, tileW * 1.5, 'peak');
  placeModel(prep(house), houses, tileW * 1.1, 'house');
  placeModel(prep(corn), crops, tileW * 1.05, 'crops');
  const cowHerd = herd.filter((_, i) => i % 2 === 0), deerHerd = herd.filter((_, i) => i % 2 === 1);
  placeModel(prep(cow), cowHerd, tileW * 0.9, 'cows');
  placeModel(prep(deer), deerHerd, tileW * 0.9, 'deer');
  placeModel(prep(boat), boats, tileW * 1.1, 'boats');
  let alive = 0; for (const c of world.civs.values()) if (c.phase !== 'dead') alive++;
  document.querySelector('#hud')!.firstChild!.textContent = 'Kenney 3D kit · ';
  stat.innerHTML = `seed <b>${SEED}</b> · tick ${world.tick} · <b>${alive}</b> civs · ${broad.length + pine.length} trees · ${peaks.length} peaks · ${houses.length} houses · ${crops.length} fields · ${herd.length} herds · ${boats.length} boats`;
}).catch(e => { stat.textContent = 'LOAD ERROR: ' + e.message; console.error(e); });

addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
renderer.setAnimationLoop(() => { controls.update(); clampPan(); renderer.render(scene, camera); });
(window as any).__three = { scene, camera, renderer, world, controls };
