import { Application, Assets, Container, Graphics, MeshPlane, RenderTexture, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { generateBiomeMap, BIOME_COLORS } from './biomes';
import { drawTile, drawStateOverlayPersistent, redrawOverlay, redrawBiomeTile, lerpColor, gridToScreen, rgbToHsl, hslToRgb } from './iso';
import { createSimWorld, step, tileOverlayColor, seedInitialCivs, applyCatastrophe, CATASTROPHE, CITY, nearestCityDist, type SimWorld, type Civ, type SimEvent, type Era, type TileOverlay, type BiomeChange, type CatastropheType } from './sim';
import * as audio from './audio';
import { createAtmosphere, ATMOS } from './atmosphere';

const ERA_TINT: Record<string, string> = {
  neolithic: '#8a7a5a',   // earthy brown
  classical: '#b0915a',   // bronze
  medieval: '#7a8a6a',    // mossy
  industrial: '#5a5a5a',  // soot gray
  modern: '#6a8aa0',      // steel blue
  post: '#9a7aa0',        // synthetic violet
};

const GRID_SIZE = 96;
const ticksPerSecond = 30;
const SKIP_TICKS = 5000;
const CATACLYSM_INTERVAL = 100000; // ticks between auto-rerolls — the world ends and a new one is rolled.
const CATACLYSM_NARRATIONS = [
  'A cataclysm unmakes the world. A new land emerges from the dust.',
  'The world ends in fire. The cycle begins again, on a new shore.',
  'All things pass. The world unbinds itself and a new land takes shape.',
  'An age beyond memory closes. New coasts rise where the old ones drowned.',
  'The deep time turns over. What was is forgotten; a new world begins.',
];
const SHOW_BUILDING_SPRITES = true;
// Civ ownership: tile-fill tint (the diamond color overlay) vs. just the border outline.
// Off → rely on civ-colored borders alone to read territory.
const SHOW_TILE_TINT = true;
const TILE_TINT_OPACITY = 0.5;  // multiplier on overlay alpha (1.0 = original strength)

// No-plinth building body paths (99×85px). All have an open hollow top for a roof.
// SIMPLE = fill-order 0-1, 1-story hinterland. GRAND = fill-order 2-3, each floor of a 2-story city building.
const BODY_FRAME_PATHS = [
  '/sprites/buildings/buildingTiles_048.png',  // 0 cream, glass panels
  '/sprites/buildings/buildingTiles_051.png',  // 1 cream/yellow, windows
  '/sprites/buildings/buildingTiles_050.png',  // 2 stone/grey, glass
  '/sprites/buildings/buildingTiles_043.png',  // 3 tan/brown brick
  '/sprites/buildings/buildingTiles_044.png',  // 4 cream, arched windows
  '/sprites/buildings/buildingTiles_045.png',  // 5 red, arched windows
  '/sprites/buildings/buildingTiles_047.png',  // 6 tan brick, rect windows
  '/sprites/buildings/buildingTiles_049.png',  // 7 red, arched windows
];
const BODY_FRAMES_SIMPLE = [0, 1, 2, 3];  // fill-order 0-1: calmer 1-story
const BODY_FRAMES_GRAND  = [4, 5, 6, 7];  // fill-order 2-3: richer 2-story floors

// Roof paths (99×54-63px, same width as body frames).
// SIMPLE = flat/hip for hinterland. GRAND = pitched/barrel for city core.
const ROOF_FRAME_PATHS = [
  '/sprites/buildings/buildingTiles_094.png',  // 0 cream hip
  '/sprites/buildings/buildingTiles_095.png',  // 1 cream hip alt
  '/sprites/buildings/buildingTiles_067.png',  // 2 cream wedge
  '/sprites/buildings/buildingTiles_063.png',  // 3 cream pitched
  '/sprites/buildings/buildingTiles_074.png',  // 4 red pitched
  '/sprites/buildings/buildingTiles_075.png',  // 5 red pitched alt
  '/sprites/buildings/buildingTiles_090.png',  // 6 red barrel
  '/sprites/buildings/buildingTiles_088.png',  // 7 dark grey pitched
];
const ROOF_FRAMES_SIMPLE = [0, 1, 2, 3];  // fill-order 0-1
const ROOF_FRAMES_GRAND  = [4, 5, 6, 7];  // fill-order 2-3

// Scale and vertical stacking geometry.
const BUILDING_SCALE   = 0.12;
const BODY_WALL_PX     = 35;  // native pixels from front-wall-top-rim to base (y≈50 of 85px sprite)
const BODY_OFFSET      = BODY_WALL_PX * BUILDING_SCALE; // 4.2px — vertical step per story

const DENSITY = {
  proximityScale:   11,   // halo radius (tiles) at prominence 1.0; scales with city prominence
  falloffPower:     2.5,  // power-curve steepness — higher = sharper drop at edge
  vitalityBase:     0.20, // density multiplier floor when civ vitality = 0
  slot1:  0.20,           // density → 1 building (below = 0 buildings, bare ground)
  slot2:  0.40,           // → 2 buildings
  slot3:  0.60,           // → 3 buildings
  slot4:  0.80,           // → 4 buildings
  easeSpeed: 0.07,        // alpha lerp speed for building fade-in/out
  refreshInterval: 15,    // ticks between full density recomputes (vitality drift)
};

// Sub-slot offsets [dx, dy] from the tile center.
// Each slot is the BOTTOM VERTEX of its quadrant sub-tile — where a building rests on
// the iso floor. Derived by taking the sub-tile center (±0.25 col/row) and shifting to
// its bottom vertex (+0.25 in both axes), then projecting: dx=(dc-dr)*16, dy=(dc+dr)*8.
// Front slot (0, +8) matches Phase-1's single-building position exactly.
const SLOT_POSITIONS: [number, number][] = [
  [ 0,  0],  // back  NW
  [ 8,  4],  // right NE
  [-8,  4],  // left  SW
  [ 0,  8],  // front SE  ← same as Phase-1
];
// Iso depth within a tile: back < sides < front.
const SLOT_DEPTHS = [0, 1, 1, 2] as const;

// Per-building tonal variation — moderate, stable per (row,col,slot).
// Half-width of the variation band around the civ's base HSL.
const BUILDING_VARIATION = {
  lightness:  0.10,  // ±10% L
  saturation: 0.18,  // ±18% S
};

// Era height range: [floors at lowest density, floors at highest density].
// A building's floor count interpolates between these by tile density (city-core
// proximity * civ vitality), with a small stable noise added so it isn't a smooth
// radial gradient.
const ERA_HEIGHT_RANGE: Record<Era, [number, number]> = {
  neolithic:  [1, 1],  // squat huts everywhere
  classical:  [1, 2],
  medieval:   [1, 2],  // sparse 1, dense 2
  industrial: [1, 3],
  modern:     [1, 4],
  post:       [1, 6],  // sparse 1, medium 3, dense 6
};
const HEIGHT_NOISE = 0.6;   // ±floors of stable per-(tile,slot) jitter on the density gradient
const MAX_EXTRA_FLOORS = 5; // safety cap (matches max floors-1 across all eras)

const ERA_SAT_MULT: Record<Era, number> = {
  neolithic:  0.30,  // heavily muted toward gray
  classical:  0.55,
  medieval:   0.75,
  industrial: 0.95,
  modern:     1.15,
  post:       1.40,  // boosted past natural saturation for synthetic vivid
};
const ERA_SAT_EASE = 0.04;  // per-tick ease toward target saturation when era changes

// --- Label config (tune by eye) ---
const LABEL = {
  minOpacity:     0.35, // opacity at tileCountMin
  maxOpacity:     1.0,  // opacity at tileCountMax
  minFontSize:    10,   // px
  maxFontSize:    18,   // px
  tileCountMin:   5,    // tile count that maps to min scale
  tileCountMax:   300,  // tile count that maps to max scale
  fontFamily:     'Georgia, "Times New Roman", serif',
  strokeColor:    0x000000,
  strokeWidth:    2.5,
  shadowAlpha:    0.55,
  shadowBlur:     4,
  shadowDist:     1.5,
  phaseRising:    ' ▲',
  phaseDeclining: ' ▼',
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cardinalDesc(row: number, col: number): string {
  const cy = GRID_SIZE / 2, cx = GRID_SIZE / 2;
  const dy = row - cy, dx = col - cx;
  const parts: string[] = [];
  if (Math.abs(dy) > GRID_SIZE * 0.15) parts.push(dy < 0 ? 'northern' : 'southern');
  if (Math.abs(dx) > GRID_SIZE * 0.15) parts.push(dx > 0 ? 'eastern' : 'western');
  return parts.length ? parts.join(' ') : 'central';
}

// The "voice" of an omen follows the leading civilization's era — neolithic
// worlds read auguries, modern ones read instruments.
type EraBucket = 'ancient' | 'middle' | 'late';
function dominantEra(world: SimWorld): Era {
  let bestCount = -1;
  let bestEra: Era = 'neolithic';
  for (const civ of world.civs.values()) {
    if (civ.phase === 'dead') continue;
    const n = civStats.tileCounts.get(civ.id) || 0;
    if (n > bestCount) { bestCount = n; bestEra = civ.era; }
  }
  return bestEra;
}
function dominantEraBucket(world: SimWorld): EraBucket {
  const rank = ['neolithic', 'classical', 'medieval', 'industrial', 'modern', 'post'].indexOf(dominantEra(world));
  return rank <= 1 ? 'ancient' : rank <= 3 ? 'middle' : 'late';
}

// Omen lines: [type][stage 1-3][era bucket]. Stage 1 is a murmur, stage 3 is
// imminent. Specificity over explanation — the line should feel overheard.
const OMEN_LINES: Record<string, Record<EraBucket, string[]>[]> = {
  plague: [
    { ancient: ['The rats come boldly into the granaries now.', 'The birds have gone quiet around the wells.'],
      middle:  ['Sickness lingers in the river towns longer than it should.', 'The gravediggers report unusual custom.'],
      late:    ['The clinics log anomalies and file them away.', 'Something is moving through the livestock, the bulletins say.'] },
    { ancient: ['Fever crosses from village to village, faster than walking.', 'The healers burn herbs day and night, and still the coughing spreads.'],
      middle:  ['Quarantine flags appear in the harbor towns.', 'The physicians argue about causes. The bells toll oftener.'],
      late:    ['The hospitals stop publishing their numbers.', 'Quiet directives close the ports, one by one.'] },
    { ancient: ['The auguries fail. The priests have no more answers.', 'Whole households sleep and do not wake.'],
      middle:  ['The dead-carts run by daylight now.', 'The bells have stopped tolling. There are too many.'],
      late:    ['The broadcasts repeat yesterday’s reassurances.', 'The last bulletins contradict each other.'] },
  ],
  asteroid: [
    { ancient: ['A new star hangs low in the evening sky.', 'The stargazers argue about a light that was not there before.'],
      middle:  ['Astronomers note an irregular body in their tables.', 'A wandering star troubles the almanacs.'],
      late:    ['A survey flags an object on a poor trajectory.', 'The deep-sky networks log an approach. Probability low, they say.'] },
    { ancient: ['The new star is brighter now. It does not move like the others.', 'Strange dusks; the omens are read in falling dust.'],
      middle:  ['The comet grows. Pamphlets call it judgment.', 'The observatories track the visitor nightly. The court is not told.'],
      late:    ['The deflection windows close, one by one.', 'The object brightens. The models converge unpleasantly.'] },
    { ancient: ['The star can be seen by day.', 'Children point at the sky. The old ones look away.'],
      middle:  ['The light casts shadows at midnight.', 'The astronomers have stopped publishing their tables.'],
      late:    ['The sky is wrong, and everyone can see it.', 'The final projections are not released.'] },
  ],
  flood: [
    { ancient: ['The tide does not go all the way out.', 'Salt creeps into the low wells.'],
      middle:  ['The harbor steps are wet where they used to be dry.', 'The dike-reeves report seepage in strange places.'],
      late:    ['The gauges drift above their averages.', 'The insurers quietly redraw the coastal maps.'] },
    { ancient: ['The marsh birds have gone. The elders watch the waterline.', 'The fishing huts stand in water at noon.'],
      middle:  ['The spring tides top the old marks, two hands and rising.', 'The millponds back up; the sluices groan.'],
      late:    ['The pumping stations run day and night.', 'The barometers fall, and go on falling.'] },
    { ancient: ['The sea is in the streets at high tide.', 'The low fields shine with standing water.'],
      middle:  ['The sea wall weeps at every joint.', 'Carts leave the low quarters loaded with everything.'],
      late:    ['The evacuation routes are published, too late to read.', 'The sea stands above the datum and does not recede.'] },
  ],
  earthquake: [
    { ancient: ['The dogs will not settle at night.', 'The well water has gone cloudy.'],
      middle:  ['Miners report knocking in the deep galleries.', 'Hairline cracks walk up the cathedral wall.'],
      late:    ['The seismographs record a murmur, repeating.', 'Small quakes cluster along the old fault.'] },
    { ancient: ['Small tremors crack the new plaster.', 'Birds rise from the hills all at once, for no reason.'],
      middle:  ['Chandeliers swing in still air.', 'The mine shafts are abandoned below the third level.'],
      late:    ['The arrays light up nightly now. The models disagree only on when.', 'The gas lines are shut across the lowlands, as a precaution.'] },
    { ancient: ['The ground hums. The standing stones lean.', 'Springs run warm that always ran cold.'],
      middle:  ['The masons refuse to work on the towers.', 'The bells ring themselves, faintly, at night.'],
      late:    ['The ground sings in the instruments’ range. Then it stops.', 'The seismographs go silent. The silence is wrong.'] },
  ],
};

function narrateEvent(ev: SimEvent, world: SimWorld): string {
  switch (ev.kind) {
    case 'civ_born': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      const loc = cardinalDesc(civ.originRow, civ.originCol);
      const byEra: Record<Era, string[]> = {
        neolithic: [
          `The ${civ.name} stir in the ${loc} hills.`,
          `${civ.name} gathers in the ${loc} wilds.`,
        ],
        classical: [
          `${civ.name} rises from ${loc} soil.`,
          `A new people call themselves ${civ.name}.`,
        ],
        medieval: [
          `${civ.name} stakes a claim in the ${loc}.`,
          `The hold of ${civ.name} is founded in the ${loc}.`,
        ],
        industrial: [
          `${civ.name} rises from ${loc} valleys, smoke on the horizon.`,
          `${civ.name} takes root, furnaces already burning.`,
        ],
        modern: [
          `${civ.name} establishes itself in the ${loc} reaches.`,
          `${civ.name} emerges, quick and deliberate.`,
        ],
        post: [
          `${civ.name} crystallizes in the ${loc} wastes.`,
          `${civ.name} coheres from ${loc} remnants.`,
        ],
      };
      return pick(byEra[civ.era]);
    }
    case 'civ_declining': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      return pick([
        `${civ.name} begins to falter.`,
        `Cracks spread through ${civ.name}.`,
        `${civ.name} enters its long twilight.`,
        `The vigor drains from ${civ.name}.`,
      ]);
    }
    case 'civ_died': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      return pick([
        `${civ.name} crumbles into ruin.`,
        `${civ.name} fades from the land.`,
        `The last embers of ${civ.name} go dark.`,
        `${civ.name} is remembered only in stone.`,
      ]);
    }
    case 'colony_founded': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      if (ev.desperate) {
        return pick([
          `Refugees of ${civ.name} raise shelters on a far shore.`,
          `The exiles of ${civ.name} make landfall, and look back at the smoke.`,
        ]);
      }
      // Routine colonies are frequent; narrate only some so the log keeps quiet.
      if (Math.random() > 0.3) return '';
      return pick([
        `${civ.name} plants a colony across the sea.`,
        `Sailors of ${civ.name} make landfall on a distant shore.`,
        `${civ.name} reaches beyond the waves.`,
      ]);
    }
    case 'omen': {
      const bucket = dominantEraBucket(world);
      return pick(OMEN_LINES[ev.catastropheType][ev.stage - 1][bucket]);
    }
    case 'spared': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      switch (ev.catastropheType) {
        case 'plague':     return pick([`The sickness passes ${civ.name} by.`, `In ${civ.name}, the fires are lit for the dead of others.`]);
        case 'asteroid':   return pick([`The fire falls short of ${civ.name}.`, `In ${civ.name}, the impact is a light on the horizon.`]);
        case 'flood':      return pick([`The waters stop at the borders of ${civ.name}.`, `${civ.name} keeps its feet dry, this time.`]);
        case 'earthquake': return pick([`In ${civ.name}, only the dishes rattled.`, `The cracks reach toward ${civ.name} and stop.`]);
      }
      return '';
    }
    case 'rally': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      return pick([
        `Against the run of fate, ${civ.name} steadies.`,
        `${civ.name} does not fall. Not this year.`,
        `Some stubbornness in ${civ.name} refuses the end.`,
      ]);
    }
    case 'last_flight': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      return pick([
        `The last ships of ${civ.name} put to sea.`,
        `${civ.name} sends its children seaward while it still can.`,
      ]);
    }
    case 'refuge_founded': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      return pick([
        `The ships of ${ev.parentName} make landfall. They name the place ${civ.name}, not knowing home is gone.`,
        `${civ.name} is founded by sailors of ${ev.parentName}, who will wait for word that never comes.`,
      ]);
    }
    case 'breakaway': {
      const child = world.civs.get(ev.newCivId);
      const parent = world.civs.get(ev.parentId);
      if (!child || !parent) return '';
      return pick([
        `${child.name} breaks free of ${parent.name}.`,
        `The colony of ${child.name} declares itself apart from ${parent.name}.`,
        `${child.name} charts its own course, splitting from ${parent.name}.`,
      ]);
    }
    case 'city_fell': {
      const civ = world.civs.get(ev.civId);
      const civName = civ?.name ?? null;
      if (ev.prominence >= 0.7) {
        return ev.wasCapital && civName
          ? pick([`The great city of ${ev.cityName} has fallen. ${civName} loses its heart.`, `${ev.cityName} burns. An age ends for ${civName}.`])
          : pick([`The great city of ${ev.cityName} is thrown down.`, `${ev.cityName} falls, and the land remembers.`]);
      }
      return ev.wasCapital && civName
        ? `${ev.cityName} falls. ${civName} is without a capital.`
        : `The city of ${ev.cityName} falls to ruin.`;
    }
    case 'capital_moved': {
      const civ = world.civs.get(ev.civId);
      // Tiny civs shuffling capitals is bookkeeping, not story.
      if (civ && (civStats.tileCounts.get(civ.id) || 0) < 30) return '';
      const civName = civ?.name ?? ev.newCapitalName;
      return pick([
        `With ${ev.oldCapitalName} fallen, the seat of ${civName} passes to ${ev.newCapitalName}.`,
        `${ev.newCapitalName} rises as the new heart of ${civName}.`,
        `${civName} retreats. ${ev.newCapitalName} is named the new capital.`,
      ]);
    }
    case 'catastrophe': {
      const loc = cardinalDesc(ev.centerRow, ev.centerCol);
      const civ = ev.affectedCivIds.length > 0 ? world.civs.get(ev.affectedCivIds[0]) : null;
      const n = civ?.name ?? null;
      const isMinor  = ev.severity < CATASTROPHE.severityModerateThreshold;
      const isSevere = ev.severity >= CATASTROPHE.severitySevereThreshold;
      if (ev.catastropheType === 'flood') {
        if (isSevere) return n
          ? pick([`The sea rises and swallows the ${loc}. The coasts of ${n} vanish beneath the waves.`, `The waters take the ${loc} lowlands. The cities of ${n} drown.`])
          : pick([`The sea rises and swallows the ${loc} lowlands.`, `The waters claim the ${loc}. The coast retreats forever.`]);
        if (isMinor) return n
          ? `Floodwaters lap at the edges of ${n} in the ${loc}.`
          : `The tides rise briefly in the ${loc}.`;
        return n
          ? pick([`The sea claims part of the ${loc} coast. ${n} retreats inland.`, `Flooding reshapes the ${loc} lowlands. ${n} loses ground to the sea.`])
          : pick([`The sea claims the ${loc} lowlands.`, `Flooding reshapes the ${loc} coast.`]);
      }
      if (ev.catastropheType === 'earthquake') {
        if (isSevere) return n
          ? pick([`The earth heaves and the ${loc} coastline is remade. ${n}'s heartland splits as the ground tears open.`, `The ground tears open in the ${loc}. The coast is unrecognizable. ${n} is lost to the chasm.`])
          : pick([`The earth heaves and the ${loc} coastline is remade.`, `The ground shifts in the ${loc}. Land sinks; sea floor rises. The map rewrites itself.`]);
        if (isMinor) return n
          ? `A tremor reshapes the ${loc} coast. The margins of ${n} shift.`
          : `A tremor moves through the ${loc}. The coastline edges.`;
        return n
          ? pick([`The ${loc} coast tears and buckles. ${n} loses ground to the sea.`, `An earthquake rearranges the ${loc} lowlands. ${n} finds new borders where water was.`])
          : pick([`The ${loc} coast tears and buckles. New water, new land.`, `An earthquake rearranges the ${loc} shoreline.`]);
      }
      if (ev.catastropheType === 'asteroid') {
        if (isSevere) return n
          ? pick([`The sky tears open over the ${loc}. ${n} ceases to be.`, `A light falls and does not stop. ${n} burns. An age is unmade.`])
          : pick([`The sky falls on the ${loc}. An age is unmade.`, `Fire without end strikes the ${loc}. The land is reset.`]);
        if (isMinor) return n
          ? `A small fire falls in the ${loc}. ${n} is shaken but survives.`
          : `Something falls from the sky in the ${loc}. Little is left.`;
        return n
          ? pick([`Fire from the heavens strikes the ${loc}. ${n} is brought low.`, `A stone from the sky reshapes the ${loc}. ${n} reels.`])
          : pick([`Fire from the heavens strikes the ${loc}.`, `A stone from the sky falls upon the ${loc}.`]);
      }
      // plague
      if (isSevere) return n
        ? pick([`A great dying sweeps the ${loc} lands. The cities of ${n} fall silent.`, `An age ends in the ${loc}. The works of ${n} crumble to dust.`])
        : pick([`A great dying sweeps the ${loc} lands.`, `Ruin falls upon the ${loc}. An age ends in silence.`]);
      if (isMinor) return n
        ? `A plague thins the cities of ${n} in the ${loc}.`
        : `A plague moves through the ${loc} settlements.`;
      return n
        ? pick([`Disease sweeps the ${loc} lands. ${n} falters.`, `Plague and collapse come to the ${loc}. ${n} is brought low.`])
        : pick([`Disease sweeps the ${loc} lands.`, `The ${loc} lands go dark. Something vast has ended.`]);
    }
  }
}

// --- Event log ---
interface LogEntry { text: string; ts: number; variant?: 'catastrophe' | 'omen' | 'relief'; }
const eventLog: LogEntry[] = [];
const LOG_MAX = 5;
const LOG_LIFETIME_MS = 22000;
const LOG_FADE_AFTER_MS = 13000;

const logPanel = document.createElement('div');
logPanel.style.cssText = `
  position: fixed; bottom: 12px; left: 12px; width: 340px;
  display: flex; flex-direction: column; gap: 2px;
  pointer-events: none; user-select: none;
`;
document.body.appendChild(logPanel);

// Event kinds that always get a log line. Everything else yields if the log
// was written recently — suspense needs stretches of quiet between beats.
const PRIORITY_EVENTS = new Set<SimEvent['kind']>([
  'omen', 'catastrophe', 'spared', 'rally', 'last_flight', 'refuge_founded',
  'civ_died', 'civ_declining',
]);
const LOG_QUIET_MS = 4500;
let lastLogPushTs = 0;

function pushLogEvents(evs: SimEvent[]) {
  for (const ev of evs) {
    const now = Date.now();
    if (!PRIORITY_EVENTS.has(ev.kind) && now - lastLogPushTs < LOG_QUIET_MS) continue;
    const text = narrateEvent(ev, simWorld);
    if (!text) continue;
    lastLogPushTs = now;
    const variant = ev.kind === 'catastrophe' ? 'catastrophe' as const
      : ev.kind === 'omen' ? 'omen' as const
      : (ev.kind === 'spared' || ev.kind === 'rally') ? 'relief' as const
      : undefined;
    eventLog.unshift({ text, ts: Date.now(), variant });
  }
  if (eventLog.length > LOG_MAX) eventLog.length = LOG_MAX;
}

function updateEventLog() {
  const now = Date.now();
  for (let i = eventLog.length - 1; i >= 0; i--) {
    if (now - eventLog[i].ts > LOG_LIFETIME_MS) eventLog.splice(i, 1);
  }
  logPanel.innerHTML = eventLog.map((e) => {
    const age = now - e.ts;
    const opacity = age < LOG_FADE_AFTER_MS
      ? 0.88
      : 0.88 * (1 - (age - LOG_FADE_AFTER_MS) / (LOG_LIFETIME_MS - LOG_FADE_AFTER_MS));
    const bg = e.variant === 'catastrophe' ? 'rgba(55,12,12,0.92)'
      : e.variant === 'omen' ? 'rgba(38,34,48,0.90)'
      : e.variant === 'relief' ? 'rgba(228,238,222,0.88)'
      : 'rgba(245,238,220,0.84)';
    const fg = e.variant === 'catastrophe' ? '#e8c8a0'
      : e.variant === 'omen' ? '#b8aed0'
      : e.variant === 'relief' ? '#3a4a34'
      : '#3a3020';
    const style = e.variant === 'omen' ? 'font-style:italic;' : '';
    return `<div style="background:${bg};padding:4px 10px;border-radius:2px;${style}
      font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:${fg};
      opacity:${opacity.toFixed(2)};">${e.text}</div>`;
  }).join('');
}

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

// Atmosphere: sky behind the world, scars inside it, a day/night glaze above.
const atmos = createAtmosphere();
// Tuning/debug handle: scrub time with __atmosphere.setTimeOfDay(0..1).
(window as any).__atmosphere = atmos;

const biomeLayer = new Container();
const simLayer = new Container();
const buildingLayer = new Container();
buildingLayer.sortableChildren = true;
const expeditionLayer = new Container();
const cityMarkersContainer = new Container();
const labelLayer = new Container();
const world = new Container();
world.addChild(biomeLayer);
world.addChild(simLayer);
// Scars sit above civ tints (catastrophes hit settled land) but below buildings.
world.addChild(atmos.scarLayer);
world.addChild(buildingLayer);
world.addChild(expeditionLayer);
// Cloud shadows fall on land and buildings; markers and labels stay above.
world.addChild(atmos.cloudShadowLayer);
world.addChild(cityMarkersContainer);
// Mist banks veil everything but the text.
world.addChild(atmos.fogLayer);
// Shoreline feather + corner haze melt the far edges into the sky; both are
// world-space so they bend with the mesh.
world.addChild(atmos.featherLayer);
world.addChild(atmos.hazeLayer);
world.addChild(labelLayer);
atmos.attach({ biomeLayer });

// Curvature: the world container never sits on the stage. It renders each
// frame into a fixed world-space RenderTexture and is drawn through a gently
// bent MeshPlane (ATMOS.curve) — so the silhouette stops being a hard
// diamond, and everything in world space (scars, rings, weather, labels)
// bends together. The capture rect is in world units, window-independent.
const WORLD_CAPTURE = { x0: -1600, y0: -110, w: 3200, h: 1720 };
const captureScale = ATMOS.composition.worldScale;
const worldRT = RenderTexture.create({
  width: Math.ceil(WORLD_CAPTURE.w * captureScale),
  height: Math.ceil(WORLD_CAPTURE.h * captureScale),
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
});
world.scale.set(captureScale);
world.x = -WORLD_CAPTURE.x0 * captureScale;
world.y = -WORLD_CAPTURE.y0 * captureScale;
const worldPlane = new MeshPlane({ texture: worldRT, verticesX: 32, verticesY: 22 });

app.stage.addChild(atmos.skyLayer);
app.stage.addChild(worldPlane);
app.stage.addChild(atmos.glazeLayer);
// The silhouette remap needs the diamond's corners in texture pixels.
const toTex = (wx: number, wy: number) => ({
  x: (wx - WORLD_CAPTURE.x0) * captureScale,
  y: (wy - WORLD_CAPTURE.y0) * captureScale,
});
atmos.attachPlane(worldPlane, {
  left: toTex(-1528, 764),
  apex: toTex(0, -8),
  right: toTex(1528, 764),
  front: toTex(0, 1536),
});
atmos.layout(window.innerWidth, window.innerHeight);
(window as any).__layers = { world, cityMarkersContainer, labelLayer, biomeLayer };

const expeditionGfx = new Graphics();
expeditionLayer.addChild(expeditionGfx);

let worldBaseX = 0, worldBaseY = 0;
function centerWorld() {
  // Seat the world plane so the diamond's top vertex sits at horizonFrac of
  // the screen, centered horizontally. (The world container itself has a
  // fixed transform into the RenderTexture; only the plane moves.)
  worldBaseX = window.innerWidth / 2 + WORLD_CAPTURE.x0 * captureScale;
  worldBaseY = window.innerHeight * ATMOS.composition.horizonFrac + WORLD_CAPTURE.y0 * captureScale;
  worldPlane.x = worldBaseX;
  worldPlane.y = worldBaseY;
}
centerWorld();

// --- Atmosphere: the world's tell ---
// catastrophePressure is surfaced as a slow ambient darkening: a multiply
// tint plus a vignette, both hued by the kind of doom that is brewing. The
// viewer should half-notice the light going wrong before the first omen line.
const DREAD = {
  // Ground multiply is gentler now that the sky carries the brewing color
  // (ATMOS.dreadSkyBlend) and the wind/cloud-shadows rise with dread too.
  tintMaxAlpha:     0.55,
  vignetteMaxAlpha: 0.80,
  easeIn:           0.006,   // per-frame fraction — dread creeps in
  easeOut:          0.0015,  // and drains away slower than it broke
  sevFloor:         0.22,    // dread ceiling for a near-zero-severity fizzle
  hues: {
    plague:     { tint: 0x97a37f, vignette: 0x252b18 },  // sickly pallor
    asteroid:   { tint: 0xb98e66, vignette: 0x2e1d0c },  // wrong-colored dusk
    flood:      { tint: 0x7e94ad, vignette: 0x131f2b },  // cold and silver
    earthquake: { tint: 0x9f8f78, vignette: 0x261e14 },  // dust in the air
  } as Record<CatastropheType, { tint: number; vignette: number }>,
};

// Vignette texture from a DOM canvas radial gradient (API-stable, one-time).
function makeVignetteTexture(): Texture {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.30, size / 2, size / 2, size * 0.72);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(cv);
}

const dreadTint = new Graphics();
dreadTint.blendMode = 'multiply';
dreadTint.alpha = 0;
const dreadVignette = new Sprite(makeVignetteTexture());
dreadVignette.alpha = 0;
const omenStarGfx = new Graphics();
const impactFlash = new Graphics();
impactFlash.alpha = 0;
// Epicenter rings live in world space so the viewer sees *where* it landed.
const epicenterGfx = new Graphics();
world.addChild(epicenterGfx);
app.stage.addChild(dreadTint);
app.stage.addChild(dreadVignette);
app.stage.addChild(omenStarGfx);
app.stage.addChild(impactFlash);

function layoutAtmosphere() {
  dreadTint.clear();
  dreadTint.rect(0, 0, window.innerWidth, window.innerHeight).fill(0xffffff);
  dreadVignette.width = window.innerWidth;
  dreadVignette.height = window.innerHeight;
  impactFlash.clear();
  impactFlash.rect(0, 0, window.innerWidth, window.innerHeight).fill(0xffffff);
}
layoutAtmosphere();

let curDread = 0;
let curHue = DREAD.hues.plague;
// Debug/tuning handle (harmless in prod; lets tooling read atmosphere state).
(window as any).__atmos = {
  get dread() { return curDread; },
  get tintAlpha() { return dreadTint.alpha; },
  get vigAlpha() { return dreadVignette.alpha; },
  tintG: dreadTint,
  vigS: dreadVignette,
};
let starPhase = 0;
interface Impact { color: number; alpha: number; decayPerSec: number }
let activeFlash: Impact | null = null;
let shakeAmp = 0;          // px, decays
let shakeDecayPerSec = 0;
interface EpicenterRing { x: number; y: number; r: number; maxR: number; alpha: number; color: number }
const epicenterRings: EpicenterRing[] = [];

function triggerEpicenter(row: number, col: number, type: CatastropheType, severity: number) {
  const { x, y } = gridToScreen(col, row);
  const s = 0.45 + 0.55 * Math.min(1, severity / CATASTROPHE.severitySevereThreshold);
  epicenterRings.push({ x, y, r: 4, maxR: 230 * s, alpha: 0.85, color: DREAD.hues[type].vignette });
}

function triggerImpact(type: CatastropheType, severity: number) {
  const s = 0.35 + 0.65 * Math.min(1, severity / CATASTROPHE.severitySevereThreshold);
  switch (type) {
    case 'asteroid':
      activeFlash = { color: 0xfff3dc, alpha: 0.9 * s, decayPerSec: 1.6 };
      shakeAmp = 7 * s; shakeDecayPerSec = 6;
      break;
    case 'earthquake':
      activeFlash = { color: 0x6b5c48, alpha: 0.25 * s, decayPerSec: 0.9 };
      shakeAmp = 10 * s; shakeDecayPerSec = 3.5;
      break;
    case 'flood':
      activeFlash = { color: 0x3d5a78, alpha: 0.45 * s, decayPerSec: 0.55 };
      break;
    case 'plague':
      activeFlash = { color: 0x1d2414, alpha: 0.4 * s, decayPerSec: 0.45 };
      break;
  }
}

function updateAtmosphere(deltaMS: number) {
  const dt = deltaMS / 1000;
  const frames = deltaMS / 16.7; // ease rates are tuned per-60fps-frame

  // Dread level follows pressure once a catastrophe is brewing; its ceiling
  // scales with the brewing severity so a fizzle never blackens the sky.
  const brewing = simWorld.brewing;
  let targetDread = 0;
  if (brewing) {
    curHue = DREAD.hues[brewing.type];
    const sevScale = DREAD.sevFloor + (1 - DREAD.sevFloor) * Math.min(1, brewing.severity / CATASTROPHE.severitySevereThreshold);
    const ramp = Math.max(0, Math.min(1,
      (simWorld.catastrophePressure - CATASTROPHE.brewingThreshold) / (1 - CATASTROPHE.brewingThreshold)));
    targetDread = ramp * sevScale;
  }
  const ease = targetDread > curDread ? DREAD.easeIn : DREAD.easeOut;
  curDread += (targetDread - curDread) * Math.min(1, ease * frames);

  dreadTint.tint = curHue.tint;
  dreadTint.alpha = curDread * DREAD.tintMaxAlpha;
  dreadVignette.tint = curHue.vignette;
  dreadVignette.alpha = curDread * DREAD.vignetteMaxAlpha;

  // Omen star: only for a brewing asteroid past the first omen stage — a
  // point of light that has no business being there, brightening.
  omenStarGfx.clear();
  if (brewing && brewing.type === 'asteroid' && simWorld.catastrophePressure >= CATASTROPHE.omenStages[0]) {
    starPhase += dt;
    const ramp = Math.max(0, Math.min(1,
      (simWorld.catastrophePressure - CATASTROPHE.omenStages[0]) / (1 - CATASTROPHE.omenStages[0])));
    const x = window.innerWidth * 0.76;
    const y = window.innerHeight * 0.14;
    const twinkle = 0.9 + 0.1 * Math.sin(starPhase * 5.1);
    const r = (1.2 + 2.6 * ramp) * twinkle;
    const a = (0.25 + 0.75 * ramp) * twinkle;
    omenStarGfx.circle(x, y, r * 3.2).fill({ color: 0xfff0d8, alpha: a * 0.16 });
    omenStarGfx.circle(x, y, r * 1.8).fill({ color: 0xfff5e4, alpha: a * 0.35 });
    omenStarGfx.circle(x, y, r).fill({ color: 0xffffff, alpha: a });
  }

  // Epicenter rings expand and fade over a few seconds.
  epicenterGfx.clear();
  for (let i = epicenterRings.length - 1; i >= 0; i--) {
    const ring = epicenterRings[i];
    ring.r += (ring.maxR - ring.r) * 1.6 * dt;
    ring.alpha -= ring.alpha * 1.1 * dt;
    if (ring.alpha < 0.02) { epicenterRings.splice(i, 1); continue; }
    epicenterGfx.ellipse(ring.x, ring.y, ring.r, ring.r * 0.5)
      .stroke({ color: ring.color, alpha: ring.alpha, width: 2.5 });
    epicenterGfx.ellipse(ring.x, ring.y, ring.r * 0.72, ring.r * 0.36)
      .stroke({ color: ring.color, alpha: ring.alpha * 0.5, width: 1.5 });
  }

  // Impact flash decays exponentially.
  if (activeFlash) {
    activeFlash.alpha -= activeFlash.alpha * activeFlash.decayPerSec * dt * 3;
    impactFlash.tint = activeFlash.color;
    impactFlash.alpha = activeFlash.alpha;
    if (activeFlash.alpha < 0.01) { activeFlash = null; impactFlash.alpha = 0; }
  }

  // Ground shake — moves the world plane (the world container has a fixed
  // transform into its RenderTexture).
  if (shakeAmp > 0.1) {
    worldPlane.x = worldBaseX + (Math.random() * 2 - 1) * shakeAmp;
    worldPlane.y = worldBaseY + (Math.random() * 2 - 1) * shakeAmp * 0.6;
    shakeAmp -= shakeAmp * shakeDecayPerSec * dt;
  } else if (worldPlane.x !== worldBaseX || worldPlane.y !== worldBaseY) {
    worldPlane.x = worldBaseX;
    worldPlane.y = worldBaseY;
  }
}

// --- Seed management ---
function getInitialSeed(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('seed');
  if (fromUrl) return fromUrl;
  const fromStorage = localStorage.getItem('theLand:seed');
  if (fromStorage) return fromStorage;
  return randomSeed();
}
function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}
function saveSeed(seed: string) {
  localStorage.setItem('theLand:seed', seed);
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState({}, '', url);
}

let currentSeed = getInitialSeed();
saveSeed(currentSeed);

// --- World state ---
let { biomes: biomeMap, elevation: elevationMap } = generateBiomeMap(GRID_SIZE, GRID_SIZE, currentSeed);
let simWorld: SimWorld = createSimWorld(GRID_SIZE, GRID_SIZE);
seedInitialCivs(simWorld, biomeMap, 1);
(window as any).__sim = simWorld;
interface TileVisual {
  g: Graphics;
  curColor: number;     curAlpha: number;
  targetColor: number;  targetAlpha: number;
  curBorderColor: number;  curBorderAlpha: number;  curBorderWidth: number;
  targetBorderColor: number; targetBorderAlpha: number; targetBorderWidth: number;
  animating: boolean;
}

interface BiomeTileVisual {
  g: Graphics;
  curColor: number;
  targetColor: number;
}

interface CivLabel {
  text: Text;
  civId: number;
  curOpacity: number;
  targetOpacity: number;
}
const civLabels = new Map<number, CivLabel>();
let tileVisuals: (TileVisual | null)[][] = Array.from({ length: GRID_SIZE }, () =>
  Array(GRID_SIZE).fill(null)
);
let biomeTileVisuals: (BiomeTileVisual | null)[][] = Array.from({ length: GRID_SIZE }, () =>
  Array(GRID_SIZE).fill(null)
);
interface MidFloor {
  sprite: Sprite;
  curAlpha: number;     // per-floor alpha (era transitions)
  targetAlpha: number;  // 1 = present at current era, 0 = fading out
}
interface TileBuildingState {
  perm: number[];
  bodyFrames: number[];        // floor1 body texture index per slot
  midFrames: number[];         // mid-floor body texture per slot (shared by all mid-floors of the slot)
  roofFrames: number[];        // roof texture index per slot
  floor1: (Sprite | null)[];
  midFloors: MidFloor[][];     // [slot] → list of MidFloor (length varies with era)
  roof:   (Sprite | null)[];
  curAlphas: number[];         // building-visibility alpha per slot (density fade)
  targetAlphas: number[];
  roofCurY:    number[];       // current roof y per slot (eases on era change)
  roofTargetY: number[];
  ruined:      boolean[];      // per-slot: abandoned (density dropped) or dead-civ — dims sprite alpha
  curRuinMult: number[];       // per-slot opacity multiplier (1.0 active, decays from 0.35 → 0 while ruined)
}
let buildingTileStates: (TileBuildingState | null)[][] = Array.from({ length: GRID_SIZE }, () =>
  Array(GRID_SIZE).fill(null)
);
let bodyTextures: Texture[] = [];
let roofTextures: Texture[] = [];
if (SHOW_BUILDING_SPRITES) {
  [bodyTextures, roofTextures] = await Promise.all([
    Promise.all(BODY_FRAME_PATHS.map(url => Assets.load<Texture>(url))),
    Promise.all(ROOF_FRAME_PATHS.map(url => Assets.load<Texture>(url))),
  ]);
}
const animatingTiles = new Set<string>();
const animatingBiomeTiles = new Set<string>();
const animatingBuildingTiles = new Set<string>();
let running = true;

const fadedDeadCivs = new Set<number>();

function drawBiomes() {
  biomeLayer.removeChildren();
  biomeTileVisuals = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  animatingBiomeTiles.clear();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const color = BIOME_COLORS[biomeMap[row][col]];
      const g = drawTile(biomeLayer, col, row, biomeMap[row][col]);
      biomeTileVisuals[row][col] = { g, curColor: color, targetColor: color };
    }
  }
}

function refreshBiomeTile(row: number, col: number) {
  const btv = biomeTileVisuals[row][col];
  if (!btv) return;
  btv.targetColor = BIOME_COLORS[biomeMap[row][col]];
  animatingBiomeTiles.add(`${row},${col}`);
}

function clearSimLayer() {
  simLayer.removeChildren();
  tileVisuals = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  animatingTiles.clear();
}

// Deterministic slot fill-order for a tile, seeded from its position.
function tileSlotPermutation(row: number, col: number): number[] {
  let h = (Math.imul(row, 2654435761) ^ Math.imul(col, 2246822519)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const perm = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = h % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
    h = ((h * 1664525) + 1013904223) >>> 0;
  }
  return perm;
}

function _bldHash(row: number, col: number, fillIdx: number, salt: number): number {
  let h = (Math.imul(row + 7, 1234567891) ^ Math.imul(col + 3, 987654321)
         ^ Math.imul(fillIdx + 1, 2654435761) ^ Math.imul(salt, 1664525)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function pickBodyFrame(row: number, col: number, fillIdx: number): number {
  const pool = fillIdx < 2 ? BODY_FRAMES_SIMPLE : BODY_FRAMES_GRAND;
  return pool[_bldHash(row, col, fillIdx, 1) % pool.length];
}
function pickMidFloorFrame(row: number, col: number, fillIdx: number): number {
  // One frame per slot, used for all mid-floors of that slot.
  return BODY_FRAMES_GRAND[_bldHash(row, col, fillIdx, 2) % BODY_FRAMES_GRAND.length];
}
function pickRoofFrame(row: number, col: number, fillIdx: number): number {
  const pool = fillIdx < 2 ? ROOF_FRAMES_SIMPLE : ROOF_FRAMES_GRAND;
  return pool[_bldHash(row, col, fillIdx, 3) % pool.length];
}

// Per-slot mid-floor count: lerp by density within the era's height range, then
// add stable per-slot noise so dense tiles aren't a perfectly smooth gradient.
function extrasForBuilding(row: number, col: number, slotIdx: number, density: number, era: Era): number {
  const [minFloors, maxFloors] = ERA_HEIGHT_RANGE[era];
  const d = Math.max(0, Math.min(1, density));
  const gradient = minFloors + (maxFloors - minFloors) * d;
  const noise = ((_bldHash(row, col, slotIdx, 7) / 0xffffffff) * 2 - 1) * HEIGHT_NOISE;
  const floors = Math.max(minFloors, Math.min(maxFloors, Math.round(gradient + noise)));
  return Math.min(MAX_EXTRA_FLOORS, floors - 1);
}

// Per-civ eased saturation multiplier (eases toward ERA_SAT_MULT[civ.era]).
const civCurSatMult = new Map<number, number>();
// Civs whose saturation is currently transitioning — their building tints need
// per-frame refresh.
const civsTransitioningSat = new Set<number>();
// Track each civ's last-seen era so we can trigger an immediate height refresh
// (mid-floor add/remove) the frame an era advance happens, instead of waiting
// up to 15 sim ticks for the periodic refresh.
const civLastEra = new Map<number, Era>();

// Deterministic per-slot tonal variation: nudge lightness and saturation by
// up to ±BUILDING_VARIATION.* around the civ's base color, then apply the
// civ's current (eased) era saturation multiplier on top. Stable per (row,col,slot)
// for fixed civ era; smoothly shifts during era transitions.
function tintForBuilding(baseColor: number, row: number, col: number, slotIdx: number, civ: Civ): number {
  const lOff = ((_bldHash(row, col, slotIdx, 5) / 0xffffffff) * 2 - 1) * BUILDING_VARIATION.lightness;
  const sOff = ((_bldHash(row, col, slotIdx, 6) / 0xffffffff) * 2 - 1) * BUILDING_VARIATION.saturation;
  const [h, s, l] = rgbToHsl(baseColor);
  const eraSat = civCurSatMult.get(civ.id) ?? ERA_SAT_MULT[civ.era];
  return hslToRgb(h,
    Math.max(0, Math.min(1, (s + sOff) * eraSat)),
    Math.max(0, Math.min(1, l + lOff)));
}

// 0..1 density for a built tile. Proximity drives the shape; vitality scales it.
// Far from all cities the value is 0 regardless of vitality — bare ground in hinterland.
function computeTileDensity(row: number, col: number, civ: Civ): number {
  let minDist = Infinity;
  let bestProminence = 0.3;
  for (const city of civ.cities) {
    const d = Math.hypot(city.row - row, city.col - col);
    if (d < minDist) { minDist = d; bestProminence = city.prominence; }
  }
  const effectiveRadius = DENSITY.proximityScale * Math.max(0.2, bestProminence);
  const normalizedDist = Math.min(1, minDist / effectiveRadius);
  const proxFactor = Math.max(0, 1 - Math.pow(normalizedDist, DENSITY.falloffPower));
  const vitalFactor = Math.max(0, Math.min(1, civ.vitality));
  // Vitality multiplies proximity effect: no halo if proxFactor=0, denser halo if vitality high.
  return proxFactor * (DENSITY.vitalityBase + (1 - DENSITY.vitalityBase) * vitalFactor);
}

function densityToCount(density: number): number {
  if (density >= DENSITY.slot4) return 4;
  if (density >= DENSITY.slot3) return 3;
  if (density >= DENSITY.slot2) return 2;
  if (density >= DENSITY.slot1) return 1;
  return 0;
}

function clearBuildingLayer() {
  buildingLayer.removeChildren();
  buildingTileStates = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  animatingBuildingTiles.clear();
}

const RUIN_TINT = 0x5a544c;       // dark warm grey-brown for abandoned/dead-civ buildings
const RUIN_ALPHA_MULT = 0.35;     // initial opacity when a building first becomes ruined
const RUIN_DECAY_EASE = 0.00167;  // per-frame ease toward 0 — ruins crumble over real-time (~3× slower)
const RUIN_DESTROY_THRESHOLD = 0.01; // alpha mult below which we destroy the slot sprites

function refreshBuildingSprite(row: number, col: number) {
  if (!SHOW_BUILDING_SPRITES || bodyTextures.length === 0) return;
  const tile = simWorld.tiles[row][col];
  const civ = tile.civId != null ? simWorld.civs.get(tile.civId) : null;
  const active = tile.state === 'built' && civ != null;

  let state = buildingTileStates[row][col];

  if (!active) {
    if (state) {
      for (let s = 0; s < 4; s++) state.targetAlphas[s] = 0;
      animatingBuildingTiles.add(`${row},${col}`);
    }
    return;
  }

  if (civ!.phase === 'dead') {
    if (!state) return;
    for (let s = 0; s < 4; s++) {
      if (!state.floor1[s]) continue;
      state.floor1[s]!.tint = RUIN_TINT;
      for (const mf of state.midFloors[s]) mf.sprite.tint = RUIN_TINT;
      if (state.roof[s])   state.roof[s]!.tint   = RUIN_TINT;
      // Newly ruined this call — snap mult to RUIN_ALPHA_MULT so it starts at 35%, then decays.
      if (!state.ruined[s]) state.curRuinMult[s] = RUIN_ALPHA_MULT;
      state.ruined[s] = true;
    }
    animatingBuildingTiles.add(`${row},${col}`);
    return;
  }

  const density = computeTileDensity(row, col, civ!);
  const count = densityToCount(density);
  if (count === 0 && !state) return;

  const { x, y } = gridToScreen(col, row);

  if (!state) {
    const perm = tileSlotPermutation(row, col);
    const bodyFrames = [0,1,2,3].map(si => pickBodyFrame(row, col, perm.indexOf(si)));
    const midFrames  = [0,1,2,3].map(si => pickMidFloorFrame(row, col, perm.indexOf(si)));
    const roofFrames = [0,1,2,3].map(si => pickRoofFrame(row, col, perm.indexOf(si)));
    state = {
      perm, bodyFrames, midFrames, roofFrames,
      floor1: [null,null,null,null],
      midFloors: [[],[],[],[]],
      roof:   [null,null,null,null],
      curAlphas: [0,0,0,0], targetAlphas: [0,0,0,0],
      roofCurY: [0,0,0,0], roofTargetY: [0,0,0,0],
      ruined: [false,false,false,false],
      curRuinMult: [1,1,1,1],
    };
    buildingTileStates[row][col] = state;
  }

  for (let fillIdx = 0; fillIdx < 4; fillIdx++) {
    const slotIdx = state.perm[fillIdx];
    const wantActive = fillIdx < count;
    const hasSprite = !!state.floor1[slotIdx];
    // Abandoned slots (built but density past it) stay visible as RUIN_TINT — they
    // only fade out when the whole tile leaves 'built' (handled in `!active` above).
    state.targetAlphas[slotIdx] = (wantActive || hasSprite) ? 1 : 0;
    const nowRuined = !wantActive && hasSprite;
    if (nowRuined && !state.ruined[slotIdx]) {
      // Just transitioned to ruined — snap mult to RUIN_ALPHA_MULT so decay starts at 35%.
      state.curRuinMult[slotIdx] = RUIN_ALPHA_MULT;
    } else if (!nowRuined && state.ruined[slotIdx]) {
      // Reactivated (density rose back) — snap back to full.
      state.curRuinMult[slotIdx] = 1.0;
    }
    state.ruined[slotIdx] = nowRuined;

    const tint = wantActive ? tintForBuilding(civ!.color, row, col, slotIdx, civ!) : RUIN_TINT;
    const [dx, dy] = SLOT_POSITIONS[slotIdx];
    const baseY = y + dy;
    const slotZBase = ((row + col) * 4 + SLOT_DEPTHS[slotIdx]) * 100;
    const extras = extrasForBuilding(row, col, slotIdx, density, civ!.era);

    if (wantActive && !hasSprite) {
      // Brand new building — create floor1 + all mid-floors for current era + roof in one go.
      const f1 = new Sprite(bodyTextures[state.bodyFrames[slotIdx]]);
      f1.anchor.set(0.5, 1.0); f1.scale.set(BUILDING_SCALE);
      f1.x = x + dx; f1.y = baseY;
      f1.zIndex = slotZBase; f1.tint = tint; f1.alpha = 0;
      state.floor1[slotIdx] = f1;
      buildingLayer.addChild(f1);

      for (let i = 0; i < extras; i++) {
        const sp = new Sprite(bodyTextures[state.midFrames[slotIdx]]);
        sp.anchor.set(0.5, 1.0); sp.scale.set(BUILDING_SCALE);
        sp.x = x + dx; sp.y = baseY - (1 + i) * BODY_OFFSET;
        sp.zIndex = slotZBase + 1 + i; sp.tint = tint; sp.alpha = 0;
        state.midFloors[slotIdx].push({ sprite: sp, curAlpha: 0, targetAlpha: 1 });
        buildingLayer.addChild(sp);
      }

      const roofY = baseY - (1 + extras) * BODY_OFFSET;
      const rf = new Sprite(roofTextures[state.roofFrames[slotIdx]]);
      rf.anchor.set(0.5, 1.0); rf.scale.set(BUILDING_SCALE);
      rf.x = x + dx; rf.y = roofY;
      rf.zIndex = slotZBase + 99; rf.tint = tint; rf.alpha = 0;
      state.roof[slotIdx] = rf;
      state.roofCurY[slotIdx] = roofY;
      state.roofTargetY[slotIdx] = roofY;
      buildingLayer.addChild(rf);

    } else if (hasSprite) {
      // Existing building — retint, then reconcile mid-floor count if active.
      state.floor1[slotIdx]!.tint = tint;
      for (const mf of state.midFloors[slotIdx]) mf.sprite.tint = tint;
      if (state.roof[slotIdx]) state.roof[slotIdx]!.tint = tint;

      if (wantActive) {
        // Grow midFloors array to `extras` length (add new sprites fading in from alpha 0).
        while (state.midFloors[slotIdx].length < extras) {
          const i = state.midFloors[slotIdx].length;
          const sp = new Sprite(bodyTextures[state.midFrames[slotIdx]]);
          sp.anchor.set(0.5, 1.0); sp.scale.set(BUILDING_SCALE);
          sp.x = x + dx; sp.y = baseY - (1 + i) * BODY_OFFSET;
          sp.zIndex = slotZBase + 1 + i; sp.tint = tint; sp.alpha = 0;
          state.midFloors[slotIdx].push({ sprite: sp, curAlpha: 0, targetAlpha: 1 });
          buildingLayer.addChild(sp);
        }
        // Mark target alpha for each existing mid-floor: 1 if within `extras`, else fade out.
        for (let i = 0; i < state.midFloors[slotIdx].length; i++) {
          state.midFloors[slotIdx][i].targetAlpha = i < extras ? 1 : 0;
        }
        // Roof target Y reflects new top of stack.
        state.roofTargetY[slotIdx] = baseY - (1 + extras) * BODY_OFFSET;
      }
      // For abandoned slots, leave mid-floors and roof y at their current state.
    }
  }

  animatingBuildingTiles.add(`${row},${col}`);
}

function rebuildBuildingSprites() {
  clearBuildingLayer();
  if (!SHOW_BUILDING_SPRITES) return;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (simWorld.tiles[row][col].state === 'built') refreshBuildingSprite(row, col);
    }
  }
}

function drawExpeditions() {
  const g = expeditionGfx;
  g.clear();
  if (simWorld.expeditions.length > 0) {
    (window as any).__lastExpRender = simWorld.tick;
  }

  for (const exp of simWorld.expeditions) {
    const civ = simWorld.civs.get(exp.civId);
    // Desperate voyages keep sailing after their nation dies — keep drawing them.
    if (!civ || (civ.phase === 'dead' && !exp.desperate)) continue;

    const n = exp.trail.length;
    for (let i = 0; i < n; i++) {
      const t = exp.trail[i];
      const alpha = ((i + 1) / n) * 0.7;
      const { x, y } = gridToScreen(t.col, t.row);
      g.circle(x, y, 2.5).fill({ color: civ.color, alpha });
    }

    const { x, y } = gridToScreen(exp.col, exp.row);
    g.moveTo(x, y - 7);
    g.lineTo(x + 7, y);
    g.lineTo(x, y + 7);
    g.lineTo(x - 7, y);
    g.closePath();
    g.fill({ color: civ.color, alpha: 1.0 });
    g.stroke({ color: 0xffffff, alpha: 0.95, width: 1.5 });
  }
}

// Incremental civ index — kept in sync as tile ownership changes via noteTileChange.
// Eliminates the full 96×96 grid scans formerly used by updateLabels/updateBars and by
// the era/dead-civ/transitioning-tint refresh paths.
const civStats = {
  tileCounts: new Map<number, number>(),
  centSumX:   new Map<number, number>(),
  centSumY:   new Map<number, number>(),
};
// Per-civ set of owned tile keys (key = r * GRID_SIZE + c).
const civTiles = new Map<number, Set<number>>();
// What civId owned each tile at the last sync — used by noteTileChange to detect transitions.
const tileCivIdSnapshot: (number | null)[][] = Array.from(
  { length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null),
);

// Full rebuild — used at init and after reset. Hot path during normal operation
// is noteTileChange below.
function rebuildCivIndex() {
  civStats.tileCounts.clear();
  civStats.centSumX.clear();
  civStats.centSumY.clear();
  civTiles.clear();
  for (let r = 0; r < GRID_SIZE; r++) {
    const row = simWorld.tiles[r];
    for (let c = 0; c < GRID_SIZE; c++) {
      const cid = row[c].civId;
      tileCivIdSnapshot[r][c] = cid;
      if (cid == null) continue;
      civStats.tileCounts.set(cid, (civStats.tileCounts.get(cid) || 0) + 1);
      civStats.centSumX.set(cid, (civStats.centSumX.get(cid) || 0) + (c - r) * 16);
      civStats.centSumY.set(cid, (civStats.centSumY.get(cid) || 0) + (c + r) * 8);
      let ts = civTiles.get(cid);
      if (!ts) { ts = new Set(); civTiles.set(cid, ts); }
      ts.add(r * GRID_SIZE + c);
    }
  }
}

// Update civStats + civTiles for a single tile whose ownership may have changed.
// Cheap (O(1)). Call after each `changes` entry from sim.step().
function noteTileChange(r: number, c: number) {
  const oldCid = tileCivIdSnapshot[r][c];
  const newCid = simWorld.tiles[r][c].civId;
  if (oldCid === newCid) return;
  const key = r * GRID_SIZE + c;
  if (oldCid != null) {
    civStats.tileCounts.set(oldCid, (civStats.tileCounts.get(oldCid) || 0) - 1);
    civStats.centSumX.set(oldCid,   (civStats.centSumX.get(oldCid)   || 0) - (c - r) * 16);
    civStats.centSumY.set(oldCid,   (civStats.centSumY.get(oldCid)   || 0) - (c + r) * 8);
    civTiles.get(oldCid)?.delete(key);
  }
  if (newCid != null) {
    civStats.tileCounts.set(newCid, (civStats.tileCounts.get(newCid) || 0) + 1);
    civStats.centSumX.set(newCid,   (civStats.centSumX.get(newCid)   || 0) + (c - r) * 16);
    civStats.centSumY.set(newCid,   (civStats.centSumY.get(newCid)   || 0) + (c + r) * 8);
    let ts = civTiles.get(newCid);
    if (!ts) { ts = new Set(); civTiles.set(newCid, ts); }
    ts.add(key);
  }
  tileCivIdSnapshot[r][c] = newCid;
}

function drawCityMarkers() {
  cityMarkersContainer.removeChildren();
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || civ.cities.length === 0) continue;
    for (let i = 0; i < civ.cities.length; i++) {
      const city = civ.cities[i];
      const isCapital = i === 0;
      const { x, y } = gridToScreen(city.col, city.row);
      const marker = new Graphics();
      marker.x = x;
      marker.y = y;
      let markerRadius: number;
      if (isCapital) {
        markerRadius = CITY.markerCapitalSize * (0.6 + 0.4 * city.prominence);
        marker.circle(0, 0, markerRadius + 1.5);
        marker.fill({ color: 0xffffff, alpha: 0.85 });
        marker.circle(0, 0, markerRadius);
        marker.fill({ color: civ.color, alpha: 1.0 });
      } else {
        markerRadius = Math.max(1.0, CITY.markerBaseSize * city.prominence);
        marker.circle(0, 0, markerRadius + 1.2);
        marker.fill({ color: 0xffffff, alpha: 0.6 });
        marker.circle(0, 0, markerRadius);
        marker.fill({ color: civ.color, alpha: 0.85 });
      }
      cityMarkersContainer.addChild(marker);
      if (city.prominence >= CITY.nameLabelThreshold) {
        const fontSize = 7 + Math.round(city.prominence * 4);
        const cityLabel = new Text({
          text: city.name,
          style: new TextStyle({
            fontFamily: LABEL.fontFamily,
            fontSize,
            fill: civ.color,
            stroke: { color: 0x000000, width: 1.5, join: 'round' },
            dropShadow: { alpha: 0.5, blur: 2, color: 0x000000, distance: 1 },
          }),
        });
        cityLabel.anchor.set(0.5, 0);
        cityLabel.x = x;
        cityLabel.y = y + markerRadius + 3;
        cityMarkersContainer.addChild(cityLabel);
      }
    }
  }
}

function updateLabels() {
  // Reads from the shared civStats cache (kept in sync incrementally via noteTileChange)
  // so we don't pay for a full 96×96 grid scan every frame.
  const tileCounts = civStats.tileCounts;
  const centSumX = civStats.centSumX;
  const centSumY = civStats.centSumY;

  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') {
      const lbl = civLabels.get(civ.id);
      if (lbl) lbl.targetOpacity = 0;
      continue;
    }

    const count = tileCounts.get(civ.id) || 0;
    const t = Math.min(1, Math.max(0, (count - LABEL.tileCountMin) / (LABEL.tileCountMax - LABEL.tileCountMin)));
    // A declining civ's name dims — the light going out is visible jeopardy.
    const phaseDim = civ.phase === 'declining' ? 0.55 : 1.0;
    const targetOpacity = (LABEL.minOpacity + t * (LABEL.maxOpacity - LABEL.minOpacity)) * phaseDim;
    const fontSize = Math.round(LABEL.minFontSize + t * (LABEL.maxFontSize - LABEL.minFontSize));
    const labelText = civ.name;

    let lbl = civLabels.get(civ.id);
    if (!lbl) {
      const style = new TextStyle({
        fontFamily: LABEL.fontFamily,
        fontSize,
        fill: civ.color,
        stroke: { color: LABEL.strokeColor, width: LABEL.strokeWidth, join: 'round' },
        dropShadow: { alpha: LABEL.shadowAlpha, blur: LABEL.shadowBlur, color: 0x000000, distance: LABEL.shadowDist },
      });
      const n0 = tileCounts.get(civ.id) || 0;
      const textObj = new Text({ text: labelText, style });
      textObj.anchor.set(0.5, 0.5);
      textObj.x = n0 > 0 ? centSumX.get(civ.id)! / n0 : gridToScreen(civ.originCol, civ.originRow).x;
      textObj.y = n0 > 0 ? centSumY.get(civ.id)! / n0 : gridToScreen(civ.originCol, civ.originRow).y;
      labelLayer.addChild(textObj);
      lbl = { text: textObj, civId: civ.id, curOpacity: 0, targetOpacity };
      civLabels.set(civ.id, lbl);
    } else {
      lbl.targetOpacity = targetOpacity;
      if (lbl.text.text !== labelText) lbl.text.text = labelText;
      if (lbl.text.style.fontSize !== fontSize) lbl.text.style.fontSize = fontSize;
    }

  }

  const toRemove: number[] = [];
  for (const [civId, lbl] of civLabels) {
    lbl.curOpacity += (lbl.targetOpacity - lbl.curOpacity) * 0.08;
    lbl.text.alpha = lbl.curOpacity;
    if (lbl.targetOpacity === 0 && lbl.curOpacity < 0.02) {
      labelLayer.removeChild(lbl.text);
      lbl.text.destroy();
      toRemove.push(civId);
    }
  }
  for (const id of toRemove) civLabels.delete(id);
}

// Ease each living civ's saturation multiplier toward its era target.
// Civs in transition (cur != target) are added to civsTransitioningSat for
// per-frame tint refresh. Also detects era changes and triggers an immediate
// height refresh (mid-floor add/remove) for the civ.
function easeCivSatMults() {
  for (const civ of simWorld.civs.values()) {
    // Era-change detection: trigger immediate height refresh on first-after-change frame.
    const lastEra = civLastEra.get(civ.id);
    if (lastEra !== civ.era) {
      civLastEra.set(civ.id, civ.era);
      if (lastEra !== undefined) {
        const ts = civTiles.get(civ.id);
        if (ts) for (const key of ts) {
          const r = (key / GRID_SIZE) | 0;
          const c = key % GRID_SIZE;
          if (simWorld.tiles[r][c].state === 'built') refreshBuildingSprite(r, c);
        }
      }
    }

    const target = ERA_SAT_MULT[civ.era];
    const cur = civCurSatMult.get(civ.id);
    if (cur === undefined) {
      // First time seeing this civ — snap to target (no transition).
      civCurSatMult.set(civ.id, target);
      continue;
    }
    if (Math.abs(cur - target) < 0.003) {
      if (cur !== target) {
        civCurSatMult.set(civ.id, target);
        // Last refresh so settled tint is exact.
        civsTransitioningSat.add(civ.id);
      } else {
        civsTransitioningSat.delete(civ.id);
      }
    } else {
      civCurSatMult.set(civ.id, cur + (target - cur) * ERA_SAT_EASE);
      civsTransitioningSat.add(civ.id);
    }
  }
  // Drop entries for civs that no longer exist (e.g., after reset).
  for (const id of civCurSatMult.keys()) {
    if (!simWorld.civs.has(id)) {
      civCurSatMult.delete(id);
      civsTransitioningSat.delete(id);
      civLastEra.delete(id);
    }
  }
}

// Retint buildings for civs whose saturation is currently easing — bounded to the
// transitioning civs' tile sets (no full grid scan).
// Only active (non-abandoned) slots get the live civ tint; abandoned stays RUIN_TINT.
function refreshTintsForTransitioningCivs() {
  if (civsTransitioningSat.size === 0) return;
  for (const civId of civsTransitioningSat) {
    const civ = simWorld.civs.get(civId);
    if (!civ || civ.phase === 'dead') continue;
    const ts = civTiles.get(civId);
    if (!ts) continue;
    for (const key of ts) {
      const r = (key / GRID_SIZE) | 0;
      const c = key % GRID_SIZE;
      const bts = buildingTileStates[r][c];
      if (!bts) continue;
      const count = densityToCount(computeTileDensity(r, c, civ));
      for (let fillIdx = 0; fillIdx < 4; fillIdx++) {
        const slotIdx = bts.perm[fillIdx];
        if (!bts.floor1[slotIdx]) continue;
        if (fillIdx >= count) continue;  // abandoned — keep RUIN_TINT
        const tint = tintForBuilding(civ.color, r, c, slotIdx, civ);
        bts.floor1[slotIdx]!.tint = tint;
        for (const mf of bts.midFloors[slotIdx]) mf.sprite.tint = tint;
        if (bts.roof[slotIdx]) bts.roof[slotIdx]!.tint = tint;
      }
    }
  }
}

function refreshTileOverlay(row: number, col: number) {
  const tile = simWorld.tiles[row][col];
  const colorInfo: TileOverlay | null = SHOW_TILE_TINT ? tileOverlayColor(tile, simWorld) : null;

  let tv = tileVisuals[row][col];

  if (!colorInfo) {
    if (tv) {
      tv.targetAlpha = 0;
      tv.targetBorderAlpha = 0;
      tv.animating = true;
      animatingTiles.add(`${row},${col}`);
    }
    return;
  }

  if (!tv) {
    let newAlphaFactor = 1.0;
    if (tile.civId != null && tile.state !== 'ruin') {
      const civ = simWorld.civs.get(tile.civId);
      if (civ && civ.phase !== 'dead' && civ.cities.length > 0) {
        const nd = nearestCityDist(civ, row, col);
        newAlphaFactor = 1 - CITY.gradientStrength * Math.min(1, nd / CITY.gradientRadius);
      }
    }
    const g = drawStateOverlayPersistent(simLayer, col, row);
    tv = {
      g,
      curColor: colorInfo.color,       curAlpha: 0,
      targetColor: colorInfo.color,    targetAlpha: colorInfo.alpha * newAlphaFactor * TILE_TINT_OPACITY,
      curBorderColor: colorInfo.borderColor,  curBorderAlpha: 0,  curBorderWidth: colorInfo.borderWidth,
      targetBorderColor: colorInfo.borderColor, targetBorderAlpha: colorInfo.borderAlpha, targetBorderWidth: colorInfo.borderWidth,
      animating: true,
    };
    tileVisuals[row][col] = tv;
    redrawOverlay(g, tv.curColor, tv.curAlpha, tv.curBorderColor, tv.curBorderAlpha, tv.curBorderWidth);
    animatingTiles.add(`${row},${col}`);
    return;
  }

  tv.targetColor = colorInfo.color;
  let alphaFactor = 1.0;
  if (tile.civId != null && tile.state !== 'ruin') {
    const civ = simWorld.civs.get(tile.civId);
    if (civ && civ.phase !== 'dead' && civ.cities.length > 0) {
      const nd = nearestCityDist(civ, row, col);
      alphaFactor = 1 - CITY.gradientStrength * Math.min(1, nd / CITY.gradientRadius);
    }
  }
  tv.targetAlpha = colorInfo.alpha * alphaFactor * TILE_TINT_OPACITY;
  tv.targetBorderColor = colorInfo.borderColor;
  tv.targetBorderAlpha = colorInfo.borderAlpha;
  tv.targetBorderWidth = colorInfo.borderWidth;
  tv.animating = true;
  animatingTiles.add(`${row},${col}`);
}

function resetWorld(newSeed: string) {
  currentSeed = newSeed;
  saveSeed(newSeed);
  ({ biomes: biomeMap, elevation: elevationMap } = generateBiomeMap(GRID_SIZE, GRID_SIZE, newSeed));
  simWorld = createSimWorld(GRID_SIZE, GRID_SIZE);
  seedInitialCivs(simWorld, biomeMap, 1);
  (window as any).__sim = simWorld;
  fadedDeadCivs.clear();
  civCurSatMult.clear();
  civsTransitioningSat.clear();
  civLastEra.clear();
  eventLog.length = 0;
  atmos.clearScars();
  for (const lbl of civLabels.values()) { labelLayer.removeChild(lbl.text); lbl.text.destroy(); }
  civLabels.clear();
  clearSimLayer();
  clearBuildingLayer();
  drawBiomes();
  // Render the seeded civs' initial tiles
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (simWorld.tiles[row][col].state !== 'wild') {
        refreshTileOverlay(row, col);
      }
    }
  }
  rebuildBuildingSprites();
  drawCityMarkers();
  rebuildCivIndex();
  updateHud();
}

function resetSimOnly() {
  simWorld = createSimWorld(GRID_SIZE, GRID_SIZE);
  seedInitialCivs(simWorld, biomeMap, 1);
  (window as any).__sim = simWorld;
  fadedDeadCivs.clear();
  civCurSatMult.clear();
  civsTransitioningSat.clear();
  civLastEra.clear();
  eventLog.length = 0;
  atmos.clearScars();
  for (const lbl of civLabels.values()) { labelLayer.removeChild(lbl.text); lbl.text.destroy(); }
  civLabels.clear();
  clearSimLayer();
  clearBuildingLayer();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (simWorld.tiles[row][col].state !== 'wild') {
        refreshTileOverlay(row, col);
      }
    }
  }
  rebuildBuildingSprites();
  drawCityMarkers();
  rebuildCivIndex();
}

drawBiomes();
// Render the initial seeded civs
for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    if (simWorld.tiles[row][col].state !== 'wild') {
      refreshTileOverlay(row, col);
    }
  }
}
rebuildBuildingSprites();
drawCityMarkers();
rebuildCivIndex();

// --- Tick loop ---
let accumulator = 0;
let frameCount = 0;
const BARS_REFRESH_FRAMES = 10;  // DOM rebuild for civ bar panel; ~6 Hz at 60fps

app.ticker.add((ticker) => {
  if (!running) return;
  accumulator += ticker.deltaMS / 1000;
  const tickInterval = 1 / ticksPerSecond;
  const frameEvents: SimEvent[] = [];
  while (accumulator >= tickInterval) {
    accumulator -= tickInterval;
    const { changes, events, biomeChanges } = step(simWorld, biomeMap, elevationMap);
    frameEvents.push(...events);
    for (const { row, col } of changes) { noteTileChange(row, col); refreshTileOverlay(row, col); refreshBuildingSprite(row, col); }
    for (const { row, col } of biomeChanges) { refreshBiomeTile(row, col); }
    // When a civ transitions to 'dead', its still-built tiles change 
    // color (toward gray). The per-tile `changes` list won't include 
    // them because their *state* didn't change. So once a tick we 
    // refresh all owned tiles of any dead civ. Cheap because there 
    // are at most a handful of dead civs.
    // When a civ first enters 'dead', repaint its tiles once to the faded
    // color. Tracked via a Set so we never miss or repeat it, even if 
    // multiple ticks happen in one frame.
    for (const civ of simWorld.civs.values()) {
      if (civ.phase === 'dead' && !fadedDeadCivs.has(civ.id)) {
        fadedDeadCivs.add(civ.id);
        const ts = civTiles.get(civ.id);
        if (!ts) continue;
        for (const key of ts) {
          const r = (key / GRID_SIZE) | 0;
          const c = key % GRID_SIZE;
          refreshTileOverlay(r, c);
          refreshBuildingSprite(r, c);
        }
      }
    }
    // Cataclysm — every CATACLYSM_INTERVAL ticks, the world is unmade and rerolled.
    if (simWorld.tick > 0 && simWorld.tick % CATACLYSM_INTERVAL === 0) {
      resetWorld(randomSeed());
      frameEvents.length = 0;  // drop events from the now-defunct world
      eventLog.unshift({ text: pick(CATACLYSM_NARRATIONS), ts: Date.now(), variant: 'catastrophe' });
    }
  }
  pushLogEvents(frameEvents);
  for (const ev of frameEvents) {
    if (ev.kind === 'catastrophe') {
      triggerImpact(ev.catastropheType, ev.severity);
      triggerEpicenter(ev.centerRow, ev.centerCol, ev.catastropheType, ev.severity);
      atmos.addScar(ev.catastropheType, ev.centerRow, ev.centerCol, ev.radius, ev.severity);
      audio.impact(ev.severity);
    } else if (ev.kind === 'omen' && ev.stage === 3) {
      audio.omenBell();
    }
  }
  updateAtmosphere(ticker.deltaMS);
  // Sky + glaze + weather + scar fades. The sky leans toward the last dread
  // hue while curDread eases, so it releases smoothly after a catastrophe.
  atmos.update(ticker.deltaMS, curDread, curHue.vignette, dominantEra(simWorld));
  audio.setDread(curDread);
  frameCount++;
  // Ease per-civ saturation toward era target; refresh tints for any civ mid-transition.
  easeCivSatMults();
  refreshTintsForTransitioningCivs();
  // Periodic density refresh (vitality drift, prominence growth). Walks only owned tiles
  // via the civ index instead of the full 96×96 grid.
  if (simWorld.tick % DENSITY.refreshInterval === 0) {
    for (const ts of civTiles.values()) {
      for (const key of ts) {
        const r = (key / GRID_SIZE) | 0;
        const c = key % GRID_SIZE;
        if (simWorld.tiles[r][c].state === 'built') refreshBuildingSprite(r, c);
      }
    }
  }
  // Redraw city markers when founding/reconcile may have run, or after a catastrophe.
  if (simWorld.tick % CITY.foundingCheckInterval === 0 ||
      frameEvents.some(e => e.kind === 'catastrophe' || e.kind === 'civ_born')) {
    drawCityMarkers();
  }
  // Animate tile color/alpha toward targets.
  const EASE = 0.15; // higher = faster transitions
  const done: string[] = [];
  for (const key of animatingTiles) {
    const [r, c] = key.split(',').map(Number);
    const tv = tileVisuals[r][c];
    if (!tv) { done.push(key); continue; }

    tv.curColor = lerpColor(tv.curColor, tv.targetColor, EASE);
    tv.curAlpha += (tv.targetAlpha - tv.curAlpha) * EASE;
    tv.curBorderColor = lerpColor(tv.curBorderColor, tv.targetBorderColor, EASE);
    tv.curBorderAlpha += (tv.targetBorderAlpha - tv.curBorderAlpha) * EASE;
    tv.curBorderWidth += (tv.targetBorderWidth - tv.curBorderWidth) * EASE;

    redrawOverlay(tv.g, tv.curColor, tv.curAlpha, tv.curBorderColor, tv.curBorderAlpha, tv.curBorderWidth);

    const colorClose = colorsWithin(tv.curColor, tv.targetColor, 2);
    const alphaClose = Math.abs(tv.curAlpha - tv.targetAlpha) < 0.01;
    const borderClose = Math.abs(tv.curBorderAlpha - tv.targetBorderAlpha) < 0.01
                     && Math.abs(tv.curBorderWidth - tv.targetBorderWidth) < 0.05;
    if (colorClose && alphaClose && borderClose) {
      tv.curAlpha = tv.targetAlpha;
      tv.curBorderColor = tv.targetBorderColor;
      tv.curBorderAlpha = tv.targetBorderAlpha;
      tv.curBorderWidth = tv.targetBorderWidth;
      redrawOverlay(tv.g, tv.targetColor, tv.curAlpha, tv.curBorderColor, tv.curBorderAlpha, tv.curBorderWidth);
      tv.animating = false;
      done.push(key);
      if (tv.targetAlpha === 0) {
        simLayer.removeChild(tv.g);
        tv.g.destroy();
        tileVisuals[r][c] = null;
      }
    }
  }
  for (const key of done) animatingTiles.delete(key);

  // Animate biome tile color transitions (flood, future terrain mutations).
  const BIOME_EASE = 0.06;
  const biomeDone: string[] = [];
  for (const key of animatingBiomeTiles) {
    const [r, c] = key.split(',').map(Number);
    const btv = biomeTileVisuals[r][c];
    if (!btv) { biomeDone.push(key); continue; }
    btv.curColor = lerpColor(btv.curColor, btv.targetColor, BIOME_EASE);
    redrawBiomeTile(btv.g, btv.curColor);
    if (colorsWithin(btv.curColor, btv.targetColor, 2)) {
      btv.curColor = btv.targetColor;
      redrawBiomeTile(btv.g, btv.curColor);
      biomeDone.push(key);
    }
  }
  for (const key of biomeDone) animatingBiomeTiles.delete(key);

  // Animate building sprite alpha (density), mid-floor alpha (era), and roof Y (era).
  const ROOF_EASE = 0.10;     // per-frame ease for roof Y slide on era change
  const MID_FLOOR_EASE = 0.07; // per-frame ease for mid-floor alpha
  const bldDone: string[] = [];
  for (const key of animatingBuildingTiles) {
    const [r, c] = key.split(',').map(Number);
    const bts = buildingTileStates[r][c];
    if (!bts) { bldDone.push(key); continue; }

    let settled = true;
    for (let s = 0; s < 4; s++) {
      // Fast path: slot has no sprite and isn't trying to grow one — nothing to animate.
      if (!bts.floor1[s] && bts.targetAlphas[s] === 0 && bts.curAlphas[s] === 0) continue;

      // Building visibility (density driver)
      bts.curAlphas[s] += (bts.targetAlphas[s] - bts.curAlphas[s]) * DENSITY.easeSpeed;
      const slotNotSettled = Math.abs(bts.curAlphas[s] - bts.targetAlphas[s]) > 0.01;
      if (slotNotSettled) settled = false; else bts.curAlphas[s] = bts.targetAlphas[s];
      const a = bts.curAlphas[s];

      // Ruin decay — while a slot is ruined, curRuinMult eases from RUIN_ALPHA_MULT toward 0.
      // The tint also blends from RUIN_TINT toward the biome color underneath, so the
      // building visually merges with the ground as it crumbles.
      if (bts.ruined[s] && bts.curRuinMult[s] > 0) {
        bts.curRuinMult[s] = Math.max(0, bts.curRuinMult[s] - bts.curRuinMult[s] * RUIN_DECAY_EASE);
        if (bts.curRuinMult[s] > RUIN_DESTROY_THRESHOLD) settled = false;
        const blendT = Math.max(0, Math.min(1, 1 - bts.curRuinMult[s] / RUIN_ALPHA_MULT));
        const btv = biomeTileVisuals[r][c];
        const biomeColor = btv ? btv.curColor : BIOME_COLORS[biomeMap[r][c]];
        const ruinedTint = lerpColor(RUIN_TINT, biomeColor, blendT);
        if (bts.floor1[s]) bts.floor1[s]!.tint = ruinedTint;
        if (bts.roof[s])   bts.roof[s]!.tint   = ruinedTint;
        for (const mf of bts.midFloors[s]) mf.sprite.tint = ruinedTint;
      }
      const ruinMult = bts.curRuinMult[s];

      // Floor1 and roof multiplied by building visibility (and ruin dimming if abandoned).
      if (bts.floor1[s]) bts.floor1[s]!.alpha = a * ruinMult;
      if (bts.roof[s])   bts.roof[s]!.alpha   = a * ruinMult;

      // Mid-floors: per-floor alpha (era) * building visibility * ruin dimming.
      const mfs = bts.midFloors[s];
      for (let i = mfs.length - 1; i >= 0; i--) {
        const mf = mfs[i];
        mf.curAlpha += (mf.targetAlpha - mf.curAlpha) * MID_FLOOR_EASE;
        const mfNotSettled = Math.abs(mf.curAlpha - mf.targetAlpha) > 0.01;
        if (mfNotSettled) settled = false; else mf.curAlpha = mf.targetAlpha;
        mf.sprite.alpha = a * mf.curAlpha * ruinMult;
        // If a mid-floor faded out completely AND is at the tail of the list, destroy + trim.
        // (Mid-fade interior floors keep their slot — we only destroy trailing ones.)
        if (!mfNotSettled && mf.targetAlpha === 0 && i === mfs.length - 1) {
          buildingLayer.removeChild(mf.sprite);
          mf.sprite.destroy();
          mfs.pop();
        }
      }

      // Roof Y eases on era change.
      if (bts.roof[s]) {
        bts.roofCurY[s] += (bts.roofTargetY[s] - bts.roofCurY[s]) * ROOF_EASE;
        if (Math.abs(bts.roofCurY[s] - bts.roofTargetY[s]) > 0.1) settled = false;
        else bts.roofCurY[s] = bts.roofTargetY[s];
        bts.roof[s]!.y = bts.roofCurY[s];
      }

      // Whole slot torn down — destroy all sprites. Triggered by either:
      //  (a) building visibility hit 0 (tile left 'built' state), or
      //  (b) ruin decay reached the destroy threshold (ghostly remnant fully crumbled).
      const ruinCrumbled = bts.ruined[s] && bts.curRuinMult[s] <= RUIN_DESTROY_THRESHOLD;
      if ((!slotNotSettled && bts.targetAlphas[s] === 0) || ruinCrumbled) {
        if (bts.floor1[s]) { buildingLayer.removeChild(bts.floor1[s]!); bts.floor1[s]!.destroy(); bts.floor1[s] = null; }
        if (bts.roof[s])   { buildingLayer.removeChild(bts.roof[s]!);   bts.roof[s]!.destroy();   bts.roof[s]   = null; }
        for (const mf of bts.midFloors[s]) { buildingLayer.removeChild(mf.sprite); mf.sprite.destroy(); }
        bts.midFloors[s] = [];
        // Reset ruin state in case a new building is later placed in this slot.
        bts.ruined[s] = false;
        bts.curRuinMult[s] = 1.0;
      }
    }

    if (settled) {
      bldDone.push(key);
      if (bts.floor1.every(s => s === null)) buildingTileStates[r][c] = null;
    }
  }
  for (const key of bldDone) animatingBuildingTiles.delete(key);

  drawExpeditions();
  updateLabels();
  updateHud();
  // DOM rebuild for the civ bars is expensive — throttle it.
  if (frameCount % BARS_REFRESH_FRAMES === 0) updateBars();
  updateEventLog();
});

// Capture the world into its RenderTexture every frame. Registered after the
// main tick callback (so it sees this frame's updates) and not gated by
// `running`, so manual actions while paused still show.
app.ticker.add(() => {
  app.renderer.render({ container: world, target: worldRT, clear: true });
});

// --- HUD ---
const hud = document.createElement('div');
hud.style.cssText = `
  position: fixed; top: 12px; left: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px;
  background: rgba(255,255,255,0.78); padding: 6px 10px; border-radius: 4px;
  display: flex; gap: 10px; align-items: center; user-select: none;
`;
hud.innerHTML = `
  <span>seed: <strong id="seed-label"></strong></span>
  <button id="reroll" style="cursor:pointer">reroll</button>
  <button id="reset-sim" style="cursor:pointer">reset sim</button>
  <button id="pause" style="cursor:pointer">pause</button>
  <button id="catastrophe" style="cursor:pointer;color:#a03020">catastrophe</button>
  <button id="skip" style="cursor:pointer;color:#607080">skip 5k</button>
  <button id="sound" style="cursor:pointer;color:#888" title="ambient sound">sound: off</button>
  <span>tick: <strong id="tick-label">0</strong></span>
  <span>civs: <strong id="civ-label">0</strong></span>
  <span>eras: <strong id="era-label">—</strong></span>
  <span>exp: <strong id="exp-label">0</strong></span>
`;
document.body.appendChild(hud);

// --- Civ bar graph panel (right edge) ---
const barPanel = document.createElement('div');
barPanel.style.cssText = `
  position: fixed; bottom: 12px; right: 12px;
  width: 320px;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px;
  background: rgba(255,255,255,0.75); padding: 10px; border-radius: 4px;
  display: flex; flex-direction: column; gap: 4px;
  user-select: none; pointer-events: none;
`;
barPanel.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;">living civilizations</div><div id="bars"></div>`;
document.body.appendChild(barPanel);

const barsContainer = document.getElementById('bars')!;

function hexToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function updateBars() {
  // Reuses the shared civStats cache instead of doing its own grid scan.
  const counts = civStats.tileCounts;
  const living: Array<{ civ: Civ; count: number }> = [];
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') continue;
    living.push({ civ, count: counts.get(civ.id) || 0 });
  }
  living.sort((a, b) => b.count - a.count);

  // Scale: longest bar = panel width. Use the largest current civ, 
  // or a floor so tiny civs don't fill the whole bar.
  const maxCount = Math.max(40, ...living.map((l) => l.count));

  // Rebuild the bars. Cheap because few civs.
  barsContainer.innerHTML = living
    .map(({ civ, count }) => {
      const pct = Math.round((count / maxCount) * 100);
      const color = hexToCss(civ.color);
      const phaseGlyph =
        civ.phase === 'rising' ? '▲' :
        civ.phase === 'stable' ? '■' :
        civ.phase === 'declining' ? '▼' : '·';
      return `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
          <span style="width:120px;color:#444;font-size:10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${ERA_TINT[civ.era]};margin-right:3px;"></span>${civ.name} <span style="color:#999;">${civ.era.slice(0,3)}</span> ${phaseGlyph}
</span>
          <div style="flex:1;height:10px;background:rgba(0,0,0,0.06);border-radius:2px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${color};transition:width 0.2s;"></div>
          </div>
          <span style="width:28px;text-align:right;color:#555;font-size:10px;">${count}</span>
        </div>`;
    })
    .join('');
}

const seedLabel = document.getElementById('seed-label')!;
const tickLabel = document.getElementById('tick-label')!;
const civLabel = document.getElementById('civ-label')!;

function updateHud() {
  seedLabel.textContent = currentSeed;
  tickLabel.textContent = String(simWorld.tick);
  let alive = 0;
  let total = 0;
  const eraCounts: Record<string, number> = {};
  for (const civ of simWorld.civs.values()) {
    total++;
    if (civ.phase !== 'dead') {
      alive++;
      eraCounts[civ.era] = (eraCounts[civ.era] || 0) + 1;
    }
  }
  civLabel.textContent = `${alive} alive / ${total} total`;
  document.getElementById('exp-label')!.textContent = String(simWorld.expeditions.length);
  const eraSummary = Object.entries(eraCounts)
    .map(([e, n]) => `${e.slice(0, 3)}:${n}`)
    .join(' ');
  document.getElementById('era-label')!.textContent = eraSummary || '—';
}
updateHud();

document.getElementById('reroll')!.addEventListener('click', () => {
  resetWorld(randomSeed());
});
document.getElementById('reset-sim')!.addEventListener('click', () => {
  resetSimOnly();
});
const soundBtn = document.getElementById('sound')!;
soundBtn.addEventListener('click', () => {
  audio.setEnabled(!audio.isEnabled());
  soundBtn.textContent = audio.isEnabled() ? 'sound: on' : 'sound: off';
});
const pauseBtn = document.getElementById('pause')!;
pauseBtn.addEventListener('click', () => {
  running = !running;
  pauseBtn.textContent = running ? 'pause' : 'resume';
});
document.getElementById('catastrophe')!.addEventListener('click', () => {
  const changes: Array<{ row: number; col: number }> = [];
  const biomeChanges: BiomeChange[] = [];
  const events: SimEvent[] = [];
  applyCatastrophe(simWorld, biomeMap, elevationMap, changes, biomeChanges, events);
  for (const { row, col } of changes) { noteTileChange(row, col); refreshTileOverlay(row, col); refreshBuildingSprite(row, col); }
  for (const { row, col } of biomeChanges) { refreshBiomeTile(row, col); }
  pushLogEvents(events);
  for (const ev of events) {
    if (ev.kind === 'catastrophe') {
      triggerImpact(ev.catastropheType, ev.severity);
      triggerEpicenter(ev.centerRow, ev.centerCol, ev.catastropheType, ev.severity);
      atmos.addScar(ev.catastropheType, ev.centerRow, ev.centerCol, ev.radius, ev.severity);
      audio.impact(ev.severity);
    }
  }
  drawCityMarkers();
});
document.getElementById('skip')!.addEventListener('click', () => {
  const wasRunning = running;
  running = false;
  for (let i = 0; i < SKIP_TICKS; i++) step(simWorld, biomeMap, elevationMap);
  // Full redraw after skip — terrain may have mutated, so rebuild biome layer first.
  // Scars from skipped ticks weren't rendered; drop any stale ones.
  atmos.clearScars();
  drawBiomes();
  fadedDeadCivs.clear();
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') fadedDeadCivs.add(civ.id);
  }
  clearSimLayer();
  clearBuildingLayer();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (simWorld.tiles[row][col].state !== 'wild') refreshTileOverlay(row, col);
    }
  }
  rebuildBuildingSprites();
  drawCityMarkers();
  for (const lbl of civLabels.values()) { labelLayer.removeChild(lbl.text); lbl.text.destroy(); }
  civLabels.clear();
  eventLog.length = 0;
  accumulator = 0;
  running = wasRunning;
  updateHud();
});

// --- Resize ---
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  centerWorld();
  layoutAtmosphere();
  atmos.layout(window.innerWidth, window.innerHeight);
});

function colorsWithin(a: number, b: number, tol: number): boolean {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return Math.abs(ar - br) <= tol && Math.abs(ag - bg) <= tol && Math.abs(ab - bb) <= tol;
}