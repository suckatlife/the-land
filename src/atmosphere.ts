// src/atmosphere.ts — sky, day/night light, and persistent catastrophe scars.
// Render-side module (Pixi allowed here; sim.ts stays Pixi-free).
//
// EVERYTHING TUNEABLE LIVES IN `ATMOS` BELOW. The intent is that taste can be
// adjusted entirely by editing this block: palette keyframes, cycle length,
// glaze ceilings, scar lifetimes and colors. The systems read these live.

import { Container, Graphics, Sprite, Texture, BlurFilter } from 'pixi.js';
import { gridToScreen, lerpColor } from './iso';
import type { CatastropheType } from './sim';

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
  dreadSkyBlend: 0.55,

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

export interface Atmosphere {
  skyLayer: Sprite;
  glazeLayer: Graphics;
  scarLayer: Container;
  update(deltaMS: number, dread: number, dreadSkyColor: number | null): void;
  addScar(type: CatastropheType, row: number, col: number, radiusTiles: number, severity: number): void;
  clearScars(): void;
  layout(width: number, height: number): void;
  timeOfDay(): number;
  setTimeOfDay(t: number): void; // scrub the day cycle (debug/tuning)
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

  let dayT = ATMOS.day.startT;
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

  function update(deltaMS: number, dread: number, dreadSkyColor: number | null) {
    nowMs += deltaMS;
    dayT = (dayT + deltaMS / (ATMOS.day.cycleSeconds * 1000)) % 1;
    const day = sampleDay(dayT);

    // The sky leans toward the brewing hue as dread rises.
    let top = day.skyTop;
    let horizon = day.skyHorizon;
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

    glazeLayer.tint = day.glaze;
    glazeLayer.alpha = Math.min(ATMOS.day.glazeCap, day.glazeAlpha);

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
    skyLayer, glazeLayer, scarLayer,
    update, addScar, clearScars, layout,
    timeOfDay: () => dayT,
    setTimeOfDay: (t: number) => { dayT = ((t % 1) + 1) % 1; },
  };
}
