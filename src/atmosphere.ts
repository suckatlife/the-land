// src/atmosphere.ts — sky, day/night light, and persistent catastrophe scars.
// Render-side module (Pixi allowed here; sim.ts stays Pixi-free).
//
// EVERYTHING TUNEABLE LIVES IN `ATMOS` BELOW. The intent is that taste can be
// adjusted entirely by editing this block: palette keyframes, cycle length,
// glaze ceilings, scar lifetimes and colors. The systems read these live.

import { Container, Graphics, Sprite, Texture, BlurFilter, type MeshPlane } from 'pixi.js';
import { gridToScreen, lerpColor } from './iso';
import type { CatastropheType, Era } from './sim';

// --- The taste block ------------------------------------------------------

export const ATMOS = {
  // Composition: how the world sits in the sky. worldScale shrinks the iso
  // diamond so air exists around it; horizonFrac is where the diamond's top
  // vertex sits (fraction of screen height). worldScale 1 + horizonFrac ~0
  // restores the old full-bleed crop (and hides the sky almost entirely).
  composition: {
    worldScale: 0.68,
    horizonFrac: 0.16,
  },

  day: {
    // One full day-night cycle, in seconds of viewing time. The clock only
    // advances while the sim runs (pause freezes the light).
    cycleSeconds: 360,
    // Where in the cycle a fresh page load starts (0.18 ≈ mid-morning).
    startT: 0.18,
    // Keyframes around the cycle (t in [0,1), wraps). skyTop/skyHorizon are
    // the sky gradient stops; glaze is a multiply wash over the whole scene
    // (sky + land together — one light). glazeAlpha 0 = neutral daylight.
    // Add/move/remove keyframes freely; they are interpolated in t-order
    // with smoothstep easing between neighbours.
    keyframes: [
      { t: 0.00, skyTop: 0xa9b7c3, skyHorizon: 0xe2c2a3, glaze: 0xe6cfae, glazeAlpha: 0.15 }, // dawn
      { t: 0.10, skyTop: 0xb8c9d2, skyHorizon: 0xe8ddc6, glaze: 0xf2e6cd, glazeAlpha: 0.06 }, // morning
      { t: 0.25, skyTop: 0xbfcfd8, skyHorizon: 0xe9e3d0, glaze: 0xffffff, glazeAlpha: 0.00 }, // noon
      { t: 0.42, skyTop: 0xb4bfc6, skyHorizon: 0xe5d3ae, glaze: 0xf0dcb4, glazeAlpha: 0.08 }, // late afternoon
      { t: 0.52, skyTop: 0x9d93a7, skyHorizon: 0xd8ae85, glaze: 0xd2ab7e, glazeAlpha: 0.28 }, // dusk
      { t: 0.66, skyTop: 0x39455c, skyHorizon: 0x6a6577, glaze: 0x8195b8, glazeAlpha: 0.42 }, // nightfall
      { t: 0.80, skyTop: 0x222c3d, skyHorizon: 0x434f66, glaze: 0x6f82a4, glazeAlpha: 0.50 }, // deep night
      { t: 0.92, skyTop: 0x2a3547, skyHorizon: 0x55586b, glaze: 0x7b8dab, glazeAlpha: 0.45 }, // small hours
    ],
    // Fraction of screen height where the horizon band sits in the sky
    // gradient (the world diamond occupies the area below the upper sky).
    horizonY: 0.62,
    // Hard ceiling on glaze alpha — the legibility floor. Night may not get
    // darker than this no matter what the keyframes say.
    glazeCap: 0.55,
  },

  // How far the sky leans toward the brewing catastrophe's hue at full dread
  // (0 = sky ignores dread, 1 = sky fully becomes the dread color).
  dreadSkyBlend: 0.8,

  // Planetary curvature + fake perspective. The world renders through a bent
  // mesh; these bend it. curvature/perspective are the 0..1 knobs (scrub live
  // with __atmosphere.setCurvature / setPerspective): 0 = the old flat build,
  // 1 = deliberately too much, defaults in the subtle-correct middle.
  // The *Frac values calibrate what "1" means and rarely need touching.
  curve: {
    // The curvature knob remaps the world's upper silhouette onto a horizon
    // arc: the apex stays put and the diamond's side wings RISE to meet a
    // smooth limb curve, each column compressing toward it — the world goes
    // up to the horizon instead of sitting inside it. 0 = the flat diamond,
    // 1 = wings fully on the arc (too much; far columns stretch visibly).
    curvature: 0.62,
    perspective: 0.45,
    remapMax:   0.55,        // at curvature=1: how far the wings travel from tent to arc
    arcSagFrac: 0.11,        // horizon arc droop from apex toward the sides, fraction of texture height
    arcPower:   1.7,         // arc shape: 2 = flat crown that dives at the ends, 1 = conical
    apexRoundFrac: 0.45,     // how wide the apex point rounds into a crown (fraction of half-span, scales with the knob)
    pinchMaxFrac:     0.16,  // at perspective=1: horizontal narrowing of the far edge
    vertCompressFrac: 0.35,  // at perspective=1: how hard far rows bunch toward the horizon (t^(1+this))
    // Corner haze: soft sky-colored washes over the three far corners so the
    // points dissolve into atmosphere instead of terminating sharply. Scales
    // with the curvature knob (0 = none, exactly the old silhouette).
    edgeHazeAlpha: 0.55,
    edgeHazeSize:  500,      // base radius, world px before per-corner stretch
    // Edge feather: a blurred sky-tinted wash along the two far shorelines so
    // the waterline-to-sky boundary is a gradient, not a ruled line. Rides
    // the curvature knob; set 0 to disable.
    edgeFeatherAlpha: 0.5,
    edgeFeatherWidth: 42,    // world px, before blur
  },

  weather: {
    cloudCount: 7,          // drifting cloud-shadow patches over the land
    fogCount: 3,            // larger, slower mist banks
    baseWind: 9,            // drift speed, world px/s, in calm
    windDreadBoost: 2.4,    // wind multiplier at full dread (the storm gathers)
    shadowAlpha: 0.11,      // cloud shadow strength in calm (multiply)
    shadowAlphaDread: 0.24, // cloud shadow strength at full dread
    shadowTint: 0x4a5668,   // cool grey-blue shadow color
    fogAlpha: 0.09,         // mist bank strength (normal blend, pale wash)
    fogTint: 0xf4f1e8,      // warm paper-white mist
  },

  season: {
    // One "year" of palette drift. The cast leans the glaze + sky; biomeTint
    // tints the terrain layer itself (autumn ambers the land, winter pales it);
    // fogMult scales mist density.
    cycleSeconds: 1200,
    startT: 0.06,
    keyframes: [
      { t: 0.00, cast: 0xdfe8d8, castAmount: 0.10, biomeTint: 0xfdfff6, fogMult: 1.1 },  // spring
      { t: 0.25, cast: 0xf2e2b8, castAmount: 0.12, biomeTint: 0xfff6e2, fogMult: 0.7 },  // summer
      { t: 0.50, cast: 0xd8c49a, castAmount: 0.15, biomeTint: 0xf0dcc0, fogMult: 1.25 }, // autumn
      { t: 0.75, cast: 0xc7d2dc, castAmount: 0.18, biomeTint: 0xdde4ec, fogMult: 1.5 },  // winter
    ],
  },

  era: {
    // The air of an age — keyed by the leading civilization's era and eased
    // slowly. `air`/`amount` lean the glaze; fogMult scales the mist.
    easeSeconds: 30,
    moods: {
      neolithic:  { air: 0xf6f0de, amount: 0.06, fogMult: 0.85 }, // primordial clarity
      classical:  { air: 0xf2e9d2, amount: 0.05, fogMult: 0.90 },
      medieval:   { air: 0xe8e0cc, amount: 0.06, fogMult: 1.00 },
      industrial: { air: 0x99938a, amount: 0.15, fogMult: 1.40 }, // soot and steam
      modern:     { air: 0xc9cdd1, amount: 0.11, fogMult: 1.10 }, // washed, exhausted
      post:       { air: 0xbfa9c9, amount: 0.10, fogMult: 1.05 }, // faintly synthetic
    } as Record<Era, { air: number; amount: number; fogMult: number }>,
  },

  scar: {
    // Most live scars kept; oldest evicted beyond this.
    maxLive: 10,
    // Soft watercolor edge on scar art, in blur px.
    blur: 3,
    // Per type: lifeMs = impact → fully faded; holdFrac = portion of life at
    // full strength before fading begins; alpha = peak opacity of the wash.
    asteroid:   { lifeMs: 480_000, holdFrac: 0.25, alpha: 0.60 },
    earthquake: { lifeMs: 320_000, holdFrac: 0.20, alpha: 0.50 },
    flood:      { lifeMs: 380_000, holdFrac: 0.25, alpha: 0.50 },
    plague:     { lifeMs: 780_000, holdFrac: 0.30, alpha: 0.40 },
    // Scar palette, per type (painterly washes, not symbols).
    colors: {
      asteroidCore:  0x2b211a,  // charred umber
      asteroidRing:  0x4a382a,  // scorch
      asteroidEmber: 0x80492a,  // faint warm flecks near the core
      quakeCrack:    0x33291e,  // dark earth fissures
      quakeDust:     0x9b8d76,  // settled dust wash
      floodSilt:     0x8a7a5e,  // clay
      floodSiltPale: 0xa99a78,  // dried silt margin
      plagueVeil:    0xcfc9b8,  // bone-pale wash
      plagueTinge:   0xb4b8a2,  // grey-green undertone
    },
  },
};

// --- Internals ------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

interface DayState { skyTop: number; skyHorizon: number; glaze: number; glazeAlpha: number }

function sampleDay(t: number): DayState {
  const keys = ATMOS.day.keyframes;
  // Find bracketing keyframes with wraparound.
  let k0 = keys[keys.length - 1];
  let k1 = keys[0];
  let span = 1 - k0.t + k1.t;
  let local = t >= k0.t ? t - k0.t : t + 1 - k0.t;
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t < keys[i + 1].t) {
      k0 = keys[i]; k1 = keys[i + 1];
      span = k1.t - k0.t;
      local = t - k0.t;
      break;
    }
  }
  const u = smoothstep(span > 0 ? local / span : 0);
  return {
    skyTop: lerpColor(k0.skyTop, k1.skyTop, u),
    skyHorizon: lerpColor(k0.skyHorizon, k1.skyHorizon, u),
    glaze: lerpColor(k0.glaze, k1.glaze, u),
    glazeAlpha: k0.glazeAlpha + (k1.glazeAlpha - k0.glazeAlpha) * u,
  };
}

function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

// Scatter soft overlapping blobs in an iso-squashed annulus — the basic
// watercolor stroke everything below is built from.
function blotch(
  g: Graphics, rand: () => number,
  cx: number, cy: number, rInner: number, rOuter: number,
  color: number, alpha: number, count: number, blobScale: number
) {
  for (let i = 0; i < count; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = rInner + Math.sqrt(rand()) * (rOuter - rInner);
    const bx = cx + Math.cos(ang) * dist;
    const by = cy + Math.sin(ang) * dist * 0.5; // iso squash
    const br = (0.10 + rand() * 0.22) * rOuter * blobScale;
    g.ellipse(bx, by, br, br * 0.55).fill({ color, alpha });
  }
}

interface Scar {
  g: Graphics;
  bornMs: number;
  lifeMs: number;
  holdFrac: number;
  peakAlpha: number;
  recede: boolean; // flood silt creeps back
}

// A single soft radial gradient — used (tinted) for the corner haze.
function makeHazeTexture(): Texture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.40)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(cv);
}

// Soft blobby cloud mass on a canvas — overlapping radial gradients. Each
// texture is reused by several sprites at different scales/flips.
function makeCloudTexture(rand: () => number): Texture {
  const w = 320, h = 180;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const blobs = 9 + Math.floor(rand() * 6);
  for (let i = 0; i < blobs; i++) {
    const bx = w * (0.18 + rand() * 0.64);
    const by = h * (0.30 + rand() * 0.40);
    const br = 28 + rand() * 55;
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    grad.addColorStop(0, 'rgba(255,255,255,0.40)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  return Texture.from(cv);
}

// Drift bounds in world coordinates — the diamond plus a margin so clouds
// enter and leave gracefully.
const DRIFT = { minX: -1850, maxX: 1850, minY: -250, maxY: 1800 };

interface Drifter {
  sp: Sprite;
  speedMult: number; // individual variation on the shared wind
  baseAlpha: number; // individual variation on the layer alpha
}

interface SeasonState { cast: number; castAmount: number; biomeTint: number; fogMult: number }

function sampleSeason(t: number): SeasonState {
  const keys = ATMOS.season.keyframes;
  let k0 = keys[keys.length - 1];
  let k1 = keys[0];
  let span = 1 - k0.t + k1.t;
  let local = t >= k0.t ? t - k0.t : t + 1 - k0.t;
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t < keys[i + 1].t) {
      k0 = keys[i]; k1 = keys[i + 1];
      span = k1.t - k0.t;
      local = t - k0.t;
      break;
    }
  }
  const u = smoothstep(span > 0 ? local / span : 0);
  return {
    cast: lerpColor(k0.cast, k1.cast, u),
    castAmount: k0.castAmount + (k1.castAmount - k0.castAmount) * u,
    biomeTint: lerpColor(k0.biomeTint, k1.biomeTint, u),
    fogMult: k0.fogMult + (k1.fogMult - k0.fogMult) * u,
  };
}

export interface Atmosphere {
  skyLayer: Sprite;
  glazeLayer: Graphics;
  scarLayer: Container;
  cloudShadowLayer: Container;
  fogLayer: Container;
  // biomeLayer is tinted seasonally; attach it once after scene construction.
  attach(layers: { biomeLayer: Container }): void;
  // The bent mesh the world draws through; attach once after creation, with
  // the diamond's corner positions in texture pixels (left, apex, right, front).
  attachPlane(plane: MeshPlane, geom: { left: { x: number; y: number }; apex: { x: number; y: number }; right: { x: number; y: number }; front: { x: number; y: number } }): void;
  // World-space layers: shoreline feather and corner haze; add to the world
  // container above fog (they bend with the mesh).
  hazeLayer: Container;
  featherLayer: Container;
  setCurvature(v: number): void;   // 0..1, live scrub
  setPerspective(v: number): void; // 0..1, live scrub
  curvature(): number;
  perspective(): number;
  update(deltaMS: number, dread: number, dreadSkyColor: number | null, dominantEra: Era): void;
  addScar(type: CatastropheType, row: number, col: number, radiusTiles: number, severity: number): void;
  clearScars(): void;
  layout(width: number, height: number): void;
  timeOfDay(): number;
  setTimeOfDay(t: number): void;   // scrub the day cycle (debug/tuning)
  seasonOfYear(): number;
  setSeasonOfYear(t: number): void; // scrub the season cycle (debug/tuning)
}

export function createAtmosphere(): Atmosphere {
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2;
  skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d')!;
  const skyTexture = Texture.from(skyCanvas);
  const skyLayer = new Sprite(skyTexture);

  const glazeLayer = new Graphics();
  glazeLayer.blendMode = 'multiply';
  glazeLayer.alpha = 0;

  const scarLayer = new Container();

  // Weather: cloud shadows (multiply, over land+buildings) and mist banks
  // (pale wash, under labels). All drift along a shared, slowly-wandering wind.
  const cloudShadowLayer = new Container();
  const fogLayer = new Container();
  const weatherRand = mulberry32(0x9e3779b9);
  const cloudTextures = [makeCloudTexture(weatherRand), makeCloudTexture(weatherRand), makeCloudTexture(weatherRand)];
  const cloudShadows: Drifter[] = [];
  const fogBanks: Drifter[] = [];
  let windAngle = weatherRand() * Math.PI * 2;

  function spawnDrifter(layer: Container, list: Drifter[], scaleMin: number, scaleMax: number) {
    const sp = new Sprite(cloudTextures[Math.floor(weatherRand() * cloudTextures.length)]);
    sp.anchor.set(0.5);
    const s = scaleMin + weatherRand() * (scaleMax - scaleMin);
    sp.scale.set(s * (weatherRand() < 0.5 ? -1 : 1), s * 0.8);
    sp.x = DRIFT.minX + weatherRand() * (DRIFT.maxX - DRIFT.minX);
    sp.y = DRIFT.minY + weatherRand() * (DRIFT.maxY - DRIFT.minY);
    layer.addChild(sp);
    list.push({ sp, speedMult: 0.6 + weatherRand() * 0.8, baseAlpha: 0.7 + weatherRand() * 0.6 });
  }
  for (let i = 0; i < ATMOS.weather.cloudCount; i++) {
    spawnDrifter(cloudShadowLayer, cloudShadows, 2.2, 4.6);
  }
  for (let i = 0; i < ATMOS.weather.fogCount; i++) {
    spawnDrifter(fogLayer, fogBanks, 5.5, 9.0);
  }
  for (const d of cloudShadows) {
    d.sp.tint = ATMOS.weather.shadowTint;
    d.sp.blendMode = 'multiply';
  }
  for (const d of fogBanks) {
    d.sp.tint = ATMOS.weather.fogTint;
  }

  // Edge feather: a blurred wash along the two far shorelines (left corner →
  // apex → right corner), drawn once in world space so it bends with the
  // mesh. Tinted live to the horizon color; alpha rides the curvature knob.
  const featherLayer = new Container();
  const featherGfx = new Graphics();
  {
    const L = { x: -1528, y: 764 }, T = { x: 0, y: -8 }, R = { x: 1528, y: 764 };
    const w0 = ATMOS.curve.edgeFeatherWidth;
    for (const [wMult, aMult] of [[1.0, 0.30], [0.55, 0.30], [0.25, 0.30]] as const) {
      featherGfx.moveTo(L.x, L.y).lineTo(T.x, T.y).lineTo(R.x, R.y)
        .stroke({ color: 0xffffff, alpha: aMult, width: w0 * wMult, cap: 'round', join: 'round' });
    }
    featherGfx.filters = [new BlurFilter({ strength: 8 })];
    featherLayer.addChild(featherGfx);
  }

  // Corner haze: three soft washes that melt the diamond's far points into
  // the sky. Lives in WORLD space (so it bends with the mesh and can never
  // strand in the sky); tinted live to the horizon color; alpha rides the
  // curvature knob.
  const hazeLayer = new Container();
  const hazeTexture = makeHazeTexture();
  const hazeSprites: Sprite[] = [];
  {
    const corners = [
      { x: -1528, y: 764, sx: 2.6, sy: 1.1 },  // left
      { x: 0, y: -8, sx: 2.2, sy: 0.95 },      // apex
      { x: 1528, y: 764, sx: 2.6, sy: 1.1 },   // right
    ];
    for (const cnr of corners) {
      const sp = new Sprite(hazeTexture);
      sp.anchor.set(0.5);
      sp.alpha = 0;
      sp.position.set(cnr.x, cnr.y);
      const base = ATMOS.curve.edgeHazeSize / 128;
      sp.scale.set(base * cnr.sx, base * cnr.sy);
      hazeLayer.addChild(sp);
      hazeSprites.push(sp);
    }
  }

  let attachedBiomeLayer: Container | null = null;
  let attachedPlane: MeshPlane | null = null;
  let planeBasePositions: Float32Array | null = null;
  let planeGeom: { left: { x: number; y: number }; apex: { x: number; y: number }; right: { x: number; y: number }; front: { x: number; y: number } } | null = null;
  let curCurvature = ATMOS.curve.curvature;
  let curPerspective = ATMOS.curve.perspective;

  // Bend the world mesh by remapping its upper silhouette onto a horizon arc.
  // For each column: the diamond's tent edge (apex-to-corner straight line)
  // is pulled toward a smooth arc through the apex; everything between the
  // tent and the front anchor compresses proportionally, the front stays
  // pinned, and content above the tent (feather blur, sky margin) rides
  // rigidly with the wing. Perspective adds a far-edge pinch and a vertical
  // squeeze of the far rows. Vertices only change when the knobs change.
  function applyCurve() {
    if (!attachedPlane || !planeBasePositions || !planeGeom) return;
    const geo = attachedPlane.geometry;
    const texH = (geo as any).height as number;
    const base = planeBasePositions;
    const out = new Float32Array(base.length);
    const { left, apex, right, front } = planeGeom;
    const c = ATMOS.curve;
    const k = curCurvature * c.remapMax;
    const halfSpan = (right.x - left.x) / 2;
    for (let i = 0; i < base.length; i += 2) {
      const x = base[i], y = base[i + 1];
      // The diamond's upper edge height at this column (clamped beyond corners).
      const dx = Math.min(1, Math.abs(x - apex.x) / halfSpan);
      const tentY = apex.y + dx * (left.y - apex.y);
      // The silhouette target: the tent with its apex point rounded into a
      // crown (softened |dx|, radius scaling with the knob), pulled toward a
      // horizon arc. Both terms vanish as the knob goes to 0 — flat restores.
      const r = c.apexRoundFrac * k;
      const dxSoft = Math.sqrt(dx * dx + r * r) - r;
      const tentSoftY = apex.y + dxSoft * (left.y - apex.y);
      const arcY = apex.y + c.arcSagFrac * texH * Math.pow(dx, c.arcPower);
      const newTopY = tentSoftY + (arcY - tentSoftY) * k;
      let ny: number;
      if (y <= tentY) {
        // Sky margin / feather above the edge: ride with the wing.
        ny = y + (newTopY - tentY);
      } else if (y < front.y) {
        // Surface between the edge and the front anchor: compress toward the
        // new top (front pinned), with perspective bunching the far rows
        // toward the horizon (t^e redistribution).
        let t = (y - tentY) / (front.y - tentY);
        t = Math.pow(t, 1 + curPerspective * c.vertCompressFrac);
        ny = newTopY + t * (front.y - newTopY);
      } else {
        ny = y;
      }
      // Perspective also pinches the far edge narrower.
      const nx = apex.x + (x - apex.x) * (1 - curPerspective * c.pinchMaxFrac * Math.max(0, 1 - y / texH));
      out[i] = nx;
      out[i + 1] = ny;
    }
    geo.positions = out;
  }
  let dayT = ATMOS.day.startT;
  let seasonT = ATMOS.season.startT;
  let eraAirCur = { air: 0xffffff, amount: 0, fogMult: 1 };
  let lastSkyTop = -1;
  let lastSkyHorizon = -1;
  let nowMs = 0; // scar clock — advances with update() so pause freezes fades
  const scars: Scar[] = [];

  function redrawSky(top: number, horizon: number) {
    const grad = skyCtx.createLinearGradient(0, 0, 0, skyCanvas.height);
    grad.addColorStop(0, hexCss(top));
    grad.addColorStop(ATMOS.day.horizonY, hexCss(horizon));
    // Below the horizon the sky continues as a slightly lifted ground-haze of
    // the horizon color, so the world doesn't sit on a hard band.
    grad.addColorStop(1, hexCss(lerpColor(horizon, 0xffffff, 0.18)));
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 2, skyCanvas.height);
    skyTexture.source.update();
  }

  function layout(width: number, height: number) {
    skyLayer.width = width;
    skyLayer.height = height;
    glazeLayer.clear();
    glazeLayer.rect(0, 0, width, height).fill(0xffffff);
  }

  function update(deltaMS: number, dread: number, dreadSkyColor: number | null, dominantEra: Era) {
    nowMs += deltaMS;
    const dt = deltaMS / 1000;
    dayT = (dayT + deltaMS / (ATMOS.day.cycleSeconds * 1000)) % 1;
    seasonT = (seasonT + deltaMS / (ATMOS.season.cycleSeconds * 1000)) % 1;
    const day = sampleDay(dayT);
    const season = sampleSeason(seasonT);

    // The air of the age eases slowly toward the leading era's mood.
    const mood = ATMOS.era.moods[dominantEra];
    const eraK = Math.min(1, dt / ATMOS.era.easeSeconds);
    eraAirCur.air = lerpColor(eraAirCur.air, mood.air, eraK);
    eraAirCur.amount += (mood.amount - eraAirCur.amount) * eraK;
    eraAirCur.fogMult += (mood.fogMult - eraAirCur.fogMult) * eraK;

    // Sky: day palette, leaned by season cast, then by the brewing hue.
    let top = lerpColor(day.skyTop, season.cast, season.castAmount * 0.5);
    let horizon = lerpColor(day.skyHorizon, season.cast, season.castAmount * 0.6);
    if (dreadSkyColor != null && dread > 0.01) {
      const lean = dread * ATMOS.dreadSkyBlend;
      top = lerpColor(top, dreadSkyColor, lean);
      horizon = lerpColor(horizon, dreadSkyColor, lean * 0.7);
    }
    // Only regenerate the gradient when it moved a perceptible amount.
    if (Math.abs((top & 0xff) - (lastSkyTop & 0xff)) > 1
      || Math.abs(((top >> 8) & 0xff) - ((lastSkyTop >> 8) & 0xff)) > 1
      || Math.abs(((top >> 16) & 0xff) - ((lastSkyTop >> 16) & 0xff)) > 1
      || Math.abs((horizon & 0xff) - (lastSkyHorizon & 0xff)) > 1
      || Math.abs(((horizon >> 8) & 0xff) - ((lastSkyHorizon >> 8) & 0xff)) > 1
      || Math.abs(((horizon >> 16) & 0xff) - ((lastSkyHorizon >> 16) & 0xff)) > 1) {
      lastSkyTop = top;
      lastSkyHorizon = horizon;
      redrawSky(top, horizon);
    }

    // Glaze: time-of-day light, cast by season, hazed by the era's air.
    let glazeColor = lerpColor(day.glaze, season.cast, season.castAmount);
    glazeColor = lerpColor(glazeColor, eraAirCur.air, eraAirCur.amount);
    const glazeAlpha = day.glazeAlpha + season.castAmount * 0.5 + eraAirCur.amount * 0.5;
    glazeLayer.tint = glazeColor;
    glazeLayer.alpha = Math.min(ATMOS.day.glazeCap, glazeAlpha);

    // Corner haze + edge feather follow the sky's horizon color (including
    // the dread lean) and fade in with the curvature knob.
    const hazeAlpha = ATMOS.curve.edgeHazeAlpha * curCurvature;
    for (const sp of hazeSprites) {
      sp.tint = horizon;
      sp.alpha = hazeAlpha;
    }
    featherGfx.tint = horizon;
    featherGfx.alpha = ATMOS.curve.edgeFeatherAlpha * curCurvature;

    // The land itself drifts with the season (ambered autumns, pale winters).
    if (attachedBiomeLayer) attachedBiomeLayer.tint = season.biomeTint;

    // Weather drift: a shared wind that wanders slowly and rises with dread.
    windAngle += (weatherRand() - 0.5) * dt * 0.15;
    const windSpeed = ATMOS.weather.baseWind * (1 + dread * (ATMOS.weather.windDreadBoost - 1));
    const wx = Math.cos(windAngle) * windSpeed;
    const wy = Math.sin(windAngle) * windSpeed * 0.5; // iso-flattened drift
    // Mist thickens at dawn and dusk, with the season and with the era's air.
    const dawnDusk = 1 + 0.7 * Math.pow(Math.abs(Math.cos(dayT * Math.PI * 2)), 10);
    const fogStrength = ATMOS.weather.fogAlpha * season.fogMult * eraAirCur.fogMult * dawnDusk;
    const shadowStrength = ATMOS.weather.shadowAlpha
      + (ATMOS.weather.shadowAlphaDread - ATMOS.weather.shadowAlpha) * dread;
    // Fog fades out near the diamond's apex so banks never paint over the
    // sky margin of the world texture (a clipped bank reads as a false
    // horizon line floating above the land).
    const advance = (d: Drifter, alpha: number, fadeNearApex: boolean) => {
      d.sp.x += wx * d.speedMult * dt;
      d.sp.y += wy * d.speedMult * dt;
      if (d.sp.x > DRIFT.maxX + 600) { d.sp.x = DRIFT.minX - 500; d.sp.y = DRIFT.minY + weatherRand() * (DRIFT.maxY - DRIFT.minY); }
      if (d.sp.x < DRIFT.minX - 600) { d.sp.x = DRIFT.maxX + 500; d.sp.y = DRIFT.minY + weatherRand() * (DRIFT.maxY - DRIFT.minY); }
      if (d.sp.y > DRIFT.maxY + 500) { d.sp.y = DRIFT.minY - 400; d.sp.x = DRIFT.minX + weatherRand() * (DRIFT.maxX - DRIFT.minX); }
      if (d.sp.y < DRIFT.minY - 500) { d.sp.y = DRIFT.maxY + 400; d.sp.x = DRIFT.minX + weatherRand() * (DRIFT.maxX - DRIFT.minX); }
      let envelope = 1;
      if (fadeNearApex) {
        const topReach = d.sp.y - d.sp.height / 2;
        envelope = Math.max(0, Math.min(1, (topReach + 60) / 360));
      }
      d.sp.alpha = alpha * d.baseAlpha * envelope;
    };
    for (const d of cloudShadows) advance(d, shadowStrength, false);
    for (const d of fogBanks) advance(d, fogStrength, true);

    // Scar fade envelopes.
    for (let i = scars.length - 1; i >= 0; i--) {
      const s = scars[i];
      const u = (nowMs - s.bornMs) / s.lifeMs;
      if (u >= 1) {
        scarLayer.removeChild(s.g);
        s.g.destroy();
        scars.splice(i, 1);
        continue;
      }
      const fade = u <= s.holdFrac ? 1 : 1 - (u - s.holdFrac) / (1 - s.holdFrac);
      s.g.alpha = s.peakAlpha * fade;
      if (s.recede) {
        const k = 1 - 0.18 * Math.min(1, u / 0.9);
        s.g.scale.set(k);
      }
    }
  }

  function addScar(type: CatastropheType, row: number, col: number, radiusTiles: number, severity: number) {
    const { x, y } = gridToScreen(col, row);
    const r = Math.max(3, radiusTiles) * 16; // world px; 16px per grid step in x
    const cfg = ATMOS.scar[type];
    const C = ATMOS.scar.colors;
    const g = new Graphics();
    const rand = mulberry32((row * 7919 + col * 104729 + Math.floor(severity * 1000)) >>> 0);
    const sevBoost = 0.75 + 0.45 * Math.min(1, severity / 0.7);

    switch (type) {
      case 'asteroid': {
        // Charred core, then a scorch ring with ragged edges; ember flecks.
        blotch(g, rand, x, y, 0, r * 0.34, C.asteroidCore, 0.65, 26, 0.9);
        blotch(g, rand, x, y, r * 0.30, r * 0.75, C.asteroidRing, 0.40, 34, 0.8);
        blotch(g, rand, x, y, r * 0.62, r * 1.02, C.asteroidRing, 0.20, 26, 0.7);
        blotch(g, rand, x, y, r * 0.06, r * 0.30, C.asteroidEmber, 0.25, 10, 0.4);
        break;
      }
      case 'earthquake': {
        // Fissures: dark random-walk cracks radiating from the center,
        // tapering as they go, over a faint settled-dust wash.
        blotch(g, rand, x, y, 0, r * 0.85, C.quakeDust, 0.16, 30, 0.9);
        const cracks = 4 + Math.floor(rand() * 3);
        for (let c = 0; c < cracks; c++) {
          let ang = rand() * Math.PI * 2;
          let px = x, py = y;
          const segs = 7 + Math.floor(rand() * 5);
          const segLen = (r * (0.55 + rand() * 0.45)) / segs;
          for (let sgi = 0; sgi < segs; sgi++) {
            ang += (rand() - 0.5) * 0.9;
            const nx = px + Math.cos(ang) * segLen;
            const ny = py + Math.sin(ang) * segLen * 0.5;
            const taper = 1 - sgi / segs;
            g.moveTo(px, py).lineTo(nx, ny)
              .stroke({ color: C.quakeCrack, alpha: 0.85 * taper + 0.15, width: 4.0 * taper + 0.8 });
            px = nx; py = ny;
          }
        }
        break;
      }
      case 'flood': {
        // Silt: a broad clay wash strongest in an annulus where the water
        // stood, with a paler dried margin. Recedes slowly (scale shrink).
        blotch(g, rand, x, y, r * 0.35, r * 0.85, C.floodSilt, 0.30, 40, 0.8);
        blotch(g, rand, x, y, r * 0.70, r * 1.08, C.floodSiltPale, 0.25, 30, 0.7);
        blotch(g, rand, x, y, 0, r * 0.40, C.floodSilt, 0.15, 14, 0.9);
        break;
      }
      case 'plague': {
        // A pale veil — the color washing out of the land. Even, soft, wide.
        blotch(g, rand, x, y, 0, r * 0.95, C.plagueVeil, 0.28, 48, 1.0);
        blotch(g, rand, x, y, r * 0.2, r * 0.8, C.plagueTinge, 0.18, 24, 0.9);
        break;
      }
    }

    g.filters = [new BlurFilter({ strength: ATMOS.scar.blur })];
    g.pivot.set(x, y);
    g.position.set(x, y);
    scarLayer.addChild(g);
    scars.push({
      g,
      bornMs: nowMs,
      lifeMs: cfg.lifeMs,
      holdFrac: cfg.holdFrac,
      peakAlpha: Math.min(1, cfg.alpha * sevBoost),
      recede: type === 'flood',
    });
    while (scars.length > ATMOS.scar.maxLive) {
      const old = scars.shift()!;
      scarLayer.removeChild(old.g);
      old.g.destroy();
    }
  }

  function clearScars() {
    for (const s of scars) {
      scarLayer.removeChild(s.g);
      s.g.destroy();
    }
    scars.length = 0;
  }

  return {
    skyLayer, glazeLayer, scarLayer, cloudShadowLayer, fogLayer,
    attach: (layers: { biomeLayer: Container }) => { attachedBiomeLayer = layers.biomeLayer; },
    attachPlane: (plane, geom) => {
      attachedPlane = plane;
      planeGeom = geom;
      planeBasePositions = plane.geometry.positions.slice();
      applyCurve();
    },
    hazeLayer,
    featherLayer,
    setCurvature: (v: number) => { curCurvature = Math.max(0, Math.min(1, v)); applyCurve(); },
    setPerspective: (v: number) => { curPerspective = Math.max(0, Math.min(1, v)); applyCurve(); },
    curvature: () => curCurvature,
    perspective: () => curPerspective,
    update, addScar, clearScars, layout,
    timeOfDay: () => dayT,
    setTimeOfDay: (t: number) => { dayT = ((t % 1) + 1) % 1; },
    seasonOfYear: () => seasonT,
    setSeasonOfYear: (t: number) => { seasonT = ((t % 1) + 1) % 1; },
  };
}
