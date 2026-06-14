// THROWAWAY three.js spike — does NOT touch the Pixi app. It drives the SAME
// pure sim (sim.ts) + terrain (biomes.ts) and renders the world as real 3D on
// an actual globe: instanced tiles on a sphere, real raised mountains, real
// extruded buildings, one directional sun. The point is to judge, side by side
// with the 2D build, whether "curvature for free + real height" is worth a
// renderer rewrite — and whether the painterly look survives in 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateBiomeMap, BIOME_COLORS, type Biome } from './biomes';
import { createSimWorld, seedInitialCivs, step } from './sim';

const W = 96, H = 96;
const SEED = new URLSearchParams(location.search).get('seed') || '1b0ca8';
const DEVELOP_TICKS = Number(new URLSearchParams(location.search).get('ticks') || 6000);

// --- Run the real sim to a developed world ---------------------------------
const { biomes, elevation } = generateBiomeMap(W, H, SEED);
const world = createSimWorld(W, H);
seedInitialCivs(world, biomes, 1);
for (let i = 0; i < DEVELOP_TICKS; i++) step(world, biomes, elevation);

// --- Globe parameters ------------------------------------------------------
const R = 70;                 // sphere radius
const SPAN = 1.5;             // angular width of the continent cap (radians)
const step3 = SPAN / (W - 1); // angular step between tiles
const tileW = step3 * R * 1.06; // tile world size (slight overlap, no gaps)

// (lon,lat) for grid (r,c), centred so the cap faces +Z.
function dirAt(r: number, c: number): THREE.Vector3 {
  const lon = (c / (W - 1) - 0.5) * SPAN;
  const lat = (r / (H - 1) - 0.5) * SPAN;
  return new THREE.Vector3(
    Math.sin(lon) * Math.cos(lat),
    Math.sin(lat),
    Math.cos(lon) * Math.cos(lat),
  ).normalize();
}

// Nearest-city proximity for a built tile → building height (city cores tall).
function buildingHeight(r: number, c: number, civId: number): number {
  const civ = world.civs.get(civId);
  if (!civ || !civ.cities.length) return 1.2;
  let best = Infinity, prom = 0.4;
  for (const city of civ.cities) {
    const d = Math.hypot(city.row - r, city.col - c);
    if (d < best) { best = d; prom = city.prominence; }
  }
  const reach = 7 * Math.max(0.3, prom);
  const t = Math.max(0, 1 - best / reach);
  return 0.5 + t * t * (1.1 + prom * 2.6); // shorter, chunkier — diorama not skyline
}

// --- Scene -----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setClearColor(0x0b0e13);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0e13, 180, 320);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 28, 168);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, R);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

// Lighting: a low sun for long shaded faces (shows off real height) + soft sky.
const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
sun.position.set(-60, 80, 90);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbcd2ec, 0x4a5060, 0.7));

// Ocean planet underneath the continent cap.
const ocean = new THREE.Mesh(
  new THREE.SphereGeometry(R - 0.35, 96, 96),
  new THREE.MeshStandardMaterial({ color: 0x6ea6cf, roughness: 0.85, metalness: 0.0, flatShading: false }),
);
scene.add(ocean);

// --- Collect per-tile instance data ----------------------------------------
const tilePos: THREE.Vector3[] = [];
const tileCol: number[] = [];
const mtn: { r: number; c: number; h: number }[] = [];
const trees: { r: number; c: number }[] = [];
const bld: { r: number; c: number; h: number; color: number }[] = [];

for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const b: Biome = biomes[r][c];
    if (b === 'water') continue; // ocean sphere shows through
    tilePos.push(dirAt(r, c).multiplyScalar(R));
    tileCol.push(BIOME_COLORS[b]);
    if (b === 'rock') {
      const en = Math.min(1, Math.max(0, (elevation[r][c] - 0.55) / 0.45));
      mtn.push({ r, c, h: 3 + en * 9 });
    } else if (b === 'forest') {
      trees.push({ r, c });
    }
    const t = world.tiles[r][c];
    if (t.state === 'built' && t.civId != null && b !== 'rock') {
      const civ = world.civs.get(t.civId);
      if (civ && civ.phase !== 'dead') bld.push({ r, c, h: buildingHeight(r, c, t.civId), color: civ.color });
    }
  }
}

const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 1, 0);
const zAxis = new THREE.Vector3(0, 0, 1);

// Orient a flat tile (PlaneGeometry, normal +Z) tangent to the sphere.
function placeTile(i: number, mesh: THREE.InstancedMesh, pos: THREE.Vector3) {
  const n = pos.clone().normalize();
  dummy.position.copy(pos);
  dummy.quaternion.setFromUnitVectors(zAxis, n);
  dummy.scale.set(tileW, tileW, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

// Orient an upright object (+Y up) radially, base sitting on the surface.
function placeUpright(i: number, mesh: THREE.InstancedMesh, r: number, c: number, h: number, w: number) {
  const n = dirAt(r, c);
  dummy.position.copy(n.clone().multiplyScalar(R + h / 2));
  dummy.quaternion.setFromUnitVectors(up, n);
  dummy.scale.set(w, h, w);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

// --- Tiles (one instanced draw call) ---------------------------------------
const tileMesh = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
  tilePos.length,
);
for (let i = 0; i < tilePos.length; i++) {
  placeTile(i, tileMesh, tilePos[i]);
  tileMesh.setColorAt(i, new THREE.Color(tileCol[i]));
}
tileMesh.instanceMatrix.needsUpdate = true;
if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
scene.add(tileMesh);

// --- Mountains (real cones) ------------------------------------------------
const mtnMesh = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.62, 1, 6),
  new THREE.MeshLambertMaterial({ color: 0xb9b2a6, flatShading: true }),
  Math.max(1, mtn.length),
);
mtn.forEach((m, i) => placeUpright(i, mtnMesh, m.r, m.c, m.h, tileW * 1.7));
mtnMesh.instanceMatrix.needsUpdate = true;
mtnMesh.count = mtn.length;
scene.add(mtnMesh);

// snow caps
const snowMesh = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.24, 0.32, 6),
  new THREE.MeshLambertMaterial({ color: 0xeef3f8, flatShading: true }),
  Math.max(1, mtn.length),
);
let snowN = 0;
mtn.forEach((m) => { if (m.h > 8) { placeUpright(snowN++, snowMesh, m.r, m.c, m.h, tileW * 1.7); } });
snowMesh.count = snowN;
snowMesh.instanceMatrix.needsUpdate = true;
scene.add(snowMesh);

// --- Trees (small cones) ---------------------------------------------------
const treeMesh = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.4, 1, 5),
  new THREE.MeshLambertMaterial({ color: 0x3f6b3a, flatShading: true }),
  Math.max(1, trees.length),
);
trees.forEach((t, i) => placeUpright(i, treeMesh, t.r, t.c, 1.8, tileW * 0.95));
treeMesh.count = trees.length;
treeMesh.instanceMatrix.needsUpdate = true;
scene.add(treeMesh);

// --- Buildings (real boxes, civ-coloured) ----------------------------------
const bldMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({}),
  Math.max(1, bld.length),
);
bld.forEach((b, i) => {
  placeUpright(i, bldMesh, b.r, b.c, b.h, tileW * 0.62);
  bldMesh.setColorAt(i, new THREE.Color(b.color));
});
bldMesh.count = bld.length;
bldMesh.instanceMatrix.needsUpdate = true;
if (bldMesh.instanceColor) bldMesh.instanceColor.needsUpdate = true;
scene.add(bldMesh);

// --- HUD + loop ------------------------------------------------------------
const stat = document.getElementById('stat')!;
let alive = 0; for (const civ of world.civs.values()) if (civ.phase !== 'dead') alive++;
stat.innerHTML = `seed <b>${SEED}</b> · tick ${world.tick} · <b>${alive}</b> civs · `
  + `${tilePos.length} tiles · ${bld.length} buildings · ${mtn.length} peaks · ${trees.length} trees`;

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

(window as any).__three = { scene, camera, renderer, world };
