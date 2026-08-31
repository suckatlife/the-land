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
      // Night deepened, and the glaze colours cooled with it. These predate the
      // city lights: with nothing emitting light after dark the land itself had
      // to stay readable, so night stopped at half a wash and read as dusk. The
      // cities carry legibility now, so night can be night.
      { t: 0.00, skyTop: 0x6a6f9a, skyHorizon: 0xf0a36a, glaze: 0xf0b878, glazeAlpha: 0.18 }, // sunrise: lilac over peach
      { t: 0.08, skyTop: 0x7ba6d4, skyHorizon: 0xf6cf9c, glaze: 0xf8e4c2, glazeAlpha: 0.07 }, // early morning
      { t: 0.25, skyTop: 0x5b9ad8, skyHorizon: 0xc7e0ee, glaze: 0xffffff, glazeAlpha: 0.00 }, // noon: clear blue
      { t: 0.42, skyTop: 0x77a6d0, skyHorizon: 0xe9cf9a, glaze: 0xf2dcae, glazeAlpha: 0.08 }, // afternoon
      { t: 0.52, skyTop: 0x7c6a9e, skyHorizon: 0xef8a4c, glaze: 0xe49152, glazeAlpha: 0.26 }, // sunset: violet over orange
      { t: 0.60, skyTop: 0x52506f, skyHorizon: 0xc06450, glaze: 0xb06658, glazeAlpha: 0.44 }, // afterglow: red-purple
      { t: 0.68, skyTop: 0x303c58, skyHorizon: 0x6a5570, glaze: 0x6f83a8, glazeAlpha: 0.58 }, // nightfall
      { t: 0.80, skyTop: 0x182338, skyHorizon: 0x33405c, glaze: 0x5b6d92, glazeAlpha: 0.70 }, // deep night
      { t: 0.92, skyTop: 0x1f2b44, skyHorizon: 0x46506a, glaze: 0x66799c, glazeAlpha: 0.62 }, // small hours
    ],
    // Fraction of screen height where the horizon band sits in the sky
    // gradient (the world diamond occupies the area below the upper sky).
    horizonY: 0.62,
    // How much of a day-night cycle the visible globe spans, in cycle
    // fractions either side of centre. This is the only new number the
    // terminator needs: it says how much later it is at the right limb than
    // the left. 0 reproduces the old flat wash exactly.
    terminatorSpread: 0.115,

    // Ceiling on the directional darkening, independent of `glazeCap`.
    terminatorMax: 0.52,

    // How much warm sunset colour a low sun casts onto the world. Additive, so
    // this is the only thing here that can make part of the globe brighter
    // than the flat glaze leaves it.
    //
    // Paired with `terminatorMax` below: the two together are the contrast
    // between the lit and unlit halves, and they want raising and lowering
    // together or the globe gets bright on one side without getting dark on
    // the other.
    sunCastMax: 0.62,

    // Hard ceiling on glaze alpha — the legibility floor. Night may not get
    // darker than this, or the world stops being watchable.
    //
    // Raised from 0.55 deliberately. That value predates the city lights: with
    // nothing emitting light at night, the land itself had to stay readable or
    // there was nothing to see. Now the lit half is carried by the cities, so
    // the dark half can actually be dark — and it has to be, or the lights sit
    // on a bright surface and never read as lights.
    glazeCap: 0.74,
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
    perspective: 0.2,       // gentle foreshortening — tiles squeeze slightly skinnier toward the top
    pinchMaxFrac:     0.16,  // at perspective=1: horizontal narrowing of the far edge
    vertCompressFrac: 2.4,   // at perspective=1: how hard rows thin toward the horizon (t^(1+this))
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
    nightAlpha: 0.50,   // 20% peak after the moon's 0.40 intensity multiplier
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

  // Traveling storms: one cell at a time crosses the world on the wind —
  // dark cloud cluster, rain streaks, lightning flickers at night.
  storm: {
    meanSec: 420,
    durationSec: 100,
    alpha: 0.34,        // cloud-cluster darkness
    rainAlpha: 0.22,
    lightningMeanSec: 7, // while storming at night
  },

  // Rare celestial events — rewards for the long-session viewer. Mean
  // intervals are rolled per-second while conditions hold; each event has a
  // cooldown so they never cluster. Trigger manually for tuning with
  // __atmosphere.triggerCelestial('comet'|'eclipse'|'aurora').
  events: {
    cometMeanSec: 480,    cometDurationSec: 80,   // any night
    eclipseMeanSec: 720,  eclipseDurationSec: 45, // moon high
    auroraMeanSec: 420,   auroraDurationSec: 160, // winter nights
    meteorsMeanSec: 360,  meteorsDurationSec: 120, // any deep night
    cooldownSec: 120,
  },

  era: {
    // The air of an age — keyed by the leading civilization's era and eased
    // slowly. `air`/`amount` lean the glaze; fogMult scales the mist.
    easeSeconds: 30,
    // How much of the era's air comes back as SCATTERED LIGHT rather than as
    // shade. The glaze is a multiply, so on its own an era's air could only
    // ever darken and desaturate the whole frame at once — which is why heavy
    // air read as mud: land and sea converged on one dull hue and the sea
    // stopped reading as water. Real haze does the opposite, lifting the dark
    // end and lowering contrast. This is the lift; the glaze keeps the density.
    airlight: 0.55,
    moods: {
      neolithic:  { air: 0xf6f0de, amount: 0.06, fogMult: 0.85 }, // primordial clarity
      classical:  { air: 0xf2e9d2, amount: 0.05, fogMult: 0.90 },
      medieval:   { air: 0xe8e0cc, amount: 0.06, fogMult: 1.00 },
      // Soot in daylight is a warm ash, not a dark olive: a light tint darkens
      // little through the multiply and carries the haze through the lift.
      industrial: { air: 0xbcae98, amount: 0.17, fogMult: 1.40 }, // soot and steam
      modern:     { air: 0xd3d7db, amount: 0.12, fogMult: 1.10 }, // washed, exhausted
      post:       { air: 0xccb9d8, amount: 0.11, fogMult: 1.05 }, // faintly synthetic
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
    volcano:    { lifeMs: 900_000, holdFrac: 0.30, alpha: 0.60 },
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
      volcanoBasalt: 0x26201c,  // cooled flows
      volcanoAsh:    0x8a8478,  // ash blanket
      volcanoEmber:  0x9a3c1a,  // dying glow at the vent
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
  terminatorLayer: Graphics;
  sunCastLayer: Graphics;
  airLayer: Graphics;                        // era airlight (screen), sits over the glaze
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
  // The screen-space horizon circle (planet silhouette): centre (cx, cy), radius
  // R, and apexY (the topmost point). null when the world is flat (curvature 0).
  limbGeometry(): { cx: number; cy: number; R: number; apexY: number } | null;
  // Celestial light surfaces. glitterLayer, landLightLayer, shimmerLayer and
  // birdLayer are world-space; starLayer, cometLayer and auroraLayer are
  // screen-space behind the world plane.
  glitterLayer: Container;
  landLightLayer: Container;
  starLayer: Container;
  shimmerLayer: Container;
  birdLayer: Container;
  stormLayer: Container;
  cometLayer: Container;
  auroraLayer: Container;
  celestialLayer: Container;  // the sun & moon overhead, halo (behind the planet, in the sky)
  skyCloudLayer: Container;   // drifting clouds in the sky (screen-space)
  rainbowLayer: Container;    // rainbow arc over the world (in front of the planet)
  setWaterMask(mask: Container | null): void; // restricts the glitter to water
  setLandMask(mask: Container | null): void;  // restricts the shimmer to land
  wind(): { x: number; y: number };
  onCelestialEvent(cb: (kind: string) => void): void;
  triggerCelestial(kind: 'comet' | 'eclipse' | 'aurora' | 'meteors'): void;
  light(): CelestialLight;
  celestialPosition(): { x: number; y: number; kind: 'sun' | 'moon' } | null;
  brightStarPositions(): Array<{ x: number; y: number }>;
  setStormRate(v: number): void;             // temperament multiplier on storm frequency
  horizonColor(): number;                    // the sky's current horizon hue (dread lean included)
  /** Jump the day-night clock. A 360-second cycle means waiting six minutes to
   *  see dusk, which makes comparing two times of day a matter of patience
   *  rather than measurement. */
  setDayT(v: number): void;
  /** Override the terminator spread (null = use the configured value). */
  setTerminatorSpread(v: number | null): void;
  /** 0 in full sun, 1 on the unlit side, for a point in screen space. Cities
   *  light up by this, so the lights follow the terminator rather than a clock
   *  — the lit half of the world stays dark and the far half glows. */
  nightFactorAt(x: number, y: number): number;
  getDayT(): number;
  setLightAzimuth(v: number | null): void;   // pin the light's azimuth (null = resume cycle)
  setLightAltitude(v: number | null): void;  // pin the light's altitude
  setStarRotation(v: number): void;          // 0..1 of a full turn
  nameConstellation(): boolean;              // join bright stars into a figure (max 6)
  clearConstellations(): void;
  setGlitterStrength(v: number): void;       // multiplier on the band alpha
  setGlitterSteady(v: boolean): void;        // hold glints still at high playback speeds
  setStarBrightness(v: number): void;        // multiplier on star alpha
  setCurvature(v: number): void;   // 0..1, live scrub
  setPerspective(v: number): void; // 0..1, live scrub
  curvature(): number;
  perspective(): number;
  // Map a plane-texture point (world coords already scaled into the capture
  // texture) to its screen position on the curved globe — for screen-space
  // overlays (rockets, space elevators) that must reach past the horizon.
  project(texX: number, texY: number): { x: number; y: number };
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

  // The terminator: the part of the day-night light that is NOT the same
  // everywhere. `glazeLayer` above carries the brightest column's light as a
  // flat wash; this carries how much darker every other column is than that.
  //
  // The sun has had an azimuth all along and nothing on the ground read it, so
  // the whole globe brightened at once and dawn read as the image fading up
  // rather than as morning arriving somewhere. Each column here is sampled from
  // the SAME nine keyframes at its own local time, so the staging that was
  // already tuned is what sweeps across.
  const terminatorLayer = new Graphics();
  terminatorLayer.blendMode = 'multiply';
  terminatorLayer.alpha = 0;

  // The other half of a low sun: the warm colour it CASTS.
  //
  // The terminator only darkens — it is a multiply, and a multiply cannot add
  // light. So the unlit side went dusky and the sunward side never caught the
  // sunset at all, which is the difference between a globe with a shadow on it
  // and a globe with a sunset ON it. This is the same sphere, lit pole, warm,
  // added rather than multiplied, and it only exists when the sun is low.
  const sunCastLayer = new Graphics();
  sunCastLayer.blendMode = 'add';
  sunCastLayer.alpha = 0;
  // Runtime override for the spread, so an A/B can be measured on one build.
  // Toggling `visible` from outside does not work: `update()` recomputes it
  // from the gradient every frame and turns it straight back on, which is how
  // an earlier comparison sampled the same state twice and read as "no effect".
  let terminatorSpreadOverride: number | null = null;

  // Airlight: the era's air scattered back as light. Screen blend, so it lifts
  // the darks toward the air's colour instead of pressing everything down.
  // Invisible in the clear early eras, so it costs nothing until there is
  // something in the air.
  const airLayer = new Graphics();
  airLayer.blendMode = 'screen';
  airLayer.alpha = 0;
  airLayer.visible = false;

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
  let globeCircle: { cx: number; cy: number; r: number } | null = null;
  // The sun as a unit vector in screen space, kept so anything on the ground
  // can ask how lit a place is. Cities need it to know when to switch their
  // lights on.
  let sunVec = { x: 0, y: -1, z: 0 };

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
    // The globe as a circle in screen space. The terminator needs the actual
    // sphere — a left-to-right gradient across the frame is a wipe, not a lit
    // ball, which is exactly how the first version read.
    globeCircle = { cx: apexX, cy, r: R };
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

  // Water glitter: a path from the light at the horizon toward the observer at
  // the globe's front-center. It lives in world space (so it bends with the
  // planet), is masked to water by main.ts, and uses a soft base plus two glint
  // variants crossfading in counter-phase for twinkle.
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
  const constellationGfx = new Graphics();
  const milkyWayG = new Graphics();
  const planetG = new Graphics();
  const brightStarPos: Array<{ x: number; y: number }> = [];
  let constellationCount = 0;
  {
    const scatter = (g: Graphics, count: number, rMin: number, rMax: number, aMin: number, aMax: number, record: boolean) => {
      for (let i = 0; i < count; i++) {
        const ang = celestialRand() * Math.PI * 2;
        const dist = Math.sqrt(celestialRand()) * ATMOS.stars.fieldRadius;
        const roll = celestialRand();
        const color = roll < 0.82 ? 0xf2f4f8 : roll < 0.92 ? 0xcdd9f0 : 0xf0ddbe;
        const x = Math.cos(ang) * dist, y = Math.sin(ang) * dist;
        if (record) brightStarPos.push({ x, y });
        g.circle(x, y, rMin + celestialRand() * (rMax - rMin))
          .fill({ color, alpha: aMin + celestialRand() * (aMax - aMin) });
      }
    };
    scatter(brightStarsG, ATMOS.stars.brightCount, 1.1, 2.1, 0.7, 1.0, true);
    scatter(faintStarsG, ATMOS.stars.count, 0.5, 1.1, 0.35, 0.7, false);
    brightStarsG.alpha = 0;
    faintStarsG.alpha = 0;
    constellationGfx.alpha = 0;
    starLayer.addChild(milkyWayG);   // behind the stars
    starLayer.addChild(faintStarsG);
    starLayer.addChild(constellationGfx);
    starLayer.addChild(brightStarsG);
    starLayer.addChild(planetG);     // brightest, on top
  }

  // The Milky Way: a soft glowing band of countless faint stars across the dome.
  const fr = ATMOS.stars.fieldRadius;
  {
    const bandAng = 0.55; // tilt of the band across the field
    const ca = Math.cos(bandAng), sa = Math.sin(bandAng);
    for (let i = 0; i < 520; i++) {
      const along = (celestialRand() - 0.5) * 2 * fr;
      const across = (celestialRand() - celestialRand()) * fr * 0.16; // tight perpendicular spread
      const x = along * ca - across * sa, y = along * sa + across * ca;
      milkyWayG.circle(x, y, 0.5 + celestialRand() * 1.3)
        .fill({ color: celestialRand() < 0.5 ? 0xdfe6f5 : 0xe8e0f0, alpha: 0.03 + celestialRand() * 0.06 });
    }
  }
  // Planets: a few bright, steadily-coloured points wandering the dome.
  {
    const planetColors = [0xffd9a0, 0xff9e7a, 0xa8c8ff, 0xfff0c4];
    for (let i = 0; i < 4; i++) {
      const ang = celestialRand() * Math.PI * 2;
      const d = 220 + celestialRand() * (fr * 0.65);
      const px = Math.cos(ang) * d, py = Math.sin(ang) * d;
      planetG.circle(px, py, 2.3).fill({ color: planetColors[i], alpha: 1 });
      planetG.circle(px, py, 3.6).fill({ color: planetColors[i], alpha: 0.25 }); // tiny halo
    }
  }

  // Sun & moon overhead (behind the planet) and the rainbow (in front) —
  // drawn fresh each frame.
  const celestialLayer = new Graphics();
  const rainbowLayer = new Graphics();
  // Drifting clouds in the sky (upper band), lit by the time of day.
  const skyCloudLayer = new Container();
  const skyClouds: Array<{ sp: Sprite; x: number; yFrac: number; sc: number }> = [];
  for (let i = 0; i < 7; i++) {
    const sp = new Sprite(cloudTextures[i % cloudTextures.length]);
    sp.anchor.set(0.5);
    skyCloudLayer.addChild(sp);
    skyClouds.push({ sp, x: celestialRand(), yFrac: 0.02 + celestialRand() * 0.2, sc: 0.45 + celestialRand() * 0.7 });
  }
  // Constellations: astronomers join bright stars into a figure. The lines
  // live in the rotating dome and fade with the bright population.
  function nameConstellation(): boolean {
    if (constellationCount >= 6 || brightStarPos.length < 8) return false;
    // Anchor at a bright star in the comfortable viewing band.
    let anchor = -1;
    for (let tries = 0; tries < 30; tries++) {
      const i = Math.floor(Math.random() * brightStarPos.length);
      const d = Math.hypot(brightStarPos[i].x, brightStarPos[i].y);
      if (d > 250 && d < 1100) { anchor = i; break; }
    }
    if (anchor < 0) return false;
    const a = brightStarPos[anchor];
    const near = brightStarPos
      .map((p, i) => ({ p, i, d: Math.hypot(p.x - a.x, p.y - a.y) }))
      .filter((e) => e.i !== anchor && e.d < 380)
      .sort((e1, e2) => e1.d - e2.d)
      .slice(0, 4 + Math.floor(Math.random() * 2));
    if (near.length < 3) return false;
    // Order around the centroid for a plausible figure.
    const cx2 = (a.x + near.reduce((s, e) => s + e.p.x, 0)) / (near.length + 1);
    const cy2 = (a.y + near.reduce((s, e) => s + e.p.y, 0)) / (near.length + 1);
    const pts = [a, ...near.map((e) => e.p)]
      .sort((p1, p2) => Math.atan2(p1.y - cy2, p1.x - cx2) - Math.atan2(p2.y - cy2, p2.x - cx2));
    constellationGfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) constellationGfx.lineTo(pts[i].x, pts[i].y);
    constellationGfx.stroke({ color: 0xc8d4ea, alpha: 0.5, width: 0.7 });
    constellationCount++;
    return true;
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
  let stormRateMult = 1;
  let lastWind = { x: 0, y: 0 };

  // Rare celestial events.
  const cometLayer = new Graphics();
  const auroraLayer = new Container();
  // The aurora draws as additive, undulating gradient curtains (see the aurora
  // branch of updateCelestialEvents) rather than a few static ribbon sprites.
  const auroraGfx = new Graphics();
  auroraGfx.blendMode = 'add';
  auroraLayer.addChild(auroraGfx);
  let activeEvent: { kind: 'comet' | 'eclipse' | 'aurora' | 'meteors'; t: number; dur: number; a?: { x: number; y: number }; b?: { x: number; y: number }; seed?: number } | null = null;
  const meteorStreaks: Array<{ x: number; y: number; vx: number; vy: number; age: number; big?: boolean }> = [];
  let eventCooldown = 0;
  let eclipseMult = 1;
  let eventCb: ((kind: string) => void) | null = null;

  function startCelestial(kind: 'comet' | 'eclipse' | 'aurora' | 'meteors') {
    const E = ATMOS.events;
    const w = limbLayout?.width ?? 1600;
    const h = limbLayout?.height ?? 900;
    const dur = kind === 'comet' ? E.cometDurationSec : kind === 'eclipse' ? E.eclipseDurationSec
      : kind === 'meteors' ? E.meteorsDurationSec : E.auroraDurationSec;
    activeEvent = { kind, t: 0, dur };
    if (kind === 'comet') {
      const leftToRight = weatherRand() < 0.5;
      const y0 = h * (0.04 + weatherRand() * 0.06);
      const y1 = h * (0.14 + weatherRand() * 0.10);
      activeEvent.a = { x: leftToRight ? w * 0.06 : w * 0.94, y: y0 };
      activeEvent.b = { x: leftToRight ? w * 0.94 : w * 0.06, y: y1 };
    }
    if (kind === 'aurora') activeEvent.seed = weatherRand() * 1000;
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
      else if (L.nightness > 0.8 && roll(E.meteorsMeanSec)) startCelestial('meteors');
    }
    eclipseMult = 1;
    cometGfx_clear();
    if (!activeEvent || activeEvent.kind !== 'aurora') auroraGfx.clear(); // drop a stale curtain
    if (!activeEvent) return;
    activeEvent.t += dt;
    const p = activeEvent.t / activeEvent.dur;
    if (p >= 1) {
      activeEvent = null;
      eventCooldown = ATMOS.events.cooldownSec;
      auroraGfx.clear();
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
    } else if (activeEvent.kind === 'meteors') {
      const w = limbLayout?.width ?? 1600;
      const h = limbLayout?.height ?? 900;
      // A real shower: several streaks a second, mostly radiating one way with
      // the odd one against the grain, plus the occasional brighter fireball.
      // Fast attack so the shower is dense within a few seconds (not a slow ramp).
      const ramp = Math.max(0, Math.min(1, activeEvent.t / 4, (activeEvent.dur - activeEvent.t) / 12));
      let expected = dt / 0.08 * ramp;     // ~12 / sec at peak — a busy shower
      while (expected > 0) {
        if (expected < 1 && Math.random() > expected) break;
        expected -= 1;
        const ang2 = Math.PI * (0.13 + Math.random() * 0.28);
        const sp = 240 + Math.random() * 260;
        const dir = Math.random() < 0.82 ? 1 : -1; // most share a radiant
        const big = Math.random() < 0.12;
        meteorStreaks.push({
          x: w * (-0.05 + Math.random() * 1.1),
          y: h * (0.01 + Math.random() * 0.26),
          vx: Math.cos(ang2) * sp * dir,
          vy: Math.sin(ang2) * sp,
          age: 0,
          big,
        });
      }
    } else if (activeEvent.kind === 'aurora') {
      // Its own envelope: brighten within a few seconds, hold, then ease away —
      // rather than the slow sin() ramp that stays dim for most of the event.
      const aenv = Math.min(1, activeEvent.t / 6, (activeEvent.dur - activeEvent.t) / 16);
      drawAurora(activeEvent.t, Math.max(0, aenv) * L.nightness, activeEvent.seed ?? 0);
    }
  }
  function cometGfx_clear() { cometLayer.clear(); }

  function updateMeteorStreaks(dt: number, nightness: number) {
    if (meteorStreaks.length === 0) return;
    for (let i = meteorStreaks.length - 1; i >= 0; i--) {
      const m = meteorStreaks[i];
      const life = m.big ? 1.0 : 0.7;
      m.age += dt;
      if (m.age > life) { meteorStreaks.splice(i, 1); continue; }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const fade = 1 - m.age / life;
      const a = fade * (m.big ? 0.95 : 0.8) * nightness;
      const tail = m.big ? 0.10 : 0.06, wid = m.big ? 1.9 : 1.0;
      // Tapered tail: a couple of stacked strokes, brightest near the head.
      cometLayer.moveTo(m.x - m.vx * tail, m.y - m.vy * tail).lineTo(m.x, m.y)
        .stroke({ color: 0x9fb6d6, alpha: a * 0.4, width: wid });
      cometLayer.moveTo(m.x - m.vx * tail * 0.5, m.y - m.vy * tail * 0.5).lineTo(m.x, m.y)
        .stroke({ color: 0xe8eef8, alpha: a, width: wid });
      // A bright little head, larger for fireballs.
      cometLayer.circle(m.x, m.y, m.big ? 2.2 : 1.1).fill({ color: 0xffffff, alpha: a });
      if (m.big) cometLayer.circle(m.x, m.y, 5).fill({ color: 0xbfe0ff, alpha: a * 0.3 });
    }
  }

  // Aurora: additive, undulating gradient curtains — a green body with a
  // magenta-violet lower fringe and pale cyan fading top, draped along a
  // rippling baseline with shimmering vertical ray structure.
  function drawAurora(t: number, amount: number, seed: number) {
    auroraGfx.clear();
    if (amount <= 0.01) return;
    const w = limbLayout?.width ?? 1600;
    const h = limbLayout?.height ?? 900;
    // Hang the curtains in the sky band above the horizon (the globe, behind
    // which this layer sits, occludes anything that drapes below the limb).
    const horizon = limbLayout?.apexY ?? h * 0.24;
    const yTopBase = h * 0.02;            // crowns of the curtains, near the top
    const yBotBase = horizon - h * 0.01;  // draped hems, just above the horizon
    const cols = 130;
    const step = w / cols;
    // Vertical colour ramp (bottom → top), as [frac, color, alphaMul].
    const ramp: Array<[number, number, number]> = [
      [0.00, 0xb84ad0, 0.5],  // magenta-violet lower fringe (an accent, not the body)
      [0.13, 0x4dffa6, 1.2],  // bright green — the dominant body
      [0.45, 0x57ecc8, 1.05], // teal
      [0.74, 0x9af0e4, 0.55], // pale cyan
      [1.00, 0xbfeafc, 0.0],  // fades out at the crown
    ];
    for (let i = 0; i <= cols; i++) {
      const x = i * step;
      const ph = x * 0.5 + seed;
      // The hem ripples and folds (sum of waves); the crown sways more gently.
      const hem = Math.sin(x * 0.011 + t * 0.55) * 18
        + Math.sin(x * 0.0047 - t * 0.37) * 22
        + Math.sin(x * 0.021 + t * 0.9) * 7;
      const crown = Math.sin(x * 0.006 + t * 0.3 + seed) * 10;
      const yBot = yBotBase + hem;
      const yTop = yTopBase + crown + (1 - (0.72 + 0.28 * Math.sin(x * 0.03 + t * 1.1 + seed))) * (yBot - yTopBase) * 0.4;
      const H = yBot - yTop;
      if (H < 4) continue;
      // Per-ray shimmer gives vertical striations that ripple along the curtain.
      const shim = 0.4 + 0.6 * Math.max(0, Math.sin(ph * 0.16 + t * 2.1 + Math.sin(t * 0.7 + ph * 0.02) * 2.4));
      const a = amount * shim;
      if (a < 0.012) continue;
      // Draw the ray bottom-up as stacked gradient segments.
      const segs = 8;
      for (let s = 0; s < segs; s++) {
        const f0 = s / segs, f1 = (s + 1) / segs; // 0 = hem (bottom), 1 = crown
        const ya = yBot - H * f0, yb = yBot - H * f1;
        const fm = (f0 + f1) / 2;
        let ci = 0;
        while (ci < ramp.length - 1 && ramp[ci + 1][0] < fm) ci++;
        const [fa, ca, aa] = ramp[ci], [fb, cb, ab] = ramp[Math.min(ramp.length - 1, ci + 1)];
        const lt = fb > fa ? (fm - fa) / (fb - fa) : 0;
        const col = lerpColor(ca, cb, lt);
        const segA = a * (aa + (ab - aa) * lt);
        if (segA < 0.01) continue;
        auroraGfx.rect(x - step * 0.62, yb, step * 1.24, ya - yb)
          .fill({ color: col, alpha: Math.min(0.3, segA * 0.29) });
      }
    }
  }

  // Traveling storm: a heavy, rarer drifter with rain and lightning.
  const stormLayer = new Container();
  const stormClouds: Sprite[] = [];
  const stormCloudOffsets: Array<{ x: number; y: number; s: number }> = [];
  for (let i = 0; i < 5; i++) {
    const sp = new Sprite(cloudTextures[i % cloudTextures.length]);
    sp.anchor.set(0.5);
    sp.tint = 0x474c55;
    sp.blendMode = 'multiply';
    sp.alpha = 0;
    stormLayer.addChild(sp);
    stormClouds.push(sp);
    stormCloudOffsets.push({
      x: (weatherRand() - 0.5) * 240,
      y: (weatherRand() - 0.5) * 110,
      s: 2.2 + weatherRand() * 1.6,
    });
  }
  const rainGfx = new Graphics();
  stormLayer.addChild(rainGfx);
  const lightningSprite = new Sprite(cloudTextures[0]);
  lightningSprite.anchor.set(0.5);
  lightningSprite.tint = 0xeef2ff;
  lightningSprite.blendMode = 'add';
  lightningSprite.alpha = 0;
  stormLayer.addChild(lightningSprite);
  let storm: { x: number; y: number; t: number } | null = null;
  let lightningFlash = 0;

  function updateStorm(dt: number, wx: number, wy: number, L: CelestialLight) {
    const S = ATMOS.storm;
    if (!storm) {
      if (Math.random() < (dt / S.meanSec) * stormRateMult) {
        // Enter upwind so the cell crosses the world.
        const fromX = wx >= 0 ? DRIFT.minX - 200 : DRIFT.maxX + 200;
        storm = { x: fromX, y: 200 + weatherRand() * 1100, t: 0 };
      } else {
        return;
      }
    }
    storm.t += dt;
    const u = storm.t / S.durationSec;
    if (u >= 1) {
      storm = null;
      for (const sp of stormClouds) sp.alpha = 0;
      rainGfx.clear();
      lightningSprite.alpha = 0;
      return;
    }
    const speed = Math.max(14, Math.hypot(wx, wy) * 1.6);
    const dirX = wx >= 0 ? 1 : -1;
    storm.x += dirX * speed * dt;
    storm.y += wy * 0.6 * dt;
    const env = Math.sin(Math.PI * Math.min(1, u * 1.15));
    for (let i = 0; i < stormClouds.length; i++) {
      const sp = stormClouds[i];
      const o = stormCloudOffsets[i];
      sp.position.set(storm.x + o.x, storm.y + o.y);
      sp.scale.set(o.s, o.s * 0.7);
      sp.alpha = ATMOS.storm.alpha * env;
    }
    // Rain: a handful of slanted streaks beneath the cluster, jittered.
    rainGfx.clear();
    for (let i = 0; i < 16; i++) {
      const rx = storm.x + (weatherRand() - 0.5) * 260;
      const ry = storm.y + 40 + weatherRand() * 90;
      rainGfx.moveTo(rx, ry).lineTo(rx - 3, ry + 9)
        .stroke({ color: 0x9fb2c8, alpha: S.rainAlpha * env, width: 1 });
    }
    // Lightning at night: a one-flash glow that decays fast.
    if (L.nightness > 0.4 && Math.random() < dt / S.lightningMeanSec) lightningFlash = 1;
    if (lightningFlash > 0.01) {
      lightningFlash *= Math.exp(-dt * 12);
      lightningSprite.position.set(storm.x, storm.y);
      lightningSprite.scale.set(3.2, 2.2);
      lightningSprite.alpha = lightningFlash * 0.75 * env;
    } else {
      lightningSprite.alpha = 0;
    }
  }

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
  let glitterSteady = false;
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
  // Bend a single plane-texture point (x, y) the same way applyCurve bends the
  // mesh vertices. Shared by the mesh remap and the public project() helper, so
  // screen-space overlays can sit exactly where a world tile lands on the globe.
  function curvePoint(x: number, y: number, texH: number): [number, number] {
    if (!planeGeom) return [x, y];
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
    return [nx, ny];
  }
  function applyCurve() {
    if (!attachedPlane || !planeBasePositions || !planeGeom) return;
    const geo = attachedPlane.geometry;
    const texH = (geo as any).height as number;
    const base = planeBasePositions;
    const out = new Float32Array(base.length);
    for (let i = 0; i < base.length; i += 2) {
      const [nx, ny] = curvePoint(base[i], base[i + 1], texH);
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
    airLayer.clear();
    airLayer.rect(0, 0, width, height).fill(0xffffff);
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
    // Glaze: time-of-day light, cast by season, hazed by the era's air. Flat,
    // as it always was — the spherical layer below adds the direction.
    let glazeColor = lerpColor(day.glaze, season.cast, season.castAmount);
    glazeColor = lerpColor(glazeColor, eraAirCur.air, eraAirCur.amount);
    const glazeAlpha = Math.min(
      ATMOS.day.glazeCap,
      day.glazeAlpha + season.castAmount * 0.5 + eraAirCur.amount * 0.28,
    );
    glazeLayer.tint = glazeColor;
    glazeLayer.alpha = glazeAlpha;
    glazeLayer.visible = glazeLayer.alpha > 0.004;

    // --- the terminator, as a lit sphere ------------------------------------
    //
    // Lambert shading on the real globe, not a gradient across the frame. Each
    // texel of a small canvas is turned into a point on the sphere, given a
    // surface normal, and dotted with the sun's direction. That is what makes
    // it read as a ball with a light on one side rather than as a wipe passing
    // across — the difference Lawrence spotted immediately.
    //
    // The sun already has `azimuth` and `altitude`; this is the first thing on
    // the ground to use them. High sun lights the whole visible face evenly and
    // the layer costs nothing; low sun throws a soft terminator that wraps with
    // the curvature.
    const spread = terminatorSpreadOverride ?? ATMOS.day.terminatorSpread;
    let nightDepth = 0;
    if (globeCircle && spread > 0) {
      // How dark the unlit side gets, over and above the flat glaze. Bounded so
      // the two together never pass the legibility floor.
      // Bounded by `terminatorMax`, NOT by `glazeCap`. The cap is a floor on
      // how dark the whole world may get — a legibility rule about the flat
      // wash. This is directional: it darkens one side of the globe while the
      // other is being lit, so borrowing the global ceiling held the night
      // side to whatever the flat glaze had left over, which at sunset was
      // about 0.29 and read as haze rather than as night.
      // Same reason: after sunset the whole visible face is night, and
      // darkening it directionally by where the MOON happens to be would carve
      // a second, wrong terminator across a world that is already dark.
      nightDepth = curLight.isDay
        ? Math.max(0, Math.min(ATMOS.day.terminatorMax, spread * 6.4))
        : 0;
    }
    terminatorLayer.visible = nightDepth > 0.004;
    sunCastLayer.visible = false; // set below, only when the sphere is known
    if (terminatorLayer.visible && globeCircle) {
      const { cx, cy, r } = globeCircle;
      // Sun direction. Azimuth runs 0..1 left to right; altitude 0..1 is the
      // arc height, so a rising sun points along the surface and a high one
      // points at the viewer.
      const az = (curLight.azimuth - 0.5) * 2;
      const alt = curLight.altitude;
      let lx = az;
      let ly = -alt * 0.9;
      let lz = Math.sqrt(Math.max(0.02, 1 - lx * lx - ly * ly));
      const ll = Math.hypot(lx, ly, lz);
      lx /= ll; ly /= ll; lz /= ll;
      sunVec = { x: lx, y: ly, z: lz };
      const dark = sampleDay((((dayT + spread) % 1) + 1) % 1);
      let darkColor = lerpColor(dark.glaze, season.cast, season.castAmount);
      darkColor = lerpColor(darkColor, eraAirCur.air, eraAirCur.amount);

      terminatorLayer.clear();
      // Concentric bands of constant N·L. Drawn as rings on the sphere's
      // projection rather than as a texture: the plainest fill the API has, and
      // the previous attempt lost a whole debugging session to a texture that
      // uploaded blank and a gradient whose colour stops dropped their alpha.
      const BANDS = 26;
      // Stacked discs centred on the ANTI-solar pole, growing outward. A point
      // deep on the night side falls inside every disc and accumulates the full
      // darkening; a point near the lit pole falls inside none.
      //
      // The first attempt centred them on the LIT pole with alpha growing with
      // radius, so the largest and darkest disc covered the entire globe — a
      // uniform wash with a little extra darkness exactly where the sun was.
      // It measured as ~3 luminance units and no left-right difference, which
      // is what "inverted" looks like from the outside.
      const ax = cx - lx * r * 0.92;
      const ay = cy - ly * r * 0.92;
      // Per-disc alpha that accumulates to `nightDepth` over all of them.
      const per = 1 - Math.pow(1 - nightDepth, 1 / BANDS);
      for (let i = 0; i < BANDS; i++) {
        const t = (i + 1) / BANDS;
        // Radius shrinks as the stack deepens, so the falloff is soft at the
        // terminator and solid at the anti-solar pole.
        const br = r * (1.95 - 1.5 * t);
        terminatorLayer.circle(ax, ay, br).fill({ color: darkColor, alpha: per });
      }
      terminatorLayer.alpha = 1;

      // --- the warm cast on the sunward side ------------------------------
      // Strongest when the sun is near the horizon and gone by noon: a high
      // sun is white and washes nothing. `skyHorizon` is the colour already in
      // the sky at this moment, so the land catches the same sunset the sky is
      // showing rather than a second, invented one.
      // Daylight only. `curLight` hands over to the MOON after sunset, and a
      // rising moon has a low altitude — so this was painting a sunset onto the
      // world at three in the morning and washing the night out completely.
      // The moon does not cast a sunset.
      const lowSun = curLight.isDay ? Math.pow(1 - Math.min(1, alt / 0.55), 1.4) : 0;
      const castStrength = lowSun * ATMOS.day.sunCastMax;
      sunCastLayer.visible = castStrength > 0.004;
      if (sunCastLayer.visible) {
        const warm = lerpColor(day.skyHorizon, season.cast, season.castAmount * 0.5);
        sunCastLayer.clear();
        const px = cx + lx * r * 0.92;
        const py = cy + ly * r * 0.92;
        const CAST_BANDS = 20;
        const castPer = 1 - Math.pow(1 - castStrength, 1 / CAST_BANDS);
        for (let i = 0; i < CAST_BANDS; i++) {
          const t = (i + 1) / CAST_BANDS;
          // Mirror of the terminator: discs on the LIT pole, shrinking as they
          // stack, so the warmth is strongest where the sun actually strikes
          // and falls off around the curve.
          const br = r * (1.35 - 1.05 * t);
          sunCastLayer.circle(px, py, br).fill({ color: warm, alpha: castPer });
        }
        sunCastLayer.alpha = 1;
      }
    }

    // …and the matching lift. Alpha follows the era's air alone, so the clear
    // ages never pay for the layer at all.
    airLayer.tint = eraAirCur.air;
    airLayer.alpha = eraAirCur.amount * ATMOS.era.airlight;
    airLayer.visible = airLayer.alpha > 0.004;

    // The limb haze follows the sky's horizon color (including the dread
    // lean) and fades in with the curvature knob.
    limbBandGfx.tint = horizon;
    limbBandGfx.alpha = ATMOS.curve.limbHazeAlpha * curCurvature;

    // --- Celestial light ---------------------------------------------------
    curLight = computeLight();
    updateCelestialEvents(dt, curLight);
    updateMeteorStreaks(dt, curLight.nightness);
    if (!curLight.isDay) curLight.intensity *= eclipseMult;
    updateBirds(dt, curLight);
    const L = curLight;

    // Water glitter / moon path: the band slides with the light's azimuth,
    // glint variants crossfade for twinkle. Intensity passes through zero at
    // twilight, so the day/night width and alpha changes never pop. At high
    // playback speeds the glints hold at their average brightness instead of
    // turning the accelerated twinkle into a rapid flash.
    const gl = ATMOS.glitter;
    if (!glitterSteady) twinklePhase += dt * gl.twinkleSpeed * Math.PI * 2;
    const bandAlpha = (L.isDay ? gl.dayAlpha : gl.nightAlpha) * L.intensity * glitterStrengthMult;
    const bandWidth = (L.isDay ? gl.dayWidthFrac : gl.nightWidthFrac) * 3200;
    const bandY = -110;
    const bandHeight = 1720;
    const viewWidth = limbLayout?.width ?? 3200 * ATMOS.composition.worldScale;
    const targetScreenX = L.azimuth * viewWidth;
    let bandTopX = (targetScreenX - viewWidth / 2) / ATMOS.composition.worldScale;
    if (attachedPlane && planeGeom) {
      // The outer MeshPlane pinches the horizon toward its center. Invert that
      // pinch so the reflection's far end projects to the celestial body's
      // actual screen x instead of drifting outward with the capture width.
      const horizonPinch = 1 - curPerspective * ATMOS.curve.pinchMaxFrac;
      const targetPlaneX = targetScreenX - attachedPlane.x;
      const targetTexX = planeGeom.apex.x
        + (targetPlaneX - planeGeom.apex.x) / horizonPinch;
      bandTopX = (targetTexX - planeGeom.apex.x) / ATMOS.composition.worldScale;
    }
    // A specular path runs from the light toward the viewer. Shearing the
    // world-space band makes its near end meet the front-center of the globe;
    // the outer curve then foreshortens the whole path with the surface.
    const observerSkew = Math.atan(-bandTopX / bandHeight);
    for (const sp of [glitterBase, glintA, glintB]) {
      sp.tint = L.color;
      sp.position.set(bandTopX, bandY);
      sp.width = bandWidth;
      sp.height = bandHeight;
      sp.skew.x = observerSkew;
    }
    glitterBase.alpha = bandAlpha * 0.5;
    const glintAAlpha = glitterSteady ? 0.55 : 0.55 + 0.45 * Math.sin(twinklePhase);
    const glintBAlpha = glitterSteady ? 0.55 : 0.55 + 0.45 * Math.cos(twinklePhase);
    glintA.alpha = bandAlpha * glintAAlpha;
    glintB.alpha = bandAlpha * glintBAlpha;

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
    constellationGfx.alpha = brightStarsG.alpha * 0.55;

    // The land itself drifts with the season (ambered autumns, pale winters).
    // Only assign when it actually moves — a redundant per-frame tint write on
    // a cacheAsTexture container can dirty the cache on some Pixi paths.
    if (attachedBiomeLayer && attachedBiomeLayer.tint !== season.biomeTint) {
      attachedBiomeLayer.tint = season.biomeTint;
    }

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
    updateStorm(dt, wx, wy, curLight);
    // Wind shimmer: same drift machinery, faster, daylight-gated. (curLight
    // is last frame's value here — a one-frame lag, invisible.)
    const shimmerAlpha = ATMOS.shimmer.alpha * curLight.intensity * (curLight.isDay ? 1 : 0.3);
    const extraMult = ATMOS.shimmer.speedMult - 1;
    for (const d of shimmerDrifters) {
      advance(d, shimmerAlpha, false);
      d.sp.x += wx * extraMult * d.speedMult * dt;
      d.sp.y += wy * extraMult * d.speedMult * dt;
    }

    // --- Sky: sun & moon overhead, drifting clouds, deep-sky glow ---
    milkyWayG.alpha = faintStarsG.alpha * 0.85;
    planetG.alpha = brightStarsG.alpha;
    if (limbLayout) {
      const w = limbLayout.width, h = limbLayout.height;
      // Drifting sky clouds — lit warm-white by day, grey and thin by night.
      const dayAmt = 1 - L.nightness;
      const cloudTint = lerpColor(0x5b6678, lerpColor(0xffffff, L.color, 0.35), dayAmt);
      const cloudAlpha = 0.06 + 0.26 * dayAmt;
      const driftDir = wx >= 0 ? 1 : -1;
      for (const cl of skyClouds) {
        cl.x += driftDir * 0.012 * dt;
        if (cl.x > 1.18) cl.x -= 1.36;
        if (cl.x < -0.18) cl.x += 1.36;
        cl.sp.x = cl.x * w;
        cl.sp.y = cl.yFrac * h;
        cl.sp.scale.set(cl.sc * 0.62, cl.sc * 0.4);
        cl.sp.tint = cloudTint;
        cl.sp.alpha = cloudAlpha;
      }

      // The sun or the moon — it rises from behind the globe (celestialLayer is
      // behind the world plane) and climbs into the sky. The moon stays full:
      // at this scale, phases read as clipping rather than celestial detail.
      celestialLayer.clear();
      const bx = L.azimuth * w;
      const by = h * (0.22 - 0.16 * L.altitude); // low (behind the limb) → high in the sky
      const fade = Math.min(1, L.altitude * 3.2); // sink into the horizon haze
      if (L.isDay) {
        const a = fade;
        celestialLayer.circle(bx, by, 70).fill({ color: 0xfff1c2, alpha: 0.05 * a });
        celestialLayer.circle(bx, by, 34).fill({ color: 0xfff0bb, alpha: 0.13 * a });
        celestialLayer.circle(bx, by, 46).stroke({ color: 0xfff2d2, alpha: 0.06 * a, width: 3 }); // halo
        celestialLayer.circle(bx, by, 12).fill({ color: 0xfff7e2, alpha: 0.9 * a });
        celestialLayer.circle(bx, by, 8).fill({ color: 0xfffdf4, alpha: 0.98 * a });
      } else {
        const a = Math.max(0.55, L.nightness) * fade;
        const R = 11;
        celestialLayer.circle(bx, by, R * 2.4).fill({ color: 0xc2cee2, alpha: 0.05 * a });   // glow
        celestialLayer.circle(bx, by, R).fill({ color: 0xe2e8f4, alpha: 0.94 * a });          // lit disk
        celestialLayer.circle(bx - 3, by - 2, 2.0).fill({ color: 0xc6cedc, alpha: 0.5 * a }); // maria
        celestialLayer.circle(bx + 2.5, by + 3, 1.4).fill({ color: 0xc6cedc, alpha: 0.4 * a });
      }

      // Rainbow (front of the planet): a soft arc when a storm breaks up by day.
      rainbowLayer.clear();
      if (storm && L.isDay && L.altitude > 0.18) {
        const su = storm.t / ATMOS.storm.durationSec;
        const fresh = Math.max(0, Math.sin(Math.PI * Math.min(1, su * 1.15))) * Math.max(0, Math.min(1, (su - 0.35) / 0.3));
        if (fresh > 0.01) {
          const rx = w * 0.5, ry = h * 1.05, rad = h * 0.6;
          const cols = [0xe06a6a, 0xe0b86a, 0xd9e06a, 0x6fcf8a, 0x6aa8e0, 0x9a7ad9];
          for (let bi = 0; bi < cols.length; bi++) {
            rainbowLayer.arc(rx, ry, rad + bi * 3.2, Math.PI * 1.2, Math.PI * 1.8)
              .stroke({ color: cols[bi], alpha: 0.15 * fresh, width: 3 });
          }
        }
      }

      // Ambient shooting stars: the odd faint streak on a clear night.
      if (L.nightness > 0.5 && !activeEvent && Math.random() < dt / 14) {
        const ang2 = Math.PI * (0.15 + Math.random() * 0.25);
        const sp = 240 + Math.random() * 160;
        meteorStreaks.push({ x: w * (0.1 + Math.random() * 0.8), y: h * (0.02 + Math.random() * 0.16),
          vx: Math.cos(ang2) * sp * (Math.random() < 0.5 ? 1 : -1), vy: Math.sin(ang2) * sp, age: 0 });
      }
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
      case 'volcano': {
        // Cooled flows radiating from the vent, an ash blanket, and an ember
        // at the center that the long fade slowly extinguishes.
        blotch(g, rand, x, y, 0, r * 0.30, C.volcanoBasalt, 0.55, 22, 0.9);
        for (let i = 0; i < 5; i++) {
          const ang = rand() * Math.PI * 2;
          const segs = 5 + Math.floor(rand() * 4);
          let px = x, py = y;
          for (let s2 = 0; s2 < segs; s2++) {
            const nx2 = px + Math.cos(ang + (rand() - 0.5) * 0.5) * r * 0.12;
            const ny2 = py + Math.sin(ang + (rand() - 0.5) * 0.5) * r * 0.06;
            g.moveTo(px, py).lineTo(nx2, ny2)
              .stroke({ color: C.volcanoBasalt, alpha: 0.5 * (1 - s2 / segs), width: 3.5 * (1 - s2 / segs) + 1 });
            px = nx2; py = ny2;
          }
        }
        blotch(g, rand, x, y, r * 0.25, r * 0.9, C.volcanoAsh, 0.20, 40, 0.8);
        g.circle(x, y, 2.4).fill({ color: C.volcanoEmber, alpha: 0.8 });
        g.circle(x, y, 5).fill({ color: C.volcanoEmber, alpha: 0.25 });
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
    nightFactorAt: (x: number, y: number) => {
      if (!globeCircle) return curLight.nightness;
      const { cx, cy, r } = globeCircle;
      const dx = (x - cx) / r;
      const dy = (y - cy) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) return curLight.nightness;
      const nz = Math.sqrt(1 - d2);
      // After sunset there is no lit side to be on: the sun is down for the
      // whole visible face, so every city should be lit regardless of where the
      // moon is. Keying this to `curLight` alone put the lights out on the
      // moonlit half.
      if (!curLight.isDay) return 1;
      const nd = dx * sunVec.x + dy * sunVec.y + nz * sunVec.z;
      return Math.max(curLight.nightness, Math.max(0, Math.min(1, 1 - nd)));
    },
    setDayT: (v: number) => { dayT = ((v % 1) + 1) % 1; },
    setTerminatorSpread: (v: number | null) => { terminatorSpreadOverride = v; },
    getDayT: () => dayT,
    skyLayer, glazeLayer, terminatorLayer, sunCastLayer, airLayer, scarLayer, cloudShadowLayer, fogLayer,
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
    limbGeometry: () => {
      if (!limbLayout) return null;
      const c = ATMOS.curve;
      const sag = curCurvature * c.limbSagMax * (limbLayout.width / 2);
      if (sag < 2) return null; // flat world, no horizon circle
      const halfW = limbLayout.width / 2 + 80;
      const R = (halfW * halfW + sag * sag) / (2 * sag);
      return { cx: limbLayout.apexX, cy: limbLayout.apexY + R, R, apexY: limbLayout.apexY };
    },
    glitterLayer,
    landLightLayer: landLightSprite,
    starLayer,
    setWaterMask: (mask: Container | null) => { glitterLayer.mask = mask; },
    shimmerLayer,
    birdLayer,
    stormLayer,
    cometLayer,
    auroraLayer,
    celestialLayer,
    skyCloudLayer,
    rainbowLayer,
    setLandMask: (mask: Container | null) => { shimmerLayer.mask = mask; },
    wind: () => lastWind,
    onCelestialEvent: (cb: (kind: string) => void) => { eventCb = cb; },
    triggerCelestial: (kind: 'comet' | 'eclipse' | 'aurora' | 'meteors') => { startCelestial(kind); },
    light: () => curLight,
    celestialPosition: () => {
      if (!limbLayout || curLight.altitude < 0.025) return null;
      return {
        x: curLight.azimuth * limbLayout.width,
        y: limbLayout.height * (0.22 - 0.16 * curLight.altitude),
        kind: curLight.isDay ? 'sun' : 'moon',
      };
    },
    brightStarPositions: () => {
      if (!limbLayout || curLight.nightness < 0.25) return [];
      const ca = Math.cos(starRotation), sa = Math.sin(starRotation);
      const px = starLayer.position.x, py = starLayer.position.y;
      return brightStarPos.map((p) => ({
        x: px + p.x * ca - p.y * sa,
        y: py + p.x * sa + p.y * ca,
      }));
    },
    // The world's temperament reaches the weather: a wet planet storms far more
    // often than a dry one. Set from the sim's character in main.ts.
    setStormRate: (v: number) => { stormRateMult = Math.max(0, v); },
    // The sky's current horizon color, dread lean included. Anything that has
    // to melt into the horizon (the depth haze in main.ts) tints to this.
    horizonColor: () => lastSkyHorizon,
    setLightAzimuth: (v: number | null) => { lightAzOverride = v == null ? null : Math.max(0, Math.min(1, v)); },
    setLightAltitude: (v: number | null) => { lightAltOverride = v == null ? null : Math.max(0, Math.min(1, v)); },
    setStarRotation: (v: number) => { starRotation = v * Math.PI * 2; },
    nameConstellation,
    clearConstellations: () => { constellationGfx.clear(); constellationCount = 0; },
    setGlitterStrength: (v: number) => { glitterStrengthMult = Math.max(0, v); },
    setGlitterSteady: (v: boolean) => { glitterSteady = v; },
    setStarBrightness: (v: number) => { starBrightnessMult = Math.max(0, v); },
    setCurvature: (v: number) => { curCurvature = Math.max(0, Math.min(1, v)); applyCurve(); layoutLimb(); },
    setPerspective: (v: number) => { curPerspective = Math.max(0, Math.min(1, v)); applyCurve(); },
    curvature: () => curCurvature,
    perspective: () => curPerspective,
    project: (texX: number, texY: number) => {
      if (!attachedPlane) return { x: texX, y: texY };
      const texH = (attachedPlane.geometry as any).height as number;
      const [nx, ny] = curvePoint(texX, texY, texH);
      return { x: attachedPlane.x + nx, y: attachedPlane.y + ny };
    },
    update, addScar, clearScars, layout,
    timeOfDay: () => dayT,
    setTimeOfDay: (t: number) => { dayT = ((t % 1) + 1) % 1; },
    seasonOfYear: () => seasonT,
    setSeasonOfYear: (t: number) => { seasonT = ((t % 1) + 1) % 1; },
  };
}
