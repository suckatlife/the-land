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
    horizonFrac: 0.24,
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
    perspective: 0.60,
    pinchMaxFrac:     0.16,  // at perspective=1: horizontal narrowing of the far edge
    vertCompressFrac: 0.55,  // at perspective=1: how hard rows thin toward the horizon (t^(1+this))
    // The limb: a true circular horizon, screen-space, that clips the world.
    // The far world disappears behind it — the ocean apron (drawn under the
    // terrain in main.ts) means there is always sea to clip, so the
    // silhouette is a circle arc by construction at any framing.
    limbSagMax:   0.40,      // arc drop at the frame edge at curvature=1, fraction of half-width
    limbBowMix:   0.85,      // how strongly surface rows bow parallel to the limb as they near it
    limbBowPower: 1.5,       // how quickly the bow fades toward the viewer (higher = horizon-only)
    limbHazeAlpha: 0.55,     // haze band lying along the limb
    limbHazeWidth: 64,       // band stroke width, screen px before blur
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

  // Celestial light — never a visible disk; the sun and moon exist only
  // through their effects (water glitter, star fade, directional tone).
  celestial: {
    // dayT windows (wrap at 1). The sun crosses the sky between sunRise and
    // sunSet; the moon owns the rest. Handoffs pass through altitude 0, so
    // intensity naturally dips at twilight.
    sunRise: 0.96,
    sunSet:  0.56,
    sunColorLow:  0xffc187,  // near the horizon
    sunColorHigh: 0xfff3dc,  // high noon
    moonColor:    0xbdc9dd,  // silver
    sunIntensity:  1.0,
    moonIntensity: 0.40,
  },

  glitter: {
    dayAlpha:   0.45,   // band strength under full sun
    nightAlpha: 0.30,   // moon path strength
    dayWidthFrac:   0.30, // band width as fraction of the world's width
    nightWidthFrac: 0.13, // the moon path is narrower
    twinkleSpeed: 1.4,  // glint crossfade rate (cycles/second)
  },

  stars: {
    // Field totals across the whole rotating dome — only ~4% sit in the
    // visible sky band at any moment (Hokusai-sparse on screen).
    count: 1300,         // faint population
    brightCount: 110,    // bright population (fades in first at dusk)
    fieldRadius: 1700,   // dome radius around the pole, px
    rotationMinutes: 30, // one full turn of the sky
    poleX: 0.64,         // celestial pole, fraction of viewport width
    poleY: 0.09,         //   and height
    maxAlpha: 0.85,
  },

  landLight: {
    strength: 0.10, // additive gradient toward the light's side of the world
  },

  // Wind made visible: faint bright waves crossing the land (a faster,
  // smaller cousin of the cloud shadows), masked to land by main.ts.
  shimmer: {
    count: 5,
    alpha: 0.055,     // peak strength in full daylight
    speedMult: 3.0,   // multiple of the cloud wind speed
  },

  // The camera breathes: a slow lens-scale oscillation, leaning in slightly
  // as dread builds. Applied by main.ts to the whole stage.
  camera: {
    breathAmp: 0.012,
    breathPeriodSec: 150,
    dreadLean: 0.015,
  },

  // Rare celestial events — rewards for the long-session viewer. Mean
  // intervals are rolled per-second while conditions hold; each event has a
  // cooldown so they never cluster. Trigger manually for tuning with
  // __atmosphere.triggerCelestial('comet'|'eclipse'|'aurora').
  events: {
    cometMeanSec: 480,    cometDurationSec: 80,   // any night
    eclipseMeanSec: 720,  eclipseDurationSec: 45, // moon high
    auroraMeanSec: 420,   auroraDurationSec: 160, // winter nights
    cooldownSec: 120,
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

export interface CelestialLight {
  azimuth: number;   // 0..1 across the sky (0 = screen-left)
  altitude: number;  // 0..1 arc height
  color: number;
  intensity: number; // 0..1, dips through zero at twilight handoffs
  isDay: boolean;
  nightness: number; // 0 day .. 1 full night (drives stars)
}

// Position of t inside a wrapping window [a..b); returns p in [0,1) or -1.
function windowPos(t: number, a: number, b: number): number {
  const len = (b - a + 1) % 1;
  const p = ((t - a + 1) % 1) / len;
  return p < 1 ? p : -1;
}

// Sun-glitter / moon-path band: a soft gradient envelope with baked glint
// dashes, denser at the center. Two variants crossfade for twinkle.
function makeGlitterTexture(rand: () => number, withGlints: boolean): Texture {
  const w = 512, h = 1024;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  if (!withGlints) {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.25)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    for (let i = 0; i < 750; i++) {
      // Center-weighted horizontal placement (sum of two uniforms).
      const x = (0.5 + (rand() - rand()) * 0.42) * w;
      const y = rand() * h;
      const envelope = Math.pow(Math.cos((x / w - 0.5) * Math.PI), 2);
      const a = (0.25 + rand() * 0.75) * envelope;
      const dw = 2 + rand() * 6;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.fillRect(x - dw / 2, y, dw, 1 + rand() * 1.5);
    }
  }
  return Texture.from(cv);
}

// Horizontal falloff for the land's directional light.
function makeLandLightTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 2;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 2);
  return Texture.from(cv);
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
  // Screen-space limb: the mask must be added to the stage (it clips the
  // world plane); the band draws the horizon haze above the plane.
  limbMask: Graphics;
  limbBand: Container;
  // Seat the limb (call on resize; scrubs re-use the last layout).
  layoutLimb(args: { width: number; height: number; apexX: number; apexY: number }): void;
  // Celestial light surfaces. glitterLayer, landLightLayer, shimmerLayer and
  // birdLayer are world-space; starLayer, cometLayer and auroraLayer are
  // screen-space behind the world plane.
  glitterLayer: Container;
  landLightLayer: Container;
  starLayer: Container;
  shimmerLayer: Container;
  birdLayer: Container;
  cometLayer: Container;
  auroraLayer: Container;
  setWaterMask(mask: Container | null): void; // restricts the glitter to water
  setLandMask(mask: Container | null): void;  // restricts the shimmer to land
  wind(): { x: number; y: number };
  onCelestialEvent(cb: (kind: string) => void): void;
  triggerCelestial(kind: 'comet' | 'eclipse' | 'aurora'): void;
  light(): CelestialLight;
  setLightAzimuth(v: number | null): void;   // pin the light's azimuth (null = resume cycle)
  setLightAltitude(v: number | null): void;  // pin the light's altitude
  setStarRotation(v: number): void;          // 0..1 of a full turn
  setGlitterStrength(v: number): void;       // multiplier on the band alpha
  setStarBrightness(v: number): void;        // multiplier on star alpha
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

  // The limb: a screen-space circular horizon. limbMaskG clips the world
  // plane (the far world disappears behind the horizon); limbBand lays a
  // blurred haze along the arc, tinted live to the horizon color. Both are
  // redrawn by layoutLimb (on resize and on curvature scrubs).
  const limbMaskG = new Graphics();
  const limbBand = new Container();
  const limbBandGfx = new Graphics();
  limbBandGfx.filters = [new BlurFilter({ strength: 9 })];
  limbBand.addChild(limbBandGfx);
  let limbLayout: { width: number; height: number; apexX: number; apexY: number } | null = null;

  function layoutLimb(args?: { width: number; height: number; apexX: number; apexY: number }) {
    if (args) limbLayout = args;
    if (!limbLayout) return;
    const { width, height, apexX, apexY } = limbLayout;
    const c = ATMOS.curve;
    limbMaskG.clear();
    limbBandGfx.clear();
    const sag = curCurvature * c.limbSagMax * (width / 2);
    if (sag < 2 || !attachedPlane) {
      // Flat: no horizon, no clipping.
      if (attachedPlane) attachedPlane.mask = null;
      applyCurve();
      return;
    }
    // Circle through the arc apex (apexX, apexY), sagging `sag` px at the
    // frame edges: R from the chord/sagitta relation.
    const halfW = width / 2 + 80; // overshoot the frame so the arc exits cleanly
    const R = (halfW * halfW + sag * sag) / (2 * sag);
    const cy = apexY + R;
    // Mask: the circle's upper region plus everything below its center line.
    limbMaskG.circle(apexX, cy, R).fill(0xffffff);
    limbMaskG.rect(-200, cy, width + 400, height + 400).fill(0xffffff);
    attachedPlane.mask = limbMaskG;
    // Haze band hugging the limb: stacked arc strokes, dense at the horizon
    // line, thinning upward into the sky.
    const w0 = c.limbHazeWidth;
    const theta = Math.asin(Math.min(1, halfW / R));
    const passes: Array<[number, number, number]> = [
      [w0 * 0.30, 1.1, 0.40],   // just below the line (over the far surface)
      [-w0 * 0.35, 1.1, 0.34],
      [-w0 * 1.00, 1.1, 0.22],
      [-w0 * 1.65, 1.0, 0.12],  // dissolving upward
    ];
    for (const [off, wMult, aMult] of passes) {
      limbBandGfx.arc(apexX, cy, R + off, -Math.PI / 2 - theta, -Math.PI / 2 + theta)
        .stroke({ color: 0xffffff, alpha: aMult, width: w0 * wMult, cap: 'round' });
    }
    // The surface bow depends on the limb radius — re-bend the mesh.
    applyCurve();
  }

  // --- Celestial light + its surfaces -------------------------------------
  const celestialRand = mulberry32(0x51f1ed);

  // Water glitter: a band of light on the ocean, world-space (bends with the
  // planet), masked to water by main.ts. Soft base + two glint variants
  // crossfading in counter-phase for twinkle.
  const glitterLayer = new Container();
  const glitterBase = new Sprite(makeGlitterTexture(celestialRand, false));
  const glintA = new Sprite(makeGlitterTexture(celestialRand, true));
  const glintB = new Sprite(makeGlitterTexture(celestialRand, true));
  for (const sp of [glitterBase, glintA, glintB]) {
    sp.anchor.set(0.5, 0);
    sp.blendMode = 'add';
    sp.alpha = 0;
    glitterLayer.addChild(sp);
  }
  let twinklePhase = 0;

  // Land directional light: an additive gradient toward the light's side.
  const landLightSprite = new Sprite(makeLandLightTexture());
  landLightSprite.blendMode = 'add';
  landLightSprite.alpha = 0;

  // Stars: two populations (bright fades in first at dusk), each a single
  // Graphics rotated around the celestial pole. Drawn once; per-frame cost is
  // one rotation value and two alphas.
  const starLayer = new Container();
  const brightStarsG = new Graphics();
  const faintStarsG = new Graphics();
  {
    const scatter = (g: Graphics, count: number, rMin: number, rMax: number, aMin: number, aMax: number) => {
      for (let i = 0; i < count; i++) {
        const ang = celestialRand() * Math.PI * 2;
        const dist = Math.sqrt(celestialRand()) * ATMOS.stars.fieldRadius;
        const roll = celestialRand();
        const color = roll < 0.82 ? 0xf2f4f8 : roll < 0.92 ? 0xcdd9f0 : 0xf0ddbe;
        g.circle(Math.cos(ang) * dist, Math.sin(ang) * dist, rMin + celestialRand() * (rMax - rMin))
          .fill({ color, alpha: aMin + celestialRand() * (aMax - aMin) });
      }
    };
    scatter(brightStarsG, ATMOS.stars.brightCount, 1.1, 2.1, 0.7, 1.0);
    scatter(faintStarsG, ATMOS.stars.count, 0.5, 1.1, 0.35, 0.7);
    brightStarsG.alpha = 0;
    faintStarsG.alpha = 0;
    starLayer.addChild(faintStarsG);
    starLayer.addChild(brightStarsG);
  }
  // Wind shimmer over land: bright strips on the wind, masked to land.
  const shimmerLayer = new Container();
  const shimmerDrifters: Drifter[] = [];
  for (let i = 0; i < ATMOS.shimmer.count; i++) {
    spawnDrifter(shimmerLayer, shimmerDrifters, 3.0, 5.0);
  }
  for (const d of shimmerDrifters) {
    d.sp.tint = 0xfff3d2;
    d.sp.blendMode = 'add';
    d.sp.scale.y *= 0.3; // long thin waves
  }
  let lastWind = { x: 0, y: 0 };

  // Rare celestial events.
  const cometLayer = new Graphics();
  const auroraLayer = new Container();
  const auroraSprites: Sprite[] = [];
  {
    // Ribbon texture: a soft vertical strip.
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 512;
    const cx2 = cv.getContext('2d')!;
    const grad = cx2.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cx2.fillStyle = grad;
    cx2.fillRect(0, 0, 96, 512);
    const ribbonTex = Texture.from(cv);
    const colors = [0x7fe0c0, 0xa7e8d2, 0xb39fe0];
    for (let i = 0; i < 3; i++) {
      const sp = new Sprite(ribbonTex);
      sp.anchor.set(0.5, 0);
      sp.tint = colors[i];
      sp.blendMode = 'add';
      sp.alpha = 0;
      auroraLayer.addChild(sp);
      auroraSprites.push(sp);
    }
  }
  let activeEvent: { kind: 'comet' | 'eclipse' | 'aurora'; t: number; dur: number; a?: { x: number; y: number }; b?: { x: number; y: number } } | null = null;
  let eventCooldown = 0;
  let eclipseMult = 1;
  let eventCb: ((kind: string) => void) | null = null;

  function startCelestial(kind: 'comet' | 'eclipse' | 'aurora') {
    const E = ATMOS.events;
    const w = limbLayout?.width ?? 1600;
    const h = limbLayout?.height ?? 900;
    const dur = kind === 'comet' ? E.cometDurationSec : kind === 'eclipse' ? E.eclipseDurationSec : E.auroraDurationSec;
    activeEvent = { kind, t: 0, dur };
    if (kind === 'comet') {
      const leftToRight = weatherRand() < 0.5;
      const y0 = h * (0.04 + weatherRand() * 0.06);
      const y1 = h * (0.14 + weatherRand() * 0.10);
      activeEvent.a = { x: leftToRight ? w * 0.06 : w * 0.94, y: y0 };
      activeEvent.b = { x: leftToRight ? w * 0.94 : w * 0.06, y: y1 };
    }
    if (kind === 'aurora') {
      for (let i = 0; i < auroraSprites.length; i++) {
        auroraSprites[i].position.set(w * (0.25 + 0.25 * i + weatherRand() * 0.08), -10);
        auroraSprites[i].height = h * 0.42;
        auroraSprites[i].width = 90 + weatherRand() * 70;
      }
    }
    eventCb?.(kind);
  }

  function updateCelestialEvents(dt: number, L: CelestialLight) {
    if (eventCooldown > 0) eventCooldown -= dt;
    if (!activeEvent && eventCooldown <= 0) {
      const E = ATMOS.events;
      const roll = (mean: number) => Math.random() < dt / mean;
      const winter = seasonT > 0.6 && seasonT < 0.95;
      if (L.nightness > 0.5 && roll(E.cometMeanSec)) startCelestial('comet');
      else if (!L.isDay && L.altitude > 0.4 && roll(E.eclipseMeanSec)) startCelestial('eclipse');
      else if (L.nightness > 0.8 && winter && roll(E.auroraMeanSec)) startCelestial('aurora');
    }
    eclipseMult = 1;
    cometGfx_clear();
    if (!activeEvent) return;
    activeEvent.t += dt;
    const p = activeEvent.t / activeEvent.dur;
    if (p >= 1) {
      activeEvent = null;
      eventCooldown = ATMOS.events.cooldownSec;
      for (const sp of auroraSprites) sp.alpha = 0;
      return;
    }
    const env = Math.sin(Math.PI * p);
    if (activeEvent.kind === 'comet' && activeEvent.a && activeEvent.b) {
      const { a, b } = activeEvent;
      const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p;
      const vx = b.x - a.x, vy = b.y - a.y;
      const vlen = Math.hypot(vx, vy);
      const alpha = env * Math.max(0.25, L.nightness);
      for (let i = 1; i <= 8; i++) {
        cometLayer.circle(x - (vx / vlen) * i * 7, y - (vy / vlen) * i * 7, 1.6 - i * 0.15)
          .fill({ color: 0xdfe9f5, alpha: alpha * (1 - i / 9) * 0.5 });
      }
      cometLayer.circle(x, y, 2.6).fill({ color: 0xffffff, alpha: alpha * 0.35 });
      cometLayer.circle(x, y, 1.5).fill({ color: 0xffffff, alpha });
    } else if (activeEvent.kind === 'eclipse') {
      eclipseMult = 1 - 0.85 * env;
    } else if (activeEvent.kind === 'aurora') {
      for (let i = 0; i < auroraSprites.length; i++) {
        const sp = auroraSprites[i];
        sp.alpha = 0.16 * env * L.nightness;
        sp.skew.x = 0.18 * Math.sin(activeEvent.t * 0.25 + i * 1.7);
        sp.x += Math.sin(activeEvent.t * 0.11 + i) * 0.08;
      }
    }
  }
  function cometGfx_clear() { cometLayer.clear(); }

  // Bird flocks: a V of dots crossing the world at dawn or dusk.
  const birdLayer = new Graphics();
  let birdFlock: { x: number; y: number; dir: number; t: number } | null = null;

  function updateBirds(dt: number, L: CelestialLight) {
    birdLayer.clear();
    if (!birdFlock) {
      if (L.isDay && L.altitude < 0.5 && Math.random() < dt / 150) {
        const dir = weatherRand() < 0.5 ? 1 : -1;
        birdFlock = { x: dir > 0 ? -1700 : 1700, y: 350 + weatherRand() * 750, dir, t: 0 };
      }
      return;
    }
    birdFlock.t += dt;
    birdFlock.x += birdFlock.dir * 110 * dt;
    if (Math.abs(birdFlock.x) > 1750) { birdFlock = null; return; }
    const { x, y, dir, t } = birdFlock;
    for (let k = 0; k <= 3; k++) {
      for (const side of k === 0 ? [0] : [-1, 1]) {
        const bx = x - dir * k * 9;
        const by = y + side * k * 6 + Math.sin(t * 6 + k * 1.3 + side) * 1.3;
        birdLayer.circle(bx, by, 1.3).fill({ color: 0x4a443c, alpha: 0.55 });
      }
    }
  }

  let starRotation = 0;
  let lightAzOverride: number | null = null;
  let lightAltOverride: number | null = null;
  let glitterStrengthMult = 1;
  let starBrightnessMult = 1;
  let curLight: CelestialLight = { azimuth: 0.5, altitude: 1, color: 0xfff3dc, intensity: 1, isDay: true, nightness: 0 };

  function computeLight(): CelestialLight {
    const c = ATMOS.celestial;
    const sunP = windowPos(dayT, c.sunRise, c.sunSet);
    let azimuth: number, altitude: number, isDay: boolean;
    if (sunP >= 0) {
      isDay = true;
      azimuth = sunP;
      altitude = Math.sin(sunP * Math.PI);
    } else {
      isDay = false;
      const moonP = windowPos(dayT, c.sunSet, c.sunRise);
      azimuth = moonP;
      altitude = Math.sin(Math.max(0, moonP) * Math.PI);
    }
    if (lightAzOverride != null) azimuth = lightAzOverride;
    if (lightAltOverride != null) altitude = lightAltOverride;
    const color = isDay
      ? lerpColor(c.sunColorLow, c.sunColorHigh, altitude)
      : c.moonColor;
    const intensity = Math.pow(altitude, 0.7) * (isDay ? c.sunIntensity : c.moonIntensity);
    // Stars: come out as the sun sinks, stay all night, linger into dawn.
    const nightness = isDay ? Math.max(0, Math.min(1, 1 - altitude * 5)) : 1;
    return { azimuth, altitude, color, intensity, isDay, nightness };
  }

  let attachedBiomeLayer: Container | null = null;
  let attachedPlane: MeshPlane | null = null;
  let planeBasePositions: Float32Array | null = null;
  let planeGeom: { left: { x: number; y: number }; apex: { x: number; y: number }; right: { x: number; y: number }; front: { x: number; y: number } } | null = null;
  let curCurvature = ATMOS.curve.curvature;
  let curPerspective = ATMOS.curve.perspective;

  // Bend the world mesh. Three smooth ingredients, no regime boundaries
  // anywhere visible (the diamond's own edges play no role — the limb mask
  // owns the silhouette and the ocean apron means there is no content edge):
  // 1. Vertical redistribution referenced to the APEX ROW: rows thin toward
  //    the horizon (t^e). The zero-compression locus is the apex row itself,
  //    which the limb mask hides everywhere by construction (the mask's
  //    highest point is the apex).
  // 2. Rows bow parallel to the limb circle as they approach it.
  // 3. A horizontal pinch of the far field.
  function applyCurve() {
    if (!attachedPlane || !planeBasePositions || !planeGeom) return;
    const geo = attachedPlane.geometry;
    const texH = (geo as any).height as number;
    const base = planeBasePositions;
    const out = new Float32Array(base.length);
    const { apex, front } = planeGeom;
    const c = ATMOS.curve;
    const span = front.y - apex.y;
    const e = 1 + curPerspective * c.vertCompressFrac;
    let limbR = 0;
    if (limbLayout) {
      const sag = curCurvature * c.limbSagMax * (limbLayout.width / 2);
      if (sag >= 2) {
        const halfW = limbLayout.width / 2 + 80;
        limbR = (halfW * halfW + sag * sag) / (2 * sag);
      }
    }
    for (let i = 0; i < base.length; i += 2) {
      const x = base[i], y = base[i + 1];
      let ny: number;
      let tRaw: number; // 0 at the apex row (infinite distance), 1 at the front
      if (y <= apex.y) {
        ny = y;
        tRaw = 0;
      } else if (y < front.y) {
        tRaw = (y - apex.y) / span;
        ny = apex.y + Math.pow(tRaw, e) * span;
      } else {
        ny = y;
        tRaw = 1;
      }
      // Bow rows parallel to the limb circle as they near the horizon.
      if (limbR > 0 && tRaw < 1) {
        const dxp = Math.min(limbR, Math.abs(x - apex.x));
        const drop = limbR - Math.sqrt(limbR * limbR - dxp * dxp);
        ny += drop * c.limbBowMix * curCurvature * Math.pow(1 - tRaw, c.limbBowPower);
      }
      // Perspective also pinches the far field narrower.
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
    starLayer.position.set(width * ATMOS.stars.poleX, height * ATMOS.stars.poleY);
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

    // The limb haze follows the sky's horizon color (including the dread
    // lean) and fades in with the curvature knob.
    limbBandGfx.tint = horizon;
    limbBandGfx.alpha = ATMOS.curve.limbHazeAlpha * curCurvature;

    // --- Celestial light ---------------------------------------------------
    curLight = computeLight();
    updateCelestialEvents(dt, curLight);
    if (!curLight.isDay) curLight.intensity *= eclipseMult;
    updateBirds(dt, curLight);
    const L = curLight;

    // Water glitter / moon path: the band slides with the light's azimuth,
    // glint variants crossfade for twinkle. Intensity passes through zero at
    // twilight, so the day/night width and alpha changes never pop.
    const gl = ATMOS.glitter;
    twinklePhase += dt * gl.twinkleSpeed * Math.PI * 2;
    const bandAlpha = (L.isDay ? gl.dayAlpha : gl.nightAlpha) * L.intensity * glitterStrengthMult;
    const bandWidth = (L.isDay ? gl.dayWidthFrac : gl.nightWidthFrac) * 3200;
    const bandX = -1600 + L.azimuth * 3200;
    for (const sp of [glitterBase, glintA, glintB]) {
      sp.tint = L.color;
      sp.position.set(bandX, -110);
      sp.width = bandWidth;
      sp.height = 1720;
    }
    glitterBase.alpha = bandAlpha * 0.5;
    glintA.alpha = bandAlpha * (0.55 + 0.45 * Math.sin(twinklePhase));
    glintB.alpha = bandAlpha * (0.55 + 0.45 * Math.cos(twinklePhase));

    // Land directional response: an additive gradient from the light's side.
    // Fades to nothing at noon (no direction) and at twilight (no light).
    const dirFactor = Math.min(1, Math.abs(L.azimuth - 0.5) * 2);
    landLightSprite.tint = L.color;
    landLightSprite.alpha = ATMOS.landLight.strength * L.intensity * dirFactor;
    landLightSprite.height = 1720;
    landLightSprite.y = -110;
    landLightSprite.width = 3200;
    if (L.azimuth < 0.5) {
      landLightSprite.scale.x = Math.abs(landLightSprite.scale.x);
      landLightSprite.x = -1600;
    } else {
      landLightSprite.scale.x = -Math.abs(landLightSprite.scale.x);
      landLightSprite.x = 1600;
    }

    // Stars: the sky turns. Bright population leads at dusk, faint follows.
    starRotation += dt * (Math.PI * 2) / (ATMOS.stars.rotationMinutes * 60);
    starLayer.rotation = starRotation;
    const sb = ATMOS.stars.maxAlpha * starBrightnessMult;
    brightStarsG.alpha = sb * smoothstep(Math.min(1, L.nightness * 1.4));
    faintStarsG.alpha = sb * smoothstep(Math.max(0, (L.nightness - 0.45) / 0.55));

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
    lastWind = { x: wx, y: wy };
    // Wind shimmer: same drift machinery, faster, daylight-gated. (curLight
    // is last frame's value here — a one-frame lag, invisible.)
    const shimmerAlpha = ATMOS.shimmer.alpha * curLight.intensity * (curLight.isDay ? 1 : 0.3);
    const extraMult = ATMOS.shimmer.speedMult - 1;
    for (const d of shimmerDrifters) {
      advance(d, shimmerAlpha, false);
      d.sp.x += wx * extraMult * d.speedMult * dt;
      d.sp.y += wy * extraMult * d.speedMult * dt;
    }

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
      layoutLimb();
    },
    limbMask: limbMaskG,
    limbBand,
    layoutLimb,
    glitterLayer,
    landLightLayer: landLightSprite,
    starLayer,
    setWaterMask: (mask: Container | null) => { glitterLayer.mask = mask; },
    shimmerLayer,
    birdLayer,
    cometLayer,
    auroraLayer,
    setLandMask: (mask: Container | null) => { shimmerLayer.mask = mask; },
    wind: () => lastWind,
    onCelestialEvent: (cb: (kind: string) => void) => { eventCb = cb; },
    triggerCelestial: (kind: 'comet' | 'eclipse' | 'aurora') => { startCelestial(kind); },
    light: () => curLight,
    setLightAzimuth: (v: number | null) => { lightAzOverride = v == null ? null : Math.max(0, Math.min(1, v)); },
    setLightAltitude: (v: number | null) => { lightAltOverride = v == null ? null : Math.max(0, Math.min(1, v)); },
    setStarRotation: (v: number) => { starRotation = v * Math.PI * 2; },
    setGlitterStrength: (v: number) => { glitterStrengthMult = Math.max(0, v); },
    setStarBrightness: (v: number) => { starBrightnessMult = Math.max(0, v); },
    setCurvature: (v: number) => { curCurvature = Math.max(0, Math.min(1, v)); applyCurve(); layoutLimb(); },
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
