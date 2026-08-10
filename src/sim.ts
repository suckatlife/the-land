import { type Biome, SEA_LEVEL, SHORE_LEVEL } from './biomes';
import { generateName, evolveName } from './names';

export type TileState = 'wild' | 'cleared' | 'built' | 'ruin';
export type CivPhase = 'rising' | 'stable' | 'declining' | 'dead';
export type Era = 'neolithic' | 'classical' | 'medieval' | 'industrial' | 'modern' | 'post';

export const ERAS_ORDERED: Era[] = ['neolithic', 'classical', 'medieval', 'industrial', 'modern', 'post'];

export function eraRank(e: Era): number {
  return ERAS_ORDERED.indexOf(e);
}

export type CatastropheType = 'plague' | 'asteroid' | 'flood' | 'earthquake' | 'volcano';

export type SimEvent =
  | { kind: 'civ_born'; civId: number }
  | { kind: 'civ_declining'; civId: number }
  | { kind: 'civ_died'; civId: number }
  | { kind: 'colony_founded'; civId: number; desperate: boolean }
  | { kind: 'breakaway'; newCivId: number; parentId: number }
  | { kind: 'catastrophe'; centerRow: number; centerCol: number; affectedCivIds: number[]; severity: number; catastropheType: CatastropheType; radius: number }
  | { kind: 'city_fell'; civId: number; cityName: string; prominence: number; wasCapital: boolean }
  | { kind: 'capital_moved'; civId: number; oldCapitalName: string; newCapitalName: string }
  // Suspense events:
  | { kind: 'omen'; stage: 1 | 2 | 3; catastropheType: CatastropheType; severity: number }
  | { kind: 'refuge_founded'; civId: number; parentName: string }
  | { kind: 'conquest'; row: number; col: number; attackerId: number; defenderId: number }
  | { kind: 'island_rising'; row: number; col: number }
  | { kind: 'island_born'; row: number; col: number }
  | { kind: 'land_bridge'; row: number; col: number }
  | { kind: 'rift_opened'; row: number; col: number }
  | { kind: 'wonder_built'; civId: number; row: number; col: number }
  | { kind: 'migration'; row: number; col: number }
  | { kind: 'spared'; civId: number; catastropheType: CatastropheType }
  | { kind: 'rally'; civId: number }
  | { kind: 'last_flight'; civId: number }
  | { kind: 'ice_advance' }
  | { kind: 'ice_peak' }
  | { kind: 'ice_retreat' };

export type BiomeChange = { row: number; col: number };

// --- Per-era visual treatment (tune these by eye) ---

export interface EraTreatment {
  satMult: number;     // saturation multiplier (1 = unchanged)
  brightMult: number;  // lightness multiplier
  borderAlpha: number; // overlay border opacity (0 = no border)
  borderWidth: number; // border stroke width in px
  borderColor: number; // border color as hex
  postTint: number | null; // hex color to blend 12% toward for post-era weirdness
  ruinColor: number;   // base color for ruins of this era
}

export const ERA_TREATMENT: Record<Era, EraTreatment> = {
  neolithic:  { satMult: 0.55, brightMult: 0.88, borderAlpha: 0.00, borderWidth: 0.0, borderColor: 0x1a1008, postTint: null,     ruinColor: 0x7a6a58 },
  classical:  { satMult: 0.78, brightMult: 0.94, borderAlpha: 0.00, borderWidth: 0.0, borderColor: 0x1a1008, postTint: null,     ruinColor: 0x8a7860 },
  medieval:   { satMult: 0.90, brightMult: 0.97, borderAlpha: 0.00, borderWidth: 0.0, borderColor: 0x1a1008, postTint: null,     ruinColor: 0x7a7060 },
  industrial: { satMult: 1.05, brightMult: 0.93, borderAlpha: 0.00, borderWidth: 0.0, borderColor: 0x1a1008, postTint: null,     ruinColor: 0x6a6050 },
  modern:     { satMult: 1.20, brightMult: 1.06, borderAlpha: 0.00, borderWidth: 0.0, borderColor: 0x1a1008, postTint: null,     ruinColor: 0x787e88 },
  post:       { satMult: 0.85, brightMult: 1.12, borderAlpha: 0.00, borderWidth: 0.0, borderColor: 0x2d1155, postTint: 0x8833cc, ruinColor: 0x7068a0 },
};

// --- Color utilities (private) ---

function rgbToHsl(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): number {
  if (s === 0) { const v = Math.round(l * 255); return (v << 16) | (v << 8) | v; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2 = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return (Math.round(hue2(h + 1/3) * 255) << 16) |
         (Math.round(hue2(h) * 255) << 8) |
          Math.round(hue2(h - 1/3) * 255);
}

function blendHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16) |
         (Math.round(ag + (bg - ag) * t) << 8) |
          Math.round(ab + (bb - ab) * t);
}

function applyTreatment(baseColor: number, t: EraTreatment): number {
  let [h, s, l] = rgbToHsl(baseColor);
  s = Math.min(1, s * t.satMult);
  l = Math.min(1, l * t.brightMult);
  let c = hslToRgb(h, s, l);
  if (t.postTint !== null) c = blendHex(c, t.postTint, 0.12);
  return c;
}

// --- Tile overlay shape ---

export interface TileOverlay {
  color: number;
  alpha: number;
  borderColor: number;
  borderAlpha: number;
  borderWidth: number;
}

export interface SimTile {
  state: TileState;
  civId: number | null;
  lastChangedTick: number;
  ruinEra: Era | null;
}

export interface CivCity {
  row: number;
  col: number;
  prominence: number;
  name: string;
  foundedTick: number;
}

export interface Civ {
  id: number;
  originRow: number;
  originCol: number;
  birthTick: number;
  phase: CivPhase;
  vitality: number;
  phaseAge: number;
  // Ticks this phase lasts — rolled ONCE on phase entry. (Re-rolling per tick
  // collapses the distribution to its minimum: every civ then lives the same
  // shortest-possible life. That bug ran for weeks before this run caught it.)
  phaseDuration: number;
  color: number;
  constitution: number;
  fortune: number;
  era: Era;
  maxSize: number;
  name: string;
  cities: CivCity[];
  hasRallied: boolean;
  hasFled: boolean;
  // A golden-age monument; persists (as a ruin marker) after the civ dies.
  wonder: { row: number; col: number } | null;
}

export interface NameMemory {
  row: number;
  col: number;
  name: string;
  lastEra: Era;
}

export interface Expedition {
  civId: number;
  row: number;
  col: number;
  dirRow: number;
  dirCol: number;
  age: number;
  trail: Array<{ row: number; col: number }>;
  desperate: boolean;
}

// The catastrophe that pressure is building toward — rolled when pressure
// crosses brewingThreshold so omens can foreshadow the right kind of doom.
export interface BrewingCatastrophe {
  type: CatastropheType;
  severity: number;
  omenStage: number; // 0 = none fired yet; counts up through omenStages
}

// --- Tunable knobs ---

export const SIM = {
  clearedToBuilt: 0.3,
  ruinReclaimTicks: 2000,
  ruinReclaimChance: 0.005,

  maxLivingCivs: 10,
  baseCivSpawnChance: 0.005,
  newCivMinDistance: 16,

  risingDuration: 1200,
  stableDuration: 2000,
  decliningDuration: 1500,
  phaseVariation: 0.6,
  // Long-tail golden ages: some civs' stable phase runs several times longer,
  // giving the world old empires a viewer can learn by name.
  stableLongTailChance: 0.15,
  stableLongTailMult: 3.5,

  vitalityRising: 0.9,
  vitalityStable: 0.7,
  vitalityDeclining: 0.3,
  vitalityDying: 0.0,
  vitalityLerp: 0.02,

  spreadBase: 0.06,
  decayBase: 0.0125,
  decayEdgeBonus: 1.5,
  conquestBase: 0.04,

  coreRadius: 14,
  peripheryDecayMultiplier: 1.5,
  coreProtectionFactor: 0.3,
  isolationMultiplier: 5.0,
  spreadIntoRuinFactor: 0.5,
  deathPeripheryAmp: 2.0,
  deathPeripheryRampTicks: 600,
  deathDecayMultiplier: 0.4,
  maxDecaysPerCivPerTick: 1,

  fortuneStep: 0.008,
  fortuneRevert: 0.005,
  fortuneMax: 0.35,

  minAmbition: 40,
  maxAmbition: 600,
  ambitionSkew: 2.5,
  overstretchPenalty: 0.4,

  eraInheritanceRadius: 6,
  eraInheritanceThreshold: 3,
  eraAdvanceChance: 0.25,

  // --- Deep-time cadence: the single knob for the whole world cycle --------
  // worldCycleTicks is how long a world lives before the cataclysm unmakes it
  // and a new one is rolled (main.ts reads this for the auto-reroll). The era
  // arc is coupled to it: the rates below are tuned against a 100k reference,
  // and the accumulation scales by (reference / worldCycleTicks), so a world
  // always climbs neolithic → post at ~74% of its life and holds post until
  // the reset — whatever length you choose. ~30k ≈ 17 min (a full arc + the
  // grand reset in one sitting); 100k ≈ 55 min (the original slow deep time).
  // Below ~20k the eras start to blur.
  worldCycleTicks:        30000,
  eraReferenceCycle:      100000,
  eraProgressBase:        0.000005,
  eraProgressSettleWeight: 0.00008,

  nameMemoryRadius: 8,

  // --- Ice ages ------------------------------------------------------------
  // One complete advance and retreat inside a single world's life, phased as
  // fractions of worldCycleTicks — so the glacial is an act in the world's
  // story rather than a cycle running on its own clock beside it. The retreat
  // is deliberately longer than the advance: ice leaves more slowly than it
  // comes, and the thaw is where the world gets its colour back.
  ice: {
    peakCoverage: 0.60,   // fraction of latitude under ice at the glacial maximum
    onsetAt:      0.28,   // world-life fraction where the front starts to grow
    peakAt:       0.55,   // ... reaches its maximum
    goneAt:       0.97,   // ... has fully withdrawn (goneAt-peakAt > peakAt-onsetAt)
    edgeSoftness: 0.30,   // latitude band the front fades across — small values are a white wall
    coldDecay:    1.7,    // extra decay multiplier for tiles deep in the ice
    refugeBuffer: 0.20,   // latitude nearest the equator the ice may never take:
                          // the warm belt civilisation retreats into and survives in
    memoryTicks:  2600,   // pale ground + moraine linger this long after the melt
  },

  // Living land — the wild biomes breathe over deep time. Forests creep into
  // moist grass and pull back when it dries; arid ground spreads from the desert
  // margins and greens over when wet; the shallows flip between sea and shore as
  // the sea level slowly oscillates. Only UNCLAIMED tiles change, so civ
  // territory stays put — the land is the protagonist, civs are weather.
  land: {
    attemptsPerTick:   6,      // random wild tiles evaluated per tick
    vegFlipChance:     0.18,   // base odds a qualifying veg edge-tile flips
    coastFlipChance:   0.25,   // base odds a qualifying shallow tile flips
    wetnessCycleTicks: 13000,  // afforestation ↔ drought oscillation period
    seaCycleTicks:     24000,  // sea-level rise ↔ fall period
    seaAmp:            0.02,    // elevation units the effective sea level swings
  },

  // Ocean routes / colonization.
  expeditionLaunchChance: 0.012,
expeditionMinVitality: 0.5,      // slightly lower bar
expeditionMinSize: 18,           // smaller civs can colonize
expeditionSpeed: 0.11,            // slow sailing ships — a deliberate ocean crossing
expeditionMaxAge: 760,           // longer life so slow ships still complete crossings
expeditionLossBase: 0.001,       // half the loss rate
expeditionLaunchCityRadius: 11,  // launch coast must be within this radius (× city prominence) of a city — keeps ships from sailing out of empty/ruined coast. Matches renderer's DENSITY.proximityScale.

  // Breakaway colonies.
  breakawayMinSize: 30,
  breakawayChance: 0.004,
  breakawayWeakParentBonus: 3.0,

  // Rallies — a declining civ with good fortune can pull back to stable, once.
  // Uncertainty needs both outcomes possible; keep rare (~1 in 10 declines).
  rallyChance: 0.0002,
  rallyMinFortune: 0.1,

  // Last flight — a declining civ may send one final expedition seaward.
  lastFlightChance: 0.00005,
  lastFlightMinSize: 12,

  // Wonders — a large, fortunate civ in its stable age may raise one
  // monument, which outlives it.
  wonderChance: 0.00015,
  wonderMinSize: 160,
  wonderMinFortune: 0.12,

  // Births arrive as migrations: a band wanders visibly for this many ticks
  // before the settlement takes a name.
  migrationTicks: 900,
};

export const CATASTROPHE = {
  // Pressure accumulation
  pressureBuildBase:           0.00005,
  pressureSettledWeight:       0.00013,
  pressureEraWeight:           0.00010,
  pressureTimeSinceLastWeight: 0.00008,
  pressureFireThreshold:       1.0,

  // Pressure-build noise — a slow random-walk multiplier on the build rate so
  // catastrophe cadence isn't a metronome (gaps of calm, sudden worsenings).
  pressureNoiseStep:           0.02,
  pressureNoiseRevert:         0.01,
  pressureNoiseMax:            0.8,    // multiplier walks within [0.2, 1.8]

  // Brewing + omens — the coming catastrophe's type and severity are rolled
  // when pressure crosses brewingThreshold; omen events fire at each stage.
  brewingThreshold:            0.50,
  omenStages:                  [0.62, 0.80, 0.93],

  // Near-miss narration: untouched civs with capital within this factor of the
  // blast radius are 'spared' (the fire passed them by).
  sparedRadiusFactor:          1.6,

  // Severity — Math.pow(random, severitySkew); higher skew = rarer big events
  severitySkew:                2,
  severityModerateThreshold:   0.35,   // above: partial era downgrade
  severitySevereThreshold:     0.70,   // above: wipe to wild (total knowledge loss)
  eraDowngradeSteps:           2,      // steps to downgrade on moderate severity

  // Plague type — uniform circle
  regionRadius:                18,     // max tile radius for minor/moderate (linearly scaled)
  // Severe events use a fixed large radius; must exceed eraInheritanceRadius (6) by a wide margin
  // so the blast center is guaranteed > 6 tiles from any surviving ruin at the edge.
  severeRadius:                32,

  // Asteroid type — radial falloff from epicenter
  asteroidCoreRadius:          6,      // inner radius of guaranteed devastation
  asteroidFalloffFactor:       2.0,    // steepness of tapering outside core

  // Vitality (scaled by severity)
  vitalityHit:                 0.65,

  // Embers — always keep at least this many civs untouched
  emberCount:                  2,

  // Flood type — raises effective waterline within a region
  floodDepth:                  0.12,   // max elevation above SEA_LEVEL drowned at severity=1
  floodRadius:                 22,     // radius (severity-scaled; severe uses severeRadius)

  // Earthquake type — sine-wave elevation perturbation sinks/raises terrain
  earthquakeAmplitude:         0.15,   // max elevation displacement (multiplied by severity)
  earthquakeFreq:              0.4,    // spatial frequency of the sine distortion
  earthquakeRadius:            26,     // tile radius of the affected zone
};

// Standing-volcano eruptions (the natural-wonder volcano, distinct from the
// roving 'volcano' catastrophe above). Deep-time pacing: long rest, short burst.
export const VOLCANO = {
  restTicks:        2400,  // ~80s at 30tps between eruptions
  restJitterTicks:  1800,  // up to +60s extra, so they don't sync up
  eruptTicks:        240,  // ~8s eruption
  initialRestTicks:  900,  // first eruption ~30s in, staggered by position
  damageRadius:        5,   // tiles scarred around the vent
  scorchRadius:      1.7,   // within this, tiles are wiped to wild (scorched bare)
  vitalityHit:      0.12,   // vitality lost by a civ that loses tiles to it
  severity:         0.35,   // moderate — drives scar size / screen shake
};

export const CITY = {
  tilesPerCity:             80,    // territory tiles needed per additional city slot
  maxCitiesAmbitionScale:   1.0,   // high-ambition civs earn proportionally more cities
  foundingCheckInterval:    20,    // ticks between founding + reconcile passes
  minDistBetweenCities:     14,    // minimum tile distance between any two cities of the same civ
  gradientStrength:         0.0,   // 0=off; reserved for sprite-density approach later
  gradientRadius:           18,    // distance at which dimming fully applies
  attackerProximityWeight:  0.0,   // >0: attacker city near front boosts conquest chance
  markerCapitalSize:        4.0,   // px radius for the capital dot
  markerBaseSize:           2.5,   // px radius for secondary city dots
  prominenceGrowthRate:     0.002, // prominence gained per updateCityProminence call (every foundingCheckInterval ticks)
  prominenceDensityRadius:  8,     // radius of same-civ tiles counted for density bonus
  prominenceDensityWeight:  2.0,   // multiplier for density contribution to growth
  nameLabelThreshold:       0.5,   // prominence at which a city earns a name label
  cityFallNarrateThreshold: 0.55,  // prominence at which a city fall is narrated (capitals always narrated)
};

const CIV_COLORS = [
  0xc06846, 0x7a98a8, 0xc7a063, 0x8b6a8e,
  0x5a7560, 0xbf8060, 0x6b7a99, 0xa68a5b,
];

// A standing volcano (a natural wonder placed by the renderer; its location is
// handed to the sim via setVolcanoes). The sim owns its eruption cycle so an
// eruption is a real event that scars the land and hurts nearby civs — not just
// a visual. The renderer reads `intensity` to animate the cone.
export interface VolcanoState {
  row: number;
  col: number;
  cooldown: number;   // ticks until the next eruption begins
  erupting: number;   // ticks remaining in the current eruption (0 = dormant)
  duration: number;   // total ticks of an eruption (for the intensity curve)
  intensity: number;  // 0 dormant .. 1 peak — what the renderer animates to
  didDamage: boolean; // tiles are scarred once, at the eruption's peak
}

// A wonder's influence on where civs settle: positive `pull` draws settlement
// (fresh water, sacred landmarks, mineral wealth), negative repels it (the
// volcano's dangerous slopes). Set by the renderer via setWonderSites.
export interface WonderSite {
  row: number;
  col: number;
  pull: number;   // +draw / −repel, magnitude at the centre
  radius: number; // tiles over which the pull fades to zero
}

export interface SimWorld {
  width: number;
  height: number;
  tiles: SimTile[][];
  volcanoes: VolcanoState[];
  wonderSites: WonderSite[];
  civs: Map<number, Civ>;
  nextCivId: number;
  tick: number;
  nameMemory: NameMemory[];
  expeditions: Expedition[];
  catastrophePressure: number;
  lastCatastropheTick: number;
  pressureNoise: number;
  brewing: BrewingCatastrophe | null;
  // Deep-time era floor: 0 (neolithic) .. 5 (post), float; floor() is the
  // minimum era a new civ is born into. Climbs over a world's life, resets on
  // reroll/cataclysm (a fresh SimWorld starts at 0).
  eraProgress: number;
  // Climate: how far the ice has advanced from both poles toward the equator
  // (0..1). iceMax remembers the furthest it ever reached this world, which is
  // where the moraine and the pale ground stay after the thaw.
  iceExtent: number;
  iceMax: number;
  // The world's temperament and life arc, rolled from its seed at creation.
  // Read it through characterOf(world), which bends it by the world's age.
  character: WorldCharacter;
  // Settlements on their way to existing — visible nomad bands.
  pendingSettlements: Array<{ row: number; col: number; ticksLeft: number }>;
  // Progressive terrain change (rifts tearing, islands rising, bridges
  // lifting): a queue of per-tile elevation targets processed a few per tick
  // so the land visibly transforms. civHits tracks tiles lost per civ so
  // vitality consequences land once per civ.
  terraform: {
    queue: Array<{ row: number; col: number; targetElev: number }>;
    perTick: number; // may be fractional; acc accumulates
    acc: number;
    civHits: Map<number, number>;
    steamAt: { row: number; col: number } | null; // render hint (island births steam)
  } | null;
}

export function createSimWorld(width: number, height: number, seed?: string): SimWorld {
  const tiles: SimTile[][] = [];
  for (let row = 0; row < height; row++) {
    tiles[row] = [];
    for (let col = 0; col < width; col++) {
      tiles[row][col] = { state: 'wild', civId: null, lastChangedTick: 0, ruinEra: null };
    }
  }
  return {
    width, height, tiles,
    volcanoes: [],
    wonderSites: [],
    civs: new Map(),
    nextCivId: 1,
    tick: 0,
    nameMemory: [],
    expeditions: [],
    catastrophePressure: 0,
    lastCatastropheTick: 0,
    pressureNoise: 1.0,
    brewing: null,
    eraProgress: 0,
    iceExtent: 0,
    iceMax: 0,
    character: rollCharacter(seed ?? 'default'),
    pendingSettlements: [],
    terraform: null,
  };
}

// --- Planetary biography ----------------------------------------------------
// Every world gets a temperament and a slow life arc, rolled from its seed.
// They don't add systems — they turn the knobs on the systems already here, so
// one world becomes a story of narrowing refuges and another of river kingdoms
// and repeated floods.
//
// The values are deliberately LOUD. A screensaver has no replay loop: the
// viewer's only comparison is a world they half-watched twenty minutes ago, so
// cross-world variance is nearly invisible unless it's extreme. The goal isn't
// "this world is subtly drier" — it's that one world is legibly a particular
// place inside its own seventeen minutes.
export type Temperament = 'cold' | 'wet' | 'dry' | 'volcanic' | 'fertile' | 'restless' | 'placid';
export type LifeArc = 'warming' | 'cooling' | 'drying' | 'greening' | 'destabilizing' | 'settling';

export interface WorldCharacter {
  temperament: Temperament;
  arc: LifeArc;
  ice: number;          // multiplier on glacial extent
  storm: number;        // storm frequency
  fire: number;         // wildfire ignition
  drought: number;      // drought onset
  flood: number;        // river flooding
  volcano: number;      // eruption frequency
  fertility: number;    // vegetation lushness and how readily land is settled
  pressure: number;     // catastrophe pressure accumulation
  moistureBias: number; // terrain generation: green continents vs. tan ones
}

const TEMPERAMENTS: Record<Temperament, Omit<WorldCharacter, 'temperament' | 'arc'>> = {
  //            ice   storm  fire  drought flood  volcano fertility pressure moisture
  cold:     { ice: 2.1, storm: 1.3, fire: 0.4, drought: 0.5, flood: 0.8, volcano: 0.7, fertility: 0.7, pressure: 1.0, moistureBias:  0.02 },
  wet:      { ice: 1.0, storm: 2.2, fire: 0.25, drought: 0.2, flood: 2.6, volcano: 0.8, fertility: 1.2, pressure: 1.0, moistureBias:  0.12 },
  dry:      { ice: 0.5, storm: 0.4, fire: 2.4, drought: 3.0, flood: 0.25, volcano: 1.0, fertility: 0.6, pressure: 1.0, moistureBias: -0.13 },
  volcanic: { ice: 0.6, storm: 1.1, fire: 1.8, drought: 0.9, flood: 0.9, volcano: 3.0, fertility: 1.1, pressure: 1.4, moistureBias: -0.02 },
  fertile:  { ice: 0.7, storm: 1.0, fire: 0.7, drought: 0.5, flood: 1.2, volcano: 0.8, fertility: 1.6, pressure: 0.8, moistureBias:  0.09 },
  restless: { ice: 1.2, storm: 1.6, fire: 1.4, drought: 1.3, flood: 1.4, volcano: 1.8, fertility: 0.9, pressure: 1.9, moistureBias:  0.00 },
  placid:   { ice: 0.6, storm: 0.6, fire: 0.6, drought: 0.6, flood: 0.7, volcano: 0.5, fertility: 1.2, pressure: 0.45, moistureBias: 0.04 },
};

// Which arcs make sense after which temperament — a world that starts cold
// warms or stays cold; it does not start cold and become volcanic.
const ARCS_FOR: Record<Temperament, LifeArc[]> = {
  cold:     ['warming', 'cooling', 'settling'],
  wet:      ['drying', 'greening', 'destabilizing'],
  dry:      ['greening', 'drying', 'warming'],
  volcanic: ['settling', 'destabilizing', 'cooling'],
  fertile:  ['drying', 'greening', 'settling'],
  restless: ['settling', 'destabilizing', 'cooling'],
  placid:   ['destabilizing', 'greening', 'warming'],
};

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function rollCharacter(seed: string): WorldCharacter {
  const h = hashSeed(seed + ':character');
  const kinds = Object.keys(TEMPERAMENTS) as Temperament[];
  const temperament = kinds[h % kinds.length];
  const arcs = ARCS_FOR[temperament];
  const arc = arcs[(h >>> 8) % arcs.length];
  return { temperament, arc, ...TEMPERAMENTS[temperament] };
}

// The arc bends the temperament across the world's life: a drying world is wet
// in youth and parched in old age. Returns the character as it stands NOW.
// `t` is world-life fraction, 0..1.
export function characterNow(base: WorldCharacter, t: number): WorldCharacter {
  const swing = (t - 0.5) * 2;         // -1 young … +1 old
  const c = { ...base };
  const bend = (v: number, amount: number) => Math.max(0.1, v * (1 + swing * amount));
  switch (base.arc) {
    case 'warming':       c.ice = bend(c.ice, -0.75); c.drought = bend(c.drought, 0.6); c.fire = bend(c.fire, 0.5); break;
    case 'cooling':       c.ice = bend(c.ice, 0.9); c.fertility = bend(c.fertility, -0.35); break;
    case 'drying':        c.drought = bend(c.drought, 1.1); c.fire = bend(c.fire, 0.8); c.flood = bend(c.flood, -0.6); c.fertility = bend(c.fertility, -0.4); break;
    case 'greening':      c.fertility = bend(c.fertility, 0.55); c.drought = bend(c.drought, -0.7); c.flood = bend(c.flood, 0.4); break;
    case 'destabilizing': c.pressure = bend(c.pressure, 1.0); c.volcano = bend(c.volcano, 0.9); c.storm = bend(c.storm, 0.7); break;
    case 'settling':      c.pressure = bend(c.pressure, -0.6); c.volcano = bend(c.volcano, -0.6); c.storm = bend(c.storm, -0.4); break;
  }
  return c;
}

// The character as of this tick — what every consumer should read.
export function characterOf(world: SimWorld): WorldCharacter {
  return characterNow(world.character, (world.tick % SIM.worldCycleTicks) / SIM.worldCycleTicks);
}

// --- Ice ages ---------------------------------------------------------------
// A glacial is an ACT in a world's life, not a cycle running on its own clock
// beside it: the extent is a pure function of where the world is in its own
// lifetime, so every world gets exactly one advance and one retreat, and the
// thaw always lands before the cataclysm. 0 = ice-free, 1 = the front has
// reached the equator (it never does; refugeBuffer holds a warm belt open).
export function iceExtentFor(tick: number, iceMult = 1): number {
  const I = SIM.ice;
  const t = (tick % SIM.worldCycleTicks) / SIM.worldCycleTicks;
  if (t <= I.onsetAt || t >= I.goneAt) return 0;
  const u = t < I.peakAt
    ? (t - I.onsetAt) / (I.peakAt - I.onsetAt)
    : 1 - (t - I.peakAt) / (I.goneAt - I.peakAt);
  const eased = u * u * (3 - 2 * u); // smoothstep: the front eases in and out
  // A cold world glaciates hard; a volcanic one barely at all.
  return Math.min(0.95, eased * I.peakCoverage * iceMult);
}

// Smooth, deterministic multi-frequency wobble in ~[-1, 1]. Pure (no seed, no
// state) so the sim and the renderer compute an identical ice front without
// having to share anything.
function iceNoise(row: number, col: number): number {
  // Two scales on purpose: broad lobes (the front bulges and retreats over tens
  // of tiles, the way an ice sheet actually does) plus finer crenulation. A
  // single fine frequency left the mean line legible as a straight edge.
  const broad = Math.sin(row * 0.055 + col * 0.041 + 0.4) + Math.sin((col - row) * 0.037 - 1.1);
  const fine = Math.sin(row * 0.21 + col * 0.13) + Math.sin((row + col) * 0.11 + 1.7);
  return (broad * 0.62 + fine * 0.22) / 1.68;
}

// How deeply a tile sits inside the ice (0 = clear, 1 = deep in the sheet).
// Latitude is distance from the diagonal equator (row+col = H-1). The front is
// warped by noise and biased by terrain so it grows organically — cold seas and
// high ground freeze ahead of it, warm lowlands hold out — rather than cutting
// a clean line across the world. Pass the biome to enable that bias.
export function iceDepthAt(world: SimWorld, row: number, col: number, biome?: Biome): number {
  const cover = world.iceExtent;
  if (cover <= 0.001) return 0;
  const I = SIM.ice;
  let lat = Math.abs(row + col - (world.height - 1)) / (world.height - 1);
  if (biome === 'water') lat += 0.07;        // sea ice tongues out ahead of the front
  else if (biome === 'rock') lat += 0.06;     // ridges hold snow first
  else if (biome === 'forest') lat += 0.03;   // snow catches and stays under trees
  else if (biome === 'sand' || biome === 'fertile') lat -= 0.06; // warm ground holds out
  lat += iceNoise(row, col) * 0.20;
  // The front, never closer to the equator than the refuge belt.
  const line = Math.max(I.refugeBuffer, 1 - cover);
  if (lat <= line) return 0;
  return Math.min(1, (lat - line) / Math.max(0.02, I.edgeSoftness));
}

// --- Helpers ---

function distance(r1: number, c1: number, r2: number, c2: number): number {
  const dr = r1 - r2;
  const dc = c1 - c2;
  return Math.sqrt(dr * dr + dc * dc);
}

export function nearestCityDist(civ: Civ, row: number, col: number): number {
  let min = Infinity;
  for (const city of civ.cities) {
    const dr = row - city.row, dc = col - city.col;
    const d = Math.sqrt(dr * dr + dc * dc);
    if (d < min) min = d;
  }
  return min < Infinity ? min : 0;
}

function pickCivSpawnTile(
  world: SimWorld,
  biomes: Biome[][]
): { row: number; col: number } | null {
  const candidates: Array<{ row: number; col: number; ruinScore: number; influence: number }> = [];

  for (let attempt = 0; attempt < 120; attempt++) {
    const row = Math.floor(Math.random() * world.height);
    const col = Math.floor(Math.random() * world.width);
    if (biomes[row][col] === 'water' || biomes[row][col] === 'rock') continue; // no founding on sea or peak
    const st = world.tiles[row][col].state;
    if (st !== 'wild' && st !== 'ruin') continue;

    // Never found on the volcano's scorched slopes — its core repels outright.
    let onVent = false;
    for (const w of world.wonderSites) {
      if (w.pull < 0 && distance(row, col, w.row, w.col) < 3) { onVent = true; break; }
    }
    if (onVent) continue;

    let okay = true;
    for (const civ of world.civs.values()) {
      if (civ.phase === 'dead') continue;
      if (distance(row, col, civ.originRow, civ.originCol) < SIM.newCivMinDistance) {
        okay = false;
        break;
      }
    }
    if (!okay) continue;

    let ruinScore = 0;
    const r = SIM.eraInheritanceRadius;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= world.height || nc < 0 || nc >= world.width) continue;
        if (dr * dr + dc * dc > r * r) continue;
        if (world.tiles[nr][nc].state === 'ruin' && world.tiles[nr][nc].ruinEra != null) {
          ruinScore++;
        }
      }
    }
    candidates.push({ row, col, ruinScore, influence: wonderInfluenceAt(world, row, col) });
  }

  if (candidates.length === 0) return null;

  // Ruins draw founders (inherited memory); a wonder's pull adds or subtracts on
  // top — blessed ground attracts, the volcano's reach discourages.
  const weights = candidates.map((c) => Math.max(0.05, 1 + c.ruinScore * 3 + c.influence));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return { row: candidates[i].row, col: candidates[i].col };
  }
  return { row: candidates[0].row, col: candidates[0].col };
}

function livingCivCount(world: SimWorld): number {
  let n = 0;
  for (const civ of world.civs.values()) {
    if (civ.phase !== 'dead') n++;
  }
  return n;
}

function inheritedEraFor(world: SimWorld, row: number, col: number): Era {
  const counts: Record<Era, number> = {
    neolithic: 0, classical: 0, medieval: 0,
    industrial: 0, modern: 0, post: 0,
  };
  const r = SIM.eraInheritanceRadius;
  for (let dr = -r; dr <= r; dr++) {
    for (let dc = -r; dc <= r; dc++) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= world.height || nc < 0 || nc >= world.width) continue;
      if (dr * dr + dc * dc > r * r) continue;
      const tile = world.tiles[nr][nc];
      if (tile.state === 'ruin' && tile.ruinEra != null) {
        counts[tile.ruinEra]++;
      }
    }
  }
  // Local ruin inheritance: the highest era with enough nearby ruins, with a
  // chance to leap one further (a people rising in a sophisticated ruin field
  // can run ahead of their time).
  let localRank = 0;
  for (let i = ERAS_ORDERED.length - 1; i >= 0; i--) {
    const era = ERAS_ORDERED[i];
    if (counts[era] >= SIM.eraInheritanceThreshold) {
      localRank = (Math.random() < SIM.eraAdvanceChance && i < ERAS_ORDERED.length - 1) ? i + 1 : i;
      break;
    }
  }
  // The world also ages as a whole; a civ is born at least at the era floor.
  const floorRank = Math.max(0, Math.min(ERAS_ORDERED.length - 1, Math.floor(world.eraProgress)));
  return ERAS_ORDERED[Math.max(localRank, floorRank)];
}

function nameForNewCiv(world: SimWorld, row: number, col: number, era: Era): string {
  let nearest: NameMemory | null = null;
  let nearestDist = Infinity;
  for (const mem of world.nameMemory) {
    const d = distance(row, col, mem.row, mem.col);
    if (d < SIM.nameMemoryRadius && d < nearestDist) {
      nearest = mem;
      nearestDist = d;
    }
  }

  let name: string;
  if (nearest) {
    name = nearest.lastEra === era ? nearest.name : evolveName(nearest.name, era);
    nearest.name = name;
    nearest.lastEra = era;
    nearest.row = row;
    nearest.col = col;
  } else {
    name = generateName(era);
    world.nameMemory.push({ row, col, name, lastEra: era });
  }
  return name;
}

function spawnCiv(world: SimWorld, row: number, col: number): Civ {
  const constitution = 0.6 + Math.random() * 0.6;
  const era = inheritedEraFor(world, row, col);
  const name = nameForNewCiv(world, row, col, era);
  const ambitionRoll = Math.pow(Math.random(), SIM.ambitionSkew);
  const maxSize = Math.round(SIM.minAmbition + ambitionRoll * (SIM.maxAmbition - SIM.minAmbition));
  const civ: Civ = {
    id: world.nextCivId++,
    originRow: row,
    originCol: col,
    birthTick: world.tick,
    phase: 'rising',
    vitality: 0.4,
    phaseAge: 0,
    phaseDuration: rollPhaseDuration('rising'),
    color: CIV_COLORS[(world.nextCivId - 2) % CIV_COLORS.length],
    constitution,
    fortune: 0,
    era,
    maxSize,
    name,
    cities: [{ row, col, prominence: 1.0, name: generateName(era), foundedTick: world.tick }],
    hasRallied: false,
    hasFled: false,
    wonder: null,
  };
  world.civs.set(civ.id, civ);
  const t = world.tiles[row][col];
  t.state = 'cleared';
  t.civId = civ.id;
  t.ruinEra = null;
  t.lastChangedTick = world.tick;
  return civ;
}

// --- Phase + fortune transitions ---

export function rollPhaseDuration(phase: CivPhase): number {
  const base = phase === 'rising' ? SIM.risingDuration
    : phase === 'stable' ? SIM.stableDuration
    : phase === 'declining' ? SIM.decliningDuration
    : Infinity;
  if (base === Infinity) return Infinity;
  let d = base * (1 + (Math.random() * 2 - 1) * SIM.phaseVariation);
  if (phase === 'stable' && Math.random() < SIM.stableLongTailChance) {
    d *= SIM.stableLongTailMult;
  }
  return d;
}

export function enterPhase(civ: Civ, phase: CivPhase) {
  civ.phase = phase;
  civ.phaseAge = 0;
  civ.phaseDuration = rollPhaseDuration(phase);
}

function advanceCivPhase(civ: Civ, tileCount: number) {
  civ.phaseAge++;
  let target = 0;
  switch (civ.phase) {
    case 'rising':    target = SIM.vitalityRising * civ.constitution; break;
    case 'stable':    target = SIM.vitalityStable * civ.constitution; break;
    case 'declining': target = SIM.vitalityDeclining * civ.constitution; break;
    case 'dead':      target = SIM.vitalityDying; break;
  }
  target = Math.min(target, 1.0);

  if (tileCount > civ.maxSize) {
    const overstretchFactor = (tileCount - civ.maxSize) / civ.maxSize;
    const penalty = Math.min(SIM.overstretchPenalty, overstretchFactor * SIM.overstretchPenalty);
    target -= penalty;
    target = Math.max(0, target);
  }

  const lerpRate = civ.phase === 'dead' ? SIM.vitalityLerp * 0.25 : SIM.vitalityLerp;
  civ.vitality += (target - civ.vitality) * lerpRate;

  if (civ.phase === 'rising' && civ.phaseAge > civ.phaseDuration) {
    enterPhase(civ, 'stable');
  } else if (civ.phase === 'stable' && civ.phaseAge > civ.phaseDuration) {
    enterPhase(civ, 'declining');
  } else if (civ.phase === 'declining' && civ.phaseAge > civ.phaseDuration) {
    enterPhase(civ, 'dead');
  }
}

function advanceCivFortune(civ: Civ) {
  const drift = (Math.random() * 2 - 1) * SIM.fortuneStep;
  const pullback = -civ.fortune * SIM.fortuneRevert;
  civ.fortune += drift + pullback;
  if (civ.fortune > SIM.fortuneMax) civ.fortune = SIM.fortuneMax;
  if (civ.fortune < -SIM.fortuneMax) civ.fortune = -SIM.fortuneMax;
}

function effectiveDecayPressure(civ: Civ): number {
  const v = civ.vitality + civ.fortune;
  return Math.max(0, Math.min(1, 1 - v));
}

function effectiveStrength(civ: Civ): number {
  return Math.max(0, civ.vitality + civ.fortune);
}

// --- Ocean routes ---

function findCoastalTile(
  world: SimWorld,
  biomes: Biome[][],
  civ: Civ
): { row: number; col: number } | null {
  if (civ.cities.length === 0) return null;
  const coastal: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < world.height; r++) {
    for (let c = 0; c < world.width; c++) {
      const t = world.tiles[r][c];
      if (t.civId !== civ.id || t.state !== 'built') continue;
      // Must sit inside the populated halo of some city (where buildings actually render).
      let nearCity = false;
      for (const city of civ.cities) {
        const dr = r - city.row, dc = c - city.col;
        const effR = SIM.expeditionLaunchCityRadius * Math.max(0.2, city.prominence);
        if (dr * dr + dc * dc <= effR * effR) { nearCity = true; break; }
      }
      if (!nearCity) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= world.height || nc < 0 || nc >= world.width) continue;
        if (biomes[nr][nc] === 'water') {
          coastal.push({ row: r, col: c });
          break;
        }
      }
    }
  }
  if (coastal.length === 0) return null;
  return coastal[Math.floor(Math.random() * coastal.length)];
}

function chooseExpeditionDirection(
  world: SimWorld,
  biomes: Biome[][],
  fromRow: number,
  fromCol: number,
  _civId: number
): { dirRow: number; dirCol: number } | null {
  let dr = 0, dc = 0;
  for (const [r, c] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nr = fromRow + r, nc = fromCol + c;
    if (nr < 0 || nr >= world.height || nc < 0 || nc >= world.width) continue;
    if (biomes[nr][nc] === 'water') { dr += r; dc += c; }
  }
  if (dr === 0 && dc === 0) return null;
  const len = Math.sqrt(dr * dr + dc * dc);
  return { dirRow: dr / len, dirCol: dc / len };
}

function maybeLaunchExpeditions(world: SimWorld, biomes: Biome[][], tileCounts: Map<number, number>, events: SimEvent[]) {
  for (const civ of world.civs.values()) {
    if (civ.phase === 'dead') continue;
    if (world.expeditions.some((e) => e.civId === civ.id)) continue;

    // Last flight: a declining civ too weak for a normal expedition may send
    // one final voyage — desperate, narrated as flight rather than ambition.
    let desperate = false;
    if (effectiveStrength(civ) >= SIM.expeditionMinVitality) {
      if ((tileCounts.get(civ.id) || 0) < SIM.expeditionMinSize) continue;
      if (Math.random() > SIM.expeditionLaunchChance) continue;
    } else if (civ.phase === 'declining' && !civ.hasFled) {
      if ((tileCounts.get(civ.id) || 0) < SIM.lastFlightMinSize) continue;
      if (Math.random() > SIM.lastFlightChance) continue;
      desperate = true;
    } else {
      continue;
    }

    const coast = findCoastalTile(world, biomes, civ);
    if (!coast) continue;
    const dir = chooseExpeditionDirection(world, biomes, coast.row, coast.col, civ.id);
    if (!dir) continue;

    if (desperate) {
      civ.hasFled = true;
      events.push({ kind: 'last_flight', civId: civ.id });
    }
    world.expeditions.push({
      civId: civ.id,
      row: coast.row,
      col: coast.col,
      dirRow: dir.dirRow,
      dirCol: dir.dirCol,
      age: 0,
      trail: [{ row: coast.row, col: coast.col }],
      desperate,
    });
  }
}

function advanceExpeditions(world: SimWorld, biomes: Biome[][], changed: Array<{ row: number; col: number }>, events: SimEvent[]) {
  const surviving: Expedition[] = [];
  for (const exp of world.expeditions) {
    const civ = world.civs.get(exp.civId);
    // Desperate voyages persist after their nation dies — the refugees don't know.
    if (!civ || (civ.phase === 'dead' && !exp.desperate)) continue;

    exp.age++;
    exp.row += exp.dirRow * SIM.expeditionSpeed;
    exp.col += exp.dirCol * SIM.expeditionSpeed;

    const ir = Math.round(exp.row);
    const ic = Math.round(exp.col);

    if (ir < 0 || ir >= world.height || ic < 0 || ic >= world.width) continue;
    if (exp.age > SIM.expeditionMaxAge) continue;
    if (Math.random() < SIM.expeditionLossBase * (1 + exp.age / 30)) continue;

    exp.trail.push({ row: ir, col: ic });
    if (exp.trail.length > 12) exp.trail.shift();

    if (biomes[ir][ic] !== 'water' && exp.age > 5) {
      // Look for a settleable tile at the landing spot or just inland.
      const landingCandidates = [
        [ir, ic],
        [ir - 1, ic], [ir + 1, ic], [ir, ic - 1], [ir, ic + 1],
      ];
      for (const [tr, tc] of landingCandidates) {
        if (tr < 0 || tr >= world.height || tc < 0 || tc >= world.width) continue;
        if (biomes[tr][tc] === 'water' || biomes[tr][tc] === 'rock') continue; // can't settle the peaks
        const target = world.tiles[tr][tc];
        if (target.civId !== exp.civId && (target.state === 'wild' || target.state === 'ruin')) {
          if (civ.phase === 'dead' && exp.desperate) {
            // Landfall after the homeland died: the refugees found a successor
            // nation carrying the old name forward.
            const newId = world.nextCivId++;
            const refuge: Civ = {
              id: newId,
              originRow: tr,
              originCol: tc,
              birthTick: world.tick,
              phase: 'rising',
              vitality: 0.4,
              phaseAge: 0,
              phaseDuration: rollPhaseDuration('rising'),
              color: CIV_COLORS[(newId - 2 + CIV_COLORS.length * 100) % CIV_COLORS.length],
              constitution: 0.6 + Math.random() * 0.6,
              fortune: 0,
              era: civ.era,
              maxSize: Math.round(SIM.minAmbition + Math.pow(Math.random(), SIM.ambitionSkew) * (SIM.maxAmbition - SIM.minAmbition)),
              name: evolveName(civ.name, civ.era),
              cities: [{ row: tr, col: tc, prominence: 0.5, name: generateName(civ.era), foundedTick: world.tick }],
              hasRallied: false,
              hasFled: true,
              wonder: null,
            };
            world.civs.set(newId, refuge);
            world.nameMemory.push({ row: tr, col: tc, name: refuge.name, lastEra: civ.era });
            target.state = 'cleared';
            target.civId = newId;
            target.ruinEra = null;
            target.lastChangedTick = world.tick;
            changed.push({ row: tr, col: tc });
            events.push({ kind: 'refuge_founded', civId: newId, parentName: civ.name });
          } else {
            target.state = 'cleared';
            target.civId = exp.civId;
            target.ruinEra = null;
            target.lastChangedTick = world.tick;
            changed.push({ row: tr, col: tc });
            events.push({ kind: 'colony_founded', civId: exp.civId, desperate: exp.desperate });
          }
          break;
        }
      }
      continue;
    }

    surviving.push(exp);
  }
  world.expeditions = surviving;
}

// --- Breakaway colonies ---

function findCivClusters(
  world: SimWorld,
  civId: number
): Array<Array<{ row: number; col: number }>> {
  const visited = new Set<string>();
  const clusters: Array<Array<{ row: number; col: number }>> = [];

  for (let r = 0; r < world.height; r++) {
    for (let c = 0; c < world.width; c++) {
      if (world.tiles[r][c].civId !== civId) continue;
      const key = `${r},${c}`;
      if (visited.has(key)) continue;

      const cluster: Array<{ row: number; col: number }> = [];
      const queue: Array<{ row: number; col: number }> = [{ row: r, col: c }];
      visited.add(key);
      while (queue.length) {
        const cur = queue.pop()!;
        cluster.push(cur);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = cur.row + dr, nc = cur.col + dc;
          if (nr < 0 || nr >= world.height || nc < 0 || nc >= world.width) continue;
          const k = `${nr},${nc}`;
          if (visited.has(k)) continue;
          if (world.tiles[nr][nc].civId === civId) {
            visited.add(k);
            queue.push({ row: nr, col: nc });
          }
        }
      }
      clusters.push(cluster);
    }
  }
  return clusters;
}

function maybeBreakaway(world: SimWorld, changed: Array<{ row: number; col: number }>, events: SimEvent[]) {
  const civList = Array.from(world.civs.values());
  for (const civ of civList) {
    if (civ.phase === 'dead') continue;
    const clusters = findCivClusters(world, civ.id);
    if (clusters.length < 2) continue;

    let mainlandIdx = 0;
    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].some((t) => t.row === civ.originRow && t.col === civ.originCol)) {
        mainlandIdx = i;
        break;
      }
    }

    for (let i = 0; i < clusters.length; i++) {
      if (i === mainlandIdx) continue;
      const exclave = clusters[i];
      if (exclave.length < SIM.breakawayMinSize) continue;

      const weakParent = effectiveStrength(civ) < 0.5;
      const chance = SIM.breakawayChance * (weakParent ? SIM.breakawayWeakParentBonus : 1);
      if (Math.random() > chance) continue;

      let cap = exclave[0];
      let capDist = -1;
      for (const t of exclave) {
        const d = distance(t.row, t.col, civ.originRow, civ.originCol);
        if (d > capDist) { capDist = d; cap = t; }
      }

      const newId = world.nextCivId++;
      const newName = evolveName(civ.name, civ.era);
      const newCiv: Civ = {
        id: newId,
        originRow: cap.row,
        originCol: cap.col,
        birthTick: world.tick,
        phase: 'rising',
        vitality: 0.5,
        phaseAge: 0,
        phaseDuration: rollPhaseDuration('rising'),
        color: CIV_COLORS[(newId - 2 + CIV_COLORS.length * 100) % CIV_COLORS.length],
        constitution: 0.6 + Math.random() * 0.6,
        fortune: 0,
        era: civ.era,
        maxSize: Math.round(SIM.minAmbition + Math.pow(Math.random(), SIM.ambitionSkew) * (SIM.maxAmbition - SIM.minAmbition)),
        name: newName,
        cities: [{ row: cap.row, col: cap.col, prominence: 0.6, name: generateName(civ.era), foundedTick: world.tick }],
        hasRallied: false,
        hasFled: false,
        wonder: null,
      };
      world.civs.set(newId, newCiv);
      events.push({ kind: 'breakaway', newCivId: newId, parentId: civ.id });
      for (const t of exclave) {
        world.tiles[t.row][t.col].civId = newId;
        changed.push({ row: t.row, col: t.col });
      }
      world.nameMemory.push({ row: cap.row, col: cap.col, name: newName, lastEra: civ.era });
    }
  }
}

// --- City founding ---

function reconcileCities(world: SimWorld, events: SimEvent[]) {
  for (const civ of world.civs.values()) {
    if (civ.cities.length === 0) continue;
    const oldCapitalName = civ.cities[0].name;
    let capitalLost = false;
    const surviving: CivCity[] = [];
    for (let i = 0; i < civ.cities.length; i++) {
      const city = civ.cities[i];
      const tile = world.tiles[city.row]?.[city.col];
      const owned = tile && tile.civId === civ.id && (tile.state === 'built' || tile.state === 'cleared');
      if (owned) {
        surviving.push(city);
      } else {
        if (i === 0) capitalLost = true;
        // Living civs: capitals always narrated, secondaries above threshold.
        // Dead civs' cities crumble silently — their fall was already the story.
        if (civ.phase !== 'dead' && (i === 0 || city.prominence >= CITY.cityFallNarrateThreshold)) {
          events.push({ kind: 'city_fell', civId: civ.id, cityName: city.name, prominence: city.prominence, wasCapital: i === 0 });
        }
      }
    }
    civ.cities = surviving;
    // Capital succession: promote the most prominent surviving city.
    if (capitalLost && civ.cities.length > 0 && civ.phase !== 'dead') {
      let bestIdx = 0;
      for (let i = 1; i < civ.cities.length; i++) {
        if (civ.cities[i].prominence > civ.cities[bestIdx].prominence) bestIdx = i;
      }
      const newCapital = civ.cities[bestIdx];
      civ.cities.splice(bestIdx, 1);
      civ.cities.unshift(newCapital);
      civ.originRow = newCapital.row;
      civ.originCol = newCapital.col;
      events.push({ kind: 'capital_moved', civId: civ.id, oldCapitalName, newCapitalName: newCapital.name });
    }
  }
}

function updateCityProminence(world: SimWorld) {
  const r = CITY.prominenceDensityRadius;
  const circleArea = Math.PI * r * r;
  for (const civ of world.civs.values()) {
    if (civ.phase === 'dead') continue;
    for (const city of civ.cities) {
      let densityCount = 0;
      for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
          if (dr * dr + dc * dc > r * r) continue;
          const nr = city.row + dr, nc = city.col + dc;
          if (nr < 0 || nr >= world.height || nc < 0 || nc >= world.width) continue;
          const tile = world.tiles[nr][nc];
          if (tile.civId === civ.id && (tile.state === 'built' || tile.state === 'cleared')) densityCount++;
        }
      }
      const densityRatio = densityCount / circleArea;
      city.prominence = Math.min(1.0, city.prominence + CITY.prominenceGrowthRate * (1 + densityRatio * CITY.prominenceDensityWeight));
    }
  }
}

function maybefoundCities(world: SimWorld, tileCounts: Map<number, number>) {
  for (const civ of world.civs.values()) {
    if (civ.phase === 'dead') continue;
    const count = tileCounts.get(civ.id) || 0;
    if (count < CITY.tilesPerCity) continue;

    const rawAllowed = Math.floor(count / CITY.tilesPerCity) + 1;
    const ambitionFactor = civ.maxSize / SIM.maxAmbition;
    const maxCities = Math.max(1, Math.round(rawAllowed * (0.5 + ambitionFactor * 0.5 * CITY.maxCitiesAmbitionScale)));
    if (civ.cities.length >= maxCities) continue;

    // Find the civ tile farthest from all current cities — the natural hub of orphaned territory.
    let bestTile: { row: number; col: number } | null = null;
    let bestDist = CITY.minDistBetweenCities;
    for (let r = 0; r < world.height; r++) {
      for (let c = 0; c < world.width; c++) {
        const tile = world.tiles[r][c];
        if (tile.civId !== civ.id) continue;
        if (tile.state !== 'built' && tile.state !== 'cleared') continue;
        const d = nearestCityDist(civ, r, c);
        if (d > bestDist) { bestDist = d; bestTile = { row: r, col: c }; }
      }
    }
    if (bestTile) {
      const cityName = nameForNewCiv(world, bestTile.row, bestTile.col, civ.era);
      civ.cities.push({ row: bestTile.row, col: bestTile.col, prominence: 0.3, name: cityName, foundedTick: world.tick });
    }
  }
}

// --- Catastrophe ---

function rollCatastropheSeverity(): number {
  // Skewed distribution — mostly low, rarely high.
  return Math.pow(Math.random(), CATASTROPHE.severitySkew);
}

// Weighted by the world's temperament, so a wet world drowns and a volcanic one
// burns. Asteroids and plague stay roughly constant — they don't care what kind
// of planet this is.
function rollCatastropheType(ch: WorldCharacter): CatastropheType {
  const weights: Array<[CatastropheType, number]> = [
    ['plague', 1], ['asteroid', 1],
    ['flood', ch.flood], ['earthquake', 1 + (ch.volcano - 1) * 0.5], ['volcano', ch.volcano],
  ];
  let total = 0;
  for (const [, w] of weights) total += w;
  let roll = Math.random() * total;
  for (const [kind, w] of weights) { roll -= w; if (roll <= 0) return kind; }
  return 'plague';
}

// Hand the sim the standing-volcano locations the renderer placed. Each gets a
// position-staggered initial rest so they don't all erupt on the same tick.
export function setVolcanoes(world: SimWorld, coords: Array<{ row: number; col: number }>) {
  world.volcanoes = coords.map((p) => ({
    row: p.row, col: p.col,
    cooldown: VOLCANO.initialRestTicks + ((p.row * 31 + p.col * 17) % VOLCANO.restJitterTicks),
    erupting: 0,
    duration: VOLCANO.eruptTicks,
    intensity: 0,
    didDamage: false,
  }));
}

// Force every volcano to erupt now (debug / authored triggers).
export function eruptVolcanoesNow(world: SimWorld) {
  for (const v of world.volcanoes) { v.erupting = v.duration; v.intensity = 0; v.didDamage = false; }
}

// Hand the sim the wonders' settlement influence (renderer-placed).
export function setWonderSites(world: SimWorld, sites: WonderSite[]) {
  world.wonderSites = sites;
}

// Signed settlement pull of all wonders at a tile, summed with linear falloff.
// Positive draws civs in; negative (the volcano) pushes them away.
function wonderInfluenceAt(world: SimWorld, row: number, col: number): number {
  let s = 0;
  for (const w of world.wonderSites) {
    const d = Math.hypot(row - w.row, col - w.col);
    if (d >= w.radius) continue;
    s += w.pull * (1 - d / w.radius);
  }
  return s;
}

// Decay multiplier from feared wonders (the volcano): tiles on the dangerous
// slopes are abandoned faster, so a thin gap persists around the vent even
// between eruptions — fear made visible, not just a settling-order tweak.
function ventFearAt(world: SimWorld, row: number, col: number): number {
  let amp = 1;
  for (const w of world.wonderSites) {
    if (w.pull >= 0) continue;
    const d = Math.hypot(row - w.row, col - w.col);
    if (d >= w.radius) continue;
    amp += -w.pull * 0.15 * (1 - d / w.radius); // pull −4 → up to ~1.6× decay at the vent
  }
  return amp;
}

// Advance every volcano one tick: rest, then play out an eruption, scarring the
// land at its peak. The renderer reads `intensity` to animate the cone.
function stepVolcanoes(
  world: SimWorld,
  biomes: Biome[][],
  changed: Array<{ row: number; col: number }>,
  events: SimEvent[],
) {
  for (const v of world.volcanoes) {
    if (v.erupting > 0) {
      const progress = (v.duration - v.erupting) / v.duration; // 0 → ~1
      v.intensity = Math.sin(progress * Math.PI);
      if (!v.didDamage && progress >= 0.5) {
        eruptVolcano(world, biomes, v, changed, events);
        v.didDamage = true;
      }
      v.erupting--;
      if (v.erupting <= 0) {
        v.erupting = 0; v.intensity = 0; v.didDamage = false;
        v.cooldown = VOLCANO.restTicks + Math.floor(Math.random() * VOLCANO.restJitterTicks);
      }
    } else if (v.cooldown > 0) {
      v.cooldown--;
      if (v.cooldown <= 0) { v.erupting = v.duration; v.intensity = 0; v.didDamage = false; }
    }
  }
}

// The eruption's bite: tiles at the vent are scorched to bare wild, the ring
// around is thrown down to ruin (remembering the era that fell), and civs that
// lose ground sicken. Fires once per eruption, at the peak, and emits a
// 'volcano' catastrophe event so the renderer's eruption FX (flash, ash/lava
// scar, shake, narration) play at the vent.
function eruptVolcano(
  world: SimWorld,
  biomes: Biome[][],
  v: VolcanoState,
  changed: Array<{ row: number; col: number }>,
  events: SimEvent[],
) {
  const R = VOLCANO.damageRadius;
  const civTilesHit = new Map<number, number>();
  for (let r = Math.max(0, v.row - R); r <= Math.min(world.height - 1, v.row + R); r++) {
    for (let c = Math.max(0, v.col - R); c <= Math.min(world.width - 1, v.col + R); c++) {
      const dr = r - v.row, dc = c - v.col;
      const distSq = dr * dr + dc * dc;
      if (distSq > R * R) continue;
      if (biomes[r][c] === 'water') continue;
      const tile = world.tiles[r][c];
      const dist = Math.sqrt(distSq);
      const cid = tile.civId;
      if (tile.state === 'built' || tile.state === 'cleared') {
        if (dist <= VOLCANO.scorchRadius) {
          tile.state = 'wild'; tile.civId = null; tile.ruinEra = null;
        } else {
          const owner = cid != null ? world.civs.get(cid) : null;
          tile.state = 'ruin';
          tile.ruinEra = owner ? owner.era : tile.ruinEra;
          tile.civId = null;
        }
        tile.lastChangedTick = world.tick;
        changed.push({ row: r, col: c });
        if (cid != null) civTilesHit.set(cid, (civTilesHit.get(cid) || 0) + 1);
      } else if (tile.state === 'ruin' && dist <= VOLCANO.scorchRadius) {
        tile.state = 'wild'; tile.ruinEra = null; // old ruins at the vent are buried
        tile.lastChangedTick = world.tick;
        changed.push({ row: r, col: c });
      }
    }
  }
  const affectedCivIds: number[] = [];
  for (const cid of civTilesHit.keys()) {
    const civ = world.civs.get(cid);
    if (!civ || civ.phase === 'dead') continue;
    civ.vitality = Math.max(0.05, civ.vitality - VOLCANO.vitalityHit);
    if (civ.phase === 'rising' || civ.phase === 'stable') {
      enterPhase(civ, 'declining');
      events.push({ kind: 'civ_declining', civId: civ.id });
    }
    affectedCivIds.push(cid);
  }
  events.push({
    kind: 'catastrophe', centerRow: v.row, centerCol: v.col,
    affectedCivIds, severity: VOLCANO.severity, catastropheType: 'volcano', radius: R,
  });
}

export function applyCatastrophe(
  world: SimWorld,
  biomes: Biome[][],
  elevation: number[][],
  changed: Array<{ row: number; col: number }>,
  biomeChanged: BiomeChange[],
  events: SimEvent[]
) {
  // Use the brewing catastrophe (pre-rolled when pressure crossed the omen
  // threshold) so the disaster that arrives is the one foreshadowed. Manual
  // triggers and edge cases with no brewing state roll fresh.
  const brewing = world.brewing;
  world.brewing = null;
  const severity = brewing ? brewing.severity : rollCatastropheSeverity();
  const catastropheType = brewing ? brewing.type : rollCatastropheType(characterOf(world));

  // Knowledge-loss tier.
  const isMinor  = severity < CATASTROPHE.severityModerateThreshold;
  const isSevere = severity >= CATASTROPHE.severitySevereThreshold;

  // Terrain catastrophes use their own radius config; plague/asteroid use regionRadius (or severeRadius when severe).
  const baseRadius = catastropheType === 'flood' ? CATASTROPHE.floodRadius
    : catastropheType === 'earthquake' ? CATASTROPHE.earthquakeRadius
    : CATASTROPHE.regionRadius;
  const radius = (isSevere && catastropheType !== 'flood' && catastropheType !== 'earthquake')
    ? CATASTROPHE.severeRadius
    : Math.round(baseRadius * (0.4 + severity * 0.6));

  // Pick center from a random built tile for guaranteed impact.
  const builtTiles: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < world.height; r++) {
    for (let c = 0; c < world.width; c++) {
      if (world.tiles[r][c].state === 'built' && world.tiles[r][c].civId != null) {
        builtTiles.push({ row: r, col: c });
      }
    }
  }
  world.catastrophePressure = 0;
  world.lastCatastropheTick = world.tick;
  if (builtTiles.length === 0) return;

  let center = builtTiles[Math.floor(Math.random() * builtTiles.length)];
  if (catastropheType === 'volcano') {
    // Volcanoes erupt from high rock, preferring peaks that menace settlement.
    let best: { row: number; col: number } | null = null;
    let bestScore = -1;
    for (let tries = 0; tries < 160; tries++) {
      const r = Math.floor(Math.random() * world.height);
      const c = Math.floor(Math.random() * world.width);
      if (biomes[r][c] !== 'rock') continue;
      let score = Math.random();
      for (const bt of builtTiles) {
        const dr = bt.row - r, dc = bt.col - c;
        if (dr * dr + dc * dc <= CATASTROPHE.regionRadius * CATASTROPHE.regionRadius) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = { row: r, col: c }; }
    }
    if (best) center = best;
  }
  const centerRow = center.row, centerCol = center.col;

  // Safe civs: capitals outside the radius.
  const living = Array.from(world.civs.values()).filter(c => c.phase !== 'dead');
  const safeIds = new Set<number>(
    living
      .filter(civ => {
        const dr = civ.originRow - centerRow, dc = civ.originCol - centerCol;
        return dr * dr + dc * dc > radius * radius;
      })
      .map(civ => civ.id)
  );

  // Ember guarantee: pad safeIds to emberCount by protecting civs with fewest tiles in region.
  if (safeIds.size < CATASTROPHE.emberCount) {
    const regionCount = new Map<number, number>();
    for (let r = Math.max(0, centerRow - radius); r <= Math.min(world.height - 1, centerRow + radius); r++) {
      for (let c = Math.max(0, centerCol - radius); c <= Math.min(world.width - 1, centerCol + radius); c++) {
        const dr = r - centerRow, dc = c - centerCol;
        if (dr * dr + dc * dc > radius * radius) continue;
        const cid = world.tiles[r][c].civId;
        if (cid != null) regionCount.set(cid, (regionCount.get(cid) || 0) + 1);
      }
    }
    const candidates = living
      .filter(civ => !safeIds.has(civ.id))
      .sort((a, b) => (regionCount.get(a.id) || 0) - (regionCount.get(b.id) || 0));
    for (let i = 0; safeIds.size < CATASTROPHE.emberCount && i < candidates.length; i++) {
      safeIds.add(candidates[i].id);
    }
  }

  const civTilesHit = new Map<number, number>();

  if (catastropheType === 'flood') {
    // Flood: all land tiles in radius below the effective waterline become water permanently.
    // Uses real elevation so only low-lying coastal tiles drown.
    const effectiveWaterline = SEA_LEVEL + CATASTROPHE.floodDepth * severity;
    for (let r = Math.max(0, centerRow - radius); r <= Math.min(world.height - 1, centerRow + radius); r++) {
      for (let c = Math.max(0, centerCol - radius); c <= Math.min(world.width - 1, centerCol + radius); c++) {
        const dr = r - centerRow, dc = c - centerCol;
        if (dr * dr + dc * dc > radius * radius) continue;
        if (biomes[r][c] === 'water') continue;
        if (elevation[r][c] >= effectiveWaterline) continue;
        // This tile drowns.
        biomes[r][c] = 'water';
        biomeChanged.push({ row: r, col: c });
        const tile = world.tiles[r][c];
        const cid = tile.civId;
        if (tile.state !== 'wild') {
          tile.state = 'wild';
          tile.civId = null;
          tile.ruinEra = null;
          tile.lastChangedTick = world.tick;
          changed.push({ row: r, col: c });
          if (cid != null) civTilesHit.set(cid, (civTilesHit.get(cid) || 0) + 1);
        }
      }
    }
    // Flood also erases name memory from the drowned zone.
    world.nameMemory = world.nameMemory.filter(m => biomes[m.row]?.[m.col] !== 'water');
  } else if (catastropheType === 'earthquake' && isSevere) {
    // Rifting: the land tears along a line through the center; the sea pours
    // in over the following ticks (progressive terraform). The existing
    // breakaway machinery handles whatever the tear severs.
    const ang = Math.random() * Math.PI;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const queue: Array<{ row: number; col: number; targetElev: number }> = [];
    const pushedT = new Set<number>();
    for (const dir of [1, -1]) {
      let waterRun = 0;
      for (let s = dir === 1 ? 0 : 1; s <= 64; s++) {
        const cr = Math.round(centerRow + uy * s * dir);
        const cc = Math.round(centerCol + ux * s * dir);
        if (cr < 0 || cr >= world.height || cc < 0 || cc >= world.width) break;
        if (biomes[cr][cc] === 'water') { waterRun++; if (waterRun >= 3) break; continue; }
        waterRun = 0;
        for (let wOff = -1; wOff <= 1; wOff++) {
          const r = Math.round(cr + ux * wOff);
          const c = Math.round(cc - uy * wOff);
          if (r < 0 || r >= world.height || c < 0 || c >= world.width) continue;
          if (biomes[r][c] === 'water') continue;
          const k = r * world.width + c;
          if (pushedT.has(k)) continue;
          pushedT.add(k);
          queue.push({ row: r, col: c, targetElev: SEA_LEVEL - 0.06 - Math.random() * 0.04 });
        }
      }
    }
    queue.sort((a, b) =>
      (Math.abs(a.row - centerRow) + Math.abs(a.col - centerCol)) -
      (Math.abs(b.row - centerRow) + Math.abs(b.col - centerCol)));
    world.terraform = { queue, perTick: 0.8, acc: 0, civHits: new Map(), steamAt: null };
    events.push({ kind: 'rift_opened', row: centerRow, col: centerCol });
  } else if (catastropheType === 'earthquake') {
    // Sine-wave elevation perturbation: some land sinks below SEA_LEVEL, some sea floor rises.
    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    for (let r = Math.max(0, centerRow - radius); r <= Math.min(world.height - 1, centerRow + radius); r++) {
      for (let c = Math.max(0, centerCol - radius); c <= Math.min(world.width - 1, centerCol + radius); c++) {
        const dr = r - centerRow, dc = c - centerCol;
        const distSq = dr * dr + dc * dc;
        if (distSq > radius * radius) continue;
        const dist = Math.sqrt(distSq);
        const falloff = 1 - dist / radius;
        const disp = CATASTROPHE.earthquakeAmplitude * severity
          * Math.sin(dr * CATASTROPHE.earthquakeFreq + phase1)
          * Math.cos(dc * CATASTROPHE.earthquakeFreq + phase2)
          * falloff;
        const newElev = Math.max(-1, Math.min(1, elevation[r][c] + disp));
        elevation[r][c] = newElev;

        const wasWater = biomes[r][c] === 'water';
        const nowWater = newElev < SEA_LEVEL;

        if (!wasWater && nowWater) {
          biomes[r][c] = 'water';
          biomeChanged.push({ row: r, col: c });
          const tile = world.tiles[r][c];
          const cid = tile.civId;
          if (tile.state !== 'wild') {
            tile.state = 'wild';
            tile.civId = null;
            tile.ruinEra = null;
            tile.lastChangedTick = world.tick;
            changed.push({ row: r, col: c });
            if (cid != null) civTilesHit.set(cid, (civTilesHit.get(cid) || 0) + 1);
          }
        } else if (wasWater && !nowWater) {
          biomes[r][c] = newElev < SHORE_LEVEL ? 'sand' : 'grass';
          biomeChanged.push({ row: r, col: c });
        }
      }
    }
    world.nameMemory = world.nameMemory.filter(m => biomes[m.row]?.[m.col] !== 'water');
  } else if (catastropheType === 'volcano') {
    // Eruption: devastation with a tight core, a new rock cone at the vent,
    // and an ash ring that will feed farms for an age.
    const burnR = Math.max(4, Math.round(radius * 0.7));
    for (let r = Math.max(0, centerRow - radius); r <= Math.min(world.height - 1, centerRow + radius); r++) {
      for (let c = Math.max(0, centerCol - radius); c <= Math.min(world.width - 1, centerCol + radius); c++) {
        const dr = r - centerRow, dc = c - centerCol;
        const distSq = dr * dr + dc * dc;
        if (distSq > radius * radius) continue;
        if (biomes[r][c] === 'water') continue;
        const dist = Math.sqrt(distSq);
        const tile = world.tiles[r][c];
        const cid = tile.civId;
        if (dist <= 2.5) {
          // The cone.
          elevation[r][c] = Math.max(elevation[r][c], 0.7 - dist * 0.1);
          if (biomes[r][c] !== 'rock') { biomes[r][c] = 'rock'; biomeChanged.push({ row: r, col: c }); }
        }
        if (cid != null && safeIds.has(cid)) continue;
        if (dist <= burnR && (tile.state === 'built' || tile.state === 'cleared')) {
          const falloff = dist <= 3 ? 1 : Math.pow((burnR - dist) / (burnR - 3), 1.4);
          if (Math.random() < falloff) {
            const ownerCiv = cid != null ? world.civs.get(cid) : null;
            tile.state = isSevere ? 'wild' : 'ruin';
            tile.ruinEra = isSevere ? null : (ownerCiv ? ownerCiv.era : tile.ruinEra);
            tile.civId = null;
            tile.lastChangedTick = world.tick;
            changed.push({ row: r, col: c });
            if (cid != null) civTilesHit.set(cid, (civTilesHit.get(cid) || 0) + 1);
          }
        } else if (dist > burnR && !isMinor
            && (biomes[r][c] === 'grass' || biomes[r][c] === 'sand' || biomes[r][c] === 'forest')
            && tile.state === 'wild') {
          // Ash ring: surviving open land is enriched.
          biomes[r][c] = 'fertile';
          biomeChanged.push({ row: r, col: c });
        }
      }
    }
  } else {
    // Plague / asteroid: devastate built, cleared, and (for non-minor) ruin tiles.
    // Ruin tiles must also be affected — otherwise old high-era ruins survive inside the blast
    // and new civs immediately re-inherit the lost era, defeating the knowledge-loss mechanic.
    for (let r = Math.max(0, centerRow - radius); r <= Math.min(world.height - 1, centerRow + radius); r++) {
      for (let c = Math.max(0, centerCol - radius); c <= Math.min(world.width - 1, centerCol + radius); c++) {
        const dr = r - centerRow, dc = c - centerCol;
        const distSq = dr * dr + dc * dc;
        if (distSq > radius * radius) continue;
        if (biomes[r][c] === 'water') continue;
        const tile = world.tiles[r][c];

        const tileState = tile.state;
        const isBuilt = tileState === 'built' || tileState === 'cleared';
        const isRuin  = tileState === 'ruin';
        if (!isBuilt && !isRuin) continue;
        if (isRuin && isMinor) continue;
        if (isRuin && !isSevere && tile.ruinEra == null) continue;
        if (tile.civId != null && safeIds.has(tile.civId)) continue;

        // Asteroid: devastation tapers with distance outside the core.
        if (catastropheType === 'asteroid' && radius > CATASTROPHE.asteroidCoreRadius) {
          const dist = Math.sqrt(distSq);
          if (dist > CATASTROPHE.asteroidCoreRadius) {
            const falloff = Math.pow(
              (radius - dist) / (radius - CATASTROPHE.asteroidCoreRadius),
              CATASTROPHE.asteroidFalloffFactor
            );
            if (Math.random() > falloff) continue;
          }
        }

        const cid = tile.civId;
        if (isSevere) {
          tile.state = 'wild';
          tile.ruinEra = null;
          tile.civId = null;
        } else if (isBuilt) {
          const ownerCiv = cid != null ? world.civs.get(cid) : null;
          const currentEra = ownerCiv ? ownerCiv.era : tile.ruinEra;
          tile.state = 'ruin';
          tile.ruinEra = isMinor || currentEra == null
            ? currentEra
            : ERAS_ORDERED[Math.max(0, eraRank(currentEra) - CATASTROPHE.eraDowngradeSteps)];
          tile.civId = null;
        } else if (tile.ruinEra != null) {
          tile.ruinEra = ERAS_ORDERED[Math.max(0, eraRank(tile.ruinEra) - CATASTROPHE.eraDowngradeSteps)];
        }
        tile.lastChangedTick = world.tick;
        changed.push({ row: r, col: c });
        if (cid != null) civTilesHit.set(cid, (civTilesHit.get(cid) || 0) + 1);
      }
    }

    // Severe plague/asteroid also erase name memory in the blast zone.
    if (isSevere) {
      world.nameMemory = world.nameMemory.filter(m => {
        const dr = m.row - centerRow, dc = m.col - centerCol;
        return dr * dr + dc * dc > radius * radius;
      });
    }
    // A severe asteroid permanently craters: a water-filled center ringed
    // with raised rock. Old worlds stay readable by their wounds.
    if (catastropheType === 'asteroid' && isSevere) {
      for (let r = Math.max(0, centerRow - 4); r <= Math.min(world.height - 1, centerRow + 4); r++) {
        for (let c = Math.max(0, centerCol - 4); c <= Math.min(world.width - 1, centerCol + 4); c++) {
          const dr = r - centerRow, dc = c - centerCol;
          const dist = Math.sqrt(dr * dr + dc * dc);
          if (dist > 4) continue;
          const tile = world.tiles[r][c];
          if (dist <= 1.6) {
            elevation[r][c] = SEA_LEVEL - 0.1;
            if (biomes[r][c] !== 'water') { biomes[r][c] = 'water'; biomeChanged.push({ row: r, col: c }); }
            if (tile.state !== 'wild') {
              tile.state = 'wild'; tile.civId = null; tile.ruinEra = null;
              tile.lastChangedTick = world.tick;
              changed.push({ row: r, col: c });
            }
          } else if (dist <= 3 && biomes[r][c] !== 'water') {
            elevation[r][c] = Math.max(elevation[r][c], 0.68);
            if (biomes[r][c] !== 'rock') { biomes[r][c] = 'rock'; biomeChanged.push({ row: r, col: c }); }
          }
        }
      }
    }
  }

  // Vitality hit for all civs that lost tiles, scaled by severity.
  const affectedCivIds: number[] = [];
  for (const civ of living) {
    if (safeIds.has(civ.id) || !civTilesHit.has(civ.id)) continue;
    const scaledHit = CATASTROPHE.vitalityHit * (0.3 + severity * 0.7);
    civ.vitality = Math.max(0.05, civ.vitality - scaledHit);
    if (civ.phase === 'rising' || civ.phase === 'stable') {
      enterPhase(civ, 'declining');
      events.push({ kind: 'civ_declining', civId: civ.id });
    }
    affectedCivIds.push(civ.id);
  }

  events.push({ kind: 'catastrophe', centerRow, centerCol, affectedCivIds, severity, catastropheType, radius });

  // Near-misses: untouched living civs whose capital sat close to the blast.
  // The two closest get narrated — relief is half of suspense.
  if (severity >= CATASTROPHE.severityModerateThreshold) {
    const nearMisses = living
      .filter(civ => !affectedCivIds.includes(civ.id))
      .map(civ => {
        const dr = civ.originRow - centerRow, dc = civ.originCol - centerCol;
        return { civ, dist: Math.sqrt(dr * dr + dc * dc) };
      })
      .filter(({ dist }) => dist <= radius * CATASTROPHE.sparedRadiusFactor)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2);
    for (const { civ } of nearMisses) {
      events.push({ kind: 'spared', civId: civ.id, catastropheType });
    }
  }

  reconcileCities(world, events);
}

// --- Main step ---

export function step(
  world: SimWorld,
  biomes: Biome[][],
  elevation: number[][]
): { changes: Array<{ row: number; col: number }>; events: SimEvent[]; biomeChanges: BiomeChange[] } {
  world.tick++;
  const changed: Array<{ row: number; col: number }> = [];
  const biomeChanges: BiomeChange[] = [];
  const events: SimEvent[] = [];

  // The world's character as of this tick, hoisted once: the grid scan below
  // reads it per tile and it must not change mid-tick.
  const ch = characterOf(world);

  const snapshot: { state: TileState; civId: number | null }[][] = world.tiles.map((rowArr) =>
    rowArr.map((t) => ({ state: t.state, civId: t.civId }))
  );

  let landTiles = 0, settledTiles = 0;
  const civTileCounts = new Map<number, number>();
  for (let r = 0; r < world.height; r++) {
    for (let c = 0; c < world.width; c++) {
      if (biomes[r][c] !== 'water') {
        landTiles++;
        if (world.tiles[r][c].state !== 'wild') settledTiles++;
      }
      const cid = world.tiles[r][c].civId;
      if (cid != null) {
        civTileCounts.set(cid, (civTileCounts.get(cid) || 0) + 1);
      }
    }
  }
  let eraRankSum = 0, eraRankCount = 0;
  for (const civ of world.civs.values()) {
    const tileCount = civTileCounts.get(civ.id) || 0;
    const prevPhase = civ.phase;
    advanceCivPhase(civ, tileCount);
    advanceCivFortune(civ);
    if (civ.phase !== 'dead') { eraRankSum += eraRank(civ.era); eraRankCount++; }
    if (prevPhase !== 'declining' && prevPhase !== 'dead' && civ.phase === 'declining') {
      events.push({ kind: 'civ_declining', civId: civ.id });
    } else if (prevPhase !== 'dead' && civ.phase === 'dead') {
      events.push({ kind: 'civ_died', civId: civ.id });
    }
    // Rally: a declining civ with the wind at its back can pull out of the
    // dive — once. The viewer should never be certain a decline is fatal.
    if (civ.phase === 'declining' && !civ.hasRallied
        && civ.fortune >= SIM.rallyMinFortune && Math.random() < SIM.rallyChance) {
      civ.hasRallied = true;
      enterPhase(civ, 'stable');
      events.push({ kind: 'rally', civId: civ.id });
    }
    // Wonders: a golden age leaves a monument.
    if (civ.phase === 'stable' && !civ.wonder && tileCount >= SIM.wonderMinSize
        && civ.fortune > SIM.wonderMinFortune && Math.random() < SIM.wonderChance) {
      civ.wonder = { row: civ.originRow, col: civ.originCol };
      events.push({ kind: 'wonder_built', civId: civ.id, row: civ.originRow, col: civ.originCol });
    }
  }

  const decayCandidates = new Map<number, Array<{ row: number; col: number; severity: number }>>();

  for (let row = 0; row < world.height; row++) {
    for (let col = 0; col < world.width; col++) {
      if (biomes[row][col] === 'water') continue;
      const tile = world.tiles[row][col];
      const snap = snapshot[row][col];

      if (snap.state === 'cleared') {
        if (Math.random() < SIM.clearedToBuilt) {
          tile.state = 'built';
          tile.lastChangedTick = world.tick;
          changed.push({ row, col });
        }
        continue;
      }

      if (snap.state === 'built' && snap.civId != null) {
        const civ = world.civs.get(snap.civId);
        if (!civ) continue;

        let exposure = 0;
        let sameCivNeighbors = 0;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= world.height || nc < 0 || nc >= world.width) {
            exposure++;
            continue;
          }
          if (snapshot[nr][nc].civId !== civ.id) exposure++;
          else sameCivNeighbors++;
        }

        const isCapital = row === civ.originRow && col === civ.originCol;
        const civTileCount = civTileCounts.get(civ.id) || 0;
        const capitalProtected = isCapital && civTileCount > 1;

        if (capitalProtected) {
          // Skip decay.
        } else if (exposure === 0) {
          // Interior.
        } else {
          const exposureFactor = exposure / 4;
          const distFromCapital = nearestCityDist(civ, row, col);
          const distNormalized = distFromCapital / SIM.coreRadius;
          let distanceFactor: number;
          if (distNormalized < 1) {
            distanceFactor = SIM.coreProtectionFactor + (1 - SIM.coreProtectionFactor) * distNormalized;
          } else {
            distanceFactor = 1 + Math.pow(distNormalized - 1, 2) * SIM.peripheryDecayMultiplier;
          }
          const isolationDampener = Math.min(1, distNormalized);
          const isolationFactor = sameCivNeighbors === 0
            ? 1 + (SIM.isolationMultiplier - 1) * isolationDampener
            : 1.0;
          const deathPeripheryAmp = civ.phase === 'dead'
            ? 1.0 + (SIM.deathPeripheryAmp - 1.0) * Math.min(1, civ.phaseAge / SIM.deathPeripheryRampTicks)
            : 1.0;
          const deadDamp = civ.phase === 'dead' ? SIM.deathDecayMultiplier : 1.0;

          // Cold: settlement caught by the advancing ice is abandoned faster,
          // so civilisations visibly contract toward the warm belt and spread
          // back out on the thaw.
          const coldFactor = 1 + iceDepthAt(world, row, col, biomes[row][col]) * (SIM.ice.coldDecay - 1);

          const decayP = SIM.decayBase * effectiveDecayPressure(civ) * exposureFactor
            * distanceFactor * isolationFactor * deathPeripheryAmp * deadDamp
            * ventFearAt(world, row, col) * coldFactor;

          if (Math.random() < decayP) {
            const list = decayCandidates.get(civ.id) || [];
            list.push({ row, col, severity: decayP });
            decayCandidates.set(civ.id, list);
          }
        }

        if (civ.phase !== 'dead') {
          const myStrength = effectiveStrength(civ);
          // Fertility is the temperament's most legible consequence: a rich
          // world fills up, a barren one stays sparse for its whole life.
          const spreadP = SIM.spreadBase * myStrength * ch.fertility;
          const neighbors = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]];
          for (const [r, c] of neighbors) {
            if (r < 0 || r >= world.height || c < 0 || c >= world.width) continue;
            // The sea stops expansion. Mountains can be CLAIMED (so they take
            // the country's colour like the land around them) but never have a
            // city founded on them or buildings drawn on them — handled at
            // founding/landing and in the renderer.
            if (biomes[r][c] === 'water') continue;
            const neighborSnap = snapshot[r][c];
            const neighborTile = world.tiles[r][c];
            // Civs hurry toward a wonder's blessing and shrink from the
            // volcano's slopes — but the draw/dread is finite, so an ambitious
            // people still creeps onto the dangerous ground and is periodically
            // scoured, a deep-time cycle of settling and ruin.
            const infl = wonderInfluenceAt(world, r, c);
            const wonderMult = infl >= 0
              ? Math.min(1.7, 1 + infl * 0.14)
              : Math.max(0.3, 1 + infl * 0.16);

            if (neighborSnap.state === 'wild') {
              if (Math.random() < spreadP * wonderMult && neighborTile.state === 'wild') {
                neighborTile.state = 'cleared';
                neighborTile.civId = civ.id;
                neighborTile.ruinEra = null;
                neighborTile.lastChangedTick = world.tick;
                changed.push({ row: r, col: c });
              }
              continue;
            }

            if (neighborSnap.state === 'ruin') {
              const ruinSpreadP = spreadP * SIM.spreadIntoRuinFactor * wonderMult;
              if (Math.random() < ruinSpreadP && neighborTile.state === 'ruin') {
                neighborTile.state = 'cleared';
                neighborTile.civId = civ.id;
                neighborTile.ruinEra = null;
                neighborTile.lastChangedTick = world.tick;
                changed.push({ row: r, col: c });
              }
              continue;
            }

            if (neighborSnap.civId != null && neighborSnap.civId !== civ.id) {
              const otherCiv = world.civs.get(neighborSnap.civId);
              if (otherCiv && otherCiv.phase !== 'dead' && neighborSnap.state === 'built') {
                const otherStrength = Math.max(0.1, effectiveStrength(otherCiv));
                const strengthRatio = myStrength / otherStrength;
                if (strengthRatio > 1.15) {
                  const defenderDistFromCapital = nearestCityDist(otherCiv, r, c);
                  const defenderDistNorm = defenderDistFromCapital / SIM.coreRadius;
                  const defenderVulnerability = 1 + Math.pow(Math.max(0, defenderDistNorm - 1), 2) * SIM.peripheryDecayMultiplier * 0.5;
                  let attackerBonus = 1.0;
                  if (CITY.attackerProximityWeight > 0) {
                    const ad = nearestCityDist(civ, r, c) / SIM.coreRadius;
                    attackerBonus = 1 + CITY.attackerProximityWeight * Math.max(0, 1 - ad);
                  }
                  const conquestP = SIM.conquestBase * myStrength * (strengthRatio - 1) * defenderVulnerability * attackerBonus;
                  if (Math.random() < conquestP) {
                    if (Math.random() < 0.6) {
                      neighborTile.state = 'cleared';
                      neighborTile.civId = civ.id;
                      neighborTile.ruinEra = null;
                    } else {
                      neighborTile.state = 'ruin';
                      neighborTile.civId = null;
                      neighborTile.ruinEra = otherCiv.era;
                    }
                    neighborTile.lastChangedTick = world.tick;
                    changed.push({ row: r, col: c });
                    events.push({ kind: 'conquest', row: r, col: c, attackerId: civ.id, defenderId: otherCiv.id });
                  }
                }
              }
            }
          }
        }
        continue;
      }

      if (snap.state === 'ruin') {
        const age = world.tick - tile.lastChangedTick;
        if (age > SIM.ruinReclaimTicks && Math.random() < SIM.ruinReclaimChance) {
          tile.state = 'wild';
          tile.ruinEra = null;
          tile.lastChangedTick = world.tick;
          changed.push({ row, col });
        }
        continue;
      }
    }
  }

  for (const [civId, candidates] of decayCandidates) {
    candidates.sort((a, b) => b.severity - a.severity);
    const count = Math.min(candidates.length, SIM.maxDecaysPerCivPerTick);
    const civ = world.civs.get(civId);
    for (let i = 0; i < count; i++) {
      const { row, col } = candidates[i];
      const tile = world.tiles[row][col];
      if (tile.state === 'built' && tile.civId === civId) {
        tile.state = 'ruin';
        tile.civId = null;
        tile.ruinEra = civ ? civ.era : null;
        tile.lastChangedTick = world.tick;
        changed.push({ row, col });
      }
    }
  }

  // Ocean routes.
  maybeLaunchExpeditions(world, biomes, civTileCounts, events);
  advanceExpeditions(world, biomes, changed, events);

  // Breakaway check — only every 15 ticks to limit flood-fill cost.
  if (world.tick % 15 === 0) {
    maybeBreakaway(world, changed, events);
  }

  // City founding + reconcile — every foundingCheckInterval ticks.
  if (world.tick % CITY.foundingCheckInterval === 0) {
    reconcileCities(world, events);
    updateCityProminence(world);
    maybefoundCities(world, civTileCounts);
  }

  // Catastrophe pressure accumulates each tick; fires when threshold is crossed.
  // The build rate is modulated by a slow random walk so cadence isn't a
  // metronome — stretches of calm, then a quickening.
  world.pressureNoise += (Math.random() * 2 - 1) * CATASTROPHE.pressureNoiseStep
    - (world.pressureNoise - 1) * CATASTROPHE.pressureNoiseRevert;
  if (world.pressureNoise < 1 - CATASTROPHE.pressureNoiseMax) world.pressureNoise = 1 - CATASTROPHE.pressureNoiseMax;
  if (world.pressureNoise > 1 + CATASTROPHE.pressureNoiseMax) world.pressureNoise = 1 + CATASTROPHE.pressureNoiseMax;

  const settledFraction = landTiles > 0 ? settledTiles / landTiles : 0;
  // Deep time advances: the world ages faster the more it is settled, scaled
  // so the era arc always fits the chosen world-cycle length (see SIM).
  if (world.eraProgress < ERAS_ORDERED.length - 1) {
    const eraRateScale = SIM.eraReferenceCycle / SIM.worldCycleTicks;
    world.eraProgress += (SIM.eraProgressBase + settledFraction * SIM.eraProgressSettleWeight) * eraRateScale;
  }

  // Climate: the ice advances from both poles and withdraws, once per world.
  {
    const prev = world.iceExtent;
    world.iceExtent = iceExtentFor(world.tick, ch.ice);
    if (world.iceExtent > world.iceMax) world.iceMax = world.iceExtent;
    const peak = SIM.ice.peakCoverage * 0.98;
    if (prev < 0.06 && world.iceExtent >= 0.06) events.push({ kind: 'ice_advance' });
    else if (prev < peak && world.iceExtent >= peak) events.push({ kind: 'ice_peak' });
    else if (prev > 0.06 && world.iceExtent <= 0.06) events.push({ kind: 'ice_retreat' });
  }

  const avgEraRankNorm = eraRankCount > 0 ? eraRankSum / eraRankCount / (ERAS_ORDERED.length - 1) : 0;
  const timeFactor = Math.min(1, (world.tick - world.lastCatastropheTick) / 5000);
  world.catastrophePressure += (
    CATASTROPHE.pressureBuildBase +
    settledFraction * CATASTROPHE.pressureSettledWeight +
    avgEraRankNorm * CATASTROPHE.pressureEraWeight +
    timeFactor * CATASTROPHE.pressureTimeSinceLastWeight
  ) * world.pressureNoise * ch.pressure;

  // Once pressure commits to a direction, the coming catastrophe takes shape;
  // omens fire as it nears.
  if (!world.brewing && world.catastrophePressure >= CATASTROPHE.brewingThreshold) {
    world.brewing = { type: rollCatastropheType(characterOf(world)), severity: rollCatastropheSeverity(), omenStage: 0 };
  }
  if (world.brewing) {
    // Omen depth predicts magnitude: a minor event gets only the stage-1
    // murmur, severe ones escalate through all three. The viewer learns that
    // stage-3 language means something big — and a lone omen that fizzles
    // reads as the world muttering, not the narrator crying wolf.
    const maxNarratedStage = world.brewing.severity >= CATASTROPHE.severitySevereThreshold ? 3
      : world.brewing.severity >= CATASTROPHE.severityModerateThreshold ? 2 : 1;
    while (world.brewing.omenStage < CATASTROPHE.omenStages.length
        && world.catastrophePressure >= CATASTROPHE.omenStages[world.brewing.omenStage]) {
      world.brewing.omenStage++;
      if (world.brewing.omenStage <= maxNarratedStage) {
        events.push({
          kind: 'omen',
          stage: world.brewing.omenStage as 1 | 2 | 3,
          catastropheType: world.brewing.type,
          severity: world.brewing.severity,
        });
      }
    }
  }
  if (world.catastrophePressure >= CATASTROPHE.pressureFireThreshold) {
    applyCatastrophe(world, biomes, elevation, changed, biomeChanges, events);
  }

  // Standing volcanoes erupt on their own slow cycle, independent of the
  // pressure-driven roving catastrophe above.
  stepVolcanoes(world, biomes, changed, events);

  // Births arrive as visible migrations: the spawn roll starts a band
  // walking; the civ exists only when it settles.
  if (livingCivCount(world) < SIM.maxLivingCivs && world.pendingSettlements.length < 2) {
    if (Math.random() < SIM.baseCivSpawnChance) {
      const spot = pickCivSpawnTile(world, biomes);
      if (spot) {
        world.pendingSettlements.push({ row: spot.row, col: spot.col, ticksLeft: SIM.migrationTicks });
        events.push({ kind: 'migration', row: spot.row, col: spot.col });
      }
    }
  }
  for (let i = world.pendingSettlements.length - 1; i >= 0; i--) {
    const p = world.pendingSettlements[i];
    p.ticksLeft--;
    if (p.ticksLeft > 0) continue;
    world.pendingSettlements.splice(i, 1);
    const t = world.tiles[p.row][p.col];
    if (livingCivCount(world) >= SIM.maxLivingCivs) continue;
    if (biomes[p.row][p.col] === 'water' || (t.state !== 'wild' && t.state !== 'ruin')) continue;
    const newCiv = spawnCiv(world, p.row, p.col);
    changed.push({ row: p.row, col: p.col });
    events.push({ kind: 'civ_born', civId: newCiv.id });
  }

  // Progressive terraform: rifts tear, islands rise, bridges lift — a few
  // tiles per tick so the change is watchable.
  if (world.terraform) {
    const tf = world.terraform;
    tf.acc += tf.perTick;
    while (tf.acc >= 1 && tf.queue.length > 0) {
      tf.acc -= 1;
      const q = tf.queue.shift()!;
      elevation[q.row][q.col] = q.targetElev;
      const newBiome: Biome = q.targetElev < SEA_LEVEL ? 'water'
        : q.targetElev < SHORE_LEVEL ? 'sand'
        : q.targetElev > 0.65 ? 'rock' : 'grass';
      if (biomes[q.row][q.col] !== newBiome) {
        biomes[q.row][q.col] = newBiome;
        biomeChanges.push({ row: q.row, col: q.col });
      }
      const tile = world.tiles[q.row][q.col];
      if (newBiome === 'water' && tile.state !== 'wild') {
        const cid = tile.civId;
        tile.state = 'wild';
        tile.civId = null;
        tile.ruinEra = null;
        tile.lastChangedTick = world.tick;
        changed.push({ row: q.row, col: q.col });
        if (cid != null) {
          const h = (tf.civHits.get(cid) || 0) + 1;
          tf.civHits.set(cid, h);
          if (h === 5) {
            const civ = world.civs.get(cid);
            if (civ && (civ.phase === 'rising' || civ.phase === 'stable')) {
              civ.vitality = Math.max(0.05, civ.vitality - 0.4);
              enterPhase(civ, 'declining');
              events.push({ kind: 'civ_declining', civId: cid });
            }
          }
        }
      }
    }
    if (tf.queue.length === 0) {
      if (tf.steamAt) events.push({ kind: 'island_born', row: tf.steamAt.row, col: tf.steamAt.col });
      world.nameMemory = world.nameMemory.filter((m) => biomes[m.row]?.[m.col] !== 'water');
      world.terraform = null;
    }
  } else {
    // Rare spontaneous geology (one process at a time).
    const geoRoll = Math.random();
    if (geoRoll < 0.000025) {
      // An island rises in open water: shoal, then sand, then a rock cone.
      for (let tries = 0; tries < 30; tries++) {
        const r = 8 + Math.floor(Math.random() * (world.height - 16));
        const c = 8 + Math.floor(Math.random() * (world.width - 16));
        if (biomes[r][c] !== 'water') continue;
        let nearLand = false;
        for (let dr = -6; dr <= 6 && !nearLand; dr++) {
          for (let dc = -6; dc <= 6; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= world.height || cc < 0 || cc >= world.width) continue;
            if (biomes[rr][cc] !== 'water') { nearLand = true; break; }
          }
        }
        if (nearLand) continue;
        const queue: Array<{ row: number; col: number; targetElev: number }> = [];
        const stages: Array<[number, number]> = [[3, SEA_LEVEL - 0.02], [2, SHORE_LEVEL - 0.03], [1, SHORE_LEVEL + 0.08], [0, 0.7]];
        for (const [rad, target] of stages) {
          for (let dr = -3; dr <= 3; dr++) {
            for (let dc = -3; dc <= 3; dc++) {
              if (Math.sqrt(dr * dr + dc * dc) > rad + 0.4) continue;
              const rr = r + dr, cc = c + dc;
              if (rr < 0 || rr >= world.height || cc < 0 || cc >= world.width) continue;
              queue.push({ row: rr, col: cc, targetElev: target });
            }
          }
        }
        world.terraform = { queue, perTick: 0.06, acc: 0, civHits: new Map(), steamAt: { row: r, col: c } };
        events.push({ kind: 'island_rising', row: r, col: c });
        break;
      }
    } else if (geoRoll < 0.000045) {
      // A land bridge lifts across a narrow strait.
      outer:
      for (let tries = 0; tries < 40; tries++) {
        const r = 4 + Math.floor(Math.random() * (world.height - 8));
        const c = 4 + Math.floor(Math.random() * (world.width - 8));
        if (biomes[r][c] !== 'water') continue;
        for (const [dr, dc] of [[1, 0], [0, 1]] as const) {
          // Walk both ways to find land at each end with 3-7 water between.
          let back = 0;
          while (back < 2 && biomes[r - dr * (back + 1)]?.[c - dc * (back + 1)] === 'water') back++;
          if (biomes[r - dr * (back + 1)]?.[c - dc * (back + 1)] === undefined) continue;
          if (biomes[r - dr * (back + 1)][c - dc * (back + 1)] === 'water') continue;
          let len = back;
          while (len < 8 && biomes[r + dr * (len - back + 1)]?.[c + dc * (len - back + 1)] === 'water') len++;
          const er = r + dr * (len - back + 1), ec = c + dc * (len - back + 1);
          if (biomes[er]?.[ec] === undefined || biomes[er][ec] === 'water') continue;
          if (len < 3 || len > 7) continue;
          const queue: Array<{ row: number; col: number; targetElev: number }> = [];
          for (let s = -back; s <= len - back; s++) {
            queue.push({ row: r + dr * s, col: c + dc * s, targetElev: SHORE_LEVEL - 0.05 });
          }
          world.terraform = { queue, perTick: 0.15, acc: 0, civHits: new Map(), steamAt: null };
          events.push({ kind: 'land_bridge', row: r, col: c });
          break outer;
        }
      }
    }
  }

  stepLandDynamics(world, biomes, elevation, changed, biomeChanges);

  return { changes: changed, events, biomeChanges };
}

// The wild land breathes: forests and arid ground spread and pull back at their
// edges, and the shallows flip with the slow tide of the sea. Bounded to a few
// random tiles per tick so the change is gradual and watchable, and only ever
// touching unclaimed (wild/ruin) land so civ territory is never disturbed.
function stepLandDynamics(
  world: SimWorld,
  biomes: Biome[][],
  elevation: number[][],
  changed: Array<{ row: number; col: number }>,
  biomeChanges: BiomeChange[],
) {
  const L = SIM.land;
  const wet = 0.5 + 0.5 * Math.sin((world.tick / L.wetnessCycleTicks) * Math.PI * 2); // 0 dry … 1 wet, starts neutral
  const seaDelta = Math.sin((world.tick / L.seaCycleTicks) * Math.PI * 2) * L.seaAmp;
  const effSea = SEA_LEVEL + seaDelta, effShore = SHORE_LEVEL + seaDelta;
  const H = world.height, W = world.width;
  for (let a = 0; a < L.attemptsPerTick; a++) {
    const r = (Math.random() * H) | 0, c = (Math.random() * W) | 0;
    const tile = world.tiles[r][c];
    if (tile.state !== 'wild' && tile.state !== 'ruin') continue; // only unclaimed land breathes
    const b = biomes[r][c];

    // --- Coastline: the shallows flip as the sea breathes in and out ---
    if (b === 'water') {
      if (elevation[r][c] >= effSea && Math.random() < L.coastFlipChance) {
        biomes[r][c] = elevation[r][c] >= effShore ? 'grass' : 'sand';
        biomeChanges.push({ row: r, col: c });
      }
      continue;
    }
    if (b === 'sand' && elevation[r][c] < effSea && Math.random() < L.coastFlipChance) {
      biomes[r][c] = 'water';
      tile.state = 'wild'; tile.civId = null; tile.ruinEra = null; tile.lastChangedTick = world.tick;
      changed.push({ row: r, col: c });
      biomeChanges.push({ row: r, col: c });
      continue;
    }

    // --- Vegetation: woods and deserts spread and retreat (inland only, above
    // the beach band) ---
    if (elevation[r][c] < SHORE_LEVEL) continue;
    let fN = 0, sN = 0, gN = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const nb = biomes[nr][nc];
      if (nb === 'forest') fN++;
      else if (nb === 'sand') sN++;
      else if (nb === 'grass' || nb === 'fertile') gN++;
    }
    // A ruin under fresh greenery is reclaimed by the wild.
    const reclaim = () => {
      if (tile.state === 'ruin') { tile.state = 'wild'; tile.ruinEra = null; tile.lastChangedTick = world.tick; changed.push({ row: r, col: c }); }
    };
    if (b === 'grass' || b === 'fertile') {
      if (fN > 0 && Math.random() < L.vegFlipChance * wet * Math.min(1, fN / 3)) {
        biomes[r][c] = 'forest'; biomeChanges.push({ row: r, col: c }); reclaim(); // woods creep in when wet
      } else if (sN > 0 && Math.random() < L.vegFlipChance * (1 - wet) * Math.min(1, sN / 3)) {
        biomes[r][c] = 'sand'; biomeChanges.push({ row: r, col: c }); // arid ground spreads when dry
      }
    } else if (b === 'forest') {
      if (fN < 5 && Math.random() < L.vegFlipChance * (1 - wet) * 0.6) {
        biomes[r][c] = 'grass'; biomeChanges.push({ row: r, col: c }); // woods thin back at dry edges
      }
    } else if (b === 'sand') {
      if (gN + fN > 0 && Math.random() < L.vegFlipChance * wet * 0.8) {
        biomes[r][c] = 'grass'; biomeChanges.push({ row: r, col: c }); reclaim(); // desert greens when wet
      }
    }
  }
}

export function tileOverlayColor(
  tile: SimTile,
  world: SimWorld
): TileOverlay | null {
  if (tile.state === 'wild') return null;

  if (tile.state === 'ruin') {
    if (tile.ruinEra == null) {
      return { color: 0x3d3a36, alpha: 0.55, borderColor: 0x1a1008, borderAlpha: 0, borderWidth: 0 };
    }
    const t = ERA_TREATMENT[tile.ruinEra];
    const color = applyTreatment(t.ruinColor, { ...t, satMult: t.satMult * 0.35, brightMult: t.brightMult * 0.72 });
    return { color, alpha: 0.60, borderColor: t.borderColor, borderAlpha: t.borderAlpha * 0.55, borderWidth: t.borderWidth * 0.7 };
  }

  if (tile.civId == null) return null;
  const civ = world.civs.get(tile.civId);
  if (!civ) return null;
  const t = ERA_TREATMENT[civ.era];
  const color = applyTreatment(civ.color, t);

  if (civ.phase === 'dead') {
    return { color, alpha: 0.65, borderColor: t.borderColor, borderAlpha: t.borderAlpha * 0.5, borderWidth: t.borderWidth };
  }
  const alpha = tile.state === 'cleared' ? 0.50 : 0.62;  // built: readable ownership tint; buildings show density on top
  return { color, alpha, borderColor: t.borderColor, borderAlpha: t.borderAlpha, borderWidth: t.borderWidth };
}

export function seedInitialCivs(
  world: SimWorld,
  biomes: Biome[][],
  count: number
): Array<{ row: number; col: number }> {
  const seeded: Array<{ row: number; col: number }> = [];
  for (let i = 0; i < count; i++) {
    const spot = pickCivSpawnTile(world, biomes);
    if (!spot) break;
    spawnCiv(world, spot.row, spot.col);
    seeded.push(spot);
  }
  return seeded;
}