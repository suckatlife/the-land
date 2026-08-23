import { Application, Assets, Container, Graphics, MeshPlane, RenderTexture, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import './style.css';
import { generateBiomeMap, generateRivers, makeTerrainSampler, classify, landFraction, DEFAULT_TERRAIN, BIOME_COLORS, SEA_LEVEL, type Biome, type TerrainProfile } from './biomes';
import { placeNaturalWonders, type NaturalWonder, type NaturalWonderKind } from './naturalWonders';

// How strongly each wonder draws (+) or repels (−) settlement, and over how
// many tiles that pull fades. The volcano's slopes are feared; fresh water and
// sacred/mineral landmarks are sought.
const WONDER_PULL: Record<NaturalWonderKind, number> = {
  volcano: -4, crater_lake: 3, monolith: 2, rainbow_hills: 1.5, karst_spires: 1.5, salt_flat: 2,
  // A lagoon is shelter and fishing; a gorge and a sand sea are country you
  // settle around rather than in.
  atoll: 3, canyon: -2, dune_sea: -3,
};
const WONDER_RADIUS: Record<NaturalWonderKind, number> = {
  volcano: 5, crater_lake: 8, monolith: 7, rainbow_hills: 6, karst_spires: 6, salt_flat: 6,
  atoll: 6, canyon: 8, dune_sea: 9,
};
import { drawTile, drawStateOverlayPersistent, redrawOverlay, redrawBiomeTile, lerpColor, gridToScreen, rgbToHsl, hslToRgb } from './iso';
import { createSimWorld, beginEnding, beginSilence, rollCharacter, characterOf, step, tileOverlayColor, seedInitialCivs, applyCatastrophe, setVolcanoes, eruptVolcanoesNow, setWonderSites, iceDepthAt, SIM, CATASTROPHE, CITY, nearestCityDist, type SimWorld, type Civ, type CivCity, type SimEvent, type Era, type TileOverlay, type BiomeChange, type CatastropheType } from './sim';
import { createAtmosphere, ATMOS } from './atmosphere';
import { initializeAnalytics, trackEvent } from './analytics';
import {
  WORLD_ENDINGS,
  createWorldHistory,
  rememberWorldEvents,
  commitEndingKind,
  resolveWorldEnding,
  worldFateForSeed,
  type ResolvedWorldEnding,
  type ApocalypseKind,
  type WorldEndingKind,
  type WorldFate,
  type WorldHistory,
} from './endings';

initializeAnalytics();

const GRID_SIZE = 96;
const ticksPerSecond = 30;
const SKIP_TICKS = 5000;
const SHOW_BUILDING_SPRITES = true;
// Civ ownership: tile-fill tint (the diamond color overlay) vs. just the border outline.
// Off → rely on buildings + farmland alone to read territory (experiment).
const SHOW_TILE_TINT = false;
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
  medieval:   0.72,
  industrial: 0.82,
  modern:     0.95,
  post:       1.12,  // still the most synthetic era, but no longer a shout
};

// --- Late-era hierarchy ----------------------------------------------------
// A developed world used to read as one uniformly assertive field of colour:
// every building in every era carried the full civ hue, so the eye had nothing
// to rank. The fix is contrast budgeting, not new geometry — ordinary
// settlement drifts toward earth/air tones and gives up saturation, while the
// city cores (and above all the capital) keep theirs. Squint test: geography
// first, civilisations second, active history third.
const HIERARCHY = {
  quietSat:      0.32,      // saturation multiplier at the most ordinary hinterland tile
  quietBlend:    0.42,      // how far that tile's colour drifts toward the ground it stands on
  quietLift:     0.10,      // lightness lifted toward the ground, so it contrasts less as well
  earthTone:     0xa2907a,  // fallback recede target when the ground tone is unknown
  capitalBoost:  0.40,      // importance added at the capital tile itself
  capitalRadius: 7,         // tiles over which that boost falls off to nothing
};

// How much a building is allowed to assert itself: 0 = anonymous hinterland
// stock, 1 = the capital's core. Density (city proximity × civ vitality) is
// already the right shape for this — the capital bonus is what stops a big
// secondary city from reading as loudly as the seat of the civilisation.
function buildingImportance(row: number, col: number, civ: Civ, density: number): number {
  let imp = density;
  const cap = civ.cities[0];
  if (cap) {
    const d = Math.hypot(cap.row - row, cap.col - col);
    imp += HIERARCHY.capitalBoost * Math.max(0, 1 - d / HIERARCHY.capitalRadius);
  }
  return Math.max(0, Math.min(1, imp));
}
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
// The age a world is IN. This used to be the era of the single largest
// civilisation, which read the world wrong in a specific and visible way:
// because a civ's era is fixed at birth and never advances while it lives (a
// CLAUDE.md invariant), one big long-lived society pins the readout for the
// rest of the world's life. Measured at eraProgress 5.0 — the very top of the
// arc — the always-on HUD still said "The Middle Ages · 1,500 CE" while the
// living civs were medieval:648, industrial:415, neolithic:321, industrial:256.
// Ten minutes of watching and deep time appeared not to move at all.
//
// So the age is read ACROSS civs: the most advanced era that holds a real share
// of the settled world. If a third of the world is industrial, the world is in
// the industrial age, whatever the biggest single blob happens to be.
const ERA_READOUT = {
  share: 0.15,   // fraction of settled tiles an era needs before it counts as the world's age
};
// Deep time does not run backwards. The readout may stall but never regress:
// the displayed year is anchored to this era, and a year counting down reads as
// a bug rather than as a dark age. Reset per world.
let displayedEraRank = 0;
// Rank order, mirroring ERA_RANK below (which is declared further down the file
// but only read at call time).
const ERA_BY_RANK: Era[] = ['neolithic', 'classical', 'medieval', 'industrial', 'modern', 'post'];
function dominantEra(world: SimWorld): Era {
  const byRank = new Array(ERA_BY_RANK.length).fill(0);
  let settled = 0;
  let largestRank = 0, largestCount = -1;
  for (const civ of world.civs.values()) {
    if (civ.phase === 'dead') continue;
    const n = civStats.tileCounts.get(civ.id) || 0;
    const rank = ERA_RANK[civ.era];
    byRank[rank] += n;
    settled += n;
    if (n > largestCount) { largestCount = n; largestRank = rank; }
  }
  let rank = largestRank;   // fall back to the old answer when nothing qualifies
  if (settled > 0) {
    for (let i = byRank.length - 1; i >= 0; i--) {
      if (byRank[i] / settled >= ERA_READOUT.share) { rank = i; break; }
    }
  }
  if (rank > displayedEraRank) displayedEraRank = rank;
  return ERA_BY_RANK[displayedEraRank];
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
  volcano: [
    { ancient: ['The mountain smokes. The old people watch it.', 'There is a smell of sulphur on the high paths.'],
      middle:  ['Sulphur taints the wells below the peak.', 'The mountain\'s snow is melting out of season.'],
      late:    ['Gas readings climb on the mountain. Access is restricted.', 'The survey marks on the mountain no longer agree.'] },
    { ancient: ['Ash falls like grey snow on the high pastures.', 'The mountain glows where it should be dark.'],
      middle:  ['The herds refuse the mountain road.', 'Hot springs appear where there were none.'],
      late:    ['The mountain swells. The instruments agree.', 'Tremors cluster under the peak, shallower each week.'] },
    { ancient: ['The birds have left the mountain.', 'The ground on the high slopes is warm at night.'],
      middle:  ['The mountain rumbles without pause. Prayers are continuous.', 'Stones roll downhill on their own.'],
      late:    ['The exclusion zone empties. The mountain waits.', 'The final ascent teams are recalled.'] },
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

// What an age calls its great work.
const WONDER_TITLES: Record<Era, (place: string) => string> = {
  neolithic:  (p) => `the Standing Stones of ${p}`,
  classical:  (p) => `the Lighthouse of ${p}`,
  medieval:   (p) => `the Cathedral of ${p}`,
  industrial: (p) => `the Great Engine of ${p}`,
  modern:     (p) => `the Spire of ${p}`,
  post:       (p) => `the Beacon of ${p}`,
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
    case 'conquest':
      // Individual tile flips aren't narrated; the war-heat aggregator
      // (below) speaks when a border is genuinely contested.
      return '';
    case 'migration': {
      const bucket = dominantEraBucket(world);
      const lines: Record<EraBucket, string[]> = {
        ancient: ['A band crosses the steppe, looking for water.', 'Smoke from cookfires moves through the wilds, a little further each night.'],
        middle:  ['Wagons move through the empty country, looking for ground.', 'A landless people walks the margins, asking after soil.'],
        late:    ['Settlers move through the empty quarter.', 'A convoy crosses the wastes, maps out of date.'],
      };
      return pick(lines[bucket]);
    }
    case 'wonder_built': {
      const civ = world.civs.get(ev.civId);
      if (!civ) return '';
      const title = WONDER_TITLES[civ.era](civ.cities[0]?.name ?? civ.name);
      return pick([
        `${civ.name} raises ${title}. It can be seen from the sea.`,
        `${title} is finished. ${civ.name} did not build it quickly.`,
      ]);
    }
    case 'island_rising': {
      const loc = cardinalDesc(ev.row, ev.col);
      return pick([
        `The sea boils in the ${loc}. Fishermen keep their distance.`,
        `Steam stands on the ${loc} water like a pillar.`,
      ]);
    }
    case 'island_born': {
      const loc = cardinalDesc(ev.row, ev.col);
      return pick([
        `A new land stands in the ${loc} sea, black and steaming.`,
        `The ${loc} sea has made an island. Nothing grows there yet.`,
      ]);
    }
    case 'land_bridge': {
      const loc = cardinalDesc(ev.row, ev.col);
      return pick([
        `The sea withdraws from the ${loc} strait. A causeway of sand stands where ships went.`,
        `The ${loc} strait has closed. What was crossed by boat is walked.`,
      ]);
    }
    case 'rift_opened': {
      const loc = cardinalDesc(ev.row, ev.col);
      return pick([
        `The land is tearing in the ${loc}. The sea follows the crack.`,
        `A rift opens across the ${loc}. The two sides are already strangers.`,
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
      if (ev.catastropheType === 'volcano') {
        if (isSevere) return n
          ? pick([`The mountain opens. Fire stands over ${n} for three days.`, `${n} is buried in a night. The sky stays grey for a season.`])
          : pick([`The mountain opens over the ${loc}. An age burns.`, `Fire stands on the ${loc} horizon for three days.`]);
        if (isMinor) return n
          ? `The mountain grumbles, and ash dusts the fields of ${n}.`
          : `The ${loc} mountain grumbles and is quiet again.`;
        return n
          ? pick([`The mountain throws fire. The villages of ${n} below it burn.`, `Ash buries the ${loc} fields. ${n} carries what it can.`])
          : pick([`The ${loc} mountain throws fire over empty land.`, `Ash drifts across the ${loc} for days.`]);
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
    // The slowest register the world has: a glacial, once per world, told in
    // three lines — the cold arriving, the world at its narrowest, the thaw.
    case 'ice_advance':
      return pick([
        'The winters stop ending. Ice gathers at the top and bottom of the world.',
        'A cold that does not lift settles on the high latitudes. The ice begins to walk.',
        'Snow lies through the summer for the first time in memory, and then again.',
      ]);
    case 'ice_peak':
      return pick([
        'The ice stands at its furthest. What lives, lives in a narrow warm belt.',
        'The world is white to the horizons. Everything that remains is crowded into the middle of it.',
        'The glaciers reach their limit. The habitable world is a band, and it is thin.',
      ]);
    case 'ice_retreat':
      return pick([
        'The ice lets go. Meltwater runs where the sheets stood, and green follows it back.',
        'The long cold breaks. The world widens again, scoured and pale where the ice lay.',
        'The glaciers withdraw, leaving bare ground and heaped stone to mark how far they came.',
      ]);
  }
}

// --- Event log ---
interface NarrationAnchor { row: number; col: number; }
interface LogEntry {
  text: string;
  ts: number;
  variant?: 'catastrophe' | 'omen' | 'relief';
  anchor?: NarrationAnchor;
  chronicle: boolean;
}
const eventLog: LogEntry[] = [];
const LOG_MAX = 16;
const LOG_ENTER_MS = 650;
const LOG_LIFETIME_MS = 9500;
const LOG_FADE_AFTER_MS = 6200;

const logPanel = document.createElement('div');
logPanel.className = 'chronicle-layer';
document.body.appendChild(logPanel);

// Visibility toggles, wired to HUD buttons further down. Off by default so the
// app opens clean as a second-screen screensaver.
let showBars = false;
let showLog = false;

// One throttled, priority-aware queue for ALL narration. Earlier this was a
// quiet-gate on sim events only, while ~7 story systems pushed straight to the
// log and could shove a catastrophe announcement off the 5-line panel. Now
// everything goes through pushNarration: high-priority lines (disasters,
// deaths, wonders, world-shaping geology) always show; normal lines yield if
// something was logged in the last 2.5s; low lines (war churn, ambient
// whispers) yield for 6s. Identical or same-war repeats are dropped.
type NarrationPriority = 'high' | 'normal' | 'low';
const NARRATION_GAP_MS: Record<NarrationPriority, number> = { high: 0, normal: 2500, low: 6000 };
let lastNarrationTs = 0;
let lastNarrationKey = '';

function pushNarration(
  text: string,
  opts: {
    priority?: NarrationPriority;
    variant?: LogEntry['variant'];
    dedupKey?: string;
    anchor?: NarrationAnchor;
    chronicle?: boolean;
  } = {},
): boolean {
  if (!text) return false;
  const now = Date.now();
  const pri = opts.priority ?? 'normal';
  // Drop exact repeats of the line currently on top, and repeats of the same
  // dedup bucket (e.g. the same war) within the low-priority window.
  if (eventLog[0]?.text === text) return false;
  if (opts.dedupKey && opts.dedupKey === lastNarrationKey && now - lastNarrationTs < NARRATION_GAP_MS.low) return false;
  if (pri !== 'high' && now - lastNarrationTs < NARRATION_GAP_MS[pri]) return false;
  lastNarrationTs = now;
  lastNarrationKey = opts.dedupKey ?? '';
  eventLog.unshift({
    text,
    ts: now,
    variant: opts.variant,
    anchor: opts.anchor,
    chronicle: opts.chronicle ?? false,
  });
  if (eventLog.length > LOG_MAX) eventLog.length = LOG_MAX;
  return true;
}

// Per-sim-event narration priority. High = always shown.
const EVENT_PRIORITY: Partial<Record<SimEvent['kind'], NarrationPriority>> = {
  catastrophe: 'high', omen: 'high', civ_died: 'high', wonder_built: 'high',
  rift_opened: 'high', island_born: 'high', land_bridge: 'high', spared: 'high', rally: 'high',
  civ_declining: 'normal', last_flight: 'normal', refuge_founded: 'normal',
  breakaway: 'normal', civ_born: 'normal', migration: 'normal', island_rising: 'normal',
  ice_advance: 'high', ice_peak: 'high', ice_retreat: 'high',
  capital_moved: 'low', city_fell: 'low', colony_founded: 'low', conquest: 'low',
};

// The connective tissue between log, panel, and map: civ names render in
// their civ's color wherever they appear, and a mention timestamps the civ
// so its panel row flashes.
const civMentionTs = new Map<number, number>();

function colorizeCivNames(text: string): string {
  const civs = [...simWorld.civs.values()].sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const civ of civs) {
    if (!out.includes(civ.name)) continue;
    const esc = civ.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\w>])(${esc})(?!\\w)`);
    if (!re.test(out)) continue;
    out = out.replace(re, (_m, pre, name) =>
      `${pre}<span style="color:${hexToCss(civ.color)};font-weight:600">${name}</span>`);
    civMentionTs.set(civ.id, Date.now());
  }
  return out;
}

function civNarrationAnchor(civId: number): NarrationAnchor | undefined {
  const civ = simWorld.civs.get(civId);
  if (!civ) return undefined;
  const city = civ.cities[0];
  return city
    ? { row: city.row, col: city.col }
    : { row: civ.originRow, col: civ.originCol };
}

function eventNarrationAnchor(ev: SimEvent): NarrationAnchor | undefined {
  switch (ev.kind) {
    case 'catastrophe':
      return { row: ev.centerRow, col: ev.centerCol };
    case 'conquest':
    case 'island_rising':
    case 'island_born':
    case 'land_bridge':
    case 'rift_opened':
    case 'wonder_built':
    case 'migration':
    case 'colony_founded':
    case 'refuge_founded':
    case 'city_fell':
    case 'capital_moved':
      return { row: ev.row, col: ev.col };
    case 'breakaway':
      return civNarrationAnchor(ev.newCivId);
    case 'civ_born':
    case 'civ_declining':
    case 'civ_died':
    case 'spared':
    case 'rally':
    case 'last_flight':
      return civNarrationAnchor(ev.civId);
    case 'omen':
    case 'ice_advance':
    case 'ice_peak':
    case 'ice_retreat':
      return undefined;
  }
}

function pushLogEvents(evs: SimEvent[]) {
  for (const ev of evs) {
    const text = colorizeCivNames(narrateEvent(ev, simWorld));
    if (!text) continue;
    const variant = ev.kind === 'catastrophe' ? 'catastrophe' as const
      : ev.kind === 'omen' ? 'omen' as const
      : (ev.kind === 'spared' || ev.kind === 'rally') ? 'relief' as const
      : undefined;
    pushNarration(text, {
      priority: EVENT_PRIORITY[ev.kind] ?? 'normal',
      variant,
      anchor: eventNarrationAnchor(ev),
      // Keep Chronicle to genuine turning points. Omens and recovery beats can
      // be numerous around one disaster, so they stay out of the spatial layer.
      chronicle: EVENT_PRIORITY[ev.kind] === 'high'
        && ev.kind !== 'omen' && ev.kind !== 'spared' && ev.kind !== 'rally',
    });
  }
}

function updateEventLog() {
  if (!showLog) return;
  const now = Date.now();
  for (let i = eventLog.length - 1; i >= 0; i--) {
    if (now - eventLog[i].ts > LOG_LIFETIME_MS) eventLog.splice(i, 1);
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const maxWidth = width < 620 ? 226 : 292;
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const fragment = document.createDocumentFragment();
  let globalIndex = 0;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w + 8 && a.x + a.w + 8 > b.x && a.y < b.y + b.h + 8 && a.y + a.h + 8 > b.y;

  // Two simultaneous callouts are enough to connect text to place without
  // turning the world into a notification surface.
  const visibleEntries = eventLog.filter((entry) => entry.chronicle).slice(0, 2);
  for (const e of visibleEntries) {
    const age = now - e.ts;
    const enterT = Math.min(1, age / LOG_ENTER_MS);
    const enterEase = 1 - Math.pow(1 - enterT, 3);
    const exitOpacity = age < LOG_FADE_AFTER_MS
      ? 1
      : 1 - (age - LOG_FADE_AFTER_MS) / (LOG_LIFETIME_MS - LOG_FADE_AFTER_MS);
    const opacity = enterEase * exitOpacity;
    const plainText = e.text.replace(/<[^>]+>/g, '');
    const boxWidth = Math.min(maxWidth, Math.max(170, 82 + plainText.length * 4.2));
    const estimatedLines = Math.max(1, Math.ceil((plainText.length * 5.2) / (boxWidth - 24)));
    const boxHeight = 25 + (estimatedLines - 1) * 15;
    const projected = e.anchor ? tileToSky(e.anchor.row, e.anchor.col) : null;
    const anchor = projected
      ? { x: clamp(projected.x, 8, width - 8), y: clamp(projected.y, 8, height - 8) }
      : null;

    let x = anchor
      ? (anchor.x < width * 0.62 ? anchor.x + 24 : anchor.x - boxWidth - 24)
      : 16;
    let y = anchor ? anchor.y - boxHeight * 0.55 : 72 + globalIndex * (boxHeight + 10);
    x = clamp(x, 12, width - boxWidth - 12);
    y = clamp(y, 12, height - boxHeight - 58);

    // Newer messages get first choice. Older ones step around them rather than
    // piling into an unreadable stack when several events share a city.
    let candidate = { x, y, w: boxWidth, h: boxHeight };
    for (let attempt = 1; placed.some((other) => overlaps(candidate, other)) && attempt <= 10; attempt++) {
      const direction = attempt % 2 === 0 ? -1 : 1;
      const step = Math.ceil(attempt / 2) * (boxHeight + 10);
      candidate = { ...candidate, y: clamp(y + direction * step, 12, height - boxHeight - 58) };
    }
    placed.push(candidate);
    if (!anchor) globalIndex++;

    if (anchor) {
      const targetX = clamp(anchor.x, candidate.x, candidate.x + candidate.w);
      const targetY = clamp(anchor.y, candidate.y, candidate.y + candidate.h);
      const dx = targetX - anchor.x;
      const dy = targetY - anchor.y;
      const leader = document.createElement('span');
      leader.className = 'chronicle-leader';
      leader.style.left = `${anchor.x}px`;
      leader.style.top = `${anchor.y}px`;
      leader.style.width = `${Math.hypot(dx, dy)}px`;
      leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      leader.style.opacity = (opacity * 0.64).toFixed(2);
      const dot = document.createElement('span');
      dot.className = 'chronicle-anchor';
      dot.style.left = `${anchor.x}px`;
      dot.style.top = `${anchor.y}px`;
      dot.style.opacity = (opacity * 0.78).toFixed(2);
      fragment.append(leader, dot);
    }

    const callout = document.createElement('div');
    callout.className = `chronicle-callout${e.variant ? ` chronicle-callout--${e.variant}` : ''}`;
    callout.style.left = `${candidate.x}px`;
    callout.style.top = `${candidate.y}px`;
    callout.style.width = `${candidate.w}px`;
    callout.style.opacity = opacity.toFixed(2);
    callout.style.transform = `translateY(${((1 - enterEase) * 6).toFixed(1)}px) scale(${(0.985 + enterEase * 0.015).toFixed(3)})`;
    callout.innerHTML = e.text;
    fragment.appendChild(callout);
  }
  logPanel.replaceChildren(fragment);
}

// Graphics quality — the user's FPS/fidelity lever (cycled from the HUD, saved
// to localStorage, applied on load). The dominant costs are fill-related: the
// main canvas at device resolution (×dpr — 4× the pixels on a hi-DPI screen)
// and the per-frame render-texture. mainRes caps the canvas resolution (the
// biggest lever), rt the texture, slots/extraFloors the building object count.
// Resolution is the real framerate lever (measured): canvas res (mainRes) drives
// the mesh/sky/limb passes, RT res (rt) drives the world-content render. The
// curvature mesh hides RT softness and the painterly art tolerates a soft canvas,
// so these can run lower than they look like they should. high→low ≈ 2× fps.
const QUALITY = {
  high:   { mainRes: 1.4,  rt: 0.72, slots: 4, extraFloors: 5, label: 'high' },
  medium: { mainRes: 1.15, rt: 0.58, slots: 3, extraFloors: 1, label: 'med'  },
  low:    { mainRes: 1,    rt: 0.46, slots: 2, extraFloors: 0, label: 'low'  },
} as const;
type QualityLevel = keyof typeof QUALITY;
let qualityLevel: QualityLevel =
  (localStorage.getItem('theLand:quality') as QualityLevel) in QUALITY
    ? (localStorage.getItem('theLand:quality') as QualityLevel)
    : 'high';

// Perf A/B overrides (?mres= / ?rt=) so resolution levers can be measured on
// clean loads without rebuilding.
const _qp = new URLSearchParams(location.search);
const debugMode = _qp.get('debug') === '1';
const _mresOverride = _qp.has('mres') ? parseFloat(_qp.get('mres')!) : null;
const _rtOverride = _qp.has('rt') ? parseFloat(_qp.get('rt')!) : null;

const app = new Application();
await app.init({
  width: window.innerWidth,
  height: window.innerHeight,
  background: '#e8e2d4',
  resolution: _mresOverride ?? Math.min(window.devicePixelRatio || 1, QUALITY[qualityLevel].mainRes),
  autoDensity: true,
  antialias: true,
});
document.body.appendChild(app.canvas);
// Upscale the canvas to the screen crisply (nearest), not blurred, so a
// sub-native render resolution stays sharp rather than soft.
app.canvas.style.imageRendering = 'pixelated';

// Atmosphere: sky behind the world, scars inside it, a day/night glaze above.
const atmos = createAtmosphere();
// Tuning/debug handle: scrub time with __atmosphere.setTimeOfDay(0..1).
(window as any).__atmosphere = atmos;

// Declared ahead of the layer stack (they slot into it below); drawn/managed
// further down.
const riverGfx = new Graphics();
const riverCraftGfx = new Graphics(); // riverboats + bridges on the rivers
const sceneryWaterGfx = new Graphics(); // beyond-the-grid sea (under glitter)
const sceneryLandGfx = new Graphics();  // beyond-the-grid land (over glitter)
const roadsGfx = new Graphics();        // paths between cities, era-styled
const conflictGfx = new Graphics();     // war flickers at contested tiles
const warLayer = new Container();       // armies, banners, sieges — one scaled Graphics per battle
const warPool: Graphics[] = [];         // pooled per-battle Graphics, each scaled around its front
const successionGfx = new Graphics();   // scrub/wood reclaiming ruins (cached; re-baked slowly)
const iceGfx = new Graphics();          // polar ice sheets, snow, moraine (cached; re-baked rarely)
const quietGfx = new Graphics();        // dead-ground silhouette left by a catastrophe
const wonderGfx = new Graphics();       // monuments (persist as ruins)
const skylineGfx = new Graphics();      // era settlement tells: walls, smokestacks, antenna masts
const boatsGfx = new Graphics();        // sea craft, fishing dots, whales
const nomadGfx = new Graphics();        // migrating bands, caravans, trains
const wildlifeGfx = new Graphics();     // wandering animal herds on wild land
const powerGfx = new Graphics();        // power grid (industrial+), pulses at night
const airGfx = new Graphics();          // planes (modern+) and rockets (post)
const birdFlockGfx = new Graphics();    // small Vs of birds flitting forest to forest
const festivalGfx = new Graphics();     // night festival glow
festivalGfx.blendMode = 'add';
const smokeLayer = new Container();
const smogGfx = new Graphics();        // end-of-cycle pollution pooling over cities
const cityLightsGfx = new Graphics();
cityLightsGfx.blendMode = 'add';
cityLightsGfx.alpha = 0;

// --- Atmospheric perspective ------------------------------------------------
// Distance should cost contrast, not only size. The wash is a single vertical
// gradient laid over the far part of the world capture (world y grows toward
// the viewer, so y=0 is the far horizon), tinted live to the sky's horizon
// colour so the far latitudes dissolve into the air they sit under.
const DEPTH = {
  reach:     0.60,  // fraction of the capture's depth the haze covers, from the horizon forward
  strength:  0.32,  // alpha at the very back
  power:     2.0,   // ramp shape — higher keeps the haze nearer the horizon
  nightMult: 0.55,  // how much of the haze survives at deep night (air still reads, but dimmer)
};
function makeDepthHazeTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 2; cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  // Bake the t^power ramp into the stops so no shader is needed.
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    grad.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, DEPTH.power).toFixed(4)})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  return Texture.from(cv);
}
const depthHazeSprite = new Sprite(makeDepthHazeTexture());

const biomeLayer = new Container();
const simLayer = new Container();
const farmGfx = new Graphics();      // mature fields, cached to one texture (cheap)
const farmGrowGfx = new Graphics();  // fields currently growing in, animated per-frame
const seaTrailGfx = new Graphics();  // worn sea lanes (boats); brighten with reuse
const landTrailGfx = new Graphics(); // worn land routes (caravans/trains)
const airTrailGfx = new Graphics();  // flight corridors (planes)
const causewayGfx = new Graphics();  // strait-spanning causeway islands + rail (modern+)
const cableGfx = new Graphics();     // undersea power/data cables between cities
const lighthouseGfx = new Graphics(); // coastal lighthouses + sweeping beams at night
const fireGfx = new Graphics();      // wildfires (additive glow)
fireGfx.blendMode = 'add';
const lavaGfx = new Graphics();      // molten lava bodies + ash plume (normal blend)
const lavaGlowGfx = new Graphics();  // lava heat-glow + vent fountain (additive)
lavaGlowGfx.blendMode = 'add';
const natWonderWaterGfx = new Graphics();  // natural-wonder open water (crater lake) — sits BELOW the glitter so it catches the sun-band like the ocean
const natWonderGroundGfx = new Graphics(); // natural-wonder ground features (salt flats, painted hills, aprons)
const natWonderGfx = new Graphics();       // natural-wonder standing forms (volcano cone, monolith, spires)
const natWonderGlowGfx = new Graphics();   // natural-wonder light (lava glow, mineral shimmer) — additive
natWonderGlowGfx.blendMode = 'add';
const plagueGfx = new Graphics();    // a sickly miasma dimming afflicted districts
const faithGfx = new Graphics();     // a golden tide of shrine-light spreading city to city
faithGfx.blendMode = 'add';
const floodGfx = new Graphics();     // river floods sheeting over the lowlands
const droughtGfx = new Graphics();   // a parched, cracked pall over drought regions
const energyGfx = new Graphics();    // renewable energy farms (solar arrays, wind turbines)
const megaGfx = new Graphics();      // post-era megastructures (arcologies, space elevators)
const ringGfx = new Graphics();      // orbital ring — NEAR arc, in front of the globe
ringGfx.eventMode = 'none';
const ringBackGfx = new Graphics();  // orbital ring — FAR arc, behind the globe (occluded by it)
ringBackGfx.eventMode = 'none';
const satelliteGfx = new Graphics(); // satellites crossing the sky (screen-space)
satelliteGfx.eventMode = 'none';
// Sky structures — rockets and space elevators — draw in SCREEN space, above
// the limb mask, so they thread past the horizon to the top of the frame
// instead of being clipped at the planet's edge like everything in `world`.
const skyStructGfx = new Graphics();
skyStructGfx.eventMode = 'none';
const buildingLayer = new Container();
const scaffoldGfx = new Graphics();   // construction frames over buildings going up
buildingLayer.sortableChildren = true;
const expeditionLayer = new Container();
const cityMarkersContainer = new Container();
const labelLayer = new Container();
const world = new Container();
world.addChild(biomeLayer);
// Biome changes (breathing land, forming islands) crossfade in here, over the
// cached base, until they finish and are folded into the cache.
const biomeTransLayer = new Container();
world.addChild(biomeTransLayer);
// Crater-lake water sits here, under the glitter, so the sun-band sweeps across
// it exactly as it does the ocean (its tiles are added to the same water mask).
world.addChild(natWonderWaterGfx);
// Sun glitter / moon path on the water, masked to water tiles below.
world.addChild(atmos.glitterLayer);
// Scenery land sits over the glitter (so the simple water mask suffices).
world.addChild(sceneryLandGfx);
// Natural wonders' ground features (caldera water, salt flats, painted bands)
// lie on the terrain itself, under settlement tints and anything built.
world.addChild(natWonderGroundGfx);
// Rivers run over the terrain, under settlement tints.
world.addChild(riverGfx);
world.addChild(riverCraftGfx);
world.addChild(simLayer);
// Cultivated fields over the ownership tint, under everything built on them.
world.addChild(farmGfx);
world.addChild(farmGrowGfx);
// Roads over the tints (still under scars and buildings).
world.addChild(roadsGfx);
// Worn land routes (traffic heat) sit just over the roads.
world.addChild(landTrailGfx);
// Reclamation grows OVER the roads (grass crossing an abandoned highway is the
// whole image) but under anything still standing.
world.addChild(successionGfx);
// The ice sheets lie over the ground and its roads — snow covers a road — but
// under everything built, so what survives the cold stands in the snow.
world.addChild(iceGfx);
// Scars sit above civ tints (catastrophes hit settled land) but below buildings.
world.addChild(atmos.scarLayer);
// The dead ground a catastrophe leaves: over the scar wash, under the buildings,
// so what survives still stands in it.
world.addChild(quietGfx);
// Wild herds graze the open land, beneath the towns that will displace them.
world.addChild(wildlifeGfx);
// Wind shimmer brightens the ground, masked to land below.
world.addChild(atmos.shimmerLayer);
world.addChild(buildingLayer);
world.addChild(scaffoldGfx);
// The power grid strings over the rooftops (industrial+).
world.addChild(powerGfx);
// Conflict flickers and monuments stand among the buildings.
world.addChild(conflictGfx);
// Armies clash at the war fronts, above the conflict glow.
world.addChild(warLayer);
world.addChild(wonderGfx);
// Era settlement tells stand among the city's buildings, with the monuments.
world.addChild(skylineGfx);
world.addChild(expeditionLayer);
// Undersea cables lie on the seabed, beneath everything that floats.
world.addChild(cableGfx);
// Causeway islands span the straits; trains ride over them, so they sit just
// under the nomad/train layer.
world.addChild(causewayGfx);
// Nomad bands and sea craft travel the surface.
world.addChild(nomadGfx);
// Worn sea lanes lie on the water, beneath the boats that wear them.
world.addChild(seaTrailGfx);
world.addChild(boatsGfx);
// Lighthouses stand on the headlands, their beams sweeping the night sea.
world.addChild(lighthouseGfx);
// Wildfires glow over the burning land.
world.addChild(fireGfx);
// Volcanic lava creeps over the land and cools into fresh rock.
world.addChild(lavaGfx);
world.addChild(lavaGlowGfx);
// A plague's miasma dims the districts it touches (above the buildings).
world.addChild(plagueGfx);
// A faith's golden light kindles over the districts it reaches.
world.addChild(faithGfx);
// River floods sheet a film of water over the drowned lowlands.
world.addChild(floodGfx);
// Drought parches the land brown and cracked.
world.addChild(droughtGfx);
// Renewable farms sit on open land near cities, beneath the megastructures.
world.addChild(energyGfx);
// Natural wonders' standing forms (volcano cone + plume, monolith, spires)
// tower over the land like the megastructures, above the buildings around them.
world.addChild(natWonderGfx);
world.addChild(natWonderGlowGfx);
// Megastructures tower over their cities.
world.addChild(megaGfx);
// Directional land light sits under the cloud shadows (clouds block sun).
world.addChild(atmos.landLightLayer);
// City smoke rises beneath the clouds.
world.addChild(smokeLayer);
// End-of-cycle smog pools over the cities.
world.addChild(smogGfx);
// Cloud shadows fall on land and buildings; markers and labels stay above.
world.addChild(atmos.cloudShadowLayer);
// City lights pierce the night (and sit above cloud shadow).
world.addChild(cityLightsGfx);
// Festival glow joins the lights; storms ride above everything groundborne.
world.addChild(festivalGfx);
// Atmospheric perspective: air between the viewer and the far latitudes. It
// lies over everything groundborne (terrain, buildings, wonders, night lights)
// so distance costs detail AND contrast, not just detail — the far half of the
// world settles toward the horizon colour instead of competing with the near
// half. One quad inside the world capture, so it bends with the planet; kept
// to the far portion of the capture so it isn't paying fill for the near half,
// where its alpha would be ~0 anyway.
world.addChild(depthHazeSprite);
world.addChild(atmos.stormLayer);
// Bird flocks cross at dawn and dusk.
world.addChild(atmos.birdLayer);
// Smaller flocks skim the canopy, forest to forest, above the surface life.
world.addChild(birdFlockGfx);
// Flight corridors hang faintly in the air, beneath the planes that trace them.
world.addChild(airTrailGfx);
// Planes and rockets fly in the air, above everything on the ground.
world.addChild(airGfx);
world.addChild(cityMarkersContainer);
// Mist banks veil everything but the text.
world.addChild(atmos.fogLayer);
world.addChild(labelLayer);
atmos.attach({ biomeLayer });

// Curvature: the world container never sits on the stage. It renders each
// frame into a fixed world-space RenderTexture and is drawn through a gently
// bent MeshPlane (ATMOS.curve) — so the silhouette stops being a hard
// diamond, and everything in world space (scars, rings, weather, labels)
// bends together. The capture rect is in world units, window-independent.
const WORLD_CAPTURE = { x0: -1600, y0: -110, w: 3200, h: 1720 };
const captureScale = ATMOS.composition.worldScale;

// Size the depth haze to the back DEPTH.reach of the capture (declared above,
// where the layer stack needs it; the capture rect only exists here).
depthHazeSprite.x = WORLD_CAPTURE.x0;
depthHazeSprite.y = WORLD_CAPTURE.y0;
depthHazeSprite.width = WORLD_CAPTURE.w;
depthHazeSprite.height = WORLD_CAPTURE.h * DEPTH.reach;

// The world is rendered into this texture EVERY frame; its resolution comes
// from the quality setting.
let worldRT = RenderTexture.create({
  width: Math.ceil(WORLD_CAPTURE.w * captureScale),
  height: Math.ceil(WORLD_CAPTURE.h * captureScale),
  antialias: false, // MSAA on a per-frame full-scene RT is costly; the mesh
                    // resampling and the painterly look hide its absence
  resolution: _rtOverride ?? QUALITY[qualityLevel].rt,
});
// Split the world-texture filtering: NEAREST when magnified (the low-res centre
// the player looks at) so it stays crisp instead of mushy, but LINEAR when
// minified (the texture squeezed toward the limb) so the globe's edge keeps its
// soft, distorted "curving away" horizon rather than hard blocky tiles.
worldRT.source.style.magFilter = 'nearest';
worldRT.source.style.minFilter = 'linear';
worldRT.source.style.update();
world.scale.set(captureScale);
world.x = -WORLD_CAPTURE.x0 * captureScale;
world.y = -WORLD_CAPTURE.y0 * captureScale;
// Dense enough that the curved silhouette reads as a curve, not a polyline.
const worldPlane = new MeshPlane({ texture: worldRT, verticesX: 110, verticesY: 36 });

// When a viewport is wider than the projected map, erase the render texture's
// alpha at its side boundaries. The actual live sky then shows through at every
// height and time of day; sampling one horizon colour creates visible bars.
function makeWorldEdgeEraseTexture(direction: 'left' | 'right'): Texture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 2;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  if (direction === 'left') {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.94)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.94)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cv.width, cv.height);
  return Texture.from(cv);
}
const WORLD_EDGE_FEATHER = 180;
const worldTextureWidth = Math.ceil(WORLD_CAPTURE.w * captureScale);
const worldTextureHeight = Math.ceil(WORLD_CAPTURE.h * captureScale);
const worldEdgeEraser = new Container();
worldEdgeEraser.eventMode = 'none';
const worldEdgeEraseLeft = new Sprite(makeWorldEdgeEraseTexture('left'));
const worldEdgeEraseRight = new Sprite(makeWorldEdgeEraseTexture('right'));
for (const edge of [worldEdgeEraseLeft, worldEdgeEraseRight]) {
  edge.blendMode = 'erase';
  edge.width = WORLD_EDGE_FEATHER;
  edge.height = worldTextureHeight;
}
worldEdgeEraseLeft.position.set(0, 0);
worldEdgeEraseRight.position.set(worldTextureWidth - WORLD_EDGE_FEATHER, 0);
worldEdgeEraser.addChild(worldEdgeEraseLeft, worldEdgeEraseRight);
const worldNeedsEdgeErase = () => window.innerWidth > worldTextureWidth + 2;

app.stage.addChild(atmos.skyLayer);
// Stars turn behind the planet; the world plane occludes them below the limb.
app.stage.addChild(atmos.starLayer);
// Sun & moon ride in the sky behind the planet, so they rise and set behind it.
app.stage.addChild(atmos.celestialLayer);
// Clouds drift in the sky band above the planet (behind the world plane).
app.stage.addChild(atmos.skyCloudLayer);
// Comets and aurora share the night sky and set behind the planet.
app.stage.addChild(atmos.cometLayer);
app.stage.addChild(atmos.auroraLayer);
// The ring's far arc rides behind the globe, so the planet occludes it and it
// only shows where it climbs above the horizon into the sky.
app.stage.addChild(ringBackGfx);
app.stage.addChild(worldPlane);
// The limb mask clips the plane at the circular horizon; it must live in the
// tree. The band lays horizon haze along the arc, above the plane.
app.stage.addChild(atmos.limbMask);
app.stage.addChild(atmos.limbBand);
app.stage.addChild(atmos.glazeLayer);
// The era's airlight sits directly over its glaze: the pair is one atmosphere,
// pressing down and lifting back up together.
app.stage.addChild(atmos.airLayer);
// The rainbow arcs over the world, in front of the planet.
app.stage.addChild(atmos.rainbowLayer);
// The orbital ring encircles the world once a civ reaches the post era.
app.stage.addChild(ringGfx);
// Satellites cross the sky over the planet (screen-space, in front of the limb).
app.stage.addChild(satelliteGfx);
// Rockets & space elevators rise past the horizon (screen-space, unclipped).
app.stage.addChild(skyStructGfx);
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
// Where a world tile's base lands on screen over the curved globe — for sky
// structures (rockets, space elevators) drawn in screen space, unclipped by
// the limb. Shares the exact mesh-bend math via atmos.project.
function tileToSky(row: number, col: number): { x: number; y: number } {
  const { x, y } = gridToScreen(col, row);
  const t = toTex(x, y);
  return atmos.project(t.x, t.y);
}

(window as any).__layers = { world, cityMarkersContainer, labelLayer, biomeLayer, buildingLayer, simLayer };
(window as any).__anim = () => ({ tiles: animatingTiles.size, buildings: animatingBuildingTiles.size, biome: animatingBiomeTiles.size, easeFrames: +easeFrames.toFixed(2), ease15: +ease(0.15).toFixed(3) });
(window as any).__rt = () => ({ res: worldRT.source.resolution, w: worldRT.source.pixelWidth, h: worldRT.source.pixelHeight, bound: worldPlane.texture === worldRT, tickerFPS: Math.round(app.ticker.FPS) });
(window as any).__perf = { sky: atmos.skyLayer, plane: worldPlane, set skipRT(v: boolean) { (window as any).__skipRT = v; } };
// Live scrubbers for the visual-hierarchy pass — mutate a field, call the
// matching apply, judge by eye. `flat()` is the A/B: it turns the whole pass
// off (uniform building colour, no depth haze, dense ground texture) so the
// same world can be compared with and without it.
// (getters, not values: GROUND is declared further down the file, so reading it
// eagerly here would hit the temporal dead zone at module init.)
// Succession: where the ruins are, how far along the wood is, and a forced bake
// so a harness can age the world and look at the result immediately.
// The world's biography — temperament, arc, and the bent values as they stand
// right now. Nothing announces this in the UI; it's meant to be felt.
// Terrain probe: sample the world's elevation anywhere, inside the grid or far
// beyond it, to confirm the island / ocean-gap / outer-land geometry without
// squinting at screenshots.
(window as any).__terrain = {
  profile: () => activeTerrainProfile,
  rayFromCentre: (steps = 90) => {
    const t = makeTerrainSampler(currentSeed, GRID_SIZE, GRID_SIZE, activeTerrainProfile);
    const mid = (GRID_SIZE - 1) / 2;
    const out: Array<{ col: number; d: number; land: boolean }> = [];
    for (let i = 0; i <= steps; i++) {
      const col = mid + i * 1.6;                     // walk east from the centre
      out.push({ col: Math.round(col), d: +((col - mid) / mid).toFixed(2),
                 land: t.elevationAt(mid, col) >= SEA_LEVEL });
    }
    return out;
  },
};
(window as any).__world = {
  character: () => simWorld.character,
  now: () => characterOf(simWorld),
  age: () => +((simWorld.tick % SIM.worldCycleTicks) / SIM.worldCycleTicks).toFixed(3),
};
(window as any).__succ = {
  at: (row: number, col: number) => tileToSky(row, col),
  bake: () => { decaySoilMarks(); drawSuccession(true); },
  stats: () => {
    let abandoned = 0, scrub = 0, wood = 0, ghosts = roadGhosts.length;
    for (let i = 0; i < abandonTick.length; i++) {
      if (abandonTick[i] < 0) continue;
      abandoned++;
      const t = successionStage(i);
      if (t >= SUCCESSION.matureFrom) wood++;
      else if (t >= SUCCESSION.scrubFrom) scrub++;
    }
    return { abandoned, scrub, wood, ghosts };
  },
};
(window as any).__hier = {
  get HIERARCHY() { return HIERARCHY; },
  get DEPTH() { return DEPTH; },
  get GROUND() { return GROUND; },
  buildings: () => rebuildBuildingSprites(),   // re-tint every building in place
  ground: () => drawBiomes(),                  // re-bake terrain texture (slow, ~1s)
  haze: () => {
    depthHazeSprite.texture = makeDepthHazeTexture();
    depthHazeSprite.height = WORLD_CAPTURE.h * DEPTH.reach;
  },
  get SUCCESSION() { return SUCCESSION; },
  // Aftermath quiet zones — same deal: getters, because QUIET is declared
  // further down. zones() reports each wound's screen position so a shot can be
  // cropped onto it.
  get QUIET() { return QUIET; },
  zones: () => quietZones.map((z) => ({ row: z.row, col: z.col, radius: z.radius, ...tileToSky(z.row, z.col) })),
  redrawQuiet: () => drawQuietZones(),
  // Ice ages: scrub the extent directly to inspect any point of the glacial
  // without waiting minutes for the world to reach it.
  get ICE() { return ICE; },
  ice: (extent: number) => {
    simWorld.iceExtent = Math.max(0, Math.min(1, extent));
    simWorld.iceMax = Math.max(simWorld.iceMax, simWorld.iceExtent);
    drawIce(true);
    rebuildBuildingSprites();
  },
  iceState: () => ({ extent: +simWorld.iceExtent.toFixed(3), max: +simWorld.iceMax.toFixed(3), memory: +iceMemoryFade().toFixed(3) }),
  flat: () => {
    HIERARCHY.quietSat = 1; HIERARCHY.quietBlend = 0; HIERARCHY.capitalBoost = 0;
    DEPTH.strength = 0; GROUND.bareBelow = 0; GROUND.bladeAlpha = 0.3; GROUND.grainAlpha = 0.32;
    rebuildBuildingSprites(); drawBiomes();
  },
};
(window as any).__fx = { smogGfx, farmGfx, buildingLayer, sky: atmos.skyLayer, fog: atmos.fogLayer };
(window as any).__life = () => ({ herds: herds.length, power: powerLines.length, cables: cables.length, caravans: caravans.length, boats: boats.length });

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
  // Camera breathing scales the whole stage around the screen center.
  app.stage.pivot.set(window.innerWidth / 2, window.innerHeight / 2);
  app.stage.position.set(window.innerWidth / 2, window.innerHeight / 2);
  // The circular horizon passes through the diamond apex's screen position.
  atmos.layoutLimb({
    width: window.innerWidth,
    height: window.innerHeight,
    apexX: window.innerWidth / 2,
    apexY: window.innerHeight * ATMOS.composition.horizonFrac - 8 * captureScale,
  });
}
centerWorld();
// The first curvature pass runs mid-init, before the mesh geometry has settled,
// so the baked perspective doesn't take full effect. Re-apply a few times over
// the first second (timing varies by browser) so the bend reliably sticks.
const reapplyCurve = () => atmos.setPerspective(atmos.perspective());
requestAnimationFrame(reapplyCurve);
setTimeout(reapplyCurve, 300);
setTimeout(reapplyCurve, 1200);

// --- Atmosphere: the world's tell ---
// catastrophePressure is surfaced as a slow ambient darkening: a multiply
// tint plus a vignette, both hued by the kind of doom that is brewing. The
// viewer should half-notice the light going wrong before the first omen line.
const DREAD = {
  // Ground multiply is gentler now that the sky carries the brewing color
  // (ATMOS.dreadSkyBlend) and the wind/cloud-shadows rise with dread too.
  // The ground multiply is gentler still now that dread also has a LIFT. On
  // its own a 0.55 multiply over the whole frame crushed the world's colour
  // separation: at full dread the sea stopped reading as water and land and
  // ocean converged on one sepia. Dread should feel oppressive, not illegible.
  tintMaxAlpha:     0.40,
  vignetteMaxAlpha: 0.80,
  // Scattered light in the wrong-coloured air: lifts the darks toward the
  // brewing hue so the world keeps its separation while the light goes wrong.
  liftMaxAlpha:     0.20,
  easeIn:           0.006,   // per-frame fraction — dread creeps in
  easeOut:          0.0015,  // and drains away slower than it broke
  sevFloor:         0.22,    // dread ceiling for a near-zero-severity fizzle
  hues: {
    plague:     { tint: 0x97a37f, vignette: 0x252b18 },  // sickly pallor
    asteroid:   { tint: 0xb98e66, vignette: 0x2e1d0c },  // wrong-colored dusk
    flood:      { tint: 0x7e94ad, vignette: 0x131f2b },  // cold and silver
    earthquake: { tint: 0x9f8f78, vignette: 0x261e14 },  // dust in the air
    volcano:    { tint: 0x9c7a68, vignette: 0x2c120a },  // ash and ember
  } as Record<CatastropheType, { tint: number; vignette: number }>,
};

// Pollution: smog that pools over the cities as the world nears its end, with
// a faint global haze behind it. Thickens with the age (industrial+ choke
// hardest) and clears when the world is remade.
const POLLUTION = {
  smogColor:  0x6a5c3e, // brown smog blobs over cities
  hazeColor:  0x8a724a, // faint global tint behind them
  hazeMaxAlpha: 0.18,   // the global haze is subtle; the city smog carries it
  smogRadius: 42,       // base smog radius at full pollution, world px
  smogAlpha:  1.0,      // peak per-city smog opacity
  startFrac:  0.45,     // fraction of the world cycle before it begins
  eraFloor:   0.3,      // pollution multiplier even in clean (pre-industrial) ages
  narrateAt:  0.3,      // pollution level that earns one narrated line per cycle
};
let pollutionNarrated = false;
let curPollution = 0;
// The dying-world blight: in the final stretch before the cataclysm the colour
// drains out of the land toward a sickly grey, so the whole globe visibly winds
// down before it breaks. Applied to biomeLayer.tint in the ticker (the scenery
// to the horizon follows it), layered over the deepening smog.
let curBlight = 0;
let blightNarrated = false;
const BLIGHT = {
  startFrac: 0.80, // begins draining at 80% through the world's life
  endFrac: 0.97,   // fully drained just before the cataclysm
  color: 0x8a877d, // desaturated grey-tan the land bleeds toward
  maxDrain: 0.74,  // how far toward grey at full blight (0..1)
  narrateAt: 0.35,
};

function updatePollution() {
  // How far through the world's life, and how industrial it has become.
  const cycleFrac = simWorld.tick / Math.max(1, currentWorldFate.endTick);

  // Blight ramp — eased, gated on some industry so a pristine pre-industrial
  // world doesn't grey out (it withers hardest where it was most developed).
  const braw = Math.max(0, Math.min(1, (cycleFrac - BLIGHT.startFrac) / (BLIGHT.endFrac - BLIGHT.startFrac)));
  const beased = braw * braw * (3 - 2 * braw);
  const blightTarget = beased * (0.45 + 0.55 * Math.max(0, Math.min(1, curPollution * 1.4)));
  curBlight += (blightTarget - curBlight) * 0.04;
  if (!blightNarrated && curBlight > BLIGHT.narrateAt) {
    blightNarrated = true;
    pushNarration(pick([
      'The colour goes out of the land. The green greys, and does not come back.',
      'A pallor spreads across the world. The fields forget how to be green.',
    ]), { priority: 'high' });
  }
  if (cycleFrac < 0.1) blightNarrated = false; // re-arm for the next world
  if ((window as any).__forceBlight != null) curBlight = (window as any).__forceBlight;
  let bestRank = 0, bestCount = -1;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') continue;
    const n = civStats.tileCounts.get(civ.id) || 0;
    if (n > bestCount) { bestCount = n; bestRank = ERA_RANK[civ.era]; }
  }
  const industrialness = Math.max(0, Math.min(1, (bestRank - 2) / 3)); // industrial+ choke
  const ramp = Math.max(0, (cycleFrac - POLLUTION.startFrac) / (1 - POLLUTION.startFrac));
  const target = ramp * ramp * (POLLUTION.eraFloor + (1 - POLLUTION.eraFloor) * industrialness);
  curPollution += (target - curPollution) * 0.04; // ease so the cataclysm reset clears smoothly

  // Faint global haze.
  pollutionGfx.tint = POLLUTION.hazeColor;
  pollutionGfx.alpha = curPollution * POLLUTION.hazeMaxAlpha;
  pollutionGfx.visible = pollutionGfx.alpha > 0.004;

  // (The per-city smog blobs were removed — they read as hard brown circles.
  // The faint global haze above carries the late-cycle pollution instead.)

  if (!pollutionNarrated && curPollution > POLLUTION.narrateAt) {
    pollutionNarrated = true;
    pushNarration(pick([
      'Smog gathers over the cities and will not lift.',
      'The air above the great cities turns brown and stays that way.',
    ]), { priority: 'normal' });
  }
  if (cycleFrac < 0.1) pollutionNarrated = false; // re-arm for the next world
}

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
dreadTint.visible = false;
// The lift pairs with dreadTint the way airlight pairs with the glaze: the
// multiply presses down, this raises the low end. Under the vignette, so the
// edges still close in.
const dreadLift = new Graphics();
dreadLift.blendMode = 'screen';
dreadLift.alpha = 0;
dreadLift.visible = false;
const dreadVignette = new Sprite(makeVignetteTexture());
dreadVignette.alpha = 0;
dreadVignette.visible = false;
const omenStarGfx = new Graphics();
const impactFlash = new Graphics();
impactFlash.alpha = 0;
impactFlash.visible = false;
// World-turnover blackout: the screen falls to black at the cataclysm, holds a
// beat, then the new world rises out of the dark.
const blackoutGfx = new Graphics();
blackoutGfx.alpha = 0;
blackoutGfx.visible = false;
blackoutGfx.eventMode = 'none';
// Pollution: a brown smog that thickens as the world ages toward the
// cataclysm (worse in industrial+ eras), then clears when the world is
// remade. Fullscreen multiply — hidden until the late cycle, so no cost
// during the clean early ages.
const pollutionGfx = new Graphics();
pollutionGfx.blendMode = 'multiply';
pollutionGfx.alpha = 0;
pollutionGfx.visible = false;
// Epicenter rings live in world space so the viewer sees *where* it landed.
const epicenterGfx = new Graphics();
world.addChild(epicenterGfx);
app.stage.addChild(pollutionGfx);
app.stage.addChild(dreadTint);
app.stage.addChild(dreadLift);
app.stage.addChild(dreadVignette);
app.stage.addChild(omenStarGfx);
app.stage.addChild(impactFlash);
app.stage.addChild(blackoutGfx); // top-most: nothing renders over the turnover black

function layoutAtmosphere() {
  dreadTint.clear();
  dreadTint.rect(0, 0, window.innerWidth, window.innerHeight).fill(0xffffff);
  dreadLift.clear();
  dreadLift.rect(0, 0, window.innerWidth, window.innerHeight).fill(0xffffff);
  dreadVignette.width = window.innerWidth;
  dreadVignette.height = window.innerHeight;
  impactFlash.clear();
  impactFlash.rect(0, 0, window.innerWidth, window.innerHeight).fill(0xffffff);
  blackoutGfx.clear();
  blackoutGfx.rect(0, 0, window.innerWidth, window.innerHeight).fill(0x000000);
  pollutionGfx.clear();
  pollutionGfx.rect(0, 0, window.innerWidth, window.innerHeight).fill(0xffffff);
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

// A gentle ring where a narrated event happened — the log line's location,
// findable on the map.
function triggerPing(row: number, col: number, color: number) {
  const { x, y } = gridToScreen(col, row);
  epicenterRings.push({ x, y, r: 3, maxR: 52, alpha: 0.5, color });
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
    case 'volcano':
      activeFlash = { color: 0xff7a42, alpha: 0.7 * s, decayPerSec: 1.1 };
      shakeAmp = 9 * s; shakeDecayPerSec = 4;
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

  // These are fullscreen quads. Pixi pays full fill for an alpha-0 quad, so
  // hide them outright when negligible (the calm majority of the time) — a
  // real fill saving every frame there's no catastrophe brewing.
  dreadTint.tint = curHue.tint;
  dreadTint.alpha = curDread * DREAD.tintMaxAlpha;
  dreadTint.visible = dreadTint.alpha > 0.004;
  // Lifted toward white from the same hue, so the air glows with the doom's
  // colour rather than only shading the world with it.
  dreadLift.tint = lerpColor(curHue.tint, 0xffffff, 0.5);
  dreadLift.alpha = curDread * DREAD.liftMaxAlpha;
  dreadLift.visible = dreadLift.alpha > 0.004;
  dreadVignette.tint = curHue.vignette;
  dreadVignette.alpha = curDread * DREAD.vignetteMaxAlpha;
  dreadVignette.visible = dreadVignette.alpha > 0.004;

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

  // Impact flash decays exponentially. Fullscreen — hidden unless flashing.
  if (activeFlash) {
    activeFlash.alpha -= activeFlash.alpha * activeFlash.decayPerSec * dt * 3;
    impactFlash.tint = activeFlash.color;
    impactFlash.alpha = activeFlash.alpha;
    impactFlash.visible = true;
    if (activeFlash.alpha < 0.01) { activeFlash = null; impactFlash.alpha = 0; impactFlash.visible = false; }
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

const WORLD_NAME_ADJECTIVES = [
  'Amber', 'Ashen', 'Blue', 'Broken', 'Distant', 'Golden', 'Green', 'Hidden',
  'Long', 'Painted', 'Quiet', 'Red', 'Silver', 'Sleeping', 'Verdant', 'Wandering',
];
const WORLD_NAME_NOUNS = [
  'Basin', 'Coast', 'Crown', 'Expanse', 'March', 'Reach', 'Sea', 'Shore',
  'Vale', 'Waste', 'Wilds', 'World',
];
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function worldNameForSeed(seed: string): string {
  const hash = hashSeed(seed);
  const adjective = WORLD_NAME_ADJECTIVES[hash % WORLD_NAME_ADJECTIVES.length];
  const noun = WORLD_NAME_NOUNS[Math.floor(hash / WORLD_NAME_ADJECTIVES.length) % WORLD_NAME_NOUNS.length];
  return `The ${adjective} ${noun}`;
}

type WorldEnding = WorldEndingKind | 'left_behind';
interface ArchivedWorld {
  seed: string;
  name: string;
  endedAt: number;
  ending: WorldEnding;
  // Which sequence actually ran. `ending` is only the title, and two causes can
  // share one — an impact and a supervolcano both leave a world of ash.
  apocalypse?: ApocalypseKind;
  ticksLived: number;
  civilizations: number;
  survivingCivilizations: number;
  cities: number;
  peakEra: Era;
  epitaph: string;
}
const WORLD_ARCHIVE_KEY = 'theLand:worldArchive';
const WORLD_ARCHIVE_LIMIT = 10;
function loadWorldArchive(): ArchivedWorld[] {
  try {
    const value = JSON.parse(localStorage.getItem(WORLD_ARCHIVE_KEY) ?? '[]');
    return Array.isArray(value) ? value.slice(0, WORLD_ARCHIVE_LIMIT) : [];
  } catch {
    return [];
  }
}
function saveWorldArchive() {
  localStorage.setItem(WORLD_ARCHIVE_KEY, JSON.stringify(worldArchive));
}
function saveSeed(seed: string) {
  localStorage.setItem('theLand:seed', seed);
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState({}, '', url);
}

let currentSeed = getInitialSeed();
let currentWorldName = worldNameForSeed(currentSeed);
let worldStartedAt = Date.now();
let worldArchive = loadWorldArchive();
saveSeed(currentSeed);

// --- World state ---

// Generate a world's terrain from its form, guaranteeing it is habitable. An
// extreme form can drown the map or lift it clear of the sea, and a world with
// no land is seventeen minutes of nothing happening — so the land fraction is
// measured and the whole world nudged up or down until it is somewhere a
// civilisation could actually start. Deterministic: same seed, same correction.
const LAND_TARGET = { min: 0.20, max: 0.70, step: 0.02, tries: 12 };
function generateWorldTerrain(seed: string) {
  const character = rollCharacter(seed);
  const profile = { ...character.terrain };
  let result = generateBiomeMap(GRID_SIZE, GRID_SIZE, seed, profile);
  for (let i = 0; i < LAND_TARGET.tries; i++) {
    const land = landFraction(result.biomes);
    if (land >= LAND_TARGET.min && land <= LAND_TARGET.max) break;
    profile.elevationOffset += land < LAND_TARGET.min ? LAND_TARGET.step : -LAND_TARGET.step;
    result = generateBiomeMap(GRID_SIZE, GRID_SIZE, seed, profile);
  }
  // The scenery beyond the grid is drawn from this same corrected profile, so
  // the played area is not a different planet from the one around it.
  activeTerrainProfile = profile;
  return result;
}
let activeTerrainProfile: TerrainProfile = DEFAULT_TERRAIN;

let { biomes: biomeMap, elevation: elevationMap } = generateWorldTerrain(currentSeed);
let simWorld: SimWorld = createSimWorld(GRID_SIZE, GRID_SIZE, currentSeed);
let currentWorldFate: WorldFate = worldFateForSeed(currentSeed, SIM.worldCycleTicks);

// --- The ending, as a staged sequence rather than a swap ---
// A world used to be replaced at endTick with 2.5s of black. It now spends its
// last ~102 world-seconds ending. Durations are world-seconds, so pause and the
// speed control move them like everything else in the world.
const ENDING_ACTS = { omen: 40, onset: 12, unmaking: 35, silence: 15 };
const ENDING_SEQUENCE_TICKS = Math.round(
  (ENDING_ACTS.omen + ENDING_ACTS.onset + ENDING_ACTS.unmaking + ENDING_ACTS.silence) * ticksPerSecond,
);
// Slack so the commit is never racing act 1's first frame.
const ENDING_COMMIT_MARGIN_TICKS = 300;

// Act boundaries are derived from endTick, not from a fraction of the world's
// life: lifeFraction bottoms out at 0.58, so the shortest world is 17,400 ticks
// and a fixed fraction would leave it less time than the sequence needs.
function endingActTicks(endTick: number) {
  const omen = endTick - ENDING_SEQUENCE_TICKS;
  const onset = omen + ENDING_ACTS.omen * ticksPerSecond;
  const unmaking = onset + ENDING_ACTS.onset * ticksPerSecond;
  const silence = unmaking + ENDING_ACTS.unmaking * ticksPerSecond;
  return { omen, onset, unmaking, silence, commit: omen - ENDING_COMMIT_MARGIN_TICKS };
}

let committedEnding: { apocalypse: ApocalypseKind; ending: WorldEndingKind } | null = null;
let endingOmenSpoken = false;

// One line as the world realises. Deliberately quiet — the omen is the world
// getting stranger, not a warning siren.
const ENDING_OMENS: Record<WorldEndingKind, string> = {
  drowned: 'The tide comes further inland than the oldest maps allow.',
  long_winter: 'The frost does not lift at noon any more.',
  ash: 'There is a taste of iron on the wind. The birds left a week ago.',
  rewilded: 'The roads are quieter every year. The grass is patient.',
  world_empire: 'One banner is answered everywhere now. No one remembers the others.',
  exodus: 'The cities have begun to look upward, and to build for leaving.',
  garden: 'Nothing is being built that was not asked for.',
};

// The quiet end is *scheduled*, not merely unforced: ordinary decline takes
// ~50 world-seconds and may not even have begun, so left alone the silence
// would open with the lights still on. Smallest civs go first, spread across
// the unmaking, and the last one falls before the silence. Deterministic —
// ordered by tile count then id, no RNG, so a seed still replays.
function buildFadeSchedule(endTick: number): Map<number, number> {
  const acts = endingActTicks(endTick);
  const counts = new Map<number, number>();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const id = simWorld.tiles[row][col].civId;
      if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const living = [...simWorld.civs.values()]
    .filter((c) => c.phase !== 'dead')
    .sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || a.id - b.id);

  const schedule = new Map<number, number>();
  const span = acts.silence - acts.unmaking;
  living.forEach((civ, i) => {
    schedule.set(civ.id, acts.unmaking + Math.round(((i + 1) / (living.length + 1)) * span));
  });
  return schedule;
}

// Debug only: force the title the next commitment will use, so the staged acts
// can be exercised without hunting for a seed that produces them.
let forcedEndingKind: WorldEndingKind | null = null;
(window as any).__forceEnding = (kind: WorldEndingKind | null) => { forcedEndingKind = kind; };

function commitEnding() {
  committedEnding = commitEndingKind(simWorld, biomeMap, currentWorldHistory, currentWorldFate);
  if (forcedEndingKind) {
    committedEnding = { ...committedEnding, ending: forcedEndingKind };
    forcedEndingKind = null;   // one-shot: it forces the NEXT commitment, not every one
  }
  // Phase 1 stages act 3 for `rewilded` only. `garden`, `exodus` and
  // `world_empire` get the omen and the held silence but keep today's act 3,
  // because each needs a different gesture and none of them is a death.
  const fade = committedEnding.ending === 'rewilded'
    ? buildFadeSchedule(currentWorldFate.endTick)
    : new Map<number, number>();
  beginEnding(simWorld, fade);
}

// The commit, the omen and the turnover. Called after every step() — from the
// ticker loop and from the skip fast-forward alike. A 5,000-tick skip that
// crossed these boundaries would otherwise run births and catastrophes straight
// through the ending window, then commit at or past endTick and replace an
// over-age world, skipping the whole staged sequence.
// Returns true if the world turned over, in which case simWorld is a new one
// and the caller must stop stepping the old.
function endingCheckpoints(): boolean {
  const acts = endingActTicks(currentWorldFate.endTick);
  if (!committedEnding && simWorld.tick >= acts.commit) commitEnding();
  if (committedEnding && !endingOmenSpoken && simWorld.tick >= acts.omen) {
    endingOmenSpoken = true;
    pushNarration(ENDING_OMENS[committedEnding.ending], { priority: 'high' });
  }
  // Act 4 applies to every ending, not only the ones with a staged act 3.
  if (committedEnding && simWorld.tick >= acts.silence) beginSilence(simWorld);
  if (simWorld.tick >= currentWorldFate.endTick) {
    beginWorldEnding();
    return true;
  }
  return false;
}

// Instrument for the ending sequence: what was committed, when each act opens,
// and whether the sim is holding births and catastrophes. Everything is in
// ticks so it can be compared against simWorld.tick directly.
(window as any).__ending = () => {
  const acts = endingActTicks(currentWorldFate.endTick);
  return {
    tick: simWorld.tick,
    endTick: currentWorldFate.endTick,
    acts,
    committed: committedEnding,
    omenSpoken: endingOmenSpoken,
    simEnding: simWorld.ending
      ? { startedTick: simWorld.ending.startedTick, scheduled: simWorld.ending.fade.size }
      : null,
    livingCivs: [...simWorld.civs.values()].filter((c) => c.phase !== 'dead').length,
    pendingSettlements: simWorld.pendingSettlements.length,
  };
};
let currentWorldHistory: WorldHistory = createWorldHistory(biomeMap);
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
  ruined:      boolean[];      // per-slot: abandoned (density dropped) or dead-civ
  curRuinMult: number[];       // per-slot opacity multiplier (1.0 active; only drops in the final reclaim phase)
  ruinAge:     number[];       // per-slot decay progress 0→1: grey → collapse → land reclaims
  ruinColor0:  number[];       // the slot's colour at the moment it ruined (desaturates from here)
  ruinStartAt: number;         // wall-clock sec to begin decaying (staggers mass die-offs); 0 = at once
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
let timeScale = 1;
// Seconds of WORLD time since load: real elapsed time, capped against stalls,
// multiplied by the speed control, and frozen while paused. Everything with a
// lifetime — battles, quiet zones, ruin decay, wonders — is timestamped
// against this rather than performance.now(), so the speed control moves the
// whole world and a paused world is genuinely still.
let worldClock = 0;
// Every ease in this file was tuned as a per-FRAME fraction at 60fps, which
// means they converge in a fixed number of frames rather than in a fixed
// amount of time: at 3fps a tile crossfade tuned for one second took twenty.
// This converts a 60fps-tuned rate to the equivalent for the frame actually
// rendered, so transitions settle in the same WALL-CLOCK time on any machine —
// and, because easeFrames comes off the world clock, 4x settles them 4x sooner
// too. At 60fps easeFrames is 1 and ease(r) returns r exactly, so nothing
// changes on a machine that was already keeping up.
let easeFrames = 1;
function ease(rate: number): number {
  return easeFrames === 1 ? rate : 1 - Math.pow(1 - rate, easeFrames);
}

const fadedDeadCivs = new Set<number>();

// Ocean apron: the sea continues past the diamond in every direction, so the
// world has no diamond boundary — the circular horizon (limb mask) is the
// only edge the viewer ever sees. Same fill and grid treatment as water
// tiles; first child of biomeLayer so it takes the seasonal tint.
function drawOceanApron(): Graphics {
  // Deep-sea backstop under the scenery tiles (covers any sub-tile slivers
  // at the capture margins). The scenery tiles carry the texture and grid.
  const g = new Graphics();
  const { x0, y0, w, h } = WORLD_CAPTURE;
  g.rect(x0, y0, w, h).fill(OCEAN.deepColor);
  return g;
}

let oceanApron: Graphics | null = null;

// Water mask for the glitter layer: a Graphics (stencil mask — the same
// mechanism the limb mask uses) covering the ocean apron's visible corners
// plus every water tile diamond, slightly inflated so coastal seams still
// glint. Rebuilt on reroll and flood/quake terrain changes.
const waterMaskG = new Graphics();
world.addChildAt(waterMaskG, world.getChildIndex(atmos.glitterLayer));
atmos.setWaterMask(waterMaskG);
// Land mask (inverse): restricts the wind shimmer to terrain.
const landMaskG = new Graphics();
world.addChildAt(landMaskG, world.getChildIndex(atmos.shimmerLayer));
atmos.setLandMask(landMaskG);

function rebuildWaterMask() {
  const g = waterMaskG;
  g.clear();
  // The apron outside the diamond: four corner polygons up to the diamond edges.
  const { x0, y0, w, h } = WORLD_CAPTURE;
  const T = { x: 0, y: -8 }, R = { x: 1536, y: 760 }, B = { x: 0, y: 1528 }, L = { x: -1536, y: 760 };
  g.poly([x0, y0, T.x, y0, T.x, T.y, L.x, L.y, x0, L.y]).fill(0xffffff);
  g.poly([T.x, y0, x0 + w, y0, x0 + w, R.y, R.x, R.y, T.x, T.y]).fill(0xffffff);
  g.poly([x0 + w, R.y, x0 + w, y0 + h, B.x, y0 + h, B.x, B.y, R.x, R.y]).fill(0xffffff);
  g.poly([B.x, y0 + h, x0, y0 + h, x0, L.y, L.x, L.y, B.x, B.y]).fill(0xffffff);
  // Crater-lake water tiles count as water for the glitter (and not as land for
  // the shimmer), so the sun-band glints on the caldera like the open sea.
  const lakeWater = new Set<number>();
  for (const wn of naturalWonders) {
    if (wn.kind !== 'crater_lake') continue;
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
      const rr = wn.row + dr, cc = wn.col + dc;
      if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) continue;
      // Round (screen-space) metric, matching the lake-water footprint.
      if (Math.hypot(dc - dr, (dc + dr) * 0.5) <= 2.55) lakeWater.add(rr * GRID_SIZE + cc);
    }
  }
  // Water tile diamonds, inflated a touch; land diamonds go to the land mask.
  landMaskG.clear();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const water = biomeMap[row][col] === 'water' || lakeWater.has(row * GRID_SIZE + col);
      const target = water ? g : landMaskG;
      const { x, y } = gridToScreen(col, row);
      target.poly([x, y - 9, x + 17, y, x, y + 9, x - 17, y]).fill(0xffffff);
    }
  }
}

// Ocean depth: water tiles pale toward the shore (small depth below sea
// level) and deepen to the base blue offshore — one mechanism gives both
// shallows rims and open-water variation, from elevation data that already
// exists. The apron stays the deep base color, which the depth curve
// converges to far from land.
const OCEAN = {
  shallowColor: 0xbfdfd6,  // pale aqua at the waterline
  deepColor:    0x76a6cf,  // open-ocean dark; the apron is painted this
  depthRange:   0.30,      // how far below sea level reaches full deep color
  midPoint:     0.45,      // where the ramp crosses the base water color
  shallowCurve: 0.6,       // <1 = shallows hug the coast tighter
  mottle:       0.05,      // ±lightness jitter per tile so deep water is never
                           // perfectly flat — without it, the uniformly-deep
                           // band where the sim's edge-falloff ring meets the
                           // scenery moat reads as a hard diamond outline
};

// Deterministic per-tile lightness jitter, so a region of identical depth
// (the deep boundary band) is textured like the rest of the ocean instead of
// a flat slab. Baked into the cached tiles — no per-frame cost.
function waterMottle(color: number, r: number, c: number): number {
  let h = (Math.imul(r + 13, 2654435761) ^ Math.imul(c + 7, 1597334677)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  const j = ((h & 0xffff) / 0xffff - 0.5) * OCEAN.mottle;
  const [hh, s, l] = rgbToHsl(color);
  return hslToRgb(hh, s, Math.max(0, Math.min(1, l + j)));
}

function waterColorFromElev(elev: number, r = 0, c = 0): number {
  const t = Math.pow(
    Math.max(0, Math.min(1, (SEA_LEVEL - elev) / OCEAN.depthRange)),
    OCEAN.shallowCurve,
  );
  const base = t <= OCEAN.midPoint
    ? lerpColor(OCEAN.shallowColor, BIOME_COLORS.water, t / OCEAN.midPoint)
    : lerpColor(BIOME_COLORS.water, OCEAN.deepColor, (t - OCEAN.midPoint) / (1 - OCEAN.midPoint));
  return waterMottle(base, r, c);
}

function waterColorAt(row: number, col: number): number {
  return waterColorFromElev(elevationMap[row][col], row, col);
}

// Scenery terrain: the world continues past the sim grid to the horizon.
// Same noise, same depth colors, same tile strokes — but the sim never sees
// it. A sea moat (SCENERY.moatTiles, blending out from the grid's own edge
// falloff) separates the known world from the distant continents, so
// civilizations always end at real coastline rather than an invisible wall.
// (The scenery moat is gone: beyond-grid terrain is now the same elevation
// function as the grid, so there is no gap to bridge — see drawScenery.)
const SCENERY_TEXTURE = {
  density: 1.0,     // multiplier on tree count out here vs. on the grid
  fadeTiles: 46,    // texture thins to nothing this far beyond the grid
};

// The beyond-the-grid tiles, kept so the ice cap can reach the whole visible
// globe. Without this the sheet stops at the sim diamond and its two straight
// edges show as a hard chevron — the ice has to cover the scenery too.
let sceneryTiles: Array<{ r: number; c: number; x: number; y: number; water: boolean }> = [];
function drawScenery() {
  sceneryWaterGfx.clear();
  sceneryLandGfx.clear();
  sceneryTiles = [];
  // Same seed, same profile, same falloff as the grid itself — the scenery is a
  // continuation of the world rather than a different one drawn around it.
  const sampler = makeTerrainSampler(currentSeed, GRID_SIZE, GRID_SIZE, activeTerrainProfile);
  const { x0, y0, w, h } = WORLD_CAPTURE;
  for (let r = -60; r <= 155; r++) {
    for (let c = -60; c <= 155; c++) {
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) continue; // real tiles cover this
      const { x, y } = gridToScreen(c, r);
      if (x < x0 - 16 || x > x0 + w + 16 || y < y0 - 8 || y > y0 + h + 8) continue;
      // No moat and no blend: the sampler already carries the world's own
      // falloff, evaluated past the grid's edge. A continental world therefore
      // runs its land off the frame instead of ending in a giveaway ring of
      // ocean around the simulated square.
      const dOut = Math.max(-r, r - (GRID_SIZE - 1), -c, c - (GRID_SIZE - 1), 0);
      const elev = sampler.elevationAt(r, c);
      const biome = classify(elev, sampler.moistureAt(r, c));
      const water = biome === 'water';
      const color = water ? waterColorFromElev(elev, r, c) : BIOME_COLORS[biome];
      const target = water ? sceneryWaterGfx : sceneryLandGfx;
      sceneryTiles.push({ r, c, x, y, water });
      target.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y])
        .fill(color)
        .stroke({ color: 0x000000, alpha: 0.08, width: 1 });
      // Give the outside world the same grain as the inside. Without this the
      // grid reads as a textured square sitting in flat colour — which on a
      // continental world, where land fills the frame, is the one remaining
      // giveaway that only the middle is alive. Sparser than the real thing and
      // thinning with distance, because this is background and it all bakes
      // into one cached texture.
      if (!water && (biome === 'forest' || biome === 'grass' || biome === 'fertile')) {
        const fade = Math.max(0, 1 - dOut / SCENERY_TEXTURE.fadeTiles);
        const n = Math.round((biome === 'forest' ? 3 : 1) * SCENERY_TEXTURE.density * fade);
        for (let i = 0; i < n; i++) {
          const ox = x + (tileRand(r, c, i * 7 + 61) - 0.5) * 20;
          const oy = y + (tileRand(r, c, i * 7 + 62) - 0.5) * 8;
          drawTree(target, ox, oy, 0.55 + tileRand(r, c, i * 7 + 63) * 0.3, tileRand(r, c, i * 7 + 64) < 0.5);
        }
      }
    }
  }
  // Static once drawn — collapse the ~20k polys to one cached quad.
  sceneryLandGfx.cacheAsTexture?.(false);
  sceneryLandGfx.cacheAsTexture?.(true);
}

// Rivers: polylines from the hills to the sea, tapering downstream, tinted
// each frame toward the celestial light so they catch dawn and dusk.
// River courses kept for the craft that ply them and the bridges that cross
// them: the meandered screen polyline plus the grid tiles the river runs through.
let riverPaths: Array<{ screen: Array<{ x: number; y: number }>; tiles: Array<{ row: number; col: number }> }> = [];
const riverTileSet = new Set<number>();
function drawRivers() {
  riverGfx.clear();
  riverPaths = [];
  riverTileSet.clear();
  const rivers = generateRivers(elevationMap, biomeMap, currentSeed);
  for (const path of rivers) {
    const pts = path.map(p => gridToScreen(p.col, p.row));
    if (pts.length < 2) continue;
    for (const p of path) riverTileSet.add(p.row * GRID_SIZE + p.col);
    // Wiggle each point sideways (perpendicular to the local flow) with a
    // couple of overlaid waves, so dead-straight grid channels meander like
    // real rivers instead of ruler-straight lines. Amplitude grows downstream.
    const m = pts.map((p, i) => {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const t = i / pts.length;
      const amp = 2.2 + 4.2 * t;
      const off = (Math.sin(i * 0.5) * 0.62 + Math.sin(i * 0.21 + 1.3) * 0.42) * amp;
      return { x: p.x - dy * off, y: p.y + dx * off };
    });
    for (let i = 1; i < m.length; i++) {
      const t = i / m.length;
      // Fade the last few segments into the sea so the mouth dissolves into the
      // ocean rather than ending on an off-colour stub.
      const mouth = Math.min(1, (m.length - i) / 3.5);
      const a = m[i - 1], b = m[i];
      riverGfx.moveTo(a.x, a.y).lineTo(b.x, b.y)
        .stroke({ color: 0x6fa8c8, alpha: (0.55 + 0.3 * t) * mouth, width: 1.0 + 2.4 * t, cap: 'round', join: 'round' });
    }
    riverPaths.push({ screen: m, tiles: path });
  }
}

// Deterministic per-tile pseudo-random in [0,1) — stable scatter for terrain
// decoration, so trees/grains don't shimmer between cache rebuilds.
function tileRand(row: number, col: number, salt: number): number {
  let h = (Math.imul(row, 73856093) ^ Math.imul(col, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// How deep inside a patch of its own biome a tile sits: ~0 at the edge, →1 in
// the interior. A distance-weighted neighbourhood count (nearer neighbours
// count more), so patches read thick in the middle and sparse/low at the rim —
// forests thinning to scrub, mountains tapering to foothills. One-time at gen.
function patchCoreness(row: number, col: number, biome: Biome): number {
  let same = 0, total = 0;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const w = 3 - Math.max(Math.abs(dr), Math.abs(dc)); // 3 at centre … 1 at radius 2
      total += w;
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      if (biomeMap[r][c] === biome) same += w;
    }
  }
  return same / total;
}

// --- Ecological succession --------------------------------------------------
// The thesis of the whole piece, stated mechanically: civilisation arrives
// quickly and the land absorbs it slowly. A city falls in seconds; the ground
// it stood on takes minutes to stop being a city — scrub crosses the roads,
// saplings gather in the foundations, and eventually only altered soil and the
// ghost of a road are left for somebody else to find.
//
// Rendered as a cached world-space layer re-baked on a slow cadence (the same
// shape as the ice sheet), because growth is continuous but nobody can see a
// tree grow at 60fps.
const SUCCESSION = {
  matureTicks:   5400,   // abandonment → mature wood (~3 min of viewing)
  scrubFrom:     0.14,   // stage fractions: first green over the rubble
  saplingFrom:   0.42,
  matureFrom:    0.74,
  rebakeTicks:   120,    // ~4s between re-bakes — growth is slow, the cache is not free
  soilAlpha:     0.20,   // altered ground where settlement stood, after everything else has gone
  soilColor:     0x8d7f63,
  soilDecayTicks: 24000, // the soil mark outlasts the trees, but not the world
  roadGhostSec:  240,    // an abandoned road stays legible this long (a quarter of a world)
  roadGhostAlpha: 0.5,   // fraction of the living road's alpha a ghost starts at
  ghostRoadCost: 0.55,   // A* step cost on a ghost tile — under 1, so new roads follow old ones
};

// Per-tile succession state. abandonTick survives the tile reverting to wild:
// the wood keeps growing after the ruin itself is gone, which is the point.
const abandonTick = new Int32Array(GRID_SIZE * GRID_SIZE).fill(-1);
const soilMark = new Float32Array(GRID_SIZE * GRID_SIZE);
let lastSuccessionBake = -1e9;

// After a 5000-tick skip the per-tile hooks never ran, so every existing ruin
// would read as freshly abandoned (or not abandoned at all). The sim already
// stamps lastChangedTick — recover the real ages from it.
function seedSuccessionAfterSkip() {
  abandonTick.fill(-1); soilMark.fill(0);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const t = simWorld.tiles[r][c];
      const k = r * GRID_SIZE + c;
      if (t.state === 'ruin') { abandonTick[k] = t.lastChangedTick; soilMark[k] = 1; }
      else if (t.state === 'built' || t.state === 'cleared') soilMark[k] = 1;
    }
  }
  lastSuccessionBake = -1e9;
  drawSuccession(true);
}

function noteSuccession(row: number, col: number) {
  const k = row * GRID_SIZE + col;
  const st = simWorld.tiles[row][col].state;
  if (st === 'built' || st === 'cleared') {
    abandonTick[k] = -1;      // occupied again: the clock resets, the wood is cleared
    soilMark[k] = 1;
  } else if (st === 'ruin' && abandonTick[k] < 0) {
    abandonTick[k] = simWorld.tick;
    soilMark[k] = 1;
  }
}

// 0 = freshly abandoned, 1 = mature wood.
function successionStage(k: number): number {
  const at = abandonTick[k];
  if (at < 0) return 0;
  return Math.max(0, Math.min(1, (simWorld.tick - at) / SUCCESSION.matureTicks));
}

function drawSuccession(force = false) {
  if (!force && simWorld.tick - lastSuccessionBake < SUCCESSION.rebakeTicks) return;
  lastSuccessionBake = simWorld.tick;
  successionGfx.cacheAsTexture?.(false);
  successionGfx.clear();
  let drew = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const k = r * GRID_SIZE + c;
      if (abandonTick[k] < 0 && soilMark[k] <= 0.01) continue;
      const biome = biomeMap[r][c];
      if (biome === 'water') continue;
      const state = simWorld.tiles[r][c].state;
      const { x, y } = gridToScreen(c, r);

      // Altered soil: the longest-lived trace, and the one a later civilisation
      // is unknowingly drawn back to. Only on ground people have LEFT — painting
      // it under living settlement tinted every occupied tile brown, which read
      // as the land being shaded in as it was settled rather than as a memory of
      // anyone having been there.
      const occupied = state === 'built' || state === 'cleared';
      const soil = occupied ? 0 : soilMark[k];
      if (soil > 0.01) {
        successionGfx.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y])
          .fill({ color: SUCCESSION.soilColor, alpha: SUCCESSION.soilAlpha * soil });
        drew++;
      }

      const t = successionStage(k);
      if (t < SUCCESSION.scrubFrom || occupied) continue;
      const rnd = (s: number) => tileRand(r, c, s);

      if (t < SUCCESSION.saplingFrom) {
        // Scrub: tufts pushing up through the rubble and over the roads.
        const f = (t - SUCCESSION.scrubFrom) / (SUCCESSION.saplingFrom - SUCCESSION.scrubFrom);
        for (let i = 0; i < 5; i++) {
          const ox = (rnd(i * 3 + 41) - 0.5) * 22, oy = (rnd(i * 3 + 42) - 0.5) * 10;
          successionGfx.moveTo(ox + x - 0.7, oy + y).lineTo(ox + x - 0.7, oy + y - 2.2)
            .moveTo(ox + x, oy + y).lineTo(ox + x, oy + y - 2.8)
            .stroke({ color: 0x7d9c5c, alpha: 0.42 * f, width: 0.7, cap: 'round' });
        }
        drew++;
      } else {
        // Saplings thickening into a wood. Trees gather on the foundations
        // rather than scattering evenly — the ruin is where the seed catches.
        const f = Math.min(1, (t - SUCCESSION.saplingFrom) / (SUCCESSION.matureFrom - SUCCESSION.saplingFrom));
        const grown = t >= SUCCESSION.matureFrom;
        const n = biome === 'sand' ? 1 : (grown ? 3 + Math.round(rnd(9) * 2) : 1 + Math.round(f * 2));
        const scale = (grown ? 0.72 + rnd(11) * 0.3 : 0.3 + f * 0.4);
        const trees: Array<{ ox: number; oy: number; s: number; conifer: boolean }> = [];
        for (let i = 0; i < n; i++) {
          trees.push({
            ox: x + (rnd(i * 4 + 51) - 0.5) * 20,
            oy: y + (rnd(i * 4 + 52) - 0.5) * 8,
            s: scale * (0.8 + rnd(i * 4 + 53) * 0.4),
            conifer: rnd(i * 4 + 54) < 0.45,
          });
        }
        trees.sort((a, b) => a.oy - b.oy);
        for (const tr of trees) drawTree(successionGfx, tr.ox, tr.oy, tr.s, tr.conifer);
        drew++;
      }
    }
  }
  successionGfx.visible = drew > 0;
  if (drew > 0) successionGfx.cacheAsTexture?.(true);
}

// The soil mark fades over many minutes — slower than the wood that grows on
// it, so the last thing to go is the fact that anyone was ever here.
function decaySoilMarks() {
  const d = SUCCESSION.rebakeTicks / SUCCESSION.soilDecayTicks;
  for (let i = 0; i < soilMark.length; i++) {
    if (soilMark[i] > 0 && abandonTick[i] >= 0) soilMark[i] = Math.max(0, soilMark[i] - d);
  }
}

// --- Ice ages ---------------------------------------------------------------
// The sim owns the ice LINE (sim.ts: iceExtentFor / iceDepthAt); this owns how
// it looks. Two rules shaped the implementation:
//
//   1. It is world-space and cached. A screen-edge wash would read as frost on
//      the viewer's lens rather than ice on a planet. This layer bends with the
//      globe like everything else, bakes to one texture, and is re-baked only
//      when the front has actually moved a meaningful amount — so the per-frame
//      cost is one quad, and there is no new fullscreen blended pass.
//   2. Snow arrives unevenly. A uniform alpha ramp is a white wall; real snow
//      collects in hollows, catches under trees, and leaves high wind-scoured
//      ground bare. The unevenness is what makes it read as weather on terrain
//      instead of a filter over it.
const ICE = {
  snowColor:    0xf4f9ff,
  seaColor:     0xe2edf5,   // sea ice a touch cooler and duller than snow
  snowAlpha:    0.80,       // opacity at full depth on land
  seaAlpha:     0.62,
  hollowGain:   0.45,       // extra snow where ground sits below its surroundings
  ridgeLoss:    0.30,       // snow scoured off high ground
  forestGain:   0.22,       // extra snow caught and held under trees
  jitter:       0.22,       // per-tile randomness so the sheet has grain
  redrawStep:   0.010,      // extent change that earns a re-bake — the "meaningful threshold"
  paleAlpha:    0.20,       // scoured pale ground the ice leaves behind it
  moraineAlpha: 0.26,       // heaped stone at the furthest advance
  moraineColor: 0xb9b3a6,
  dimCold:      0.75,       // chroma taken from settlement deep in the ice
  dimTone:      0xc2ccd6,   // the cold grey-blue frozen settlement drifts toward
};

// How much snow this tile holds, independent of the front's position: hollows
// gather, ridges are scoured bare, woods hold what falls on them.
function snowCatch(row: number, col: number): number {
  const e = elevationMap[row][col];
  let neigh = 0, n = 0;
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const r = row + dr, c = col + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
    neigh += elevationMap[r][c]; n++;
  }
  const rel = n ? (neigh / n) - e : 0;          // >0 means this tile sits in a dip
  let k = 1 + Math.max(-1, Math.min(1, rel * 14)) * ICE.hollowGain;
  if (e > 0.62) k -= ICE.ridgeLoss * Math.min(1, (e - 0.62) / 0.2);
  if (biomeMap[row][col] === 'forest') k += ICE.forestGain;
  return Math.max(0, k * (1 - ICE.jitter * 0.5 + tileRand(row, col, 313) * ICE.jitter));
}

// A world stub for asking iceDepthAt about a DIFFERENT extent than the current
// one — used to find the furthest the ice ever reached this world.
const iceProbe = { iceExtent: 0, height: GRID_SIZE } as unknown as SimWorld;
function depthAtExtent(extent: number, row: number, col: number): number {
  iceProbe.iceExtent = extent;
  return iceDepthAt(iceProbe, row, col, biomeMap[row][col]);
}

// After the thaw the ground stays pale and the terminal moraine stays put, both
// fading over SIM.ice.memoryTicks. This is "the land remembers" at the slowest
// register the world has.
function iceMemoryFade(): number {
  if (simWorld.iceMax < 0.05) return 0;
  const cycle = SIM.worldCycleTicks;
  const since = (simWorld.tick % cycle) - SIM.ice.goneAt * cycle;
  if (since <= 0) return 1;                       // still glaciated, or mid-retreat
  return Math.max(0, 1 - since / SIM.ice.memoryTicks);
}

let lastIceExtent = -1;
let lastIceMemory = -1;
function drawIce(force = false) {
  const ext = simWorld.iceExtent;
  const mem = iceMemoryFade();
  if (!force
    && Math.abs(ext - lastIceExtent) < ICE.redrawStep
    && Math.abs(mem - lastIceMemory) < 0.02) return;
  lastIceExtent = ext; lastIceMemory = mem;

  // cacheAsTexture(false) first: re-baking in place is what keeps this off the
  // per-frame budget, but the cache has to be released before the redraw.
  iceGfx.cacheAsTexture?.(false);
  iceGfx.clear();
  if (ext <= 0.002 && mem <= 0.002) { iceGfx.visible = false; return; }
  iceGfx.visible = true;

  const maxExt = simWorld.iceMax;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const water = biomeMap[r][c] === 'water';
      const d = ext > 0.002 ? iceDepthAt(simWorld, r, c, biomeMap[r][c]) : 0;
      const { x, y } = gridToScreen(c, r);
      const diamond = [x, y - 8, x + 16, y, x, y + 8, x - 16, y];

      if (d > 0.01) {
        const a = (water ? ICE.seaAlpha : ICE.snowAlpha)
          * Math.min(1, d * (water ? 1 : snowCatch(r, c)));
        if (a > 0.01) iceGfx.poly(diamond).fill({ color: water ? ICE.seaColor : ICE.snowColor, alpha: a });
        continue;
      }
      if (mem <= 0.002 || water || maxExt < 0.05) continue;

      // Ground the ice has already left: scoured pale, with heaped stone in the
      // narrow band that marks how far it came.
      const dMax = depthAtExtent(maxExt, r, c);
      if (dMax <= 0.01) continue;
      if (dMax < 0.24) {
        iceGfx.poly(diamond).fill({ color: ICE.moraineColor, alpha: ICE.moraineAlpha * mem * (0.5 + tileRand(r, c, 517) * 0.5) });
      } else {
        iceGfx.poly(diamond).fill({ color: ICE.snowColor, alpha: ICE.paleAlpha * mem * Math.min(1, dMax) });
      }
    }
  }

  // The world beyond the sim grid freezes too, or the cap ends on the diamond's
  // straight edges. No elevation out here, so the unevenness is jitter only.
  if (ext > 0.002) {
    for (const t of sceneryTiles) {
      const d = iceDepthAt(simWorld, t.r, t.c, t.water ? 'water' : 'grass');
      if (d <= 0.01) continue;
      const catchK = t.water ? 1 : (1 - ICE.jitter * 0.5 + tileRand(t.r + 200, t.c + 200, 313) * ICE.jitter);
      const a = (t.water ? ICE.seaAlpha : ICE.snowAlpha) * Math.min(1, d * catchK);
      if (a > 0.01) {
        iceGfx.poly([t.x, t.y - 8, t.x + 16, t.y, t.x, t.y + 8, t.x - 16, t.y])
          .fill({ color: t.water ? ICE.seaColor : ICE.snowColor, alpha: a });
      }
    }
  }
  iceGfx.cacheAsTexture?.(true);
}

// --- Aftermath quiet zones --------------------------------------------------
// After a catastrophe the mood shifted but the PLACE didn't: the wound sat in
// among dense settlement colour and you couldn't point at it, even when the
// chronicle said ash had buried the fields. Making scars louder would just add
// noise. Instead the land goes quiet where it was hit — settlement there loses
// its colour, an irregular dead-ground silhouette holds the shape, and the
// quiet recovers from the OUTSIDE IN, so the absence itself is what reads.
// A faint remainder never recovers: the land remembers.
const QUIET = {
  maxZones:       6,
  radiusScale:    0.80,  // fraction of the blast radius the quiet reaches
  suppress:       0.85,  // chroma taken from settlement at the centre of a fresh wound
  holdSeconds:    8,     // full quiet before recovery begins
  recoverSeconds: 95,    // outside-in recovery (60–120s is the band that reads as healing)
  remainder:      0.13,  // fraction of the quiet that never recovers, over the old footprint
  rimFeather:     0.38,  // outer fraction of the radius the remainder fades across — without
                         // this the permanent floor ends in a step and draws a visible circle
  groundAlpha:    0.34,  // dead-ground silhouette opacity at full quiet
  groundColor:    0x6f6659,
  lobes:          7,     // silhouette irregularity — a wound is not a circle
  lobeDepth:      0.26,
};
interface QuietZone { row: number; col: number; radius: number; born: number; seed: number }
const quietZones: QuietZone[] = [];

// Irregular radius of a zone in the direction of a given angle.
function quietRadiusAt(z: QuietZone, ang: number): number {
  const wobble = 1 + QUIET.lobeDepth * (
    Math.sin(QUIET.lobes * ang + z.seed) * 0.6 + Math.sin(3 * ang - z.seed * 1.7) * 0.4);
  return z.radius * QUIET.radiusScale * wobble;
}

// 0 = untouched, 1 = the dead heart of a fresh wound. The live core shrinks as
// the zone recovers (healing runs edge → centre); the permanent remainder
// covers the original footprint at a low, fixed level.
function quietnessAt(row: number, col: number, nowSec: number): number {
  let out = 0;
  for (const z of quietZones) {
    const dr = row - z.row, dc = col - z.col;
    const d = Math.hypot(dr, dc);
    const R = quietRadiusAt(z, Math.atan2(dr, dc));
    if (d > R) continue;
    const p = Math.max(0, Math.min(1, (nowSec - z.born - QUIET.holdSeconds) / QUIET.recoverSeconds));
    const liveR = R * (1 - p);
    const live = liveR > 0.001 ? Math.max(0, 1 - d / liveR) * (1 - p) : 0;
    // The permanent floor has to fade out at the rim too, or its edge draws a
    // hard circle around the wound — the one thing a painterly stain must not do.
    const perm = QUIET.remainder * Math.min(1, (R - d) / Math.max(1e-3, R * QUIET.rimFeather));
    out = Math.max(out, perm, live);
  }
  return Math.min(1, out);
}

function addQuietZone(row: number, col: number, radius: number, nowSec: number) {
  quietZones.push({ row, col, radius, born: nowSec, seed: tileRand(row, col, 991) * 6.283 });
  // Oldest (most recovered) zone goes first if we're over the cap.
  while (quietZones.length > QUIET.maxZones) quietZones.shift();
  drawQuietZones();
  // Repaint the settlement inside the new wound immediately rather than waiting
  // for the periodic density pass — the colour should drain as the dust lands.
  const r0 = Math.max(0, row - radius | 0), r1 = Math.min(GRID_SIZE - 1, row + radius | 0);
  const c0 = Math.max(0, col - radius | 0), c1 = Math.min(GRID_SIZE - 1, col + radius | 0);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (simWorld.tiles[r][c].state === 'built') refreshBuildingSprite(r, c);
    }
  }
}

// The dead-ground silhouette, rasterised per tile from the same quietness field
// that drains the buildings. Per-tile rather than one smooth polygon for two
// reasons: it hugs the coastline for free (the sea is never stained — a wash
// over open water read as an oil slick), and the tile grain matches how the
// rest of the ground is drawn. Alpha jitters slightly per tile so the stain is
// a wash, not a decal.
function drawQuietZones() {
  quietGfx.clear();
  if (!quietZones.length) { quietGfx.visible = false; return; }
  quietGfx.visible = true;
  const nowSec = worldClock;
  // Walk each zone's box, but paint any tile once — overlapping wounds share a
  // quietness (quietnessAt takes the max), so drawing twice would double-darken.
  const painted = new Set<number>();
  for (const z of quietZones) {
    const reach = Math.ceil(z.radius * QUIET.radiusScale * (1 + QUIET.lobeDepth));
    const r0 = Math.max(0, z.row - reach), r1 = Math.min(GRID_SIZE - 1, z.row + reach);
    const c0 = Math.max(0, z.col - reach), c1 = Math.min(GRID_SIZE - 1, z.col + reach);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (biomeMap[r][c] === 'water') continue;   // the sea does not scar
        const key = r * GRID_SIZE + c;
        if (painted.has(key)) continue;
        const q = quietnessAt(r, c, nowSec);
        if (q < 0.02) continue;
        painted.add(key);
        const a = QUIET.groundAlpha * q * (0.8 + tileRand(r, c, 77) * 0.4);
        const { x, y } = gridToScreen(c, r);
        quietGfx.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y]).fill({ color: QUIET.groundColor, alpha: a });
      }
    }
  }
}

// Open ground used to carry the same grain/blade texture on every single tile,
// which made empty land as busy as settled land and left the eye nowhere to
// rest. A slow seedless swell (smooth over ~10 tiles) thins that texture out
// and, below a threshold, leaves stretches simply bare — so plains read as
// plains. Forests and mountains are deliberately untouched: they're geography,
// and geography is supposed to read first.
const GROUND = {
  bareBelow:  0.40,  // swell under this leaves ground bare — the quiet passages
  bladeAlpha: 0.20,  // grass/fertile blades (was a flat 0.30 everywhere)
  grainAlpha: 0.22,  // sand grains (was a flat 0.32 everywhere)
};
function groundCover(row: number, col: number): number {
  const a = Math.sin(row * 0.13 + col * 0.09) + Math.sin(col * 0.11 - row * 0.16);
  const swell = (a / 2 + 1) / 2;                       // ~0..1, smooth
  return Math.max(0, (swell - GROUND.bareBelow) / (1 - GROUND.bareBelow));
}

// One little tree (conifer or broadleaf) at a tile-local offset. Shared by
// forests and by forested mountain foothills.
function drawTree(g: Graphics, ox: number, oy: number, s: number, conifer: boolean) {
  g.ellipse(ox, oy + 1.6 * s, 3.0 * s, 1.2 * s).fill({ color: 0x40583a, alpha: 0.16 }); // cast shadow
  g.rect(ox - 0.5 * s, oy - 1.4 * s, 1.0 * s, 3.4 * s).fill({ color: 0x5a4632, alpha: 0.9 }); // trunk
  if (conifer) {
    g.poly([ox, oy - 8.5 * s, ox - 3.2 * s, oy - 0.5 * s, ox + 3.2 * s, oy - 0.5 * s]).fill({ color: 0x3c6636 });
    g.poly([ox, oy - 11 * s, ox - 2.4 * s, oy - 4 * s, ox + 2.4 * s, oy - 4 * s]).fill({ color: 0x4a7a44 });
  } else {
    g.circle(ox, oy - 5 * s, 3.4 * s).fill({ color: 0x437138 });
    g.circle(ox - 1.9 * s, oy - 3.6 * s, 2.4 * s).fill({ color: 0x3c6636 });
    g.circle(ox + 1.9 * s, oy - 4 * s, 2.2 * s).fill({ color: 0x539050 });
  }
}

// Terrain texture, drawn onto each land tile's own Graphics so it bakes into
// the cached biome layer (perf-free per frame). Everything is relative to the
// tile centre; the back-to-front tile draw order makes heights overlap right.
function decorateTile(g: Graphics, biome: Biome, row: number, col: number) {
  const rnd = (s: number) => tileRand(row, col, s);
  if (biome === 'forest') {
    // Dense, tall stands in the heart of the wood; a sparse, low fringe at the
    // edge. coreness drives both how many trees and how big they grow.
    const core = patchCoreness(row, col, 'forest');
    const n = 1 + Math.round(core * 5); // 1 (lone edge tree) … 6 (deep wood)
    const sizeBias = 0.55 + core * 0.45; // saplings at the fringe, giants at the core
    const trees: Array<{ ox: number; oy: number; s: number; conifer: boolean }> = [];
    for (let i = 0; i < n; i++) {
      trees.push({
        ox: (rnd(i * 4 + 2) - 0.5) * 22,
        oy: (rnd(i * 4 + 3) - 0.5) * 9,
        s: (0.78 + rnd(i * 4 + 4) * 0.5) * sizeBias,
        conifer: rnd(i * 4 + 5) < 0.5,
      });
    }
    trees.sort((a, b) => a.oy - b.oy); // nearer trees (lower) drawn last
    for (const t of trees) drawTree(g, t.ox, t.oy, t.s, t.conifer);
  } else if (biome === 'rock') {
    // Mountains sit on the same ground as the land around them (the tile keeps
    // its grass colour); the peak itself is the rock. coreness shapes the range:
    // a tiny stony bump at the fringe — wreathed in foothill trees — rising to a
    // tall, snow-capped massif at the heart that spills across neighbouring tiles.
    const core = patchCoreness(row, col, 'rock');
    const elev = Math.min(1, Math.max(0, (elevationMap[row][col] - 0.55) / 0.45));
    // Forested foothills: a few trees at the sparse edge (behind the peak),
    // fading to bare rock toward the core — the combination tiles.
    const treeN = Math.round((1 - core) * (1 - core) * 4); // ~4 at the fringe → 0 at the core
    const foot: Array<{ ox: number; oy: number; s: number; conifer: boolean }> = [];
    for (let i = 0; i < treeN; i++) foot.push({
      ox: (rnd(i * 4 + 20) - 0.5) * 24,
      oy: (rnd(i * 4 + 21) - 0.5) * 9 - 1,
      s: 0.6 + rnd(i * 4 + 22) * 0.3,
      conifer: rnd(i * 4 + 23) < 0.6,
    });
    foot.sort((a, b) => a.oy - b.oy);
    for (const t of foot) drawTree(g, t.ox, t.oy, t.s, t.conifer);
    // The peak — small at the edge (core²), a wide tall mass at the core.
    const cc = core * core;
    const peak = 2 + cc * 26 + elev * 3;       // ~2 at the fringe → ~28 at the heart
    const w = 4 + cc * 18, apexX = (rnd(1) - 0.5) * 4; // ~4 → ~22 wide (spills into neighbours)
    g.poly([apexX, -peak, -w, 4, apexX, 7]).fill({ color: 0xccc6bb }); // lit face
    g.poly([apexX, -peak, w, 4, apexX, 7]).fill({ color: 0x8b857a }); // shadow face
    if (peak > 16) {
      const snow = Math.min(8, (peak - 16) * 1.4);
      g.poly([apexX, -peak, apexX - snow * 0.7, -peak + snow, apexX + snow * 0.7, -peak + snow]).fill({ color: 0xeef2f6, alpha: 0.92 });
    }
  } else if (biome === 'sand') {
    const cover = groundCover(row, col);
    const n = Math.round(6 * cover);
    for (let i = 0; i < n; i++) {
      const ox = (rnd(i * 2 + 1) - 0.5) * 24, oy = (rnd(i * 2 + 2) - 0.5) * 11;
      g.circle(ox, oy, 0.7).fill({ color: i % 3 ? 0xd6bd86 : 0xc6ab74, alpha: GROUND.grainAlpha }); // faint grains
    }
  } else { // grass, fertile — a few faint blades, lusher on fertile
    const cover = groundCover(row, col);
    const n = Math.round((biome === 'fertile' ? 5 : 4) * cover);
    const tip = biome === 'fertile' ? 0x7aac58 : 0x82ad68;
    for (let i = 0; i < n; i++) {
      const ox = (rnd(i * 2 + 1) - 0.5) * 22, oy = (rnd(i * 2 + 2) - 0.5) * 10;
      g.moveTo(ox - 0.7, oy).lineTo(ox - 0.7, oy - 2.0).moveTo(ox, oy).lineTo(ox, oy - 2.4)
        .moveTo(ox + 0.7, oy).lineTo(ox + 0.7, oy - 1.9)
        .stroke({ color: tip, alpha: GROUND.bladeAlpha, width: 0.6, cap: 'round' });
    }
  }
}

function drawBiomes() {
  clearBiomeTrans(); // a full redraw supersedes any in-flight tile crossfades
  biomeLayer.removeChildren();
  oceanApron = drawOceanApron();
  biomeLayer.addChild(oceanApron);
  biomeLayer.addChild(sceneryWaterGfx);
  drawScenery();
  rebuildWaterMask();
  biomeTileVisuals = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  animatingBiomeTiles.clear();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const biome = biomeMap[row][col];
      // Forests AND mountains sit on the same ground as the land around them —
      // the trees / the peak provide the colour, not the tile — so their edges
      // blend seamlessly into the grass instead of ending on a hard border.
      const color = biome === 'water' ? waterColorAt(row, col)
        : (biome === 'forest' || biome === 'rock') ? BIOME_COLORS.grass
        : BIOME_COLORS[biome];
      const g = drawTile(biomeLayer, col, row, biome);
      if (biome === 'water' || biome === 'forest' || biome === 'rock') redrawBiomeTile(g, color);
      if (biome !== 'water') decorateTile(g, biome, row, col);
      biomeTileVisuals[row][col] = { g, curColor: color, targetColor: color };
    }
  }
  drawRivers();
  // The biome layer is ~9k tile Graphics + 20k scenery-water polys that
  // almost never change — cache the whole subtree to one texture. While a
  // flood/quake animates tiles, the cache re-renders per frame (rare).
  biomeLayer.cacheAsTexture?.(false);
  biomeLayer.cacheAsTexture?.(true);
}

// The wild biomes change at runtime now (the land breathes, plus floods/quakes),
// so a changed tile is fully re-drawn — base colour AND scenery (trees appear or
// vanish, sand grains, the peak). The biome layer is cached, so changes are
// invisible until the cache is re-baked; that bake (and the water mask) is
// throttled below since the land change is slow.
let biomeCacheDirty = false;
let waterMaskDirty = false;
let lastBiomeBake = -1e9;
let lastWaterMask = -1e9;
// Re-baking the cached biome texture can flash uninitialised garbage for one
// frame on some GPUs (Mesa/SteamOS). The crossfade overlay already carries each
// changed tile at full opacity, so we let the cached base lag far behind and
// re-bake only rarely — the overlay holds the correct look until it catches up.
const BIOME_BAKE_INTERVAL = 900;  // ~30s between cache re-bakes
const WATER_MASK_INTERVAL = 30;   // ~1s — mask geometry only, no texture re-bake
function refreshBiomeTile(row: number, col: number) {
  const btv = biomeTileVisuals[row][col];
  if (!btv) return;
  const biome = biomeMap[row][col];
  const base = biome === 'water' ? waterColorAt(row, col)
    : (biome === 'forest' || biome === 'rock') ? BIOME_COLORS.grass
    : BIOME_COLORS[biome];
  redrawBiomeTile(btv.g, base);
  if (biome !== 'water') decorateTile(btv.g, biome, row, col);
  btv.curColor = base; btv.targetColor = base;
  biomeCacheDirty = true;
  waterMaskDirty = true;
}
// A biome change crossfades in: the NEW tile is drawn in an uncached overlay,
// easing up over the OLD tile still showing in the cache; when it reaches full
// it commits to the cache, and the overlay is dropped after the next re-bake (so
// there's never a one-frame gap between the two).
interface BiomeTrans { row: number; col: number; alpha: number; committed: boolean; g: Graphics }
const biomeTrans = new Map<number, BiomeTrans>();
const BIOME_FADE = 0.016; // per-frame ease — ~1s crossfade at 60fps
function enrollBiomeTrans(row: number, col: number) {
  const key = row * GRID_SIZE + col;
  const biome = biomeMap[row][col];
  const base = biome === 'water' ? waterColorAt(row, col)
    : (biome === 'forest' || biome === 'rock') ? BIOME_COLORS.grass
    : BIOME_COLORS[biome];
  let tr = biomeTrans.get(key);
  if (!tr) {
    const g = new Graphics();
    const { x, y } = gridToScreen(col, row);
    g.x = x; g.y = y; g.alpha = 0;
    biomeTransLayer.addChild(g);
    tr = { row, col, alpha: 0, committed: false, g };
    biomeTrans.set(key, tr);
  }
  // (Re)draw the new biome into the overlay tile; if it changed again mid-fade,
  // keep fading from where we are toward the newest look.
  tr.g.clear();
  redrawBiomeTile(tr.g, base);
  if (biome !== 'water') decorateTile(tr.g, biome, row, col);
  tr.committed = false;
}
function updateBiomeTrans() {
  for (const tr of biomeTrans.values()) {
    if (tr.committed) continue;
    tr.alpha = Math.min(1, tr.alpha + BIOME_FADE * easeFrames);
    tr.g.alpha = tr.alpha;
    if (tr.alpha >= 1) { refreshBiomeTile(tr.row, tr.col); tr.committed = true; } // fold into the cache
  }
}
function clearBiomeTrans() {
  for (const tr of biomeTrans.values()) { biomeTransLayer.removeChild(tr.g); tr.g.destroy(); }
  biomeTrans.clear();
}

// Apply the pending water-mask rebuild (often) and the biome cache re-bake
// (rarely) — both throttled, on separate clocks.
function flushBiomeChanges(tick: number) {
  if (waterMaskDirty && tick - lastWaterMask >= WATER_MASK_INTERVAL) {
    rebuildWaterMask(); waterMaskDirty = false; lastWaterMask = tick;
  }
  if (biomeCacheDirty && tick - lastBiomeBake >= BIOME_BAKE_INTERVAL) {
    (biomeLayer as any).updateCacheTexture?.(); biomeCacheDirty = false; lastBiomeBake = tick;
    // Committed tiles are now in the cache — retire their fade overlays.
    for (const [key, tr] of biomeTrans) if (tr.committed) { biomeTransLayer.removeChild(tr.g); tr.g.destroy(); biomeTrans.delete(key); }
  }
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
  // Each mid-floor is its own sprite; height-stacking is a big share of the
  // ~10k building sprites. The quality cap flattens it (low = no mid-floors),
  // which is the real object-count lever for weak/object-bound GPUs.
  const floorCap = QUALITY[qualityLevel].extraFloors;
  if (floorCap === 0) return 0;
  const [minFloors, maxFloors] = ERA_HEIGHT_RANGE[era];
  const d = Math.max(0, Math.min(1, density));
  const gradient = minFloors + (maxFloors - minFloors) * d;
  const noise = ((_bldHash(row, col, slotIdx, 7) / 0xffffffff) * 2 - 1) * HEIGHT_NOISE;
  const floors = Math.max(minFloors, Math.min(maxFloors, Math.round(gradient + noise)));
  return Math.min(MAX_EXTRA_FLOORS, floorCap, floors - 1);
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
function tintForBuilding(baseColor: number, row: number, col: number, slotIdx: number, civ: Civ, importance = 1, groundTone = HIERARCHY.earthTone, quiet = 0, cold = 0): number {
  const lOff = ((_bldHash(row, col, slotIdx, 5) / 0xffffffff) * 2 - 1) * BUILDING_VARIATION.lightness;
  const sOff = ((_bldHash(row, col, slotIdx, 6) / 0xffffffff) * 2 - 1) * BUILDING_VARIATION.saturation;
  const [h, s, l] = rgbToHsl(baseColor);
  const eraSat = civCurSatMult.get(civ.id) ?? ERA_SAT_MULT[civ.era];
  // Ordinary stock gives up chroma; the core keeps all of it.
  const ordinary = 1 - importance;
  const rank = HIERARCHY.quietSat + (1 - HIERARCHY.quietSat) * importance;
  // A wound outranks everything: settlement inside a quiet zone drains toward
  // ash no matter how important it was. That's the point — the absence reads.
  const wound = 1 - QUIET.suppress * quiet;
  // Cold does the same thing more gently: settlement caught by the ice goes
  // grey-blue and dim before it contracts away entirely.
  const chill = 1 - ICE.dimCold * cold;
  const [, , gl] = rgbToHsl(groundTone);
  const c = hslToRgb(h,
    Math.max(0, Math.min(1, (s + sOff) * eraSat * rank * wound * chill)),
    // Lift toward the ground's value too: cutting chroma alone leaves a dark
    // mass that still shouts by contrast. Recede in value AND colour.
    Math.max(0, Math.min(1, l + lOff + (gl - l) * HIERARCHY.quietLift * ordinary)));
  // …and drifts toward the ground it stands on — a desert town goes sandy, a
  // forest town goes green — so hinterland settlement reads as part of the
  // landscape rather than as a swatch of the civ's colour laid over it.
  let settled = lerpColor(c, groundTone, HIERARCHY.quietBlend * ordinary);
  if (quiet > 0) settled = lerpColor(settled, QUIET.groundColor, 0.45 * quiet);
  if (cold > 0) settled = lerpColor(settled, ICE.dimTone, 0.34 * cold);
  return settled;
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
  const cap = QUALITY[qualityLevel].slots;
  if (density >= DENSITY.slot4) return Math.min(4, cap);
  if (density >= DENSITY.slot3) return Math.min(3, cap);
  if (density >= DENSITY.slot2) return 2;
  if (density >= DENSITY.slot1) return 1;
  return 0;
}

function clearBuildingLayer() {
  buildingLayer.removeChildren();
  buildingTileStates = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  animatingBuildingTiles.clear();
}

const RUIN_TINT = 0x5a544c;       // fallback stone tone (rubble base)
// A ruin's life, as a fraction of its decay (ruinAge 0→1): it first drains of
// colour to grey stone, then its upper floors collapse into a low rubble
// stub, and finally the land reclaims the stub. Time-based (frame-rate
// independent) — the whole arc takes RUIN_DECAY_SECONDS.
const RUIN_DECAY_SECONDS = 30;
const RUIN_PHASE = { greyBy: 0.22, collapseFrom: 0.15, collapseTo: 0.62, reclaimFrom: 0.62 };
// When a whole civ falls at once, scatter the moment each building begins to
// crumble across this window, so a dead city collapses tile by tile (a ripple)
// instead of every roof caving in on the same frame.
const RUIN_STAGGER_SECONDS = 8;
const ruinStaggerFor = (row: number, col: number) => tileRand(row, col, 4242) * RUIN_STAGGER_SECONDS;

// Luminance greyscale of a colour, nudged to warm stone (not a dead grey).
function greyOf(color: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, bl = color & 0xff;
  const l = Math.round(0.32 * r + 0.55 * g + 0.13 * bl) * 0.85 + 18;
  const v = Math.max(0, Math.min(255, l));
  return ((Math.min(255, v + 8)) << 16) | (v << 8) | Math.max(0, v - 10);
}

function refreshBuildingSprite(row: number, col: number) {
  if (!SHOW_BUILDING_SPRITES || bodyTextures.length === 0) return;
  const tile = simWorld.tiles[row][col];
  const civ = tile.civId != null ? simWorld.civs.get(tile.civId) : null;
  // Nothing is built on the peaks — even if a volcano raised rock under a tile,
  // or an older world settled it; any stranded buildings fade out.
  const active = tile.state === 'built' && civ != null && biomeMap[row][col] !== 'rock';

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
    let newlyRuined = false;
    for (let s = 0; s < 4; s++) {
      if (!state.floor1[s]) continue;
      // Mark for decay (grey → collapse → reclaim), capturing the colour to drain
      // from. A ruined building at ruinAge 0 still renders intact, so it stands
      // until its staggered start; the animation loop drives it from there.
      if (!state.ruined[s]) {
        state.ruined[s] = true;
        state.ruinAge[s] = 0;
        state.ruinColor0[s] = state.floor1[s]!.tint as number;
        newlyRuined = true;
      }
    }
    // Stagger the onset so the dead city crumbles tile by tile, not all at once.
    if (newlyRuined) state.ruinStartAt = worldClock + ruinStaggerFor(row, col);
    animatingBuildingTiles.add(`${row},${col}`);
    return;
  }

  const density = computeTileDensity(row, col, civ!);
  const importance = buildingImportance(row, col, civ!, density);
  // The ground this tile stands on, matching drawBiomes' rule that forest and
  // rock tiles keep the grass base under their trees/peaks.
  const tileBiome = biomeMap[row][col];
  const groundTone = (tileBiome === 'forest' || tileBiome === 'rock' || tileBiome === 'water')
    ? BIOME_COLORS.grass : BIOME_COLORS[tileBiome];
  const quiet = quietZones.length ? quietnessAt(row, col, worldClock) : 0;
  const cold = simWorld.iceExtent > 0.002 ? iceDepthAt(simWorld, row, col, tileBiome) : 0;
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
      ruinAge: [0,0,0,0],
      ruinColor0: [0,0,0,0],
      ruinStartAt: 0,
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
      // Slot abandoned (density dropped past it) — start the decay progression.
      state.ruinAge[slotIdx] = 0;
      state.ruinColor0[slotIdx] = (state.floor1[slotIdx]!.tint as number);
    } else if (!nowRuined && state.ruined[slotIdx]) {
      // Reactivated (density rose back) — rebuilt, full and coloured again.
      state.curRuinMult[slotIdx] = 1.0;
      state.ruinAge[slotIdx] = 0;
    }
    state.ruined[slotIdx] = nowRuined;

    const tint = wantActive ? tintForBuilding(civ!.color, row, col, slotIdx, civ!, importance, groundTone, quiet, cold) : RUIN_TINT;
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
      // Ruined slots are owned by the decay animation (grey/collapse/reclaim),
      // so don't stamp a flat tint over them here.
      if (!state.ruined[slotIdx]) {
        state.floor1[slotIdx]!.tint = tint;
        for (const mf of state.midFloors[slotIdx]) mf.sprite.tint = tint;
        if (state.roof[slotIdx]) state.roof[slotIdx]!.tint = tint;
      }

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

let expWasEmpty = true;
function drawExpeditions() {
  const g = expeditionGfx;
  if (simWorld.expeditions.length === 0) {
    if (!expWasEmpty) { g.clear(); expWasEmpty = true; }
    return;
  }
  expWasEmpty = false;
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

    // A lean exploration longship — raked bow, bare mast with a streaming
    // pennant, and a churning V-wake. Reads as a fast scout, distinct from the
    // fat single-sailed trade boats.
    const { x, y } = gridToScreen(exp.col, exp.row);
    const ahead = gridToScreen(exp.col + exp.dirCol, exp.row + exp.dirRow);
    let hx = ahead.x - x, hy = ahead.y - y;
    const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
    drawExpeditionShip(g, x, y, hx, hy, civ.color);
  }
}

// A long, narrow longship pointed along (hx,hy): a deep raked bow, a bare mast
// rising screen-up with a civ-coloured pennant streaming astern, and a spreading
// foam wake — the look of a fast voyage of discovery.
function drawExpeditionShip(g: Graphics, x: number, y: number, hx: number, hy: number, color: number) {
  const px = -hy, py = hx; // beam
  const L = 7, W = 1.9;
  // Spreading V-wake astern (drawn first, under the hull).
  const sx = x - hx * L, sy = y - hy * L;
  g.poly([sx, sy, sx - hx * 6 + px * 4, sy - hy * 6 + py * 4, sx - hx * 4, sy - hy * 4])
    .fill({ color: 0xffffff, alpha: 0.16 });
  g.poly([sx, sy, sx - hx * 6 - px * 4, sy - hy * 6 - py * 4, sx - hx * 4, sy - hy * 4])
    .fill({ color: 0xffffff, alpha: 0.16 });
  // Hull: a long double-ender with a raked bow.
  g.poly([
    x + hx * L * 1.35, y + hy * L * 1.35,   // long bow
    x + px * W, y + py * W,
    x - hx * L, y - hy * L,                 // stern
    x - px * W, y - py * W,
  ]).fill({ color: 0x3c352c, alpha: 0.95 });
  // Mast rising screen-up, with a civ-coloured pennant streaming astern.
  const mh = 7;
  g.poly([x, y - mh, x - hx * 6, y - mh + 1.6, x - hx * 6, y - mh - 1.6])
    .fill({ color: lerpColor(color, 0xffffff, 0.15), alpha: 0.92 });
  g.poly([x - 0.5, y - 1, x + 0.5, y - 1, x + 0.5, y - mh, x - 0.5, y - mh])
    .fill({ color: 0x2a241d, alpha: 0.9 });
  g.circle(x, y - 0.5, 1.1).fill({ color, alpha: 0.95 });
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

// --- City lights (night) and smoke (day) -----------------------------------
// Both rebuild on the city cadence (cheap, ~every 0.7s of viewing); per-frame
// cost is container alpha for lights and ~a few dozen sprite moves for smoke.

const LIGHTS = {
  maxAlpha: 0.9,        // layer alpha at full night
  dotRadius: 2.1,       // per-tile lamp dot
  cityHaloRadius: 10,   // soft halo at cities (scaled by prominence)
  densityFloor: 0.16,   // tiles dimmer than this stay dark
  // The quality of light is the era speaking: hearth embers, lamplight,
  // sooty industry, cool modern sprawl, synthetic post glow.
  eraColors: {
    neolithic: 0xffaa5e, classical: 0xffc47e, medieval: 0xffc47e,
    industrial: 0xff8f43, modern: 0xcfe0ff, post: 0xb9a3ff,
  } as Record<Era, number>,
};

function rebuildCityLights() {
  cityLightsGfx.clear();
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') continue;
    const color = LIGHTS.eraColors[civ.era];
    // The grid electrifies through the ages: sparse, dim hearths in the early
    // eras → a dense, bright modern sprawl.
    const rank = ERA_RANK[civ.era];
    const glow = 0.5 + rank * 0.14;                                  // 0.5 (neolithic) → 1.2 (post)
    const floor = LIGHTS.densityFloor * (rank >= 4 ? 0.55 : rank <= 1 ? 1.4 : 1.0); // modern lights more tiles
    for (const city of civ.cities) {
      const { x, y } = gridToScreen(city.col, city.row);
      cityLightsGfx.circle(x, y, LIGHTS.cityHaloRadius * (0.5 + city.prominence) * (0.85 + rank * 0.05))
        .fill({ color, alpha: (0.10 + 0.08 * city.prominence) * glow });
    }
    const ts = civTiles.get(civ.id);
    if (!ts) continue;
    for (const key of ts) {
      const r = (key / GRID_SIZE) | 0;
      const c = key % GRID_SIZE;
      if (simWorld.tiles[r][c].state !== 'built') continue;
      const density = computeTileDensity(r, c, civ);
      if (density < floor) continue;
      const { x, y } = gridToScreen(c, r);
      // Lights sit on the building slots (not the tile center), each with a
      // deterministic jitter, size, and brightness — so windows are scattered
      // and uneven, never a regular grid of identical dots.
      const count = densityToCount(density);
      const perm = tileSlotPermutation(r, c);
      for (let fillIdx = 0; fillIdx < count; fillIdx++) {
        const slotIdx = perm[fillIdx];
        const [sx, sy] = SLOT_POSITIONS[slotIdx];
        const h = _bldHash(r, c, slotIdx, 11);
        const jx = ((h & 0xff) / 255 - 0.5) * 5;
        const jy = (((h >> 8) & 0xff) / 255 - 0.5) * 4 - 2; // a touch up, onto the walls
        const szv = ((h >> 16) & 0xff) / 255;
        const av = ((h >> 24) & 0xff) / 255;
        // Some windows stay dark — a lit settlement isn't uniformly bright.
        if (av < 0.18) continue;
        const sz = (0.8 + szv * 2.0) * (0.55 + density * 0.5);
        const a = Math.min(1, (0.22 + 0.5 * density) * (0.6 + av * 0.6) * glow);
        cityLightsGfx.circle(x + sx + jx, y + sy + jy, sz).fill({ color, alpha: a });
      }
    }
  }
}

const SMOKE = {
  minProminence: 0.5,   // cities large enough to smoke
  maxPuffs: 56,
  riseSpeed: 9,         // world px/s upward
  windCarry: 0.35,      // fraction of the atmosphere wind that drifts puffs
  lifeSec: 8,
  eraStyle: {
    neolithic:  { color: 0xd8cdbb, alpha: 0.10, count: 1 },
    classical:  { color: 0xd2c8b6, alpha: 0.11, count: 1 },
    medieval:   { color: 0xc4bba9, alpha: 0.12, count: 2 },
    industrial: { color: 0x6e675f, alpha: 0.18, count: 3 },
    modern:     { color: 0x9aa0a6, alpha: 0.09, count: 1 },
    post:       { color: 0xb0a8c0, alpha: 0.06, count: 1 },
  } as Record<Era, { color: number; alpha: number; count: number }>,
};

function makePuffTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return Texture.from(cv);
}
const puffTexture = makePuffTexture();

interface SmokeEmitter { x: number; y: number; color: number; alpha: number; count: number }
interface Puff { sp: Sprite; age: number; emitter: SmokeEmitter }
let smokeEmitters: SmokeEmitter[] = [];
const puffs: Puff[] = [];

function rebuildSmokeEmitters() {
  smokeEmitters = [];
  // A rising island steams while it builds.
  if (simWorld.terraform?.steamAt) {
    const s = simWorld.terraform.steamAt;
    const { x, y } = gridToScreen(s.col, s.row);
    smokeEmitters.push({ x, y, color: 0xe8eef2, alpha: 0.2, count: 3 });
  }
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') continue;
    const style = SMOKE.eraStyle[civ.era];
    for (const city of civ.cities) {
      if (city.prominence < SMOKE.minProminence) continue;
      const { x, y } = gridToScreen(city.col, city.row);
      smokeEmitters.push({ x, y: y - 6, color: style.color, alpha: style.alpha, count: style.count });
    }
  }
}

function updateSmoke(dt: number) {
  // Spawn up to each emitter's budget, bounded globally.
  let budget = SMOKE.maxPuffs - puffs.length;
  if (budget > 0) {
    for (const em of smokeEmitters) {
      if (budget <= 0) break;
      let alive = 0;
      for (const p of puffs) if (p.emitter === em) alive++;
      if (alive >= em.count) continue;
      const sp = new Sprite(puffTexture);
      sp.anchor.set(0.5);
      sp.position.set(em.x + (Math.random() - 0.5) * 4, em.y);
      sp.tint = em.color;
      sp.alpha = 0;
      sp.scale.set(0.12);
      smokeLayer.addChild(sp);
      puffs.push({ sp, age: Math.random() * 0.5, emitter: em });
      budget--;
    }
  }
  const wind = atmos.wind();
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.age += dt;
    const u = p.age / SMOKE.lifeSec;
    if (u >= 1 || !smokeEmitters.includes(p.emitter)) {
      smokeLayer.removeChild(p.sp);
      p.sp.destroy();
      puffs.splice(i, 1);
      continue;
    }
    p.sp.y -= SMOKE.riseSpeed * dt;
    p.sp.x += wind.x * SMOKE.windCarry * dt;
    p.sp.scale.set(0.12 + u * 0.5);
    p.sp.alpha = p.emitter.alpha * Math.sin(Math.PI * u);
  }
}

// --- Story surfaces: roads, wars, boats, wonders, ghosts, festivals --------

// Roads: each city connects to its nearest older sibling — a growing tree.
// Paths are A* over land, cached by endpoints (terrain is near-static), so
// the periodic rebuild is usually pure drawing.
const ROAD_STYLE: Record<Era, { color: number; width: number; alpha: number }> = {
  neolithic:  { color: 0x7a6748, width: 1.3, alpha: 0.42 },  // worn dirt trails
  classical:  { color: 0x8f7748, width: 1.6, alpha: 0.52 },
  medieval:   { color: 0x8f7748, width: 1.8, alpha: 0.55 },
  industrial: { color: 0x46423c, width: 2.2, alpha: 0.62 },  // dark rail/road
  modern:     { color: 0x55565c, width: 2.6, alpha: 0.62 },
  post:       { color: 0xa899e0, width: 2.0, alpha: 0.62 },  // lit threads
};
const roadPathCache = new Map<string, Array<{ row: number; col: number }> | null>();

function findLandPath(r1: number, c1: number, r2: number, c2: number): Array<{ row: number; col: number }> | null {
  const key = (r: number, c: number) => r * GRID_SIZE + c;
  const open: Array<{ r: number; c: number; f: number }> = [{ r: r1, c: c1, f: 0 }];
  const gScore = new Map<number, number>([[key(r1, c1), 0]]);
  const cameFrom = new Map<number, number>();
  let explored = 0;
  while (open.length > 0 && explored++ < 3000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.r === r2 && cur.c === c2) {
      const path: Array<{ row: number; col: number }> = [];
      let k: number | undefined = key(cur.r, cur.c);
      while (k !== undefined) {
        path.unshift({ row: (k / GRID_SIZE) | 0, col: k % GRID_SIZE });
        k = cameFrom.get(k);
      }
      return path;
    }
    const g0 = gScore.get(key(cur.r, cur.c))!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = cur.r + dr, nc = cur.c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (biomeMap[nr][nc] === 'water') continue;
      const nk = key(nr, nc);
      // Under 1 on a ghost tile: a new road would rather rediscover an
      // ancient route than cut a fresh one — roads outlive their builders.
      const g = g0 + (roadGhostTiles.has(nk) ? SUCCESSION.ghostRoadCost : 1);
      if (g >= (gScore.get(nk) ?? Infinity)) continue;
      gScore.set(nk, g);
      cameFrom.set(nk, key(cur.r, cur.c));
      open.push({ r: nr, c: nc, f: g + (Math.abs(nr - r2) + Math.abs(nc - c2)) * 1.01 });
    }
  }
  return null;
}

function roadBetween(a: CivCity, b: CivCity): Array<{ row: number; col: number }> | null {
  const ck = `${a.row},${a.col}-${b.row},${b.col}`;
  if (!roadPathCache.has(ck)) roadPathCache.set(ck, findLandPath(a.row, a.col, b.row, b.col));
  return roadPathCache.get(ck)!;
}

// Roads are built over time: each one draws on from its older endpoint toward
// the newer city over ROAD_BUILD_SEC, so the network visibly grows as cities
// connect rather than popping in complete.
const ROAD_BUILD_SEC = 6;
interface RoadLine { pts: Array<{ x: number; y: number }>; tiles: number[]; progress: number; color: number; width: number; alpha: number }
const roadLines = new Map<string, RoadLine>();

// Abandoned roads, fading. A road doesn't vanish when the last city that used
// it falls — it stops being maintained. The trace stays legible for minutes,
// and the ground it lay on is remembered so somebody later can find the line
// of it under the grass (see the A* bias in findLandPath).
interface RoadGhost { pts: Array<{ x: number; y: number }>; alpha: number; life: number }
const roadGhosts: RoadGhost[] = [];
const roadGhostTiles = new Set<number>();
function updateRoadGhosts(dt: number) {
  for (let i = roadGhosts.length - 1; i >= 0; i--) {
    const g = roadGhosts[i];
    g.life -= dt / SUCCESSION.roadGhostSec;
    if (g.life <= 0) { roadGhosts.splice(i, 1); continue; }
    const a = g.alpha * g.life * g.life; // holds, then lets go
    if (a < 0.01) continue;
    roadsGfx.moveTo(g.pts[0].x, g.pts[0].y);
    for (let j = 1; j < g.pts.length; j++) roadsGfx.lineTo(g.pts[j].x, g.pts[j].y);
    roadsGfx.stroke({ color: 0x8a8069, alpha: a, width: 1.1, cap: 'round', join: 'round' });
  }
}

// Reconcile the road set on the city cadence: add new connections (at
// progress 0), drop roads whose cities are gone.
function rebuildRoads() {
  const live = new Set<string>();
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || civ.cities.length < 2) continue;
    const style = ROAD_STYLE[civ.era];
    const ordered = [...civ.cities].sort((a, b) => a.foundedTick - b.foundedTick);
    for (let i = 1; i < ordered.length; i++) {
      let nearest = 0, nd = Infinity;
      for (let j = 0; j < i; j++) {
        const d = Math.hypot(ordered[i].row - ordered[j].row, ordered[i].col - ordered[j].col);
        if (d < nd) { nd = d; nearest = j; }
      }
      const a = ordered[nearest], b = ordered[i];
      const key = `${a.row},${a.col}-${b.row},${b.col}`;
      live.add(key);
      const existing = roadLines.get(key);
      if (existing) {
        // Keep its build progress; refresh era styling (eras change over time).
        existing.color = style.color; existing.width = style.width; existing.alpha = style.alpha;
        continue;
      }
      const path = roadBetween(a, b);
      if (!path || path.length < 2) continue;
      roadLines.set(key, {
        pts: path.map((p) => gridToScreen(p.col, p.row)),
        tiles: path.map((p) => p.row * GRID_SIZE + p.col),
        progress: 0, color: style.color, width: style.width, alpha: style.alpha,
      });
    }
  }
  for (const k of [...roadLines.keys()]) {
    if (live.has(k)) continue;
    const dead = roadLines.get(k)!;
    if (dead.progress > 0.3) {   // only roads that actually got built leave a trace
      roadGhosts.push({ pts: dead.pts, alpha: dead.alpha * SUCCESSION.roadGhostAlpha, life: 1 });
      for (const t of dead.tiles) roadGhostTiles.add(t);
    }
    roadLines.delete(k);
  }
  while (roadGhosts.length > 40) roadGhosts.shift();
}

// Advance each road's build and redraw, drawing only the completed fraction.
function drawRoads(dt: number) {
  if (roadLines.size === 0) { roadsGfx.clear(); return; }  // ghosts are drawn after this, into the cleared layer
  roadsGfx.clear();
  for (const road of roadLines.values()) {
    road.progress = Math.min(1, road.progress + dt / ROAD_BUILD_SEC);
    const n = road.pts.length;
    const reach = road.progress * (n - 1);
    const full = Math.floor(reach);
    roadsGfx.moveTo(road.pts[0].x, road.pts[0].y);
    for (let k = 1; k <= full && k < n; k++) roadsGfx.lineTo(road.pts[k].x, road.pts[k].y);
    if (full < n - 1) {
      const u = reach - full;
      const pa = road.pts[full], pb = road.pts[full + 1];
      roadsGfx.lineTo(pa.x + (pb.x - pa.x) * u, pa.y + (pb.y - pa.y) * u);
    }
    // Fade in alpha over the first stretch so a fresh road isn't a hard line.
    const a = road.alpha * Math.min(1, road.progress * 3);
    roadsGfx.stroke({ color: road.color, alpha: a, width: road.width, join: 'round', cap: 'round' });
  }
}

// Power grid (industrial era onward): straight transmission lines fanning from
// each civ's main city to its others, strung with pylons. By day a faint steel
// thread; by night the wires carry running pulses of electric light — the
// strongest visual tell that a civilization has industrialized.
interface PowerLine { a: { x: number; y: number }; b: { x: number; y: number } }
const powerLines: PowerLine[] = [];
let powerPulse = 0;

// Undersea cables: where a civ's coastal cities can't be reached overland, a
// submarine cable carries power and data across the seabed between them — a dim
// line with glints of traffic running along it.
interface Cable { a: { x: number; y: number }; b: { x: number; y: number }; color: number }
const cables: Cable[] = [];
let cablePulse = 0;
const CABLE_MAX_TILES = 34;
function rebuildCables() {
  cables.length = 0;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || ERA_RANK[civ.era] < 3 || civ.cities.length < 2) continue;
    // Anchor at the busiest coastal city.
    let hub: CivCity | null = null;
    for (const c of civ.cities) if (coastalWaterNear(c) && (!hub || c.prominence > hub.prominence)) hub = c;
    if (!hub) continue;
    for (const city of civ.cities) {
      if (city === hub || !coastalWaterNear(city)) continue;
      const d = Math.hypot(hub.row - city.row, hub.col - city.col);
      if (d < 10 || d > CABLE_MAX_TILES) continue;
      // The route must run mostly over open sea (a real crossing, not along a coast).
      const line = sampleLine(hub.row, hub.col, city.row, city.col);
      let water = 0;
      for (const t of line) if (biomeMap[t.row]?.[t.col] === 'water') water++;
      if (water < line.length * 0.5) continue;
      cables.push({ a: gridToScreen(hub.col, hub.row), b: gridToScreen(city.col, city.row), color: civ.color });
    }
  }
}
function drawCables(dt: number, night: number) {
  cableGfx.clear();
  if (cables.length === 0) return;
  cablePulse = (cablePulse + dt * 0.45) % 1;
  const glow = 0.22 + 0.78 * night;
  for (const c of cables) {
    const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y;
    cableGfx.moveTo(c.a.x, c.a.y).lineTo(c.b.x, c.b.y)
      .stroke({ color: 0x243845, alpha: 0.34, width: 1.3 }); // the cable on the seabed
    // Power (cyan) and data (teal) glints run the length of the cable.
    for (let k = 0; k < 4; k++) {
      const t = (cablePulse + k / 4) % 1;
      const px = c.a.x + dx * t, py = c.a.y + dy * t;
      const teal = k % 2 === 1;
      cableGfx.circle(px, py, 1.5).fill({ color: teal ? 0x7fffcf : 0x9fdcff, alpha: 0.45 * glow });
      cableGfx.circle(px, py, 0.7).fill({ color: 0xeaffff, alpha: 0.75 * glow });
    }
  }
}

// Lighthouses: a seafaring civ raises a beacon at its busiest harbour — a
// striped tower whose lamp sweeps the night sea.
interface Lighthouse { row: number; col: number; phase: number }
const lighthouses: Lighthouse[] = [];
function rebuildLighthouses() {
  lighthouses.length = 0;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || ERA_RANK[civ.era] < 1 || civ.cities.length === 0) continue;
    let best: CivCity | null = null;
    for (const c of civ.cities) if (coastalWaterNear(c) && (!best || c.prominence > best.prominence)) best = c;
    if (!best) continue;
    const w = coastalWaterNear(best)!;
    // Stand the tower on the headland — the LAND tile at the shore beside that
    // water, nearest the city — not out on the water itself.
    let land = { row: best.row, col: best.col };
    let bestD = Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = w.row + dr, c = w.col + dc;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
        if (biomeMap[r][c] === 'water') continue;
        const d = (r - best.row) ** 2 + (c - best.col) ** 2;
        if (d < bestD) { bestD = d; land = { row: r, col: c }; }
      }
    }
    lighthouses.push({ row: land.row, col: land.col, phase: (land.row * 7 + land.col * 13) % 100 });
  }
}
function drawLighthouses(nowSec: number, night: number) {
  lighthouseGfx.clear();
  if (lighthouses.length === 0) return;
  const S = 1.5; // unique landmark structures drawn 50% larger so they don't get lost
  for (const lh of lighthouses) {
    const { x, y } = gridToScreen(lh.col, lh.row);
    // A lamp beam sweeping the sea, at night — an iso-flattened cone.
    if (night > 0.08) {
      const ang = nowSec * 0.6 + lh.phase;
      const dx = Math.cos(ang), dy = Math.sin(ang) * 0.5;
      const lx = x, ly = y - 7 * S, bl = 52, hw = 6 * S;
      const ex = lx + dx * bl, ey = ly + dy * bl, px = -dy * hw, py = dx * hw;
      lighthouseGfx.poly([lx, ly, ex + px, ey + py, ex - px, ey - py]).fill({ color: 0xfff0c0, alpha: 0.13 * night });
    }
    // The tower: white with red bands and a dark lantern room.
    lighthouseGfx.poly([x - 1.6 * S, y, x + 1.6 * S, y, x + 1.1 * S, y - 7 * S, x - 1.1 * S, y - 7 * S]).fill({ color: 0xeef0f2, alpha: 0.95 });
    lighthouseGfx.rect(x - 1.4 * S, y - 2.6 * S, 2.8 * S, 1.3 * S).fill({ color: 0xc83828, alpha: 0.9 });
    lighthouseGfx.rect(x - 1.2 * S, y - 5.4 * S, 2.4 * S, 1.1 * S).fill({ color: 0xc83828, alpha: 0.9 });
    lighthouseGfx.rect(x - 1.1 * S, y - 8.4 * S, 2.2 * S, 1.6 * S).fill({ color: 0x3a3f48, alpha: 0.95 }); // lantern room
    // The lamp, blinking and brighter after dark.
    const bl2 = 0.5 + 0.5 * Math.sin(nowSec * 2.5 + lh.phase);
    const ng = Math.max(0.2, night);
    lighthouseGfx.circle(x, y - 7.6 * S, 2.4 * S).fill({ color: 0xfff4c8, alpha: 0.14 * ng * bl2 });
    lighthouseGfx.circle(x, y - 7.6 * S, 1.0 * S).fill({ color: 0xfffae0, alpha: (0.5 + 0.4 * ng) * bl2 });
  }
}

// --- Natural wonders: permanent, seed-placed land features (see naturalWonders.ts).
// Drawn as overlays on the terrain, rebuilt on reroll. The volcano is alive —
// it smokes always and erupts on a slow cycle, reusing the lava visual idiom.
let naturalWonders: NaturalWonder[] = [];
function rebuildNaturalWonders() {
  naturalWonders = placeNaturalWonders(biomeMap, elevationMap, currentSeed, rollCharacter(currentSeed).form);
}
// Hand the natural wonders to the sim: volcano locations (the sim owns the
// eruption cycle — timing, scarring, vitality) and every wonder's settlement
// pull (civs seek the blessed, flee the volcano). Called after the sim is built.
function syncSimWonders() {
  setVolcanoes(simWorld, naturalWonders.filter(w => w.kind === 'volcano').map(w => ({ row: w.row, col: w.col })));
  setWonderSites(simWorld, naturalWonders.map(w => ({
    row: w.row, col: w.col, pull: WONDER_PULL[w.kind], radius: WONDER_RADIUS[w.kind],
  })));
}
// Live-watch handle: inspect placements and force every volcano to erupt now.
(window as any).__wonders = {
  list: () => naturalWonders,
  erupt: () => eruptVolcanoesNow(simWorld),
};
// The eruption level the cone animates to is the SIM's intensity for the
// volcano at this tile (0 dormant .. 1 peak) — so the visual and the land-
// scarring are the same event, not two clocks.
function eruptionLevel(w: NaturalWonder): number {
  for (const v of simWorld.volcanoes) if (v.row === w.row && v.col === w.col) return v.intensity;
  return 0;
}
function drawNaturalWonders(nowSec: number, night: number) {
  natWonderWaterGfx.clear();
  natWonderGroundGfx.clear();
  natWonderGfx.clear();
  natWonderGlowGfx.clear();
  if (naturalWonders.length === 0) return;
  const ng = Math.max(0.18, night);
  for (const w of naturalWonders) {
    const { x, y } = gridToScreen(w.col, w.row);
    switch (w.kind) {
      case 'volcano':        drawVolcano(x, y, w, nowSec, ng, night); break;
      case 'crater_lake':    drawCraterLake(x, y, w, nowSec, ng); break;
      case 'monolith':       drawMonolith(x, y, w, ng); break;
      case 'rainbow_hills':  drawRainbowHills(x, y, w, nowSec, ng); break;
      case 'karst_spires':   drawKarstSpires(x, y, w, ng); break;
      case 'salt_flat':      drawSaltFlat(x, y, w, nowSec, ng); break;
      case 'atoll':          drawAtoll(x, y, w, ng); break;
      case 'canyon':         drawCanyon(x, y, w, ng); break;
      case 'dune_sea':       drawDuneSea(x, y, w, ng); break;
    }
  }
}
// --- Tile-aligned drawing, so wonders are built from the same diamonds as the
// terrain instead of floating on top as smooth decals. ---
const NW_TW = 32, NW_TH = 16;
function nwHash(row: number, col: number, salt: number): number {
  let h = (row * 73856093) ^ (col * 19349663) ^ (salt * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 0xffffffff; // 0..1
}
// One terrain tile, split into four triangles from the centre and shaded as if
// lit from the top-left — so a recoloured patch reads as faceted relief instead
// of a flat diamond block. `relief` is the light/shadow spread (0 ≈ flat, good
// for water; higher for rock/hills). `tris` is a 4-bit mask of which facets to
// draw (1=UL 2=UR 4=LR 8=LL); dropping facets at the rim lets the real terrain
// below show through, so the boundary interlocks with grass instead of stepping
// along whole tiles. A tiny per-tile tilt breaks up uniformity.
function nwTile(g: Graphics, row: number, col: number, color: number, relief = 0.12, alpha = 1, tris = 0b1111) {
  if (tris === 0) return;
  const { x, y } = gridToScreen(col, row);
  const hw = NW_TW / 2, hh = NW_TH / 2;
  const tilt = (nwHash(row, col, 21) - 0.5) * relief * 0.6; // slight random light lean
  const r = relief + tilt;
  const ul = lerpColor(color, 0xffffff, Math.max(0, r));
  const ur = lerpColor(color, 0xffffff, Math.max(0, r * 0.35));
  const ll = lerpColor(color, 0x000000, Math.max(0, r * 0.35));
  const lr = lerpColor(color, 0x000000, Math.max(0, r));
  if (tris & 1) g.poly([x, y, x - hw, y, x, y - hh]).fill({ color: ul, alpha }); // upper-left
  if (tris & 2) g.poly([x, y, x, y - hh, x + hw, y]).fill({ color: ur, alpha }); // upper-right
  if (tris & 4) g.poly([x, y, x + hw, y, x, y + hh]).fill({ color: lr, alpha }); // lower-right
  if (tris & 8) g.poly([x, y, x, y + hh, x - hw, y]).fill({ color: ll, alpha }); // lower-left
  if (tris === 0b1111) {
    g.poly([x, y - hh, x + hw, y, x, y + hh, x - hw, y])
      .stroke({ color: 0x000000, alpha: 0.05, width: 1 });
  }
}
// Lay a blobby, ragged-edged patch of retinted tiles centred on a wonder. The
// per-tile callback returns the fill (or null to skip), so each wonder paints
// its own bands/water. radius is in tiles; the rim is eroded by a hash so the
// border never reads as a clean ellipse.
function nwFootprint(
  g: Graphics, center: NaturalWonder, radius: number,
  fill: (dr: number, dc: number, dist: number, edge: number) => number | null,
  relief = 0.12, softEdge = true, round = false,
) {
  // `round`: measure distance in SCREEN space so the patch is a true circle on
  // the isometric grid, not a diamond. (sx,sy) here are the tile's screen offset
  // in tile-width units — equal weighting → round outline.
  const R = round ? Math.ceil(radius) + 2 : Math.ceil(radius) + 1;
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -R; dc <= R; dc++) {
      const rr = center.row + dr, cc = center.col + dc;
      if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) continue;
      const dist = round ? Math.hypot(dc - dr, (dc + dr) * 0.5) : Math.hypot(dr, dc);
      if (dist > radius + 1.1) continue;
      const c = fill(dr, dc, dist, Math.max(0, (dist - (radius - 1.1)) / 1.7));
      if (c == null) continue;
      let tris = 0b1111;
      if (softEdge) {
        // Ragged rim at the FACET level: each of the four triangles survives
        // only if its hash beats the edge factor, so the outline frays into the
        // surrounding terrain (which shows through the dropped facets).
        const edge = (dist - (radius - 1.2)) / 1.7; // <=0 core, →~1 at the rim
        if (edge > 0) {
          tris = 0;
          for (let t = 0; t < 4; t++) if (nwHash(rr, cc, 41 + t) > edge * 1.05) tris |= 1 << t;
        }
      }
      nwTile(g, rr, cc, c, relief, 1, tris);
    }
  }
}
// A soft contact shadow so raised forms sit on the ground instead of floating.
function nwShadow(g: Graphics, x: number, y: number, rx: number) {
  g.ellipse(x + rx * 0.18, y + 1.5, rx, rx * 0.42).fill({ color: 0x2a2a22, alpha: 0.16 });
}
// A single rocky peak — a ridged triangle, lit on the left, shadowed on the
// right, with a pale rock cap. Used to build a massif around the volcano so it
// reads as sitting *in* a mountain range, not alone on a plain.
function nwPeak(g: Graphics, px: number, py: number, h: number, halfW: number, tint: number) {
  const base = lerpColor(0x7d756a, tint, 0.35);
  // Body.
  g.poly([px - halfW, py, px + halfW, py, px, py - h]).fill({ color: base, alpha: 0.97 });
  // Shadowed right face.
  g.poly([px, py - h, px + halfW, py, px + halfW * 0.2, py]).fill({ color: lerpColor(base, 0x000000, 0.28), alpha: 0.9 });
  // Sunlit left edge + a few rock crags.
  g.poly([px - halfW, py, px, py - h, px - halfW * 0.35, py]).fill({ color: lerpColor(base, 0xffffff, 0.22), alpha: 0.85 });
  g.poly([px, py - h, px - halfW * 0.18, py - h * 0.45, px + halfW * 0.16, py - h * 0.5]).fill({ color: lerpColor(base, 0xffffff, 0.32), alpha: 0.7 }); // cap
}

// A dark basalt cone with a crater. Always wisps smoke and glows faintly at
// night; on the eruption cycle it throws a lava fountain, a thick ash plume,
// ember sparks, and a strong heat-glow.
function drawVolcano(x: number, y: number, w: NaturalWonder, nowSec: number, ng: number, night: number) {
  const S = 1.9;
  const H = 15 * S, rimW = 6.5 * S, baseW = 12 * S;
  const erupt = eruptionLevel(w);
  const craterY = y - H;
  // Tiled base: a patch of scorched dark rock the cone rises from, so it reads
  // as part of the mountain rather than a shape pasted on the grass.
  nwFootprint(natWonderGroundGfx, w, 3.1, (_dr, _dc, dist) => {
    const t = dist / 3.3;
    return lerpColor(0x4a4038, 0x6a5e52, t * 0.8 + nwHash(w.row + _dr, w.col + _dc, 4) * 0.2);
  }, 0.18, true, true);
  nwShadow(natWonderGfx, x, y, baseW);
  // Back peaks: a couple of rock summits set behind the cone, so the volcano
  // rises from within a ridge. Drawn first → the cone overlaps and sits among them.
  const ph = w.phase;
  nwPeak(natWonderGfx, x - baseW * 1.05, y - 6, H * (0.62 + 0.08 * Math.sin(ph)), baseW * 0.55, 0x6a6258);
  nwPeak(natWonderGfx, x + baseW * 0.95, y - 9, H * (0.7 + 0.08 * Math.cos(ph)), baseW * 0.5, 0x756c60);
  nwPeak(natWonderGfx, x + baseW * 0.2, y - 13, H * 0.5, baseW * 0.4, 0x70685c);
  // Body: a trapezoid cone, dark basalt with a sunlit left flank.
  natWonderGfx.poly([x - baseW, y, x + baseW, y, x + rimW, craterY, x - rimW, craterY])
    .fill({ color: 0x4a4038, alpha: 0.97 });
  natWonderGfx.poly([x - baseW, y, x - rimW, craterY, x - rimW * 0.4, craterY, x - baseW * 0.45, y])
    .fill({ color: 0x5c5046, alpha: 0.6 }); // sunlit flank
  // A few ridges down the flanks break up the flat fill.
  for (const rx of [-0.55, -0.15, 0.3, 0.65]) {
    natWonderGfx.poly([x + rx * baseW, y, x + rx * baseW * 0.55, craterY, x + (rx * baseW * 0.55 + 1.5), craterY, x + rx * baseW + 2, y])
      .fill({ color: 0x3c332c, alpha: 0.3 });
  }
  // Crater lip.
  natWonderGfx.ellipse(x, craterY, rimW, rimW * 0.34).fill({ color: 0x352c26, alpha: 0.95 });
  natWonderGfx.ellipse(x, craterY, rimW * 0.7, rimW * 0.24).fill({ color: 0x241c18, alpha: 0.9 });
  // Resting glow in the crater, brighter at night and during eruption.
  const restGlow = 0.10 + 0.06 * Math.sin(nowSec * 1.3 + w.phase);
  natWonderGlowGfx.ellipse(x, craterY, rimW * 0.6, rimW * 0.2)
    .fill({ color: 0xff5a22, alpha: (restGlow * ng + erupt * 0.7) });
  // Smoke / ash plume — always a thin wisp, thick and dark during eruption.
  const plumeCount = 5 + Math.floor(erupt * 7);
  for (let i = 0; i < plumeCount; i++) {
    const t = ((nowSec * (0.22 + 0.04 * erupt) + i / plumeCount + w.phase) % 1);
    const rise = t * (38 + 46 * erupt) * S * 0.5;
    const drift = Math.sin(nowSec * 0.5 + i * 1.7 + w.phase) * (5 + 8 * t) * S * 0.4;
    const pr = (2.2 + t * 6 + erupt * 4) * S * 0.5;
    const pa = (1 - t) * (0.18 + 0.32 * erupt);
    const col = lerpColor(0x6b6258, 0x2a2420, erupt); // pale rest smoke → dark ash
    natWonderGfx.circle(x + drift, craterY - rise, pr).fill({ color: col, alpha: pa });
  }
  // Eruption: a bright lava fountain and ember sparks bursting from the crater.
  if (erupt > 0.02) {
    natWonderGlowGfx.ellipse(x, craterY, rimW * 1.3, rimW * 0.5)
      .fill({ color: 0xff7a30, alpha: 0.35 * erupt });
    const sparks = Math.floor(erupt * 14);
    for (let i = 0; i < sparks; i++) {
      const a = (i / sparks) * Math.PI - Math.PI / 2 + Math.sin(nowSec * 2 + i) * 0.2;
      const sp = ((nowSec * 1.6 + i * 0.37) % 1);
      const dist = sp * (20 + 14 * erupt) * S * 0.4;
      const ex = x + Math.cos(a) * dist * 0.7;
      const ey = craterY - Math.abs(Math.sin(a)) * dist - sp * 4 * S + sp * sp * 9 * S; // arc up then fall
      natWonderGlowGfx.circle(ex, ey, (1 - sp) * 1.6 * S * 0.6 + 0.5)
        .fill({ color: lerpColor(0xffd060, 0xff4010, sp), alpha: (1 - sp) * 0.9 * erupt });
    }
    // Lava tongues creeping down the flanks at peak.
    if (erupt > 0.4) {
      for (const side of [-1, 1]) {
        const lx = x + side * rimW * 0.5;
        natWonderGfx.poly([lx, craterY + 2, lx + side * 2, y - 2, lx + side * 4, y, lx - side, craterY + 4])
          .fill({ color: lerpColor(0xff5a18, 0x7a1c08, 0.3), alpha: 0.7 * erupt });
        natWonderGlowGfx.poly([lx, craterY + 2, lx + side * 2, y - 2, lx + side * 4, y, lx - side, craterY + 4])
          .fill({ color: 0xff8030, alpha: 0.4 * erupt });
      }
    }
  }
  // Front peaks: lower on screen (nearer the viewer), drawn last so they
  // occlude the cone's base — the volcano nestles between foreground ridges.
  nwPeak(natWonderGfx, x - baseW * 0.72, y + 5, H * (0.5 + 0.07 * Math.cos(ph * 1.3)), baseW * 0.6, 0x827a6c);
  nwPeak(natWonderGfx, x + baseW * 0.82, y + 7, H * (0.56 + 0.07 * Math.sin(ph * 1.1)), baseW * 0.62, 0x8a8274);
  void night;
}
// A round caldera lake: deep blue water on the ground, ringed by a pale rock rim
// that stands a little above it.
function drawCraterLake(x: number, y: number, w: NaturalWonder, nowSec: number, ng: number) {
  // Rock rim: a ring of pale-stone tiles that frays into the surrounding ground
  // (soft facet edge), giving the caldera an irregular outline.
  nwFootprint(natWonderGroundGfx, w, 3.9, (dr, dc, dist) => {
    if (dist < 2.3) return null; // hollow centre — the water fills it below
    return lerpColor(0x9c9286, 0xbfb8ae, nwHash(w.row + dr, w.col + dc, 6));
  }, 0.2, true, true);
  // Water: flat (un-faceted) lake tiles on the sub-glitter layer, so the sun
  // glitter band sweeps across it like the open sea. Deep centre → lighter rim,
  // matching the ocean's shore-to-deep gradient but a touch darker.
  nwFootprint(natWonderWaterGfx, w, 2.55, (_dr, _dc, dist) =>
    lerpColor(0x4f93ad, 0x7fb2c8, Math.min(1, dist / 2.6)), 0, false, true);
  void x; void y; void nowSec; void ng;
}
// A lone red sandstone monolith — a long, rounded block sitting on arid flats.
function drawMonolith(x: number, y: number, w: NaturalWonder, ng: number) {
  const S = 1.8;
  const wdt = 9 * S, hgt = 6.5 * S;
  // Tiled apron of rust-red dirt the rock rises from, so its colour belongs to
  // the ground around it rather than appearing from nowhere.
  nwFootprint(natWonderGroundGfx, w, 2.2, (dr, dc, dist) =>
    lerpColor(0xc69a72, 0xb08258, dist / 2.4 + nwHash(w.row + dr, w.col + dc, 8) * 0.25), 0.16, true, true);
  nwShadow(natWonderGfx, x, y, wdt);
  // Muted terracotta mass (toward the sandy palette, not a fire-engine red).
  const body = 0xab6a44, top = 0xc08a5e, dark = 0x83492c;
  natWonderGfx.poly([
    x - wdt, y, x - wdt, y - hgt * 0.5, x - wdt * 0.7, y - hgt,
    x + wdt * 0.7, y - hgt, x + wdt, y - hgt * 0.5, x + wdt, y,
  ]).fill({ color: body, alpha: 0.98 });
  // Sunlit top facet and a shaded right face for volume.
  natWonderGfx.poly([x - wdt * 0.7, y - hgt, x + wdt * 0.7, y - hgt, x + wdt, y - hgt * 0.5, x - wdt, y - hgt * 0.5])
    .fill({ color: top, alpha: 0.6 });
  natWonderGfx.poly([x + wdt * 0.7, y - hgt, x + wdt, y - hgt * 0.5, x + wdt, y, x + wdt * 0.6, y])
    .fill({ color: dark, alpha: 0.55 });
  // Vertical weathering grooves.
  for (const gx of [-0.5, 0.1, 0.55]) {
    natWonderGfx.rect(x + gx * wdt, y - hgt * 0.85, 0.6 * S, hgt * 0.8).fill({ color: dark, alpha: 0.32 });
  }
  void ng;
}
// Banded mineral hills: low rounded hills striped in dusty mineral colours,
// raised off the ground so they read as relief, not a flat orange patch.
const RH_BANDS = [0xb87a5a, 0xcf9468, 0xddb37e, 0xe6cf9e, 0xd8b488];
function rhBand(dr: number, dc: number): number {
  // Wide (~2-tile) diagonal bands instead of a 1-tile checker.
  const i = ((Math.floor((dc - dr + 40) / 2)) % RH_BANDS.length + RH_BANDS.length) % RH_BANDS.length;
  return RH_BANDS[i];
}
function drawRainbowHills(x: number, y: number, w: NaturalWonder, nowSec: number, ng: number) {
  // Faceted, banded ground (higher relief so the stripes catch the light).
  nwFootprint(natWonderGroundGfx, w, 3.9, (dr, dc) => {
    const v = nwHash(w.row + dr, w.col + dc, 9) * 0.10 - 0.05;
    return lerpColor(rhBand(dr, dc), 0xffffff, Math.max(0, v));
  }, 0.16, true, true);
  // A scatter of low rounded hills rising from the bands, each coloured by the
  // band it sits on, shaded top-lit, sorted back-to-front so they overlap.
  const mounds: Array<{ mx: number; my: number; r: number; h: number; col: number }> = [];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (nwHash(w.row + dr * 3, w.col + dc * 3, 31) > 0.45) continue; // sparse
      const s = gridToScreen(w.col + dc, w.row + dr);
      const r = 6 + nwHash(w.row + dr, w.col + dc, 32) * 5;
      const h = 4 + nwHash(w.row + dr, w.col + dc, 33) * 5;
      mounds.push({ mx: s.x, my: s.y, r, h, col: rhBand(dr, dc) });
    }
  }
  mounds.sort((a, b) => a.my - b.my);
  for (const m of mounds) {
    natWonderGfx.ellipse(m.mx + 1, m.my + 1, m.r, m.r * 0.4).fill({ color: 0x000000, alpha: 0.08 }); // contact
    const N = 12, pts: number[] = [];
    for (let i = 0; i <= N; i++) { const a = Math.PI * (i / N); pts.push(m.mx - Math.cos(a) * m.r, m.my - Math.sin(a) * m.h); }
    pts.push(m.mx + m.r, m.my, m.mx - m.r, m.my);
    natWonderGfx.poly(pts).fill({ color: lerpColor(m.col, 0x000000, 0.06), alpha: 0.97 }); // body
    // Sunlit top-left cap.
    natWonderGfx.ellipse(m.mx - m.r * 0.3, m.my - m.h * 0.62, m.r * 0.5, m.h * 0.45)
      .fill({ color: lerpColor(m.col, 0xffffff, 0.22), alpha: 0.8 });
  }
  void nowSec; void x; void y; void ng;
}
// Vertical limestone towers rising from coastal water — a stone fleet.
function drawKarstSpires(x: number, y: number, w: NaturalWonder, ng: number) {
  const S = 2.0;
  // A few towers of varying height and offset, deterministic from phase.
  const spires = [
    [-7, 0, 13], [-2, 2, 18], [3, -1, 15], [7, 1, 11], [0, 3, 9],
  ];
  for (let i = 0; i < spires.length; i++) {
    const [dx, dy, h0] = spires[i];
    const sx = x + dx * S, sy = y + dy * S * 0.5;
    const h = h0 * S * (0.9 + 0.2 * Math.sin(w.phase + i));
    const halfW = 2.0 * S;
    // Tower: slightly bulging column, rounded top.
    natWonderGfx.poly([sx - halfW, sy, sx + halfW, sy, sx + halfW * 0.7, sy - h * 0.8, sx - halfW * 0.7, sy - h * 0.8])
      .fill({ color: 0x6f7a66, alpha: 0.95 });
    natWonderGfx.ellipse(sx, sy - h * 0.8, halfW * 0.7, halfW * 0.5).fill({ color: 0x7d886f, alpha: 0.95 });
    // Sunlit left edge + a darker waterline.
    natWonderGfx.poly([sx - halfW, sy, sx - halfW * 0.7, sy - h * 0.8, sx - halfW * 0.3, sy - h * 0.8, sx - halfW * 0.5, sy])
      .fill({ color: 0x90997f, alpha: 0.5 });
    natWonderGfx.ellipse(sx, sy, halfW, halfW * 0.4).fill({ color: 0x33403a, alpha: 0.35 });
  }
  void ng;
}
// A flat mineral lake — pale rose crust with a faint shimmer.
// A reef ring in open water: a pale sand-and-coral rim enclosing a shallow
// lagoon. Structurally a crater lake turned inside out and moved out to sea —
// same ring-and-water idiom, but flat, bright, and tropical rather than stone.
function drawAtoll(x: number, y: number, w: NaturalWonder, ng: number) {
  // The reef: a broken ring, paler where it breaks the surface.
  nwFootprint(natWonderGroundGfx, w, 3.4, (dr, dc, dist) => {
    if (dist < 2.0) return null;              // hollow: the lagoon fills it
    const h = nwHash(w.row + dr, w.col + dc, 12);
    if (h < 0.22) return null;                // gaps where the sea breaks through
    return lerpColor(0xe6d7ac, 0xf2e9cf, h);
  }, 0.05, true, true);
  // Lagoon: bright shallow water, palest at the centre where it is shallowest —
  // the opposite gradient to the open sea, which is what makes it read as a
  // lagoon rather than a hole in the map.
  nwFootprint(natWonderWaterGfx, w, 2.25, (_dr, _dc, dist) =>
    lerpColor(0x8fe0d8, 0x5fc0c4, Math.min(1, dist / 2.4)), 0, false, true);
  void x; void y; void ng;
}

// A gorge cut through high country: a winding floor in shadow between two pale
// rims. The course is a sine of the wonder's own phase, so every canyon bends
// differently, and it is drawn as ground rather than as a raised form — the
// land here is missing, not added.
function drawCanyon(x: number, y: number, w: NaturalWonder, ng: number) {
  const bend = 3.2, wind = 0.42;
  nwFootprint(natWonderGroundGfx, w, 6, (dr, dc, dist) => {
    // A gorge is cut into ground; where the footprint reaches the sea it simply
    // stops, rather than painting rock over water.
    if (biomeMap[w.row + dr]?.[w.col + dc] === 'water') return null;
    const course = Math.sin(dr * wind + w.phase) * bend;   // the gorge's centreline
    const off = Math.abs(dc - course);
    const ragged = nwHash(w.row + dr, w.col + dc, 17) * 0.9;
    if (off < 1.1 + ragged * 0.5) {
      // Floor: deep shadow, darkest at the middle of the cut.
      return lerpColor(0x4a3f36, 0x6b5c4d, off / 1.8);
    }
    if (off < 2.6 + ragged) {
      // Rim: sunlit stone breaking away at the lip.
      return lerpColor(0xb3a692, 0x8e806d, (off - 1.1) / 1.9 + ragged * 0.2);
    }
    void dist;
    return null;
  }, 0.26, true, false);
  void x; void y; void ng;
}

// A sand sea: long wind-driven ridges marching across dry country. Bands run at
// an angle to the grid so they read as dunes rather than as stripes on tiles.
function drawDuneSea(x: number, y: number, w: NaturalWonder, ng: number) {
  nwFootprint(natWonderGroundGfx, w, 6.5, (dr, dc, dist, edge) => {
    if (biomeMap[w.row + dr]?.[w.col + dc] === 'water') return null;   // sand stops at the shore
    const ridge = Math.sin((dc * 0.9 + dr * 0.5) + Math.sin(dr * 0.18) * 1.4 + w.phase);
    const lit = 0.5 + ridge * 0.5;            // crest lit, trough shaded
    if (edge > 0.85) return null;
    void dist;
    return lerpColor(0xcbb083, 0xf0e0b6, lit * 0.85 + nwHash(w.row + dr, w.col + dc, 23) * 0.15);
  }, 0.1, true, true);
  void x; void y; void ng;
}

function drawSaltFlat(x: number, y: number, w: NaturalWonder, nowSec: number, ng: number) {
  // A small, round, dusty mineral pan — a whisper of rose over cream, not hot
  // pink, so it reads as a drying salt basin rather than a sticker.
  nwFootprint(natWonderGroundGfx, w, 2.3, (dr, dc, dist) => {
    const t = Math.min(1, dist / 2.3);
    // Faint pink core fading to a salt-white crust at the rim.
    const base = lerpColor(0xe7cdc9, 0xf2e6df, t);
    const v = nwHash(w.row + dr, w.col + dc, 7) * 0.10 - 0.05;
    return lerpColor(base, 0xffffff, Math.max(0, v));
  }, 0.05, true, true);
  void nowSec; void w; void x; void y; void ng;
}

// Rivers come alive: little barges drift downstream to the sea, and bridges
// span the rivers where roads cross them.
interface RiverBoat { pts: Array<{ x: number; y: number }>; idx: number; speed: number; fade: number }
const riverBoats: RiverBoat[] = [];
const riverBridges: number[] = []; // grid tile keys where a road crosses a river
function rebuildBridges() {
  riverBridges.length = 0;
  if (riverTileSet.size === 0) return;
  const seen = new Set<number>();
  for (const ek of landTrail.keys()) {
    const ka = (ek / TRAIL_N) | 0, kb = ek % TRAIL_N;
    if (riverTileSet.has(ka) && !seen.has(ka)) { seen.add(ka); riverBridges.push(ka); }
    if (riverTileSet.has(kb) && !seen.has(kb)) { seen.add(kb); riverBridges.push(kb); }
  }
}
// A river is worth plying only if its course passes near a settlement — empty
// wilderness rivers carry no barges.
function riverNearBuilding(rp: { tiles: Array<{ row: number; col: number }> }): boolean {
  for (const { row, col } of rp.tiles) {
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      if (simWorld.tiles[r][c].state === 'built') return true;
    }
  }
  return false;
}
function maybeSpawnRiverBoats() {
  if (riverPaths.length === 0 || riverBoats.length >= 8 || Math.random() > 0.35) return;
  const rp = riverPaths[Math.floor(Math.random() * riverPaths.length)];
  if (rp.screen.length < 8 || !riverNearBuilding(rp)) return; // no barges on uninhabited rivers
  riverBoats.push({ pts: rp.screen, idx: 1 + Math.random() * 2, speed: 2.5 + Math.random() * 1.5, fade: 1 });
}
function updateRiverCraft(dt: number, night: number) {
  riverCraftGfx.clear();
  // Bridges: a short plank deck across the river at each road crossing.
  for (const key of riverBridges) {
    const r = (key / GRID_SIZE) | 0, c = key % GRID_SIZE;
    const { x, y } = gridToScreen(c, r);
    riverCraftGfx.poly([x - 7, y - 2, x + 7, y - 2, x + 7, y, x - 7, y]).fill({ color: 0x6a5238, alpha: 0.9 }); // deck
    riverCraftGfx.rect(x - 6, y - 1, 1, 3).fill({ color: 0x4a3a28, alpha: 0.8 }); // posts
    riverCraftGfx.rect(x + 5, y - 1, 1, 3).fill({ color: 0x4a3a28, alpha: 0.8 });
  }
  // Barges drifting down to the sea.
  for (let i = riverBoats.length - 1; i >= 0; i--) {
    const b = riverBoats[i];
    const last = b.pts.length - 1;
    if (b.fade >= 1) { b.idx += b.speed * dt; if (b.idx >= last) { b.idx = last; b.fade = 0.999; } }
    else { b.fade -= dt / 1.2; if (b.fade <= 0) { riverBoats.splice(i, 1); continue; } }
    const k = Math.min(Math.floor(b.idx), last - 1), u = Math.min(1, b.idx - k);
    const x = b.pts[k].x + (b.pts[k + 1].x - b.pts[k].x) * u;
    const y = b.pts[k].y + (b.pts[k + 1].y - b.pts[k].y) * u;
    let fx = b.pts[k + 1].x - b.pts[k].x, fy = b.pts[k + 1].y - b.pts[k].y;
    const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    const rx = -fy, ry = fx, op = Math.min(1, b.fade);
    // a small flat barge with a little cargo
    riverCraftGfx.poly([x + fx * 3, y + fy * 3, x + rx * 1.5, y + ry * 1.5, x - fx * 3, y - fy * 3, x - rx * 1.5, y - ry * 1.5])
      .fill({ color: 0x6a513a, alpha: 0.92 * op });
    riverCraftGfx.rect(x - 1, y - 1.6, 2, 1.6).fill({ color: 0x8a6a44, alpha: 0.9 * op }); // cargo
    if (night > 0.3) riverCraftGfx.circle(x + fx * 3, y + fy * 3, 0.6).fill({ color: 0xffe6a8, alpha: 0.7 * night * op }); // bow lamp
  }
}

// Wildfires: a forest catches and the blaze spreads tile by tile through the
// wild woods, glowing at night, then burns out to grassland that the breathing
// land slowly reforests.
interface FireTile { row: number; col: number; t: number; spread: boolean; wasForest: boolean }
const fires: FireTile[] = [];
const FIRE_BURN = 5;            // seconds a tile burns
const FIRE_CAP = 140;          // max tiles alight at once
const FIRE_IGNITE_MEAN = 55;   // avg seconds between fresh wildfires
const FIRE_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];
function flammable(r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  const st = simWorld.tiles[r][c].state;
  if (st !== 'wild' && st !== 'ruin') return false; // only the wilds burn, not towns/farms
  const b = biomeMap[r][c];
  return b === 'forest' || b === 'grass' || b === 'fertile';
}
function igniteTile(r: number, c: number) {
  if (fires.length >= FIRE_CAP || !flammable(r, c)) return;
  if (fires.some((f) => f.row === r && f.col === c)) return;
  fires.push({ row: r, col: c, t: 0, spread: false, wasForest: biomeMap[r][c] === 'forest' });
}
function updateFires(dt: number, nowSec: number, night: number) {
  // A new fire breaks out now and then, on a random patch of wild forest.
  if (fires.length === 0 && Math.random() < (dt / FIRE_IGNITE_MEAN) * characterOf(simWorld).fire) {
    for (let tries = 0; tries < 24; tries++) {
      const r = (Math.random() * GRID_SIZE) | 0, c = (Math.random() * GRID_SIZE) | 0;
      if (biomeMap[r][c] === 'forest' && simWorld.tiles[r][c].state === 'wild') { igniteTile(r, c); break; }
    }
  }
  fireGfx.clear();
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i];
    f.t += dt;
    // Partway through, the fire leaps to neighbouring fuel.
    if (!f.spread && f.t > FIRE_BURN * 0.4) {
      f.spread = true;
      for (const [dr, dc] of FIRE_DIRS) {
        const nr = f.row + dr, nc = f.col + dc;
        if (!flammable(nr, nc)) continue;
        const p = biomeMap[nr][nc] === 'forest' ? 0.5 : 0.16; // forests carry fire; grass less so
        if (Math.random() < p) igniteTile(nr, nc);
      }
    }
    if (f.t >= FIRE_BURN) {
      if (f.wasForest && biomeMap[f.row][f.col] === 'forest') { biomeMap[f.row][f.col] = 'grass'; enrollBiomeTrans(f.row, f.col); } // burned to grassland
      fires.splice(i, 1); continue;
    }
    // Flames, embers and a glow that reads strongly at night.
    const { x, y } = gridToScreen(f.col, f.row);
    const env = Math.sin(Math.PI * Math.min(1, f.t / FIRE_BURN * 1.25)); // grow then die down
    const flick = 0.7 + 0.3 * Math.sin(nowSec * 12 + f.row * 3 + f.col * 5);
    const size = (2.5 + env * 3.5) * flick;
    fireGfx.circle(x, y - 2, size * 2.6).fill({ color: 0xff5a14, alpha: (0.05 + 0.16 * night) * env }); // glow
    for (let k = 0; k < 3; k++) {
      const ox = (k - 1) * 2.3 * flick, fy = -(size + Math.sin(nowSec * 10 + k + f.col) * 1.4);
      fireGfx.poly([x + ox, y + fy, x + ox - 1.5, y, x + ox + 1.5, y]).fill({ color: k === 1 ? 0xffd24a : 0xff7a22, alpha: 0.8 * env });
    }
    fireGfx.poly([x, y - (size + 1.5), x - 1.8, y, x + 1.8, y]).fill({ color: 0xffe879, alpha: 0.7 * env }); // bright core
  }
}

// Volcanoes: a mountain's vent opens, fountaining fire and ash; lava creeps
// downhill tile by tile and cools into fresh black rock. Where a flow reaches
// the sea it solidifies into new land — over deep time, headlands and islands.
interface LavaTile { row: number; col: number; t: number; spread: boolean; sea: boolean }
interface Volcano { row: number; col: number; t: number; lava: LavaTile[] }
const volcanoes: Volcano[] = [];
const VOLCANO_LIFE = 16;      // seconds the vent fountains
const VOLCANO_MEAN = 150;     // avg seconds between eruptions
const LAVA_CAP = 80;          // max molten tiles per volcano
const LAVA_FLOW = 1.4;        // seconds before a flow creeps to the next tile
const LAVA_COOL_LAND = 5;     // seconds a land flow glows before hardening
const LAVA_COOL_SEA = 2.4;    // sea flows quench and harden faster
function lavaFlowable(r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  const st = simWorld.tiles[r][c].state;
  return st === 'wild' || st === 'ruin'; // through the wilds and (below) the sea — never over towns or fields
}
function addLava(v: Volcano, r: number, c: number) {
  if (v.lava.length >= LAVA_CAP) return;
  if (v.lava.some((l) => l.row === r && l.col === c)) return;
  const sea = biomeMap[r][c] === 'water';
  if (!sea && !lavaFlowable(r, c)) return;
  v.lava.push({ row: r, col: c, t: 0, spread: false, sea });
}
function hardenLava(l: LavaTile) {
  // Molten rock freezes to fresh dark rock; a sea flow becomes new land.
  if (l.sea) elevationMap[l.row][l.col] = SEA_LEVEL + 0.22;
  biomeMap[l.row][l.col] = 'rock';
  enrollBiomeTrans(l.row, l.col);
}
function maybeEruptVolcano(dt: number) {
  if (volcanoes.length > 0 || Math.random() >= (dt / VOLCANO_MEAN) * characterOf(simWorld).volcano) return;
  // Vents open on high, wild rock — a mountain summit.
  let best = -1, bestR = 0, bestC = 0;
  for (let tries = 0; tries < 40; tries++) {
    const r = (Math.random() * GRID_SIZE) | 0, c = (Math.random() * GRID_SIZE) | 0;
    if (biomeMap[r][c] !== 'rock' || simWorld.tiles[r][c].state !== 'wild') continue;
    if (elevationMap[r][c] > best) { best = elevationMap[r][c]; bestR = r; bestC = c; }
  }
  if (best < 0) return;
  volcanoes.push({ row: bestR, col: bestC, t: 0, lava: [] });
  triggerPing(bestR, bestC, 0xff7a30);
}
function updateVolcanoes(dt: number, nowSec: number, night: number) {
  lavaGfx.clear();
  lavaGlowGfx.clear();
  for (let vi = volcanoes.length - 1; vi >= 0; vi--) {
    const v = volcanoes[vi];
    v.t += dt;
    const erupting = v.t < VOLCANO_LIFE;
    // The vent keeps feeding lava onto its own slope while it's active.
    if (erupting && Math.random() < dt * 3) addLava(v, v.row, v.col);
    // Flows creep downhill and cool.
    for (let i = v.lava.length - 1; i >= 0; i--) {
      const l = v.lava[i];
      l.t += dt;
      if (!l.spread && l.t > LAVA_FLOW) {
        l.spread = true;
        // Find the lowest downhill neighbours and send lava that way.
        const e = elevationMap[l.row][l.col];
        const opts: Array<{ r: number; c: number; e: number }> = [];
        for (const [dr, dc] of FIRE_DIRS) {
          const nr = l.row + dr, nc = l.col + dc;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
          const ne = elevationMap[nr][nc];
          if (ne > e + 0.01) continue; // lava only runs downhill
          if (biomeMap[nr][nc] !== 'water' && !lavaFlowable(nr, nc)) continue;
          opts.push({ r: nr, c: nc, e: ne });
        }
        opts.sort((a, b) => a.e - b.e);
        for (let k = 0; k < Math.min(2, opts.length); k++) addLava(v, opts[k].r, opts[k].c);
      }
      const cool = l.sea ? LAVA_COOL_SEA : LAVA_COOL_LAND;
      if (l.t >= cool) { hardenLava(l); v.lava.splice(i, 1); continue; }
      // Draw the molten tile: a glowing diamond, dimming as it cools.
      const heat = 1 - l.t / cool;
      const { x, y } = gridToScreen(l.col, l.row);
      const body = lerpColor(0x6a1408, 0xff8a18, heat * heat);
      lavaGfx.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y]).fill({ color: body, alpha: 0.6 + 0.38 * heat });
      const flick = 0.75 + 0.25 * Math.sin(nowSec * 9 + l.row * 3 + l.col * 5);
      lavaGlowGfx.circle(x, y - 1, (6 + 6 * heat) * flick).fill({ color: 0xff5a14, alpha: (0.12 + 0.22 * night) * heat });
      if (l.sea && heat > 0.5) { // steam where lava meets the sea
        lavaGfx.circle(x + Math.sin(nowSec * 2 + l.col) * 2, y - 3 - (nowSec * 6 % 5), 2).fill({ color: 0xe8eef2, alpha: 0.16 });
      }
    }
    // The vent: a fire fountain and a rising ash column while active, then fades.
    const { x: vx, y: vy } = gridToScreen(v.col, v.row);
    const ventEnv = erupting ? 1 : Math.max(0, 1 - (v.t - VOLCANO_LIFE) / 3);
    if (ventEnv > 0) {
      // Ash plume: a continuous grey column rising and drifting on the wind.
      for (let k = 0; k < 9; k++) {
        const up = (k * 7 + (nowSec * 14) % 7);
        const py = vy - 4 - up;
        const pr = 2 + k * 0.9;
        lavaGfx.circle(vx + Math.sin(nowSec + k) * (1 + k * 0.5) + k * 0.6, py, pr)
          .fill({ color: lerpColor(0x4a4540, 0x2a2622, k / 9), alpha: 0.22 * ventEnv * (1 - k / 11) });
      }
      // Fire fountain at the lip.
      const f = 0.7 + 0.3 * Math.sin(nowSec * 16 + v.col);
      lavaGlowGfx.circle(vx, vy - 2, 9 * f).fill({ color: 0xff6a18, alpha: 0.3 * ventEnv });
      for (let k = 0; k < 4; k++) {
        const a = nowSec * 6 + k * 1.7, sp = (a % 1);
        lavaGlowGfx.circle(vx + Math.cos(a) * 5 * sp, vy - 4 - sp * 10 * f, 1.4 * (1 - sp))
          .fill({ color: 0xffd24a, alpha: 0.8 * ventEnv * (1 - sp) });
      }
      lavaGlowGfx.poly([vx, vy - 6 * f, vx - 2, vy, vx + 2, vy]).fill({ color: 0xffe879, alpha: 0.7 * ventEnv });
    }
    // Eruption over and the last flow hardened — remove the volcano.
    if (!erupting && v.lava.length === 0 && ventEnv <= 0) volcanoes.splice(vi, 1);
  }
}

// Plagues: a sickness breaks out in a city and a miasma spreads district to
// district across the civ, dimming the streets it touches. Most quarters pull
// through and brighten again; the worst-hit collapse, building by building,
// into ruin. Civilizations as weather — a fever that passes over the land.
interface PlagueTile { row: number; col: number; born: number; fate: 'recover' | 'ruin'; ruined: boolean }
interface Plague { civId: number; era: Era; capR: number; capC: number; born: number; lastSpread: number; frontier: number[]; afflicted: Map<number, PlagueTile>; ruinsLeft: number }
const plagues: Plague[] = [];
const PLAGUE_MEAN = 135;     // avg seconds between outbreaks
const PLAGUE_SPAN = 28;      // seconds from outbreak until the fever has passed
const PLAGUE_SPREAD = 0.22;  // seconds between contagion rings
const PLAGUE_FADE = 1.6;     // seconds a district takes to darken / recover
function plagueOwns(p: Plague, r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  if (simWorld.tiles[r][c].civId !== p.civId) return false;
  const st = simWorld.tiles[r][c].state;
  return st === 'built' || st === 'cleared';
}
function maybeOutbreak(dt: number, nowSec: number) {
  if (plagues.length >= 2 || Math.random() >= dt / PLAGUE_MEAN) return;
  const eligible = [...simWorld.civs.values()].filter(
    (c) => c.phase !== 'dead' && ERA_RANK[c.era] >= 1 && (civStats.tileCounts.get(c.id) || 0) >= 14,
  );
  if (!eligible.length) return;
  const civ = eligible[(Math.random() * eligible.length) | 0];
  // Outbreak seeds in an owned built tile.
  const owned = [...(civTiles.get(civ.id) || [])].filter((k) => simWorld.tiles[(k / GRID_SIZE) | 0][k % GRID_SIZE].state === 'built');
  if (!owned.length) return;
  const k0 = owned[(Math.random() * owned.length) | 0];
  const r0 = (k0 / GRID_SIZE) | 0, c0 = k0 % GRID_SIZE;
  const p: Plague = {
    civId: civ.id, era: civ.era, capR: civ.originRow, capC: civ.originCol,
    born: nowSec, lastSpread: nowSec, frontier: [k0],
    afflicted: new Map(), ruinsLeft: Math.min(22, Math.floor((civStats.tileCounts.get(civ.id) || 0) * 0.16)),
  };
  p.afflicted.set(k0, { row: r0, col: c0, born: nowSec, fate: 'recover', ruined: false });
  plagues.push(p);
  triggerPing(r0, c0, 0x9fae74);
}
function plagueRuin(p: Plague, r: number, c: number) {
  const tile = simWorld.tiles[r][c];
  if (tile.state !== 'built' || tile.civId !== p.civId) return; // already changed hands
  if (r === p.capR && c === p.capC) return;                     // the capital is never abandoned
  if ((civStats.tileCounts.get(p.civId) || 0) <= 6) return;     // never wipe a civ out
  tile.state = 'ruin';
  tile.ruinEra = p.era;
  tile.civId = null;
  tile.lastChangedTick = simWorld.tick;
  noteTileChange(r, c);
  refreshTileOverlay(r, c);
  refreshBuildingSprite(r, c);
}
function updatePlagues(nowSec: number) {
  plagueGfx.clear();
  for (let pi = plagues.length - 1; pi >= 0; pi--) {
    const p = plagues[pi];
    const age = nowSec - p.born;
    if (age > PLAGUE_SPAN) { plagues.splice(pi, 1); continue; }
    // Contagion spreads through the first ~60% of the fever, then it recedes.
    if (age < PLAGUE_SPAN * 0.6 && nowSec - p.lastSpread > PLAGUE_SPREAD && p.afflicted.size < 220) {
      p.lastSpread = nowSec;
      const next: number[] = [];
      for (const key of p.frontier) {
        const r = (key / GRID_SIZE) | 0, c = key % GRID_SIZE;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc, nk = nr * GRID_SIZE + nc;
          if (p.afflicted.has(nk) || !plagueOwns(p, nr, nc)) continue;
          const built = simWorld.tiles[nr][nc].state === 'built';
          const fate: 'recover' | 'ruin' = built && p.ruinsLeft > 0 && Math.random() < 0.22 ? 'ruin' : 'recover';
          if (fate === 'ruin') p.ruinsLeft--;
          p.afflicted.set(nk, { row: nr, col: nc, born: nowSec, fate, ruined: false });
          next.push(nk);
        }
      }
      p.frontier = next;
    }
    // Envelope: the fever rises, holds, and lifts.
    const env = age < 3 ? age / 3 : age > PLAGUE_SPAN - 5 ? Math.max(0, (PLAGUE_SPAN - age) / 5) : 1;
    for (const a of p.afflicted.values()) {
      const local = Math.min(1, (nowSec - a.born) / PLAGUE_FADE);
      // Doomed quarters fall to ruin a beat after the miasma reaches them.
      if (a.fate === 'ruin' && !a.ruined && nowSec - a.born > 2.4) { a.ruined = true; plagueRuin(p, a.row, a.col); }
      const built = simWorld.tiles[a.row][a.col].state === 'built';
      const intensity = local * env * (a.ruined ? 0.5 : 1) * (built ? 1.15 : 0.85);
      if (intensity < 0.02) continue;
      const { x, y } = gridToScreen(a.col, a.row);
      // Keep the terrain legible beneath the outbreak. A dark, uniform tile
      // blanket made a mature plague look like a chunk of the map had failed to
      // render, especially at night. This lighter uneven wash reads as miasma
      // while roads, buildings, and coastlines remain visible.
      const grain = 0.72 + tileRand(a.row, a.col, 613) * 0.28;
      plagueGfx.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y])
        .fill({ color: 0x78835a, alpha: 0.28 * intensity * grain });
      plagueGfx.ellipse(x, y - 1, 9, 3.5)
        .fill({ color: 0xa7b17a, alpha: 0.07 * intensity * grain });
      // A few miasma motes hang above the worst tiles.
      if (intensity > 0.45) {
        const m = (nowSec * 0.6 + a.row * 0.7 + a.col) % 1;
        plagueGfx.circle(x + Math.sin(nowSec + a.col) * 4, y - 4 - m * 11, 1.5 * (1 - m))
          .fill({ color: 0xb8c58a, alpha: 0.48 * intensity * (1 - m) });
      }
    }
  }
}

// Floods & deltas: rivers swell over their banks now and then, drowning the
// lowlands in a sheet of water that soon recedes; and where a river meets the
// sea, silt slowly builds new delta land — coastlines that grow, not breathe.
interface FloodTile { row: number; col: number; rise: number } // rise: fraction of the crest this tile reaches
interface Flood { tiles: FloodTile[]; t: number }
const floods: Flood[] = [];
const FLOOD_MEAN = 64;   // avg seconds between floods (modulated by season)
const FLOOD_DUR = 15;    // seconds: rise, crest, recede
const DELTA_MEAN = 20;   // avg seconds between silt deposits — slow seaward growth
function floodable(r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  if (biomeMap[r][c] === 'water' || biomeMap[r][c] === 'rock') return false;
  return simWorld.tiles[r][c].state !== 'built'; // water pools in fields and wilds, not through a city's streets
}
function maybeFlood(dt: number) {
  if (floods.length > 0 || riverPaths.length === 0) return;
  // Snowmelt swells the rivers in spring — floods come more often then.
  const spring = atmos.seasonOfYear() < 0.3 ? 1.7 : 1;
  if (Math.random() >= (dt / FLOOD_MEAN) * spring * characterOf(simWorld).flood) return;
  const rp = riverPaths[(Math.random() * riverPaths.length) | 0];
  const tiles: FloodTile[] = [];
  const seen = new Set<number>();
  // The lower reaches overflow: river-bank tiles and the low ground beside them.
  for (let i = (rp.tiles.length * 0.35) | 0; i < rp.tiles.length; i++) {
    const { row, col } = rp.tiles[i];
    if (biomeMap[row]?.[col] === 'water') continue; // the sea mouth itself
    const downstream = i / rp.tiles.length;
    for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = row + dr, nc = col + dc, nk = nr * GRID_SIZE + nc;
      if (seen.has(nk) || !floodable(nr, nc)) continue;
      // Only the low ground drowns; the channel itself goes deepest.
      if (dr === 0 && dc === 0) { seen.add(nk); tiles.push({ row: nr, col: nc, rise: 0.6 + 0.4 * downstream }); }
      else if (elevationMap[nr][nc] < elevationMap[row][col] + 0.04) { seen.add(nk); tiles.push({ row: nr, col: nc, rise: (0.35 + 0.35 * downstream) }); }
    }
  }
  if (tiles.length >= 6) floods.push({ tiles, t: 0 });
}
function updateFloods(dt: number, nowSec: number, night: number) {
  floodGfx.clear();
  for (let i = floods.length - 1; i >= 0; i--) {
    const fl = floods[i];
    fl.t += dt;
    if (fl.t > FLOOD_DUR) { floods.splice(i, 1); continue; }
    // Envelope: waters rise over 4s, crest, then recede over the last 6s.
    const env = fl.t < 4 ? fl.t / 4 : fl.t > FLOOD_DUR - 6 ? Math.max(0, (FLOOD_DUR - fl.t) / 6) : 1;
    for (const t of fl.tiles) {
      const a = env * t.rise;
      if (a < 0.03) continue;
      const { x, y } = gridToScreen(t.col, t.row);
      const ripple = 0.85 + 0.15 * Math.sin(nowSec * 2 + t.row * 0.6 + t.col * 0.4);
      floodGfx.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y])
        .fill({ color: lerpColor(0x5f93b8, 0x335a7a, night), alpha: 0.5 * a * ripple });
      // A glint of sky on the floodwater.
      floodGfx.poly([x, y - 4, x + 7, y, x, y + 1, x - 7, y]).fill({ color: 0xbcd8ea, alpha: 0.12 * a });
    }
  }
}
function depositSilt(rp: { tiles: Array<{ row: number; col: number }> }): boolean {
  // Lay one grain of delta: the shallow sea tile nearest the river mouth that
  // still hugs the shore. As silt builds, the shoreline frontier marches out,
  // so the delta keeps fanning seaward over deep time (bounded by the radius).
  const mouth = rp.tiles[rp.tiles.length - 1];
  let bestR = -1, bestC = -1, bestD = 1e9;
  for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
    const nr = mouth.row + dr, nc = mouth.col + dc;
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
    if (biomeMap[nr][nc] !== 'water' || elevationMap[nr][nc] < SEA_LEVEL - 0.12) continue; // shallows only
    let land = false;
    for (const [er, ec] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ar = nr + er, ac = nc + ec;
      if (ar >= 0 && ar < GRID_SIZE && ac >= 0 && ac < GRID_SIZE && biomeMap[ar][ac] !== 'water') { land = true; break; }
    }
    if (!land) continue;
    const d = dr * dr + dc * dc;
    if (d < bestD) { bestD = d; bestR = nr; bestC = nc; }
  }
  if (bestR < 0) return false;
  biomeMap[bestR][bestC] = 'sand';
  elevationMap[bestR][bestC] = SEA_LEVEL + 0.06;
  enrollBiomeTrans(bestR, bestC);
  return true;
}
function maybeGrowDelta(dt: number) {
  if (riverPaths.length === 0 || Math.random() >= dt / DELTA_MEAN) return;
  depositSilt(riverPaths[(Math.random() * riverPaths.length) | 0]);
}

// Droughts & famine: a parched season creeps across a region — the land browns
// and cracks from the heart outward, forests wither to scrub, then the rains
// return and the green creeps back. A slow turn of the land against its people.
interface DroughtTile { row: number; col: number; dn: number } // dn: 0 at the heart, 1 at the rim
interface Drought { tiles: DroughtTile[]; t: number; dur: number; cx: number; cy: number }
const droughts: Drought[] = [];
const DROUGHT_MEAN = 95;   // avg seconds between droughts
function maybeDrought(dt: number) {
  if (droughts.length > 0 || Math.random() >= (dt / DROUGHT_MEAN) * characterOf(simWorld).drought) return;
  // Centre on a random patch of inhabited-ish land.
  let cr = -1, cc = -1;
  for (let tries = 0; tries < 30; tries++) {
    const r = (Math.random() * GRID_SIZE) | 0, c = (Math.random() * GRID_SIZE) | 0;
    if (biomeMap[r][c] !== 'water' && biomeMap[r][c] !== 'rock') { cr = r; cc = c; break; }
  }
  if (cr < 0) return;
  const R = 9 + ((Math.random() * 5) | 0);
  const tiles: DroughtTile[] = [];
  for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
    const r = cr + dr, c = cc + dc, d = Math.hypot(dr, dc);
    if (d > R || r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
    if (biomeMap[r][c] === 'water') continue; // the sea doesn't parch
    tiles.push({ row: r, col: c, dn: d / R });
  }
  const cs = gridToScreen(cc, cr);
  if (tiles.length >= 20) droughts.push({ tiles, t: 0, dur: 30 + Math.random() * 14, cx: cs.x, cy: cs.y });
}
function updateDroughts(dt: number, nowSec: number) {
  droughtGfx.clear();
  for (let i = droughts.length - 1; i >= 0; i--) {
    const dr = droughts[i];
    dr.t += dt;
    if (dr.t > dr.dur) { droughts.splice(i, 1); continue; }
    const ageF = dr.t / dr.dur; // 0..1 over the drought's life
    for (const t of dr.tiles) {
      // The parch creeps outward from the heart, holds, then recedes inward.
      const onset = t.dn * 0.4;
      const local = Math.min(1, Math.max(0, (ageF - onset) / 0.18));
      const recede = Math.min(1, Math.max(0, (1 - ageF - onset * 0.5) / 0.18));
      const dry = Math.min(local, recede) * (1 - t.dn * 0.4); // the heart parches hardest
      if (dry < 0.04) continue;
      const { x, y } = gridToScreen(t.col, t.row);
      // A dry, dusty tan pall settles over the green.
      droughtGfx.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y])
        .fill({ color: lerpColor(0xb39a5e, 0x8a6f3c, t.dn), alpha: 0.5 * dry });
      // The hardest-hit ground cracks open.
      if (dry > 0.6) {
        const s = (t.row * 7 + t.col * 13) % 6;
        droughtGfx.moveTo(x - 5, y).lineTo(x + 1 + s, y - 1).lineTo(x + 6, y + 1)
          .stroke({ color: 0x5a4422, alpha: 0.35 * dry, width: 0.5 });
        droughtGfx.moveTo(x, y - 3).lineTo(x - 2, y + 2).stroke({ color: 0x5a4422, alpha: 0.3 * dry, width: 0.5 });
      }
      // At the worst of it, a forest here and there withers to scrub (the
      // breathing land reforests it once the rains return).
      if (dry > 0.85 && biomeMap[t.row][t.col] === 'forest' && simWorld.tiles[t.row][t.col].state === 'wild' && Math.random() < dt * 0.04) {
        biomeMap[t.row][t.col] = 'grass';
        enrollBiomeTrans(t.row, t.col);
      }
    }
    // A faint heat-shimmer of dust lifting off the parched heart.
    const env = Math.sin(Math.PI * ageF);
    droughtGfx.ellipse(dr.cx + Math.sin(nowSec * 0.7) * 8, dr.cy - 6 - (nowSec * 5 % 8), 11, 3)
      .fill({ color: 0xc8b488, alpha: 0.05 * env });
  }
}

// The spread of a faith: a golden tide kindles in a city and rolls district to
// district across a civilization — shrine-lights coming alight in its wake,
// cresting in a glow of festival, then settling into a warm steady devotion.
// The benevolent twin of the plague: it dims nothing, it only lights.
interface FaithTile { row: number; col: number; born: number }
interface Faith { civId: number; oR: number; oC: number; born: number; lastSpread: number; frontier: number[]; touched: Map<number, FaithTile> }
const faiths: Faith[] = [];
const FAITH_MEAN = 125;     // avg seconds between awakenings
const FAITH_SPAN = 30;      // seconds from kindling to settled devotion
const FAITH_SPREAD = 0.2;   // seconds between waves of conversion
function faithOwns(f: Faith, r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  if (simWorld.tiles[r][c].civId !== f.civId) return false;
  const st = simWorld.tiles[r][c].state;
  return st === 'built' || st === 'cleared';
}
function maybeAwaken(dt: number, nowSec: number) {
  if (faiths.length >= 2 || Math.random() >= dt / FAITH_MEAN) return;
  const eligible = [...simWorld.civs.values()].filter(
    (c) => c.phase !== 'dead' && ERA_RANK[c.era] >= 1 && (civStats.tileCounts.get(c.id) || 0) >= 14,
  );
  if (!eligible.length) return;
  const civ = eligible[(Math.random() * eligible.length) | 0];
  const owned = [...(civTiles.get(civ.id) || [])].filter((k) => simWorld.tiles[(k / GRID_SIZE) | 0][k % GRID_SIZE].state === 'built');
  if (!owned.length) return;
  const k0 = owned[(Math.random() * owned.length) | 0];
  const r0 = (k0 / GRID_SIZE) | 0, c0 = k0 % GRID_SIZE;
  const f: Faith = { civId: civ.id, oR: r0, oC: c0, born: nowSec, lastSpread: nowSec, frontier: [k0], touched: new Map() };
  f.touched.set(k0, { row: r0, col: c0, born: nowSec });
  faiths.push(f);
  triggerPing(r0, c0, 0xffd27a);
}
function updateFaiths(nowSec: number, night: number) {
  faithGfx.clear();
  const ng = 0.4 + 0.6 * night; // warmest at night, still glows by day
  for (let fi = faiths.length - 1; fi >= 0; fi--) {
    const f = faiths[fi];
    const age = nowSec - f.born;
    if (age > FAITH_SPAN) { faiths.splice(fi, 1); continue; }
    if (age < FAITH_SPAN * 0.65 && nowSec - f.lastSpread > FAITH_SPREAD && f.touched.size < 240) {
      f.lastSpread = nowSec;
      const next: number[] = [];
      for (const key of f.frontier) {
        const r = (key / GRID_SIZE) | 0, c = key % GRID_SIZE;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc, nk = nr * GRID_SIZE + nc;
          if (f.touched.has(nk) || !faithOwns(f, nr, nc)) continue;
          f.touched.set(nk, { row: nr, col: nc, born: nowSec });
          next.push(nk);
        }
      }
      f.frontier = next;
    }
    // Envelope: kindles, crests in a golden age, settles to a steady warmth.
    const env = age < 3 ? age / 3 : age > FAITH_SPAN - 6 ? 0.5 + 0.5 * Math.max(0, (FAITH_SPAN - age) / 6) : 1;
    const crest = Math.max(0, 1 - Math.abs(age - FAITH_SPAN * 0.55) / (FAITH_SPAN * 0.2)); // golden-age bloom
    for (const t of f.touched.values()) {
      const local = Math.min(1, (nowSec - t.born) / 1.6);
      const intensity = local * env;
      if (intensity < 0.03) continue;
      const built = simWorld.tiles[t.row][t.col].state === 'built';
      const { x, y } = gridToScreen(t.col, t.row);
      faithGfx.circle(x, y - 2, (built ? 8 : 5)).fill({ color: 0xffce78, alpha: (built ? 0.13 : 0.07) * intensity * ng });
      if (built) {
        // A shrine candle alight in the streets, flickering.
        const fl = 0.7 + 0.3 * Math.sin(nowSec * 8 + t.row * 3 + t.col * 5);
        faithGfx.circle(x, y - 3, 1.6 * fl).fill({ color: 0xffe8b0, alpha: 0.5 * intensity });
        faithGfx.poly([x, y - 5 - fl * 1.5, x - 1, y - 3, x + 1, y - 3]).fill({ color: 0xfff0c4, alpha: 0.7 * intensity });
      }
    }
    // The golden age crests over the holy city — a soft expanding halo.
    if (crest > 0.02) {
      const { x, y } = gridToScreen(f.oC, f.oR);
      const pulse = (nowSec * 0.4) % 1;
      faithGfx.circle(x, y - 3, 8 + pulse * 26).fill({ color: 0xffd98a, alpha: 0.12 * crest * (1 - pulse) });
      faithGfx.circle(x, y - 3, 6).fill({ color: 0xfff0c0, alpha: 0.22 * crest });
    }
  }
}

// Megastructures: the most advanced civs raise a landmark over their greatest
// city — an arcology dome or a space elevator threading toward orbit.
type MegaKind = 'dome' | 'elevator' | 'megatower' | 'reactor';
const MEGA_KINDS: MegaKind[] = ['elevator', 'megatower', 'dome', 'reactor'];
interface Mega { row: number; col: number; kind: MegaKind; color: number }
const megastructures: Mega[] = [];
// Debug-spawned structures persist independent of the civ-driven rebuild, so the
// test menu can drop one and watch it. Drawn alongside the real ones.
const debugMegas: Mega[] = [];
function rebuildMegastructures() {
  megastructures.length = 0;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || ERA_RANK[civ.era] < 5 || civ.cities.length === 0) continue;
    const hub = civ.cities.reduce((b, c) => (c.prominence > b.prominence ? c : b), civ.cities[0]);
    megastructures.push({ row: hub.row, col: hub.col, kind: MEGA_KINDS[civ.id % MEGA_KINDS.length], color: civ.color });
  }
}
function drawMegastructures(nowSec: number, night: number) {
  megaGfx.clear();
  if (megastructures.length === 0 && debugMegas.length === 0) return;
  const ng = Math.max(0.25, night);
  for (const m of [...megastructures, ...debugMegas]) {
    if (m.kind === 'elevator') {
      // Space elevators draw in screen space so the tether threads all the way
      // up past the horizon, instead of being clipped at the planet's limb.
      const s = tileToSky(m.row, m.col);
      drawSkyElevator(skyStructGfx, s.x, s.y, m.color, nowSec, ng);
    } else {
      const { x, y } = gridToScreen(m.col, m.row);
      drawOneMega(megaGfx, x, y, m.kind, m.color, nowSec, ng, night);
    }
  }
}
// A space elevator climbing from its city base all the way to the top of the
// screen, the tether thinning and dissolving into the sky, with way-stations,
// a climber sliding up, and a high beacon.
function drawSkyElevator(g: Graphics, x: number, baseY: number, color: number, nowSec: number, ng: number) {
  const topY = 6;
  const H = Math.max(120, baseY - topY); // reach the top of the frame
  const segs = 26;
  const tether = lerpColor(color, 0xc2cdd8, 0.7);
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1) / segs;
    const w0 = 2.4 * (1 - t0 * 0.65), w1 = 2.4 * (1 - t1 * 0.65);
    const a = 0.85 * (1 - t0 * t0 * t0); // stays solid most of the way, dissolves near the top
    g.poly([x - w0, baseY - H * t0, x + w0, baseY - H * t0, x + w1, baseY - H * t1, x - w1, baseY - H * t1])
      .fill({ color: tether, alpha: a });
    // A brighter inner cable keeps the line readable against the sky.
    g.rect(x - 0.5, baseY - H * t1, 1, H * (t1 - t0) + 0.5).fill({ color: lerpColor(tether, 0xffffff, 0.5), alpha: a * 0.7 });
  }
  for (const sf of [0.2, 0.42, 0.64, 0.84]) {
    const sy = baseY - H * sf;
    g.rect(x - 4.5, sy - 1.8, 9, 3.6).fill({ color: lerpColor(color, 0xe8eef4, 0.6), alpha: 0.85 * (1 - sf * 0.6) });
  }
  const climb = (nowSec * 0.05) % 1;
  g.circle(x, baseY - H * climb, 1.8).fill({ color: 0xfff0a0, alpha: 0.85 * (1 - climb * 0.5) }); // climber
  g.circle(x, baseY - H * 0.55, 1.5).fill({ color: 0xff8a6a, alpha: (0.3 + 0.4 * Math.sin(nowSec * 3)) * ng * 0.7 }); // beacon
  // Ground anchor wedge at the base.
  g.poly([x - 5, baseY, x + 5, baseY, x + 3, baseY - 9, x - 3, baseY - 9]).fill({ color: lerpColor(color, 0x70808f, 0.4), alpha: 0.95 });
}
function drawOneMega(megaGfx: Graphics, x: number, y: number, kind: MegaKind, color: number, nowSec: number, ng: number, night: number) {
  if (kind === 'megatower') {
    // A supertall tower stepping up to a spire, lit floor by floor at night.
    const H = 84;
    const steps = [[0, 5], [0.42, 3.6], [0.72, 2.2], [1, 1.2]];
    for (let s = 0; s < steps.length - 1; s++) {
      const y0 = y - H * steps[s][0], y1 = y - H * steps[s + 1][0], w0 = steps[s][1], w1 = steps[s + 1][1];
      megaGfx.poly([x - w0, y0, x + w0, y0, x + w1, y1, x - w1, y1]).fill({ color: lerpColor(color, 0x70808f, 0.45), alpha: 0.96 });
      megaGfx.poly([x - w0, y0, x + w0, y0, x + w1, y1, x - w1, y1]).stroke({ color: lerpColor(color, 0xffffff, 0.3), alpha: 0.3, width: 0.5 });
    }
    megaGfx.poly([x - 0.5, y - H, x + 0.5, y - H, x, y - H - 10]).fill({ color: 0x9aaabb, alpha: 0.9 }); // spire
    if (night > 0.12) for (let r = 0; r < 12; r++) { const wy = y - H * (0.08 + r * 0.07); megaGfx.circle(x + ((r * 7) % 5 - 2), wy, 0.5).fill({ color: 0xffe6a8, alpha: 0.55 * ng }); }
    megaGfx.circle(x, y - H - 10, 1).fill({ color: 0xff6a5a, alpha: (0.4 + 0.5 * Math.sin(nowSec * 3)) * ng }); // aircraft beacon
  } else if (kind === 'reactor') {
    // A fusion plant: a low dome flanked by cooling towers, with a pulsing core.
    for (const cx of [-9, 9]) {
      megaGfx.poly([x + cx - 4, y, x + cx + 4, y, x + cx + 2.6, y - 13, x + cx - 2.6, y - 13]).fill({ color: 0xb9bcc2, alpha: 0.92 }); // cooling tower
      megaGfx.ellipse(x + cx, y - 13, 2.6, 0.9).fill({ color: 0xd6d9de, alpha: 0.9 });
      megaGfx.circle(x + cx + (Math.sin(nowSec + cx) * 2), y - 15 - (nowSec * 4 % 4), 1.4).fill({ color: 0xdfe4ea, alpha: 0.18 }); // steam
    }
    const R = 8, N = 14, pts: number[] = [];
    for (let i = 0; i <= N; i++) { const a = Math.PI + Math.PI * (i / N); pts.push(x + Math.cos(a) * R, y + Math.sin(a) * R * 0.6); }
    megaGfx.poly(pts).fill({ color: 0x5a6470, alpha: 0.95 });
    megaGfx.poly(pts).stroke({ color: 0x8a96a4, alpha: 0.5, width: 0.6 });
    const pulse = 0.5 + 0.5 * Math.sin(nowSec * 4);
    megaGfx.circle(x, y - R * 0.5, 3.5).fill({ color: 0x7afff0, alpha: (0.12 + 0.16 * pulse) }); // energy glow
    megaGfx.circle(x, y - R * 0.5, 1.2).fill({ color: 0xeafffb, alpha: 0.5 + 0.4 * pulse });
  } else {
    // Arcology dome: a translucent ribbed dome with rim lights.
    const R = 16, N = 18, pts: number[] = [];
    for (let i = 0; i <= N; i++) { const a = Math.PI + Math.PI * (i / N); pts.push(x + Math.cos(a) * R, y + Math.sin(a) * R * 0.6); }
    megaGfx.poly(pts).fill({ color: lerpColor(color, 0xaaccff, 0.55), alpha: 0.12 });
    megaGfx.poly(pts).stroke({ color: lerpColor(color, 0xffffff, 0.5), alpha: 0.45, width: 1 });
    for (let k = 1; k < 5; k++) { const a = Math.PI + Math.PI * (k / 5); megaGfx.moveTo(x, y).lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R * 0.6).stroke({ color: lerpColor(color, 0xffffff, 0.4), alpha: 0.22, width: 0.5 }); }
    megaGfx.ellipse(x, y - R * 0.62, 1.8, 1.0).fill({ color: 0xfff0b0, alpha: 0.5 + 0.4 * ng * (0.6 + 0.4 * Math.sin(nowSec * 2)) });
  }
}

// Renewable energy farms: once a civ reaches the modern era it plants solar
// arrays and wind turbines on the open land around its cities.
type EnergyKind = 'solar' | 'wind';
interface EnergyFarm { row: number; col: number; kind: EnergyKind; n: number; a: number; dying?: boolean }
const energyFarms: EnergyFarm[] = [];
// Live-watch handle: snapshot current farm tiles (to check they hold still).
(window as any).__energy = () => energyFarms.map(f => `${f.row},${f.col},${f.kind},a=${f.a.toFixed(2)}${f.dying ? ',dying' : ''}`);
// Energy farms PERSIST across rebuilds — otherwise reselecting tiles every
// founding pass made them flicker and jump around the map. Each farm stays put
// while its tile is still open farmland owned by a developed civ; we only drop
// the ones whose ground went bad and top each civ up to its quota on stable,
// spread-out tiles.
const ENERGY_QUOTA = 5, ENERGY_MIN_GAP = 4;
function energyTileValid(row: number, col: number): boolean {
  if (biomeMap[row][col] === 'water') return false;
  const t = simWorld.tiles[row][col];
  // A farm is durable INFRASTRUCTURE — modern civs build them (see the era gate
  // in rebuildEnergyFarms), but once built they outlive that civ like a ruin.
  // Validity is deliberately era-AGNOSTIC: the only churn the farms ever showed
  // came from an earlier-era civ conquering the land and instantly invalidating
  // every farm on it (that's the pop-in/out + drift the world-cycle produced).
  // So we keep a farm while its land merely stays developed and owned by ANY
  // living civ; it fades only when the land truly reverts (→ wild/ruin) or goes
  // unowned — which is the clean mass fade at a world's collapse.
  if (t.civId == null || (t.state !== 'cleared' && t.state !== 'built')) return false;
  const civ = simWorld.civs.get(t.civId);
  return !!civ && civ.phase !== 'dead';
}
function rebuildEnergyFarms() {
  // Keep valid farms exactly where they are. Invalid ones don't vanish on the
  // spot — they're flagged dying and fade out in the draw loop (everything else
  // in this world eases; a farm popping out of existence read as a glitch). A
  // farm whose land comes back simply un-dies and fades back in.
  for (const f of energyFarms) f.dying = !energyTileValid(f.row, f.col);
  // Group living farms by their current owner so we know who still needs more.
  // Dying farms are leaving, so they don't count toward quota or block reuse.
  const perCiv = new Map<number, Array<{ row: number; col: number }>>();
  for (const f of energyFarms) {
    if (f.dying) continue;
    const id = simWorld.tiles[f.row][f.col].civId!;
    let arr = perCiv.get(id);
    if (!arr) { arr = []; perCiv.set(id, arr); }
    arr.push(f);
  }
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || ERA_RANK[civ.era] < 4) continue;
    const owned = civTiles.get(civ.id);
    if (!owned || owned.size === 0) continue;
    const mine = perCiv.get(civ.id) ?? [];
    if (mine.length >= ENERGY_QUOTA) continue;
    // Candidate cleared tiles. Prefer ones NEAREST a city: the core is
    // decay-protected and rarely changes hands, so farms settle on stable land
    // around the cities (as intended) instead of chasing volatile frontier
    // tiles — which is what made them teleport when a contested tile was lost.
    // Position breaks ties so the choice stays deterministic.
    const cores = civ.cities.length ? civ.cities : [{ row: civ.originRow, col: civ.originCol }];
    const cityDist = (r: number, c: number) => {
      let m = Infinity;
      for (const ct of cores) { const d = Math.abs(ct.row - r) + Math.abs(ct.col - c); if (d < m) m = d; }
      return m;
    };
    const cands: Array<{ r: number; c: number; d: number }> = [];
    for (const key of owned) {
      const r = (key / GRID_SIZE) | 0, c = key % GRID_SIZE;
      if (simWorld.tiles[r][c].state === 'cleared' && biomeMap[r][c] !== 'water') cands.push({ r, c, d: cityDist(r, c) });
    }
    cands.sort((a, b) => (a.d - b.d) || (a.r - b.r) || (a.c - b.c));
    for (const t of cands) {
      if (mine.length >= ENERGY_QUOTA) break;
      // Spread them out and never double up on a tile.
      if (mine.some(f => Math.abs(f.row - t.r) + Math.abs(f.col - t.c) < ENERGY_MIN_GAP)) continue;
      const kind: EnergyKind = (t.r + t.c) % 2 === 0 ? 'solar' : 'wind';
      const farm: EnergyFarm = { row: t.r, col: t.c, kind, n: energyFarms.length, a: 0 };
      energyFarms.push(farm);
      mine.push(farm);
    }
  }
}
const ENERGY_FADE = 0.06; // per-frame ease for farms appearing/vanishing (~0.5s)
function drawEnergyFarms(nowSec: number, night: number) {
  energyGfx.clear();
  if (energyFarms.length === 0) return;
  // Ease every farm toward full (alive) or zero (dying); cull once invisible.
  for (let i = energyFarms.length - 1; i >= 0; i--) {
    const f = energyFarms[i];
    const target = f.dying ? 0 : 1;
    f.a += (target - f.a) * ease(ENERGY_FADE);
    if (f.dying && f.a < 0.02) { energyFarms.splice(i, 1); continue; }
    if (f.a < 0.01) continue;
    const { x, y } = gridToScreen(f.col, f.row);
    if (f.kind === 'solar') drawSolarFarm(energyGfx, x, y, night, f.a);
    else drawWindFarm(energyGfx, x, y, nowSec, f.n, night, f.a);
  }
}
const ENERGY_S = 1.5; // match the lighthouse: 50% larger so the farms read clearly
function drawSolarFarm(g: Graphics, x: number, y: number, night: number, fa: number) {
  const S = ENERGY_S;
  const glint = Math.max(0, 1 - night * 1.4); // panels catch the sun by day
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const px = x + ((col - 1) * 7 - row * 3.5) * S, py = y + (row * 4 - 1) * S;
    const panel = [px - 4 * S, py, px + 2 * S, py - 2.4 * S, px + 5 * S, py + 0.5 * S, px - 1 * S, py + 2.9 * S];
    g.poly(panel).fill({ color: 0x223a66, alpha: 0.92 * fa });
    g.poly(panel).stroke({ color: 0x4a6aa0, alpha: 0.5 * fa, width: 0.4 });
    g.poly([px - 1 * S, py + 0.3 * S, px + 2 * S, py - 1 * S, px + 2.6 * S, py - 0.4 * S, px - 0.4 * S, py + 0.9 * S])
      .fill({ color: 0xbfe0ff, alpha: 0.4 * glint * fa });
  }
}
function drawWindFarm(g: Graphics, x: number, y: number, nowSec: number, n: number, night: number, fa: number) {
  const S = ENERGY_S;
  const blade = night > 0.4 ? 0xd6dac8 : 0xf4f6f0;
  const positions = [[-7, 1], [4, -2], [-1, 4]];
  for (let i = 0; i < positions.length; i++) {
    const bx = x + positions[i][0] * S, by = y + positions[i][1] * S;
    const H = (13 + (i % 2) * 3) * S, hx = bx, hy = by - H;
    g.poly([bx - 0.7 * S, by, bx + 0.7 * S, by, hx + 0.5 * S, hy, hx - 0.5 * S, hy]).fill({ color: 0xe6ead0, alpha: 0.9 * fa });
    const spin = nowSec * 1.6 + n * 1.3 + i, R = 6.5 * S;
    for (let b = 0; b < 3; b++) {
      const a = spin + b * (Math.PI * 2 / 3);
      const tx = hx + Math.cos(a) * R, ty = hy + Math.sin(a) * R * 0.7;
      g.poly([hx, hy, tx, ty, hx + Math.cos(a + 0.3) * 2 * S, hy + Math.sin(a + 0.3) * 2 * S * 0.7])
        .fill({ color: blade, alpha: 0.9 * fa });
    }
    g.circle(hx, hy, 0.9 * S).fill({ color: 0xcfd4c0, alpha: 0.95 * fa });
  }
}

function rebuildPowerLines() {
  powerLines.length = 0;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || ERA_RANK[civ.era] < 3 || civ.cities.length < 2) continue;
    const hub = civ.cities.reduce((best, c) => (c.prominence > best.prominence ? c : best), civ.cities[0]);
    const hubS = gridToScreen(hub.col, hub.row);
    for (const city of civ.cities) {
      if (city === hub) continue;
      // Only where a land route exists, so wires don't span open ocean.
      if (!roadBetween(hub, city)) continue;
      powerLines.push({ a: hubS, b: gridToScreen(city.col, city.row) });
    }
  }
}

function drawPowerLines(dt: number, night: number) {
  powerGfx.clear();
  if (powerLines.length === 0) return;
  powerPulse = (powerPulse + dt * 0.33) % 1;
  for (const pl of powerLines) {
    const dx = pl.b.x - pl.a.x, dy = pl.b.y - pl.a.y;
    const len = Math.hypot(dx, dy);
    // The wire: steel by day, faintly lit by night.
    powerGfx.moveTo(pl.a.x, pl.a.y).lineTo(pl.b.x, pl.b.y)
      .stroke({ color: 0x4c5662, alpha: 0.26 + 0.14 * night, width: 0.9 });
    // Pylons every ~52px.
    const nP = Math.max(1, Math.round(len / 52));
    for (let i = 1; i < nP; i++) {
      const t = i / nP, px = pl.a.x + dx * t, py = pl.a.y + dy * t;
      powerGfx.rect(px - 0.6, py - 2.6, 1.2, 5.2).fill({ color: 0x363f49, alpha: 0.32 + 0.12 * night });
    }
    // Power and data pulse along the wire — subtle by day, brighter at night.
    const glow = 0.2 + 0.8 * night;
    // Power: a couple of cyan running lights.
    for (let k = 0; k < 2; k++) {
      const t = (powerPulse + k * 0.5) % 1;
      const px = pl.a.x + dx * t, py = pl.a.y + dy * t;
      powerGfx.circle(px, py, 1.7).fill({ color: 0x9fdcff, alpha: 0.5 * glow });
      powerGfx.circle(px, py, 0.8).fill({ color: 0xeaffff, alpha: 0.8 * glow });
    }
    // Data (telecom): smaller, faster teal packets running the other way.
    for (let k = 0; k < 3; k++) {
      const t = (1 - (powerPulse * 1.7 + k / 3)) % 1;
      const px = pl.a.x + dx * t, py = pl.a.y + dy * t;
      powerGfx.circle(px, py, 0.9).fill({ color: 0x7fffcf, alpha: 0.42 * glow });
    }
  }
}

// War heat: conquest tile-flips aggregate per civ-pair; sustained contact is
// narrated once, and quiet afterwards is narrated too.
const warHeat = new Map<string, { a: number; b: number; row: number; col: number; count: number; lastTs: number; narratedAt: number }>();
// At most one war line per minute across the whole map, so a crowded frontier
// stays a minority beat rather than a war bulletin (war was ~40% of the log).
// World-clock seconds, not wall-clock ms: these gate in-world narration about
// battles, and battle heat itself (born/lastHit) is already on worldClock.
const WAR_GLOBAL_GAP_SEC = 60;
// How long a quiet war is kept alive while its follow-up line keeps being
// refused by the log's wall-clock dedup window. Bounded so warHeat cannot grow.
const QUIET_RETRY_UNTIL_SEC = 120;
// -Infinity so the first war line is not gated by a window that has not opened
// yet; with Date.now() the epoch made this vacuously true.
let lastWarNarrationTs = -Infinity;
interface ConflictFlash { x: number; y: number; age: number }
const conflictFlashes: ConflictFlash[] = [];

function noteConquest(ev: { row: number; col: number; attackerId: number; defenderId: number }) {
  const [a, b] = ev.attackerId < ev.defenderId
    ? [ev.attackerId, ev.defenderId] : [ev.defenderId, ev.attackerId];
  const k = `${a}:${b}`;
  const now = worldClock;
  let w = warHeat.get(k);
  if (!w) { w = { a, b, row: ev.row, col: ev.col, count: 0, lastTs: now, narratedAt: 0 }; warHeat.set(k, w); }
  w.count++;
  w.lastTs = now;
  w.row = ev.row;
  w.col = ev.col;
  // A war earns a line only after sustained fighting, rarely after that, and
  // no more than one war line every WAR_GLOBAL_GAP_SEC across the whole map —
  // so a crowded frontier doesn't turn the log into a war bulletin.
  if (w.count >= 14
      && (w.narratedAt === 0 || now - w.narratedAt > 150)
      && now - lastWarNarrationTs > WAR_GLOBAL_GAP_SEC) {
    const A = simWorld.civs.get(a), B = simWorld.civs.get(b);
    if (A && B) {
      const ok = pushNarration(colorizeCivNames(pick([
        `${A.name} and ${B.name} contest their border.`,
        `There is burning on the line between ${A.name} and ${B.name}.`,
        `${A.name} and ${B.name} have come to blows over the marches.`,
        `War smoulders along the frontier of ${A.name} and ${B.name}.`,
      ])), { priority: 'normal', dedupKey: `war:${k}`, anchor: { row: w.row, col: w.col } });
      if (ok) { w.narratedAt = now; w.count = 0; lastWarNarrationTs = now; }
    }
  }
  if (conflictFlashes.length < 20) {
    const { x, y } = gridToScreen(ev.col, ev.row);
    conflictFlashes.push({ x, y, age: 0 });
  }
  noteBattle(ev);
}

// Armies & sieges: a war front becomes a visible battle — two clusters of
// troops with banners clashing in a haze of dust, reinforcements marching up
// the road from the attacker's nearest city, and a ring of tents when a city
// is under siege. Sustained by the conquest tile-flips the sim already emits.
interface Battle {
  row: number; col: number; cx: number; cy: number; born: number; lastHit: number;
  ax: number; ay: number; dx: number; dy: number;   // attacker / defender cluster centres
  mx: number; my: number;                            // march origin (attacker city)
  aColor: number; dColor: number; attackerId: number; defenderId: number;
  siege: boolean; seed: number;
  era: number;                                       // attacker's ERA_RANK — sets the war style
}
const battles: Battle[] = [];
const BATTLE_LIFE = 9;   // seconds a front stays hot after the last clash
function nearestCity(civ: { cities: Array<{ row: number; col: number }> } | undefined, row: number, col: number) {
  if (!civ || !civ.cities.length) return null;
  let best = civ.cities[0], bd = 1e9;
  for (const c of civ.cities) { const d = (c.row - row) ** 2 + (c.col - col) ** 2; if (d < bd) { bd = d; best = c; } }
  return best;
}
function noteBattle(ev: { row: number; col: number; attackerId: number; defenderId: number }) {
  // Fold into a nearby existing front so one frontier is one battle, not many.
  for (const b of battles) {
    if (Math.abs(b.row - ev.row) <= 3 && Math.abs(b.col - ev.col) <= 3) { b.lastHit = worldClock; return; }
  }
  // Only some fronts flare into a visible battle, so wars read as an occasional
  // beat rather than a constant churn. (Existing battles still sustain above.)
  if (battles.length >= 6 || Math.random() < 0.5) return;
  const atk = simWorld.civs.get(ev.attackerId), def = simWorld.civs.get(ev.defenderId);
  const { x: cx, y: cy } = gridToScreen(ev.col, ev.row);
  // Attacker advances from its nearest city; the clusters face off across the tile.
  const city = nearestCity(atk, ev.row, ev.col);
  const cs = city ? gridToScreen(city.col, city.row) : { x: cx - 40, y: cy };
  let vx = cs.x - cx, vy = cs.y - cy; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
  // A siege if the contested tile sits against a defender-held city block.
  let siege = false;
  for (let dr = -1; dr <= 1 && !siege; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = ev.row + dr, c = ev.col + dc;
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && simWorld.tiles[r][c].state === 'built' && simWorld.tiles[r][c].civId === ev.defenderId) { siege = true; break; }
  }
  battles.push({
    row: ev.row, col: ev.col, cx, cy, born: worldClock, lastHit: worldClock,
    ax: cx + vx * 7, ay: cy + vy * 7, dx: cx - vx * 7, dy: cy - vy * 7,
    mx: cs.x, my: cs.y, aColor: atk?.color ?? 0xcc5544, dColor: def?.color ?? 0x4466cc,
    attackerId: ev.attackerId, defenderId: ev.defenderId,
    siege, seed: (ev.row * 13 + ev.col * 7) % 100, era: atk ? ERA_RANK[atk.era] : 1,
  });
}
function drawTrooper(g: Graphics, x: number, y: number, color: number) {
  g.rect(x - 0.8, y - 3, 1.6, 3).fill({ color: 0x322f29, alpha: 0.92 });       // body
  g.circle(x, y - 3.4, 0.7).fill({ color: 0x4b463f, alpha: 0.92 });            // head
  g.rect(x - 1.2, y - 2.5, 2.4, 1, ).fill({ color, alpha: 0.85 });             // shield in civ colour
}
function drawBanner(g: Graphics, x: number, y: number, color: number, nowSec: number) {
  g.rect(x - 0.4, y - 12, 0.9, 12).fill({ color: 0x2a2620, alpha: 0.9 });      // pole
  const w = 5.5 + Math.sin(nowSec * 4 + x) * 1.2;
  g.poly([x + 0.5, y - 12, x + 0.5 + w, y - 10.6, x + 0.5, y - 8.4]).fill({ color, alpha: 0.92 });
}
// An armoured vehicle, hull oriented along (hx,hy), gun pointed at the foe.
function drawTank(g: Graphics, x: number, y: number, hx: number, hy: number, color: number, fire: boolean) {
  const px = -hy, py = hx, L = 3.2, W = 1.9;
  g.poly([
    x + hx * L + px * W, y + hy * L + py * W, x + hx * L - px * W, y + hy * L - py * W,
    x - hx * L - px * W, y - hy * L - py * W, x - hx * L + px * W, y - hy * L + py * W,
  ]).fill({ color: 0x3b3f3a, alpha: 0.96 });                                   // hull
  g.rect(x - 1.1, y - 1.1, 2.2, 2.2).fill({ color: lerpColor(color, 0x2a2a2a, 0.45), alpha: 0.95 }); // turret w/ civ tint
  g.moveTo(x, y).lineTo(x + hx * 5.5, y + hy * 5.5).stroke({ color: 0x23241f, width: 1, cap: 'round' }); // barrel
  if (fire) {
    g.circle(x + hx * 6, y + hy * 6, 1.7).fill({ color: 0xffd060, alpha: 0.9 });
    g.circle(x + hx * 6, y + hy * 6, 3.2).fill({ color: 0xff9a30, alpha: 0.3 });
  }
}
// A hovering gunship, floating above its shadow, an energy core glowing.
function drawGunship(g: Graphics, x: number, y: number, hx: number, hy: number, glow: number, nowSec: number, idx: number) {
  const px = -hy;
  const bob = Math.sin(nowSec * 3 + idx * 1.7) * 0.7;
  const yy = y - 3.5 + bob;
  g.ellipse(x, y + 1, 3, 1).fill({ color: 0x000000, alpha: 0.16 });            // hover shadow
  g.poly([
    x + hx * 3.4, yy, x - hx * 2.2 + px * 2.4, yy + 0.9, x - hx * 2.2 - px * 2.4, yy + 0.9,
  ]).fill({ color: 0x2c3138, alpha: 0.96 });                                   // angular hull
  g.poly([x - hx * 2.2 + px * 2.4, yy + 0.9, x - hx * 2.2 - px * 2.4, yy + 0.9, x - hx * 3.4, yy - 0.4])
    .fill({ color: 0x444b54, alpha: 0.9 });                                    // tail fin
  g.circle(x + hx * 0.4, yy, 1).fill({ color: glow, alpha: 0.95 });           // energy core
  g.circle(x + hx * 0.4, yy, 2.1).fill({ color: glow, alpha: 0.22 });
}
// An industrial-era tethered observation balloon, floating behind the lines and
// bobbing on the wind — the period's eye over the battlefield.
function drawObservationBalloon(g: Graphics, x: number, groundY: number, nowSec: number, seed: number, env: number) {
  const by = groundY - 27 + Math.sin(nowSec * 1.1 + seed) * 1.6;
  g.moveTo(x, groundY).lineTo(x, by + 6).stroke({ color: 0x6b6358, alpha: 0.4 * env, width: 0.5 }); // tether
  g.poly([x - 4.4, by + 3.5, x - 7.2, by + 1.5, x - 7.2, by + 5.8]).fill({ color: 0xb6a276, alpha: 0.8 * env }); // tail fin
  g.ellipse(x, by, 4.6, 6.2).fill({ color: 0xc7b485, alpha: 0.92 * env });        // envelope
  g.ellipse(x - 1.5, by - 1.6, 1.4, 3).fill({ color: 0xe6dab9, alpha: 0.5 * env }); // sun highlight
  g.rect(x - 1.2, by + 6, 2.4, 1.8).fill({ color: 0x4a3b2a, alpha: 0.9 * env });   // basket
}
// A rare post-era Giant Death Robot, towering over the gunships — bipedal, a
// glowing core, a sensor eye, arm cannons trained on the foe.
function drawDeathRobot(g: Graphics, x: number, groundY: number, hx: number, nowSec: number, color: number, env: number) {
  const stride = Math.sin(nowSec * 2.0 + x), hipY = groundY - 13;
  const metal = 0x474e57, dark = 0x333941, lit = 0x5c636d;
  for (const s of [-1, 1]) { // striding legs
    const phase = s * stride, kneeX = x + s * 3 + phase * 1.5, footX = x + s * 4 + phase * 3;
    g.moveTo(x + s * 1.8, hipY + 3).lineTo(kneeX, hipY + 8).stroke({ color: dark, width: 2.2, cap: 'round', alpha: env });
    g.moveTo(kneeX, hipY + 8).lineTo(footX, groundY).stroke({ color: metal, width: 2.0, cap: 'round', alpha: env });
  }
  g.rect(x - 4, hipY - 4, 8, 8).fill({ color: metal, alpha: 0.97 * env });          // torso
  g.rect(x - 4, hipY - 4, 8, 1.6).fill({ color: lit, alpha: 0.9 * env });
  g.rect(x - 4, hipY - 4, 2.4, 8).fill({ color: dark, alpha: 0.5 * env });          // shaded side
  g.rect(x - 2.2, hipY - 7.5, 4.4, 3.5).fill({ color: dark, alpha: 0.95 * env });   // sensor head
  g.circle(x, hipY - 5.6, 1).fill({ color: 0xff5a3c, alpha: (0.5 + 0.5 * Math.sin(nowSec * 6 + x)) * env }); // eye
  g.rect(x + hx * 6 - 1, hipY - 1, 5, 2).fill({ color: dark, alpha: 0.95 * env });  // arm cannon
  const core = lerpColor(color, 0x9ffcff, 0.6);
  g.circle(x, hipY + 1, 1.6).fill({ color: core, alpha: 0.9 * env });
  g.circle(x, hipY + 1, 3).fill({ color: core, alpha: 0.25 * env });
  if (Math.sin(nowSec * 4 + x) > 0.6) g.circle(x + hx * 11, hipY, 1.7).fill({ color: 0xeaffff, alpha: 0.85 * env }); // muzzle flash
}
// War units read tiny at full-globe zoom, so each battle is drawn into its own
// Graphics scaled around its own front centre — the whole clash (units AND their
// spread) grows together, in place, from one knob. Bump WAR_SCALE to taste.
let WAR_SCALE = 1.7;
// War units are 6–16px in world space, which is a handful of pixels on a
// full-globe capture — so this is a knob to judge live, and these are the
// handles for doing it: scrub the scale, and ask where the live fronts are on
// screen (through the curvature, via tileToSky) so a shot can be cropped onto
// one instead of hunting for it by eye.
(window as any).__war = {
  get scale() { return WAR_SCALE; },
  set scale(v: number) { WAR_SCALE = v; },
  list: () => battles.map((b) => ({ row: b.row, col: b.col, siege: b.siege, era: b.era, ...tileToSky(b.row, b.col) })),
};
function updateWarfare(nowSec: number) {
  for (let i = battles.length - 1; i >= 0; i--) {
    if (nowSec - battles[i].lastHit > BATTLE_LIFE) battles.splice(i, 1);
  }
  for (let i = 0; i < battles.length; i++) {
    const b = battles[i];
    let g = warPool[i];
    if (!g) { g = new Graphics(); warPool[i] = g; warLayer.addChild(g); }
    g.clear(); g.visible = true;
    // Pivot+position at the front centre so scaling grows the clash around itself.
    g.pivot.set(b.cx, b.cy); g.position.set(b.cx, b.cy); g.scale.set(WAR_SCALE);
    drawOneBattle(g, b, nowSec);
  }
  for (let i = battles.length; i < warPool.length; i++) warPool[i].visible = false;
}
function drawOneBattle(warGfx: Graphics, b: Battle, nowSec: number) {
  {
    const cold = nowSec - b.lastHit;
    const env = Math.min(1, (nowSec - b.born) / 1) * Math.min(1, (BATTLE_LIFE - cold) / 2);
    if (env < 0.02) return;
    // Heading from the attacker cluster toward the defender.
    let hx = b.dx - b.ax, hy = b.dy - b.ay; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
    const style = b.era >= 5 ? 'energy' : b.era >= 3 ? 'mech' : 'melee';

    if (style === 'energy') {
      // --- Future war: hover-gunships, energy beams, a defender shield dome ---
      if (b.siege) { // shield dome over the besieged city, flickering as it's struck
        const hit = 0.5 + 0.5 * Math.sin(nowSec * 7 + b.seed);
        for (const rr of [10, 7]) warGfx.moveTo(b.dx - rr, b.dy + 2).arc(b.dx, b.dy + 2, rr, Math.PI, 0).stroke({ color: 0x7fe8ff, alpha: (0.12 + 0.18 * hit) * env, width: 1.2 });
      }
      const aGlow = lerpColor(b.aColor, 0x9ffcff, 0.6), dGlow = lerpColor(b.dColor, 0xff9af0, 0.55);
      for (let k = 0; k < 3; k++) {
        drawGunship(warGfx, b.ax + ((k % 2) - 0.5) * 4, b.ay + (k - 1) * 3.2, hx, hy, aGlow, nowSec, k);
        drawGunship(warGfx, b.dx + ((k % 2) - 0.5) * 4, b.dy + (k - 1) * 3.2, -hx, -hy, dGlow, nowSec, k + 5);
      }
      // Beam weapons lancing across the gap, flickering on and off.
      for (let k = 0; k < 3; k++) {
        const on = Math.sin(nowSec * 6 + k * 2.1 + b.seed) > 0.2;
        if (!on) continue;
        const fromA = (k % 2) === 0;
        const sx = (fromA ? b.ax : b.dx) + (Math.random() - 0.5) * 5, sy = (fromA ? b.ay : b.dy) - 1 + (Math.random() - 0.5) * 4;
        const ex = (fromA ? b.dx : b.ax) + (Math.random() - 0.5) * 4, ey = (fromA ? b.dy : b.ay) - 1 + (Math.random() - 0.5) * 3;
        const col = fromA ? aGlow : dGlow;
        warGfx.moveTo(sx, sy).lineTo(ex, ey).stroke({ color: col, alpha: 0.18 * env, width: 2.4, cap: 'round' });
        warGfx.moveTo(sx, sy).lineTo(ex, ey).stroke({ color: 0xffffff, alpha: 0.7 * env, width: 0.7, cap: 'round' });
        warGfx.circle(ex, ey, 1.8).fill({ color: col, alpha: 0.7 * env }); // impact flare
      }
      // Rarely, a Giant Death Robot strides in on the attacker's side.
      if (b.seed % 4 === 0) drawDeathRobot(warGfx, b.ax - hx * 6, b.ay + 2, hx, nowSec, b.aColor, env);
    } else if (style === 'mech') {
      // --- Industrial war: tanks and artillery, tracers, drifting smoke ---
      for (let k = 0; k < 3; k++) { // smoke from the shelling
        const sx = b.cx + Math.sin(nowSec * 1.1 + k * 2 + b.seed) * 7, sy = b.cy - 2 - ((nowSec * 5 + k * 6) % 10);
        warGfx.ellipse(sx, sy, 5 - k * 0.8, 3 - k * 0.5).fill({ color: 0x6b6358, alpha: 0.16 * env * (1 - k / 3) });
      }
      const aFire = Math.sin(nowSec * 5 + b.seed) > 0.45, dFire = Math.sin(nowSec * 5 + b.seed + 2.5) > 0.45;
      for (let k = 0; k < 3; k++) {
        drawTank(warGfx, b.ax + ((k % 2) - 0.5) * 4.5, b.ay + (k - 1) * 3.4, hx, hy, b.aColor, aFire && k === 1);
        drawTank(warGfx, b.dx + ((k % 2) - 0.5) * 4.5, b.dy + (k - 1) * 3.4, -hx, -hy, b.dColor, dFire && k === 1);
      }
      // Shell tracers arcing across the gap.
      for (let k = 0; k < 2; k++) {
        const f = (nowSec * 0.9 + k * 0.5) % 1, fromA = k % 2 === 0;
        const x0 = fromA ? b.ax : b.dx, y0 = fromA ? b.ay : b.dy, x1 = fromA ? b.dx : b.ax, y1 = fromA ? b.dy : b.ay;
        const tx = x0 + (x1 - x0) * f, ty = y0 + (y1 - y0) * f - Math.sin(Math.PI * f) * 6; // arc
        warGfx.circle(tx, ty, 0.7).fill({ color: 0xffe08a, alpha: 0.85 * env });
      }
      if (b.siege) for (let k = 0; k < 3; k++) { // sandbag/bunker emplacements
        const tx = b.ax + (k - 1) * 5, ty = b.ay + 2.5;
        warGfx.rect(tx - 2.4, ty - 1.4, 4.8, 1.8).fill({ color: 0x6f6450, alpha: 0.85 * env });
      }
      // The industrial era floats an observation balloon behind its lines.
      if (b.era === 3) drawObservationBalloon(warGfx, b.ax - hx * 7, b.ay, nowSec, b.seed, env);
    } else {
      // --- Ancient war: infantry with shields and banners, dust, tents ---
      for (let k = 0; k < 3; k++) {
        const px = b.cx + Math.sin(nowSec * 1.3 + k * 2 + b.seed) * 6, py = b.cy - 1 - ((nowSec * 4 + k * 5) % 7);
        warGfx.ellipse(px, py, 6 - k, 2.6 - k * 0.4).fill({ color: 0xb6a890, alpha: 0.13 * env * (1 - k / 3) });
      }
      if (b.siege) for (let k = 0; k < 3; k++) {
        const tx = b.ax + (k - 1) * 5, ty = b.ay + 2;
        warGfx.poly([tx, ty - 4, tx - 3, ty, tx + 3, ty]).fill({ color: 0xb8a079, alpha: 0.85 * env });
      }
      for (let k = 0; k < 7; k++) {
        const j = b.seed + k, wig = Math.sin(nowSec * 9 + j) * 1.3;
        drawTrooper(warGfx, b.ax + ((k % 3) - 1) * 3 + wig, b.ay + (((k / 3) | 0) - 0.5) * 3, b.aColor);
        drawTrooper(warGfx, b.dx + ((k % 3) - 1) * 3 - wig, b.dy + (((k / 3) | 0) - 0.5) * 3, b.dColor);
      }
      drawBanner(warGfx, b.ax - 6, b.ay, b.aColor, nowSec);
      drawBanner(warGfx, b.dx + 6, b.dy, b.dColor, nowSec);
      if (Math.sin(nowSec * 7 + b.seed) > 0.4) {
        warGfx.circle(b.cx + Math.sin(nowSec * 13) * 3, b.cy - 2, 0.8).fill({ color: 0xffe08a, alpha: 0.8 * env });
      }
    }

    // Reinforcements stream up the road from the attacker's city (all eras).
    const march = (nowSec * 0.18) % 1;
    for (let k = 0; k < 4; k++) {
      const f = ((k / 4) + march) % 1;
      const mxp = b.mx + (b.ax - b.mx) * f, myp = b.my + (b.ay - b.my) * f;
      warGfx.circle(mxp, myp - 1, 0.9).fill({ color: 0x35322b, alpha: 0.6 * env });
    }
  }
}

function checkWarQuiet() {
  const now = worldClock;
  for (const [k, w] of warHeat) {
    if (w.narratedAt > 0 && now - w.lastTs > 45) {
      const A = simWorld.civs.get(w.a), B = simWorld.civs.get(w.b);
      if (A && B && A.phase !== 'dead' && B.phase !== 'dead') {
        const ok = pushNarration(colorizeCivNames(pick([
          `The border between ${A.name} and ${B.name} falls quiet.`,
          `The fighting between ${A.name} and ${B.name} burns itself out.`,
        ])), { priority: 'low', dedupKey: `war:${k}`, anchor: { row: w.row, col: w.col } });
        // This threshold is world time but pushNarration's dedup window is wall
        // time (NARRATION_GAP_MS.low, 6s), so at 8x we arrive 5.6 wall seconds
        // after the last line and the follow-up is refused. Keep the entry and
        // retry on a later pass rather than dropping the line for good.
        if (!ok && now - w.lastTs < QUIET_RETRY_UNTIL_SEC) continue;
      }
      warHeat.delete(k);
    } else if (w.narratedAt === 0 && now - w.lastTs > 60) {
      warHeat.delete(k);
    }
  }
}

let conflictWasEmpty = true;
function updateConflictFlashes(dt: number) {
  if (conflictFlashes.length === 0) {
    if (!conflictWasEmpty) { conflictGfx.clear(); conflictWasEmpty = true; }
    return;
  }
  conflictWasEmpty = false;
  conflictGfx.clear();
  for (let i = conflictFlashes.length - 1; i >= 0; i--) {
    const f = conflictFlashes[i];
    f.age += dt;
    const u = f.age / 0.8;
    if (u >= 1) { conflictFlashes.splice(i, 1); continue; }
    conflictGfx.circle(f.x, f.y, 1.6 + u * 2).fill({ color: 0xffa050, alpha: (1 - u) * 0.7 });
    conflictGfx.circle(f.x, f.y - u * 5, 2.2).fill({ color: 0x5a544c, alpha: (1 - u) * 0.3 });
  }
}

// Wonders: each great civ raises a monument in the age it flourished — a stone
// circle, a pyramid, a cathedral, an iron tower — that rises stone by stone
// over time, spans several tiles, and weathers into an evocative ruin when its
// builders are gone. The land remembers them long after the civ is weather.
const WONDER_BUILD = 15; // seconds to raise a wonder, course by course
interface WonderState { era: Era; born: number }
const wonderState = new Map<number, WonderState>();
// Debug-spawned wonders, independent of any civ — for the test menu.
const debugWonders: Array<{ row: number; col: number; era: Era; born: number }> = [];
function drawWonders(nowSec: number, night: number) {
  wonderGfx.clear();
  const live = new Set<number>();
  for (const civ of simWorld.civs.values()) {
    if (!civ.wonder) continue;
    live.add(civ.id);
    let st = wonderState.get(civ.id);
    if (!st) { st = { era: civ.era, born: nowSec }; wonderState.set(civ.id, st); } // monument keeps the age it was raised in
    const prog = Math.min(1, (nowSec - st.born) / WONDER_BUILD);
    const { x, y } = gridToScreen(civ.wonder.col, civ.wonder.row);
    drawOneWonder(wonderGfx, x, y, st.era, prog, civ.phase === 'dead', nowSec, night);
  }
  for (const id of wonderState.keys()) if (!live.has(id)) wonderState.delete(id);
  for (const w of debugWonders) {
    const prog = Math.min(1, (nowSec - w.born) / WONDER_BUILD);
    const { x, y } = gridToScreen(w.col, w.row);
    drawOneWonder(wonderGfx, x, y, w.era, prog, false, nowSec, night);
  }
}

// Era settlement tells: a glance at a civ's foremost city should read its age.
// We mark only the most prominent city per civ (one tell, not clutter) and only
// the eras with a distinctive silhouette: medieval walls, industrial smokestacks,
// modern broadcast mast. Neolithic/classical are pre-skyline; post is owned by
// the megastructures. Each tell eases in/out (last position cached) so a civ
// changing era, losing prominence, or dying never makes the tell pop.
const SKYLINE_MIN_PROM = 0.5;
const SKYLINE_FADE = 0.05;
interface SkylineState { a: number; x: number; y: number; era: Era; color: number }
const skylineState = new Map<number, SkylineState>();
// Debug: where each tell is drawn (tile + screen + era + eased alpha).
(window as any).__skylines = () => [...skylineState.entries()].map(([id, s]) => ({ id, era: s.era, a: +s.a.toFixed(2), x: Math.round(s.x), y: Math.round(s.y) }));
function drawEraSkylines(nowSec: number, night: number) {
  skylineGfx.clear();
  const seen = new Set<number>();
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || !civ.cities.length) continue;
    const rank = ERA_RANK[civ.era];
    if (rank < 2 || rank > 4) continue; // medieval / industrial / modern only
    const hub = civ.cities.reduce((b, c) => (c.prominence > b.prominence ? c : b), civ.cities[0]);
    if (hub.prominence < SKYLINE_MIN_PROM) continue;
    seen.add(civ.id);
    const { x, y } = gridToScreen(hub.col, hub.row);
    const st = skylineState.get(civ.id) ?? { a: 0, x, y, era: civ.era, color: civ.color };
    st.a += (1 - st.a) * ease(SKYLINE_FADE); st.x = x; st.y = y; st.era = civ.era; st.color = civ.color;
    skylineState.set(civ.id, st);
    drawEraTell(skylineGfx, x, y, civ.era, st.a, nowSec, night, civ.color);
  }
  // Fade out any tell whose civ no longer qualifies, at its last-known spot.
  for (const [id, st] of skylineState) {
    if (seen.has(id)) continue;
    st.a -= st.a * ease(SKYLINE_FADE) + 0.004 * easeFrames;
    if (st.a <= 0.01) { skylineState.delete(id); continue; }
    drawEraTell(skylineGfx, st.x, st.y, st.era, st.a, nowSec, night, st.color);
  }
}
function drawEraTell(g: Graphics, x: number, y: number, era: Era, a: number, nowSec: number, night: number, civColor: number) {
  if (a < 0.02) return;
  if (era === 'medieval') {
    // A walled keep: crenellated curtain wall flanking a square central tower.
    const body = 0xb9b0a0, dark = 0x8a8273, lit = 0xd8cfbd;
    g.rect(x - 20, y - 7, 40, 7).fill({ color: body, alpha: 0.9 * a });
    g.rect(x - 20, y - 7, 40, 1.5).fill({ color: lit, alpha: 0.8 * a });
    for (let i = -19; i <= 15; i += 8) g.rect(x + i, y - 10, 4, 3).fill({ color: body, alpha: 0.9 * a }); // merlons
    g.rect(x - 6, y - 24, 12, 18).fill({ color: body, alpha: 0.93 * a }); // keep
    g.rect(x - 6, y - 24, 4, 18).fill({ color: dark, alpha: 0.5 * a });   // shaded face
    g.rect(x - 6, y - 24, 12, 1.6).fill({ color: lit, alpha: 0.8 * a });
    for (let i = -6; i <= 2; i += 4) g.rect(x + i, y - 27, 3, 3).fill({ color: body, alpha: 0.9 * a }); // keep merlons
    g.poly([x + 6, y - 26, x + 6, y - 32, x + 13, y - 30]).fill({ color: civColor, alpha: 0.85 * a }); // pennant
  } else if (era === 'industrial') {
    // Brick smokestacks over a long shed; the era's dark smoke already rises here.
    const brick = 0x6e5648, cap = 0x4a3a30, shade = lerpColor(0x6e5648, 0x000000, 0.28);
    g.rect(x - 13, y - 8, 26, 8).fill({ color: 0x5a4b40, alpha: 0.9 * a }); // factory shed
    for (const [dx, h] of [[-8, 23], [2, 30], [10, 19]] as Array<[number, number]>) {
      g.rect(x + dx - 2, y - h, 4, h).fill({ color: brick, alpha: 0.93 * a });
      g.rect(x + dx - 2, y - h, 1.5, h).fill({ color: shade, alpha: 0.5 * a });
      g.rect(x + dx - 2.7, y - h, 5.4, 2).fill({ color: cap, alpha: 0.9 * a }); // crown
    }
  } else { // modern
    // A guyed broadcast mast with a red aviation light that blinks at night.
    const steel = 0x9aa0a6, guy = 0x5f656b, H = 40, top = y - H;
    g.rect(x - 1, top, 2, H).fill({ color: steel, alpha: 0.9 * a });
    for (let k = 1; k <= 4; k++) {
      const yy = y - H * k / 5, spread = 11 - k * 1.5;
      g.moveTo(x, yy).lineTo(x - spread, y).stroke({ color: guy, alpha: 0.3 * a, width: 0.6 });
      g.moveTo(x, yy).lineTo(x + spread, y).stroke({ color: guy, alpha: 0.3 * a, width: 0.6 });
    }
    g.rect(x - 4, top + 7, 8, 2).fill({ color: steel, alpha: 0.85 * a }); // platform
    const blink = 0.5 + 0.5 * Math.sin(nowSec * 3);
    g.circle(x, top - 1, 1.7).fill({ color: 0xff3326, alpha: (0.22 + 0.7 * night * blink) * a });
  }
}
function drawOneWonder(g: Graphics, x: number, y: number, era: Era, prog: number, dead: boolean, nowSec: number, night: number) {
  const body = dead ? 0x8b8479 : 0xe9e2d2;
  const edge = dead ? 0x5f594f : 0x9a9282;
  const dark = dead ? 0x49453d : 0x756e5e;
  // A broad ground platform — every wonder spans several tiles, not one.
  g.ellipse(x, y + 2, 30, 13).fill({ color: edge, alpha: 0.26 });
  if (era === 'neolithic') {
    // Stone circle: a ring of megaliths raised one at a time, lintels last.
    const N = 9, rx = 26, ry = 11;
    for (let i = 0; i < N; i++) {
      if (i / N > prog) continue;
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const sx = x + Math.cos(a) * rx, sy = y + Math.sin(a) * ry;
      const back = sy < y;
      if (dead && i % 3 === 0) { g.poly([sx - 2, sy, sx + 6, sy - 2, sx + 7, sy + 1, sx - 1, sy + 2]).fill({ color: edge, alpha: 0.9 }); continue; } // toppled
      const h = 9 + (i % 2) * 3;
      g.rect(sx - 2.2, sy - h, 4.4, h).fill({ color: back ? dark : body, alpha: 0.96 });
      g.rect(sx - 2.2, sy - h, 4.4, 1.6).fill({ color: edge, alpha: 0.9 });
    }
    if (prog > 0.9 && !dead) for (const a of [0.5, 1.5]) { // a couple of capstone lintels
      const sx = x + Math.cos(a) * rx, sy = y + Math.sin(a) * ry;
      g.rect(sx - 5, sy - 13, 10, 2.4).fill({ color: body, alpha: 0.95 });
    }
  } else if (era === 'classical') {
    // Stepped pyramid, raised course by course from a wide base.
    const courses = 7, baseW = 27, H = 27, ch = H / courses;
    for (let c = 0; c < courses; c++) {
      if (c / courses > prog + 0.001) break;
      const w0 = baseW * (1 - c / courses), w1 = baseW * (1 - (c + 1) / courses);
      const yy = y - c * ch;
      g.poly([x - w0, yy, x + w0, yy, x + w1, yy - ch, x - w1, yy - ch])
        .fill({ color: c % 2 ? body : lerpColor(body, edge, 0.22), alpha: 0.97 });
      g.poly([x + w0, yy, x + w1, yy - ch, x + w1 + 4, yy - ch + 1, x + w0 + 4, yy + 1]).fill({ color: dark, alpha: 0.5 }); // shaded east face
    }
    if (dead) g.ellipse(x - 12, y, 7, 3).fill({ color: edge, alpha: 0.6 }); // fallen rubble
  } else if (era === 'medieval') {
    // A great cathedral: nave, twin west towers, and a central spire.
    const w = 13, naveH = 13;
    if (prog > 0.05) { // nave body
      const nh = naveH * Math.min(1, prog / 0.6);
      g.poly([x - w, y, x + w, y, x + w, y - nh, x - w, y - nh]).fill({ color: body, alpha: 0.96 });
      g.poly([x + w, y, x + w, y - nh, x + w + 5, y - nh - 2, x + w + 5, y - 2]).fill({ color: dark, alpha: 0.55 }); // roof slope
    }
    if (prog > 0.55 && !dead) for (const tx of [-w + 3, w - 3]) { // twin towers
      const th = 22 * Math.min(1, (prog - 0.55) / 0.3);
      g.rect(x + tx - 2.5, y - th, 5, th).fill({ color: body, alpha: 0.96 });
      if (th > 18) g.poly([x + tx - 2.5, y - th, x + tx + 2.5, y - th, x + tx, y - th - 4]).fill({ color: edge, alpha: 0.95 });
    }
    if (prog > 0.8) { // central spire
      const sh = 30 * Math.min(1, (prog - 0.8) / 0.2);
      g.poly([x - 2, y - naveH, x + 2, y - naveH, x, y - naveH - sh]).fill({ color: dead ? edge : body, alpha: 0.95 });
    }
    if (dead) g.rect(x - w, y - 4, w * 2, 4).fill({ color: dark, alpha: 0.4 }); // roofless gloom
  } else if (era === 'industrial') {
    // An iron lattice tower flaring to four legs, a beacon at its peak.
    const H = 40 * (dead ? 0.7 : 1), legW = 16;
    const ironC = dead ? 0x4a4742 : 0x6a5a4a;
    const top = y - H * Math.min(1, prog / 0.92);
    // outline legs
    g.poly([x - legW, y, x - 1.5, top, x + 1.5, top, x + legW, y, x + legW - 3, y, x + 1, top + 2, x - 1, top + 2, x - legW + 3, y]).fill({ color: ironC, alpha: 0.95 });
    // cross-bracing
    for (let k = 1; k <= 4; k++) {
      const f = k / 5; const yy = y - (y - top) * f;
      const lw = legW * (1 - f * 0.85);
      g.moveTo(x - lw, yy).lineTo(x + lw, yy).stroke({ color: ironC, alpha: 0.7, width: 0.8 });
      if (yy < y - 4) { g.moveTo(x - lw, yy).lineTo(x + lw * 0.4, yy + (y - top) * 0.18).stroke({ color: ironC, alpha: 0.45, width: 0.5 }); }
    }
    if (prog > 0.92 && !dead) g.circle(x, top - 1, 1.4).fill({ color: 0xff7a4a, alpha: 0.5 + 0.4 * Math.sin(nowSec * 3) }); // beacon
  } else if (era === 'modern') {
    // A soaring monument obelisk on a plaza, lit at its crown.
    const H = 36 * (dead ? 0.75 : 1) * Math.min(1, prog / 0.9);
    g.rect(x - 9, y - 3, 18, 3).fill({ color: edge, alpha: 0.8 }); // plaza
    g.poly([x - 3.2, y - 2, x + 3.2, y - 2, x + 1.6, y - H, x - 1.6, y - H]).fill({ color: dead ? edge : 0xeef1f6, alpha: 0.97 });
    g.poly([x + 0.4, y - 2, x + 3.2, y - 2, x + 1.6, y - H, x + 0.4, y - H]).fill({ color: dark, alpha: 0.4 }); // shaded side
    if (prog > 0.9 && !dead) g.circle(x, y - H, 1.6).fill({ color: 0xfff0b0, alpha: 0.5 + 0.4 * night });
  } else { // post
    // A monolith of dark glass haloed in light — the last age's wonder.
    const H = 30 * Math.min(1, prog / 0.9);
    g.rect(x - 5, y - H, 10, H).fill({ color: dead ? 0x3a3a42 : 0x1f2330, alpha: 0.9 });
    g.rect(x - 5, y - H, 3, H).fill({ color: dead ? 0x4a4a52 : 0x3a4458, alpha: 0.8 });
    if (!dead) {
      const pulse = 0.5 + 0.5 * Math.sin(nowSec * 1.5);
      g.rect(x - 5, y - H, 10, H).stroke({ color: 0x8fd8ff, alpha: 0.3 + 0.3 * pulse, width: 1 });
      g.circle(x, y - H * 0.5, 7).fill({ color: 0x7fc8ff, alpha: 0.06 + 0.06 * pulse });
    }
  }
}

// Route trails: every dispatched boat / caravan / train / plane lays a faint
// trail along its route; reused routes brighten and thicken, disused ones fade.
// By the modern age the map shows the worn web of sea lanes, rails, and flight
// corridors. Keyed by the unordered pair of adjacent tiles (an edge), so the
// trails read as continuous lines.
const TRAIL_N = GRID_SIZE * GRID_SIZE;
const TRAIL_CAP = 12;        // heat at which a route is fully worn in
type Trail = Map<number, number>;
const seaTrail: Trail = new Map();
const landTrail: Trail = new Map();
const airTrail: Trail = new Map();

function trailAdd(trail: Trail, path: Array<{ row: number; col: number }>, amount: number) {
  for (let i = 0; i < path.length - 1; i++) {
    const ka = path[i].row * GRID_SIZE + path[i].col;
    const kb = path[i + 1].row * GRID_SIZE + path[i + 1].col;
    if (ka === kb) continue;
    const ek = ka < kb ? ka * TRAIL_N + kb : kb * TRAIL_N + ka;
    trail.set(ek, Math.min(TRAIL_CAP, (trail.get(ek) || 0) + amount));
  }
}
function trailDecay(trail: Trail, f: number) {
  for (const [k, v] of trail) { const nv = v * f; if (nv < 0.3) trail.delete(k); else trail.set(k, nv); }
}
function drawTrail(g: Graphics, trail: Trail, color: number, baseA: number, peakA: number, baseW: number, peakW: number) {
  g.clear();
  for (const [ek, heat] of trail) {
    const ka = (ek / TRAIL_N) | 0, kb = ek % TRAIL_N;
    const pa = gridToScreen(ka % GRID_SIZE, (ka / GRID_SIZE) | 0);
    const pb = gridToScreen(kb % GRID_SIZE, (kb / GRID_SIZE) | 0);
    const t = Math.min(1, heat / TRAIL_CAP);
    g.moveTo(pa.x, pa.y).lineTo(pb.x, pb.y)
      .stroke({ color, alpha: baseA + (peakA - baseA) * t, width: baseW + (peakW - baseW) * t, cap: 'round' });
  }
}
// Tiles along the straight line between two points (for flight corridors).
function sampleLine(r0: number, c0: number, r1: number, c1: number): Array<{ row: number; col: number }> {
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  const out: Array<{ row: number; col: number }> = [];
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    out.push({ row: Math.round(r0 + (r1 - r0) * t), col: Math.round(c0 + (c1 - c0) * t) });
  }
  return out;
}
function redrawTrails() {
  drawTrail(seaTrailGfx, seaTrail, 0xeafdff, 0.12, 0.70, 1.1, 3.8);
  drawTrail(landTrailGfx, landTrail, 0x46371f, 0.12, 0.55, 1.0, 3.0);
  drawTrail(airTrailGfx, airTrail, 0xeaf0fa, 0.07, 0.40, 0.7, 2.2);
}
// A "skip 5k" fast-forwards past all the real-time travel that would have worn
// the routes in, so seed the trails from each civ's city network (older, larger
// civs more worn) — otherwise jumping to the modern age shows a blank map.
function seedTrailsAfterSkip() {
  let budget = 90;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || civ.cities.length < 2) continue;
    const era = ERA_RANK[civ.era];
    let hub = civ.cities[0];
    for (const c of civ.cities) if (c.prominence > hub.prominence) hub = c;
    for (let i = 1; i < civ.cities.length && budget > 0; i++, budget--) {
      const city = civ.cities[i];
      const rp = roadBetween(hub, city);
      if (rp && rp.length >= 2) trailAdd(landTrail, rp, 4 + era);
      const wa = coastalWaterNear(hub), wb = coastalWaterNear(city);
      if (wa && wb) {
        const ck = `${wa.row},${wa.col}-${wb.row},${wb.col}`;
        if (!waterRouteCache.has(ck)) waterRouteCache.set(ck, findWaterPath(wa.row, wa.col, wb.row, wb.col));
        const r = waterRouteCache.get(ck);
        if (r && r.length >= 6) trailAdd(seaTrail, r, 3 + era * 0.5);
      }
      if (era >= 4) trailAdd(airTrail, sampleLine(hub.row, hub.col, city.row, city.col), 3 + era * 0.5);
    }
  }
  redrawTrails();
}

// Boats, fishing dots, whales — small life on the water.
interface Boat { pts: Array<{ x: number; y: number }>; idx: number; speed: number; color: number; era: number; fade: number }
const boats: Boat[] = [];
// Shipwrecks: a boat that founders becomes a broken hull that settles, sinks,
// and fades over a few seconds.
interface Wreck { x: number; y: number; fx: number; fy: number; color: number; era: number; t: number }
const wrecks: Wreck[] = [];
const WRECK_LIFE = 8;
const waterRouteCache = new Map<string, Array<{ row: number; col: number }> | null>();
let fishSpots: Array<{ x: number; y: number }> = [];
let whale: { x: number; y: number; t: number } | null = null;

function findWaterPath(r1: number, c1: number, r2: number, c2: number): Array<{ row: number; col: number }> | null {
  // Same A* as roads, walkable = water.
  const key = (r: number, c: number) => r * GRID_SIZE + c;
  const open: Array<{ r: number; c: number; f: number }> = [{ r: r1, c: c1, f: 0 }];
  const gScore = new Map<number, number>([[key(r1, c1), 0]]);
  const cameFrom = new Map<number, number>();
  let explored = 0;
  while (open.length > 0 && explored++ < 5000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.r === r2 && cur.c === c2) {
      const path: Array<{ row: number; col: number }> = [];
      let k: number | undefined = key(cur.r, cur.c);
      while (k !== undefined) {
        path.unshift({ row: (k / GRID_SIZE) | 0, col: k % GRID_SIZE });
        k = cameFrom.get(k);
      }
      return path;
    }
    const g0 = gScore.get(key(cur.r, cur.c))!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = cur.r + dr, nc = cur.c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (biomeMap[nr][nc] !== 'water') continue;
      const nk = key(nr, nc);
      const g = g0 + 1;
      if (g >= (gScore.get(nk) ?? Infinity)) continue;
      gScore.set(nk, g);
      cameFrom.set(nk, key(cur.r, cur.c));
      open.push({ r: nr, c: nc, f: g + (Math.abs(nr - r2) + Math.abs(nc - c2)) * 1.01 });
    }
  }
  return null;
}

function coastalWaterNear(city: CivCity): { row: number; col: number } | null {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = city.row + dr, c = city.col + dc;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      if (biomeMap[r][c] === 'water') return { row: r, col: c };
    }
  }
  return null;
}

// Little life on the surface — boats, fishing, caravans, nomads. Tuned to
// feel busy and to glow like lanterns at night. Cheap (a few dozen dots).
const TRAVELERS = {
  boatCap: 16, boatPerCiv: 3, boatSpawnChance: 0.45,
  fishCap: 28, fishMinProminence: 0.4,
  caravanCap: 14, caravanPerCiv: 3, caravanSpawnChance: 0.55,
  scale: 2.2,        // sprite size multiplier
  nightGlow: 1.0,    // lantern glow strength at full night
};

// A traveler marker, lantern-lit at night: a warm halo + glowing core appear
// as night falls, so boats and caravans read as points of light in the dark.
function travelerDot(g: Graphics, x: number, y: number, r: number, color: number, night: number, coreAlpha = 0.9) {
  if (night > 0.2) {
    const ng = Math.min(1, night) * TRAVELERS.nightGlow;
    g.circle(x, y, r * 3.0).fill({ color: 0xffca8a, alpha: 0.10 * ng });
    g.circle(x, y, r * 1.7).fill({ color: 0xffd88a, alpha: 0.34 * ng });
    g.circle(x, y, r).fill({ color: lerpColor(color, 0xfff0c4, 0.6 * ng), alpha: Math.max(coreAlpha, 0.85) });
  } else {
    g.circle(x, y, r).fill({ color, alpha: coreAlpha });
  }
}

// A little sailboat: a dark hull pointed along its heading, with a civ-coloured
// sail standing up from the deck (readable from any direction) and a lantern at
// night. Replaces the old dot so craft read as boats moving on the sea.
// Trade boats progress through the ages: a sailboat in the early eras, a
// smoking steamship in the industrial age, a container ship by the modern age.
function drawBoat(g: Graphics, x: number, y: number, fx: number, fy: number, color: number, S: number, night: number, era: number, op = 1) {
  const rx = -fy, ry = fx; // beam (perpendicular to heading)
  const ng = Math.min(1, night);
  if (era >= 4) {
    // Container ship: a long low steel hull stacked with cargo, white bridge aft.
    const L = 7 * S, W = 2.5 * S;
    g.poly([
      x + fx * L, y + fy * L,                  // bow
      x + rx * W * 0.5, y + ry * W * 0.5,
      x - fx * L * 0.95, y - fy * L * 0.95,    // squared stern
      x - rx * W * 0.5, y - ry * W * 0.5,
    ]).fill({ color: 0x39434e, alpha: 0.96 * op });
    const cc = [0xb5532e, 0x2f6ea8, 0x3f8f5a, 0xc9a23a, color]; // cargo + a civ-coloured box
    for (let n = 0; n < 5; n++) {
      const t = -0.55 + n * 0.3;
      const dx = x + fx * L * t, dy = y + fy * L * t;
      const hh = (1.5 + (n % 2) * 1.1) * S;
      g.rect(dx - 0.85 * S, dy - hh, 1.7 * S, hh).fill({ color: cc[n % cc.length], alpha: 0.95 * op });
    }
    const ax = x - fx * L * 0.78, ay = y - fy * L * 0.78;
    g.rect(ax - 0.9 * S, ay - 2.6 * S, 1.8 * S, 2.6 * S).fill({ color: 0xe7ecf1, alpha: 0.95 * op }); // bridge
    g.rect(ax - 0.35 * S, ay - 3.6 * S, 0.7 * S, 1.1 * S).fill({ color: 0x7a4a36, alpha: op });        // funnel
    if (night > 0.2) {
      g.circle(ax, ay - 3.4 * S, 0.7 * S).fill({ color: 0xffe6a8, alpha: 0.7 * ng * op });
      g.circle(x + fx * L, y + fy * L, 0.6 * S).fill({ color: 0xff6a5a, alpha: 0.6 * ng * op });
    }
    return;
  }
  if (era === 3) {
    // Steamship: a dark iron hull with a smoking funnel.
    const L = 5.8 * S, W = 2.4 * S;
    g.poly([
      x + fx * L * 0.65, y + fy * L * 0.65,
      x + rx * W * 0.5, y + ry * W * 0.5,
      x - fx * L * 0.5, y - fy * L * 0.5,
      x - rx * W * 0.5, y - ry * W * 0.5,
    ]).fill({ color: 0x3a3530, alpha: 0.96 * op });
    g.rect(x - 0.75 * S, y - 4.4 * S, 1.5 * S, 3.2 * S).fill({ color: 0x5a4038, alpha: op });  // funnel
    g.rect(x - 0.75 * S, y - 4.4 * S, 1.5 * S, 0.6 * S).fill({ color: 0x2a201c, alpha: op });  // cap band
    for (let s = 0; s < 3; s++) {                                                              // smoke drifting astern
      g.circle(x - fx * (2 + s * 2.2) * S, y - (4.8 + s * 0.7) * S, (1 + s * 0.6) * S)
        .fill({ color: 0x6c6c72, alpha: (0.32 - s * 0.08) * op });
    }
    if (night > 0.2) g.circle(x, y - 2 * S, 0.7 * S).fill({ color: 0xffe6a8, alpha: 0.6 * ng * op });
    return;
  }
  // Sail era (neolithic → medieval): a wooden hull with a triangular sail that
  // grows taller, with a topsail hint, in the medieval age.
  const L = 5.4 * S, W = 2.4 * S;
  g.poly([
    x + fx * L * 0.6, y + fy * L * 0.6,     // bow
    x + rx * W * 0.5, y + ry * W * 0.5,
    x - fx * L * 0.45, y - fy * L * 0.45,   // stern
    x - rx * W * 0.5, y - ry * W * 0.5,
  ]).fill({ color: 0x4a3a2a, alpha: 0.95 * op });
  const sh = (era >= 2 ? 6.6 : 5.4) * S, sw = (era >= 2 ? 2.7 : 2.3) * S;
  g.poly([x, y - sh, x - sw, y - S, x + sw, y - S]).fill({ color: lerpColor(color, 0xffffff, 0.2), alpha: 0.96 * op });
  if (era >= 2) g.poly([x, y - sh, x - sw * 0.5, y - sh * 0.55, x, y - sh * 0.55]).fill({ color: lerpColor(color, 0xffffff, 0.4), alpha: 0.6 * op });
  if (night > 0.2) {
    const ng2 = ng * TRAVELERS.nightGlow;
    g.circle(x, y - sh * 0.45, 3.4 * S).fill({ color: 0xffca8a, alpha: 0.10 * ng2 * op });
    g.circle(x, y - sh * 0.45, 1.2 * S).fill({ color: 0xffe6a8, alpha: 0.55 * ng2 * op });
  }
}

// A small silver fish (body + tail fin) swimming along `ang`. For fishing
// grounds, so the sea has fish, not brown dots that look like land animals.
function drawFish(g: Graphics, x: number, y: number, ang: number, S: number, night: number) {
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  const L = 2.8 * S, W = 1.2 * S, col = 0x6f8da0, a = 0.82 * (1 - 0.35 * night);
  g.poly([
    x + dx * L * 0.5, y + dy * L * 0.5,                 // nose
    x + px * W * 0.5, y + py * W * 0.5,
    x - dx * L * 0.35, y - dy * L * 0.35,               // tail base
    x - px * W * 0.5, y - py * W * 0.5,
  ]).fill({ color: col, alpha: a });
  g.poly([
    x - dx * L * 0.35, y - dy * L * 0.35,
    x - dx * L * 0.65 + px * W * 0.7, y - dy * L * 0.65 + py * W * 0.7,
    x - dx * L * 0.65 - px * W * 0.7, y - dy * L * 0.65 - py * W * 0.7,
  ]).fill({ color: col, alpha: a * 0.85 });
}

// A small jet seen from above, pointed along (hx,hy): a slim fuselage, swept
// delta wings, and a tailplane. Replaces the dot so aircraft read as planes.
function drawPlane(g: Graphics, x: number, y: number, hx: number, hy: number, night: number) {
  const px = -hy, py = hx;
  const col = 0xeef2f8, a = 0.95;
  // Swept main wings (drawn under the fuselage).
  const span = 6.5, sweep = 2.6;
  g.poly([
    x + hx * 0.5, y + hy * 0.5,                              // wing root, forward
    x - hx * sweep + px * span, y - hy * sweep + py * span,  // left tip, back+out
    x - hx * (sweep + 1.8), y - hy * (sweep + 1.8),          // trailing root
    x - hx * sweep - px * span, y - hy * sweep - py * span,  // right tip
  ]).fill({ color: col, alpha: a * 0.92 });
  // Tailplane.
  const tspan = 2.6, tback = 4.4;
  g.poly([
    x - hx * (tback - 0.8), y - hy * (tback - 0.8),
    x - hx * tback + px * tspan, y - hy * tback + py * tspan,
    x - hx * (tback + 1.0), y - hy * (tback + 1.0),
    x - hx * tback - px * tspan, y - hy * tback - py * tspan,
  ]).fill({ color: col, alpha: a * 0.92 });
  // Fuselage.
  const L = 6.5, W = 1.0;
  g.poly([
    x + hx * L, y + hy * L,             // nose
    x + px * W, y + py * W,
    x - hx * L * 0.85, y - hy * L * 0.85, // tail
    x - px * W, y - py * W,
  ]).fill({ color: col, alpha: a });
  // A red nav light winks at the nose after dark.
  if (night > 0.3) g.circle(x + hx * L * 0.7, y + hy * L * 0.7, 0.9).fill({ color: 0xff5a4a, alpha: 0.55 * Math.min(1, night) });
}

// Hub-and-spoke: most journeys radiate from a civ's busiest city, so prominent
// cities become hubs with worn spokes fanning out to the rest of the network.
const HUB_BIAS = 0.8;
function hubAndSpoke(n: number, promAt: (k: number) => number): [number, number] {
  let hub = 0;
  for (let k = 1; k < n; k++) if (promAt(k) > promAt(hub)) hub = k;
  const i = Math.random() < HUB_BIAS ? hub : Math.floor(Math.random() * n);
  let j = Math.floor(Math.random() * (n - 1));
  if (j >= i) j++;
  return [i, j];
}

function maybeSpawnBoats() {
  if (boats.length >= TRAVELERS.boatCap) return;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || civ.cities.length < 2) continue;
    if (boats.filter((b) => b.color === civ.color).length >= TRAVELERS.boatPerCiv) continue;
    if (Math.random() > TRAVELERS.boatSpawnChance) continue;
    const coastal = civ.cities
      .map((city) => ({ city, w: coastalWaterNear(city) }))
      .filter((e) => e.w);
    if (coastal.length < 2) continue;
    const [i, j] = hubAndSpoke(coastal.length, (k) => coastal[k].city.prominence);
    const a = coastal[i].w!, b = coastal[j].w!;
    const ck = `${a.row},${a.col}-${b.row},${b.col}`;
    if (!waterRouteCache.has(ck)) waterRouteCache.set(ck, findWaterPath(a.row, a.col, b.row, b.col));
    const route = waterRouteCache.get(ck);
    if (!route || route.length < 6) continue;
    trailAdd(seaTrail, route, 1.3); // wear the sea lane
    const rank = ERA_RANK[civ.era];
    const eraSpeed = rank >= 4 ? 1.5 : rank === 3 ? 1.2 : rank === 2 ? 0.95 : 0.75; // sail is slow; steam and cargo are fast
    boats.push({
      pts: route.map((p) => gridToScreen(p.col, p.row)),
      idx: 0,
      speed: (1.6 + Math.random() * 0.8) * eraSpeed, // path points per second
      color: civ.color,
      era: rank,
      fade: 1,
    });
    if (boats.length >= TRAVELERS.boatCap) return;
  }
}

function rebuildFishSpots() {
  fishSpots = [];
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') continue;
    for (const city of civ.cities) {
      if (city.prominence < TRAVELERS.fishMinProminence || fishSpots.length >= TRAVELERS.fishCap) continue;
      const w = coastalWaterNear(city);
      if (w) fishSpots.push(gridToScreen(w.col, w.row));
    }
  }
}

function drawWreck(g: Graphics, w: Wreck, S: number) {
  const op = Math.max(0, 1 - w.t / WRECK_LIFE);
  const sink = Math.min(1, w.t / WRECK_LIFE); // settles lower and tips as it goes under
  const rx = -w.fy, ry = w.fx;
  // foam disturbance where she went down, fading fast
  if (w.t < 2.2) g.circle(w.x, w.y, (3 + w.t * 2.4) * S).stroke({ color: 0xffffff, alpha: 0.22 * (1 - w.t / 2.2), width: 1 });
  // the broken hull, bow tipping down, settling into the sea
  const L = 4.6 * S, W = 1.9 * S, dip = sink * 3 * S;
  g.poly([
    w.x + w.fx * L * (1 - sink * 0.55), w.y + w.fy * L * (1 - sink * 0.55) + dip, // bow dips under
    w.x + rx * W * 0.5, w.y + ry * W * 0.5,
    w.x - w.fx * L * 0.45, w.y - w.fy * L * 0.45,
    w.x - rx * W * 0.5, w.y - ry * W * 0.5,
  ]).fill({ color: 0x352b22, alpha: 0.85 * op });
  // a snapped mast leaning over, and a little floating debris
  g.moveTo(w.x - w.fx * S, w.y - w.fy * S).lineTo(w.x - w.fx * 4 * S + 2, w.y - (4.5 * (1 - sink)) * S)
    .stroke({ color: 0x2a241d, alpha: 0.7 * op, width: 1.2 });
  for (let d = 0; d < 3; d++) g.circle(w.x + Math.sin(w.t * 1.5 + d * 2) * 4, w.y + 1 + d, 0.6).fill({ color: 0x4a4038, alpha: 0.45 * op });
}

// A building going up wears a timber/steel scaffold (posts + platform beams +
// a brace) that comes down as the walls fill in. Drawn over the rising sprite.
function drawScaffold(bx: number, byBase: number, byTop: number, a: number) {
  const op = Math.max(0, 1 - a / 0.9) * 0.8;
  if (op <= 0.01) return;
  const ht = byBase - byTop, sw = 2.6;
  const post = 0x9a8763, beam = 0xc2b290;
  scaffoldGfx.rect(bx - sw, byTop, 0.7, ht).fill({ color: post, alpha: op });          // corner posts
  scaffoldGfx.rect(bx + sw - 0.7, byTop, 0.7, ht).fill({ color: post, alpha: op });
  for (let lv = 0; lv <= 3; lv++) {                                                     // platform beams
    const yy = byTop + ht * lv / 3;
    scaffoldGfx.rect(bx - sw - 0.5, yy, sw * 2 + 1, 0.6).fill({ color: beam, alpha: op * 0.9 });
  }
  scaffoldGfx.moveTo(bx - sw, byBase).lineTo(bx + sw, byTop).stroke({ color: post, alpha: op * 0.55, width: 0.6 }); // diagonal brace
}

function updateWater(dt: number, nowSec: number, night: number) {
  const empty = boats.length === 0 && wrecks.length === 0 && fishSpots.length === 0 && !whale;
  if (empty) { boatsGfx.clear(); return; }
  const S = TRAVELERS.scale;
  boatsGfx.clear();
  for (let i = boats.length - 1; i >= 0; i--) {
    const b = boats[i];
    const last = b.pts.length - 1;
    if (b.fade >= 1) {
      b.idx += b.speed * dt;
      if (b.idx >= last) { b.idx = last; b.fade = 0.999; } // arrived → fade out at the dock
    } else {
      b.fade -= dt / 1.3;
      if (b.fade <= 0) { boats.splice(i, 1); continue; }
    }
    const k = Math.min(Math.floor(b.idx), last - 1), u = Math.min(1, b.idx - k);
    const x = b.pts[k].x + (b.pts[k + 1].x - b.pts[k].x) * u;
    const y = b.pts[k].y + (b.pts[k + 1].y - b.pts[k].y) * u;
    let fx = b.pts[k + 1].x - b.pts[k].x, fy = b.pts[k + 1].y - b.pts[k].y;
    const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    // a rare wreck mid-voyage — she founders and becomes a sinking hulk
    if (b.fade >= 1 && b.idx > 2 && b.idx < last - 2 && Math.random() < 0.004 * dt) {
      wrecks.push({ x, y, fx, fy, color: b.color, era: b.era, t: 0 });
      boats.splice(i, 1); continue;
    }
    // a little foam wake trailing astern (only while under way)
    if (b.fade >= 1 && k > 1) boatsGfx.circle(x - fx * 4 * S, y - fy * 4 * S, 1.0 * S).fill({ color: 0xffffff, alpha: 0.16 });
    drawBoat(boatsGfx, x, y, fx, fy, b.color, S, night, b.era, Math.min(1, b.fade));
  }
  for (let i = wrecks.length - 1; i >= 0; i--) {
    const w = wrecks[i];
    w.t += dt;
    if (w.t >= WRECK_LIFE) { wrecks.splice(i, 1); continue; }
    drawWreck(boatsGfx, w, S);
  }
  // Fishing grounds: a little school of silver fish circling, with a ripple —
  // so they read as fish in the sea, not a brown blob mistaken for an animal.
  for (let i = 0; i < fishSpots.length; i++) {
    const s = fishSpots[i];
    const rp = Math.sin(nowSec * 0.8 + i) * 0.5 + 0.5;
    boatsGfx.circle(s.x, s.y, (2 + rp * 3) * S).stroke({ color: 0xcfe6f2, alpha: 0.12 * (1 - rp), width: 1 });
    const n = 2 + (i % 2);
    for (let f = 0; f < n; f++) {
      const a = nowSec * (0.5 + f * 0.15) + f * 2.1 + i;
      drawFish(boatsGfx, s.x + Math.cos(a) * 2.6 * S, s.y + Math.sin(a) * 1.3 * S, a + Math.PI / 2, S, night);
    }
  }
  if (whale) {
    whale.t += dt;
    const u = whale.t / 9;
    if (u >= 1) { whale = null; }
    else {
      const env = Math.sin(Math.PI * u);
      boatsGfx.ellipse(whale.x, whale.y, 5.5, 1.9).fill({ color: 0x32424e, alpha: env * 0.6 });
      if (u > 0.2 && u < 0.5) {
        const su = (u - 0.2) / 0.3;
        boatsGfx.circle(whale.x + 3, whale.y - 2 - su * 5, 1.0).fill({ color: 0xeef4f8, alpha: (1 - su) * 0.6 });
        boatsGfx.circle(whale.x + 3.5, whale.y - 3 - su * 8, 0.7).fill({ color: 0xeef4f8, alpha: (1 - su) * 0.4 });
      }
    }
  }
}

function maybeWhale(dt: number) {
  if (whale || Math.random() > dt / 300) return;
  for (let tries = 0; tries < 20; tries++) {
    const r = Math.floor(Math.random() * GRID_SIZE), c = Math.floor(Math.random() * GRID_SIZE);
    if (biomeMap[r][c] !== 'water' || elevationMap[r][c] > SEA_LEVEL - 0.12) continue;
    const { x, y } = gridToScreen(c, r);
    whale = { x, y, t: 0 };
    triggerPing(r, c, 0xdfeaf2);
    return;
  }
}

const ERA_RANK: Record<Era, number> = { neolithic: 0, classical: 1, medieval: 2, industrial: 3, modern: 4, post: 5 };

// Land caravans (pre-industrial) and trains (industrial+) moving between a
// civ's cities along its roads — the persistent "people roaming" on land.
type LandKind = 'caravan' | 'train' | 'car';
interface Caravan { pts: Array<{ x: number; y: number }>; idx: number; speed: number; color: number; kind: LandKind }
const caravans: Caravan[] = [];

function maybeSpawnCaravans() {
  if (caravans.length >= TRAVELERS.caravanCap) return;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || civ.cities.length < 2) continue;
    if (caravans.filter((c) => c.color === civ.color).length >= TRAVELERS.caravanPerCiv) continue;
    if (Math.random() > TRAVELERS.caravanSpawnChance) continue;
    const cities = civ.cities;
    const [i, j] = hubAndSpoke(cities.length, (k) => cities[k].prominence);
    const path = roadBetween(cities[i], cities[j]);
    if (!path || path.length < 4) continue;
    trailAdd(landTrail, path, 1.3); // wear the road
    // Foot-and-wagon caravans give way to rail in the industrial age, then to
    // cars and trucks on the roads by the modern age (with some rail still).
    const rank = ERA_RANK[civ.era];
    const kind: LandKind = rank >= 4 ? (Math.random() < 0.6 ? 'car' : 'train') : rank === 3 ? 'train' : 'caravan';
    const speed = (kind === 'car' ? 3.6 : kind === 'train' ? 2.6 : 1.0) + Math.random() * 0.6;
    caravans.push({
      pts: path.map((p) => gridToScreen(p.col, p.row)),
      idx: 0,
      speed,
      color: civ.color,
      kind,
    });
    if (caravans.length >= TRAVELERS.caravanCap) return;
  }
}

// Planes (modern+) cross the world in straight lines with a contrail; rockets
// (post) lift off vertically from a city and fade into the sky.
interface Plane { x: number; y: number; vx: number; vy: number; trail: Array<{ x: number; y: number }>; color: number }
interface Rocket { x: number; y0: number; t: number; smoke: Array<{ x: number; y: number; t: number; r: number }> }
const planes: Plane[] = [];
const rockets: Rocket[] = [];

function maybeSpawnPlanes() {
  if (planes.length >= 5) return;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || ERA_RANK[civ.era] < 4 || civ.cities.length < 2) continue;
    if (Math.random() > 0.4) continue;
    // Fly between two of the civ's cities so the corridor is reused and worn in.
    const cities = civ.cities;
    const [i, j] = hubAndSpoke(cities.length, (k) => cities[k].prominence);
    const A = cities[i], B = cities[j];
    trailAdd(airTrail, sampleLine(A.row, A.col, B.row, B.col), 1.6); // lay the flight corridor
    const pa = gridToScreen(A.col, A.row), pb = gridToScreen(B.col, B.row);
    let dx = pb.x - pa.x, dy = pb.y - pa.y;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const sp = 130 + Math.random() * 90;
    // Start a little before A and fly through B and off the far side.
    planes.push({ x: pa.x - dx * 140, y: pa.y - dy * 140, vx: dx * sp, vy: dy * sp, trail: [], color: 0xeef2f8 });
    if (planes.length >= 5) return;
  }
}

function maybeSpawnRockets(dt: number) {
  if (rockets.length >= 3 || Math.random() > dt / 26) return;
  const posts = [...simWorld.civs.values()].filter((c) => c.phase !== 'dead' && ERA_RANK[c.era] >= 4 && c.cities.length);
  if (!posts.length) return;
  const civ = posts[Math.floor(Math.random() * posts.length)];
  const city = civ.cities[Math.floor(Math.random() * civ.cities.length)];
  const s = tileToSky(city.row, city.col); // screen-space base so it can rise past the horizon
  rockets.push({ x: s.x, y0: s.y, t: 0, smoke: [] });
  triggerPing(city.row, city.col, 0xfff0d0);
}

// The space age: any living modern-or-later civ has put things in orbit.
function spaceAge(): boolean {
  for (const civ of simWorld.civs.values()) if (civ.phase !== 'dead' && ERA_RANK[civ.era] >= 4) return true;
  return false;
}

// Satellites: slow points of light gliding across the sky once a civ reaches the
// space age — brightest at night, all but invisible by day. Screen-space, so
// they cross the whole firmament over the planet.
interface Satellite { x: number; y: number; vx: number; vy: number; blink: number; trail: Array<{ x: number; y: number }> }
const satellites: Satellite[] = [];
function maybeSpawnSatellite(dt: number) {
  if (satellites.length >= 4 || !spaceAge() || Math.random() > dt / 4) return;
  const W = window.innerWidth, H = window.innerHeight;
  const leftToRight = Math.random() < 0.5;
  const sp = 38 + Math.random() * 46;                 // px/s — a slow orbital glide
  const slope = (Math.random() - 0.5) * 0.5;          // mostly horizontal
  satellites.push({
    x: leftToRight ? -24 : W + 24,
    y: H * (0.06 + Math.random() * 0.48),             // up in the sky band
    vx: (leftToRight ? 1 : -1) * sp,
    vy: slope * sp,
    blink: Math.random() * 10,
    trail: [],
  });
}
function updateSatellites(dt: number, nowSec: number, night: number) {
  satelliteGfx.clear();
  if (satellites.length === 0) return;
  const W = window.innerWidth, H = window.innerHeight;
  const vis = Math.min(1, 0.12 + night * 1.15); // bright at night, near-invisible by day
  for (let i = satellites.length - 1; i >= 0; i--) {
    const s = satellites[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) { satellites.splice(i, 1); continue; }
    s.trail.push({ x: s.x, y: s.y });
    if (s.trail.length > 26) s.trail.shift();
    // A faint glinting trail the satellite draws across the sky.
    for (let t = 1; t < s.trail.length; t++) {
      const f = t / s.trail.length;
      satelliteGfx.moveTo(s.trail[t - 1].x, s.trail[t - 1].y).lineTo(s.trail[t].x, s.trail[t].y)
        .stroke({ color: 0xcfe0ff, alpha: 0.4 * f * vis, width: 0.4 + 0.9 * f, cap: 'round' });
    }
    const bl = 0.55 + 0.45 * Math.sin(nowSec * 3 + s.blink);
    satelliteGfx.circle(s.x, s.y, 1.5).fill({ color: 0xffffff, alpha: vis * bl });
    satelliteGfx.circle(s.x, s.y, 0.7).fill({ color: 0xbad6ff, alpha: vis });
  }
}

// Orbital ring: once a civ reaches the post era it girdles the world with a
// faint tilted ring, a string of space stations drifting along it in formation.
// Screen-space and brightest at night — the far-future payoff in the sky.
let ringAlpha = 0;
let debugRing = false; // test menu can force the orbital ring on
function postAge(): boolean {
  for (const civ of simWorld.civs.values()) if (civ.phase !== 'dead' && ERA_RANK[civ.era] >= 5) return true;
  return false;
}
function updateOrbitalRing(dt: number, nowSec: number, night: number) {
  // Ease the ring in when the post era arrives, out when it passes.
  const target = (postAge() || debugRing) ? 1 : 0;
  ringAlpha += (target - ringAlpha) * Math.min(1, dt * 0.4);
  ringGfx.clear();
  ringBackGfx.clear();
  if (ringAlpha < 0.01) return;
  const W = window.innerWidth, H = window.innerHeight;
  // Anchor the ring to the actual planet silhouette so it reads as a hoop
  // girdling the globe: a wide, gently-curved arc that peaks just above the
  // horizon and meets the limb at the screen edges (where it dips behind the
  // planet). Because we see only the globe's huge top cap, the ring is a large
  // circle a fraction of the limb radius, centred well below the screen.
  const limb = atmos.limbGeometry();
  const R = limb ? limb.R : H * 1.9;
  const apexY = limb ? limb.apexY : H * 0.22;
  const cx = limb ? limb.cx : W / 2;
  // Ring radius a touch under the limb's, so its arc rides just above the
  // horizon across the whole width and only dips behind the planet beyond the
  // screen edges — a broad, gentle hoop, not a tight disk on the surface.
  const Rc = R * 0.9;
  const cy = apexY + Rc - H * 0.07;                       // lift the arc clear of the horizon
  const rx = Rc, ry = Rc;                                 // a true circle reads as the cleanest hoop
  const tilt = -0.025, ct = Math.cos(tilt), st = Math.sin(tilt);
  const vis = Math.min(1, 0.2 + night * 1.1); // bright at night, ghostly by day
  // front = the near half, in front of the globe; back = the far half, which the
  // planet occludes (it draws on ringBackGfx, behind the world plane).
  const onRing = (th: number) => {
    const ex = Math.cos(th) * rx, ey = Math.sin(th) * ry;
    return { x: cx + ex * ct - ey * st, y: cy + ex * st + ey * ct, front: Math.sin(th) > 0 };
  };
  // The band: near arc on the front layer, far arc on the occluded back layer.
  const N = 160;
  let prev = onRing(0);
  for (let i = 1; i <= N; i++) {
    const p = onRing((i / N) * Math.PI * 2);
    const g = p.front ? ringGfx : ringBackGfx;
    g.moveTo(prev.x, prev.y).lineTo(p.x, p.y)
      .stroke({ color: 0xe6f3ff, alpha: ringAlpha * vis * (p.front ? 0.5 : 0.72), width: p.front ? 1.8 : 2.0, cap: 'round' });
    prev = p;
  }
  // Space stations drift along the ring in formation, glinting as they pass —
  // each drawn on its own half's layer so the globe hides the ones behind it.
  const M = 6;
  for (let k = 0; k < M; k++) {
    const th = nowSec * 0.06 + (k / M) * Math.PI * 2;
    const p = onRing(th);
    const g = p.front ? ringGfx : ringBackGfx;
    const fa = ringAlpha * vis * (p.front ? 1 : 0.7);
    if (fa < 0.04) continue;
    const sz = p.front ? 2.8 : 2.0;
    g.circle(p.x, p.y, sz * 2.6).fill({ color: 0x9fd0ff, alpha: fa * 0.22 });          // soft glow
    g.rect(p.x - 5.5, p.y - 0.7, 11, 1.4).fill({ color: 0x7d94b6, alpha: fa * 0.85 }); // solar wings
    g.rect(p.x - 1.6, p.y - 1.6, 3.2, 3.2).fill({ color: 0xeef6ff, alpha: fa });       // core module
    g.circle(p.x, p.y, sz * 0.55).fill({ color: 0xffffff, alpha: fa });
    const bl = 0.5 + 0.5 * Math.sin(nowSec * 4 + k * 2);
    g.circle(p.x + 4, p.y, 0.8).fill({ color: 0xff7a6a, alpha: fa * bl });             // nav beacon
  }
}

// Causeways: in the modern age a civ bridges the straits between its lands with
// a chain of artificial islands — each a little cluster of buildings — carrying
// a rail across the water with trains running over it. They CONNECT landmasses
// (spanning a strait between two of the civ's cities) rather than sticking out
// from one coast.
interface Causeway { line: Array<{ row: number; col: number }>; nodes: Array<{ row: number; col: number }>; color: number }
const causeways: Causeway[] = [];
const CAUSEWAY_PER_CIV = 2;
function rebuildCauseways() {
  causeways.length = 0;
  const seen = new Set<number>();
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || ERA_RANK[civ.era] < 4) continue;
    const cities = civ.cities;
    let made = 0;
    for (let i = 0; i < cities.length && made < CAUSEWAY_PER_CIV; i++) {
      for (let j = i + 1; j < cities.length && made < CAUSEWAY_PER_CIV; j++) {
        const A = cities[i], B = cities[j];
        const dist = Math.hypot(A.row - B.row, A.col - B.col);
        if (dist < 4 || dist > 20) continue;
        const line = sampleLine(A.row, A.col, B.row, B.col);
        // The line must cross a real but spannable strait between two shores.
        let run = 0, maxRun = 0, water = 0;
        for (const t of line) {
          if (biomeMap[t.row]?.[t.col] === 'water') { water++; run++; if (run > maxRun) maxRun = run; }
          else run = 0;
        }
        if (maxRun < 3 || maxRun > 13 || water > line.length - 2) continue;
        const ka = A.row * GRID_SIZE + A.col, kb = B.row * GRID_SIZE + B.col;
        const key = Math.min(ka, kb) * TRAIL_N + Math.max(ka, kb);
        if (seen.has(key)) continue;
        seen.add(key);
        const nodes = line.filter((t) => biomeMap[t.row]?.[t.col] === 'water');
        causeways.push({ line, nodes, color: civ.color });
        trailAdd(landTrail, line, 5); // the rail wears in across the span
        made++;
      }
    }
  }
}
function drawCauseways() {
  causewayGfx.clear();
  for (const cw of causeways) {
    const pts = cw.line.map((t) => gridToScreen(t.col, t.row));
    // Piling supports rising from the seabed under the deck (no land).
    for (const n of cw.nodes) {
      const { x, y } = gridToScreen(n.col, n.row);
      causewayGfx.rect(x - 3.4, y - 0.5, 0.9, 3.4).fill({ color: 0x352c22, alpha: 0.5 });
      causewayGfx.rect(x + 2.5, y - 0.5, 0.9, 3.4).fill({ color: 0x352c22, alpha: 0.5 });
    }
    for (let i = 0; i < pts.length - 1; i++) {                                                       // bridge deck
      causewayGfx.moveTo(pts[i].x, pts[i].y).lineTo(pts[i + 1].x, pts[i + 1].y)
        .stroke({ color: 0x4a4038, alpha: 0.85, width: 2.6 });
    }
    for (let i = 0; i < pts.length - 1; i++) {                                                       // rail atop the deck
      causewayGfx.moveTo(pts[i].x, pts[i].y).lineTo(pts[i + 1].x, pts[i + 1].y)
        .stroke({ color: 0x9a8a76, alpha: 0.55, width: 0.9 });
    }
  }
}
// Trains crossing the straits on the causeways.
function maybeSpawnCausewayTrains() {
  if (causeways.length === 0 || caravans.length >= TRAVELERS.caravanCap) return;
  if (Math.random() > 0.4) return;
  const cw = causeways[Math.floor(Math.random() * causeways.length)];
  const path = Math.random() < 0.5 ? cw.line : [...cw.line].reverse();
  caravans.push({ pts: path.map((t) => gridToScreen(t.col, t.row)), idx: 0, speed: 2.4 + Math.random() * 0.6, color: cw.color, kind: 'train' });
}

function updateAir(dt: number, night: number) {
  // Sky structures redraw every frame: rockets here, space elevators appended
  // by drawMegastructures (which runs later in the loop). Clear unconditionally.
  skyStructGfx.clear();
  if (planes.length === 0 && rockets.length === 0) { airGfx.clear(); return; }
  airGfx.clear();
  for (let i = planes.length - 1; i >= 0; i--) {
    const pl = planes[i];
    pl.x += pl.vx * dt; pl.y += pl.vy * dt;
    pl.trail.push({ x: pl.x, y: pl.y });
    if (pl.trail.length > 34) pl.trail.shift();
    if (Math.abs(pl.x) > 1900 || pl.y > 1800 || pl.y < -300) { planes.splice(i, 1); continue; }
    // Contrail: a white streak the jet pulls behind it, fading and narrowing
    // toward the tail.
    for (let t = 1; t < pl.trail.length; t++) {
      const f = t / pl.trail.length; // 0 tail … 1 at the jet
      airGfx.moveTo(pl.trail[t - 1].x, pl.trail[t - 1].y).lineTo(pl.trail[t].x, pl.trail[t].y)
        .stroke({ color: 0xffffff, alpha: 0.5 * f, width: 0.5 + 1.7 * f, cap: 'round' });
    }
    let hx = pl.vx, hy = pl.vy;
    const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
    drawPlane(airGfx, pl.x, pl.y, hx, hy, night);
  }
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rk = rockets[i];
    rk.t += dt;
    if (rk.t > 6.5) { rockets.splice(i, 1); continue; }
    const rise = rk.t * rk.t * 60; // accelerating, climbs far past the top of the frame
    const ry = rk.y0 - rise;
    const aloft = rk.t < 5.5; // still in flight (vs. just the lingering contrail)
    // Shed a smoke puff at the exhaust each tick while climbing.
    if (aloft) rk.smoke.push({ x: rk.x + (Math.random() - 0.5) * 1.5, y: ry + 7, t: 0, r: 2 });
    // The contrail: puffs age, expand and drift, fading from grey to nothing.
    for (let s = rk.smoke.length - 1; s >= 0; s--) {
      const p = rk.smoke[s];
      p.t += dt;
      if (p.t > 2.6) { rk.smoke.splice(s, 1); continue; }
      const pa = Math.max(0, 1 - p.t / 2.6);
      p.r += dt * 6;
      skyStructGfx.circle(p.x, p.y - p.t * 4, p.r)
        .fill({ color: 0xe8eef2, alpha: pa * 0.5 });
    }
    if (!aloft) continue; // rocket itself is gone; just let the trail dissipate
    // Bright exhaust flame beneath the rocket.
    for (let f = 0; f < 7; f++) {
      skyStructGfx.circle(rk.x + (Math.random() - 0.5) * 2.5, ry + 6 + f * 3.5, 3.6 - f * 0.4)
        .fill({ color: f < 2 ? 0xfff0c0 : 0xff7a30, alpha: (1 - f / 7) * 0.8 });
    }
    // Rocket body: a little white capsule with a nose cone.
    skyStructGfx.roundRect(rk.x - 1.6, ry - 4, 3.2, 9, 1.4).fill({ color: 0xf4f6f8 });
    skyStructGfx.poly([rk.x - 1.6, ry - 4, rk.x + 1.6, ry - 4, rk.x, ry - 8]).fill({ color: 0xd84a3a });
    // Launch glow at the base early in the climb.
    if (rk.t < 1.2) {
      skyStructGfx.circle(rk.x, rk.y0, 14 * (1 - rk.t / 1.2)).fill({ color: 0xffd070, alpha: 0.25 * (1 - rk.t / 1.2) });
    }
  }
}

// Nomad bands (pending settlements walking in) + caravans, drawn together.
function updateNomads(nowSec: number, dt: number, night: number) {
  nomadGfx.clear();
  const S = TRAVELERS.scale * 1.5; // roving bands of people 50% larger
  for (const p of simWorld.pendingSettlements) {
    const f = 1 - p.ticksLeft / SIM_MIGRATION_TICKS;
    const { x: tx, y: ty } = gridToScreen(p.col, p.row);
    const phase = (p.row * 7 + p.col * 13) % 100;
    const dist = 80 * (1 - f);
    const ang = phase + f * 2.0;
    const cx = tx + Math.cos(ang) * dist;
    const cy = ty + Math.sin(ang) * dist * 0.5;
    for (let i = 0; i < 5; i++) {
      const ox = Math.sin(phase + i * 2.3) * 6 + Math.sin(nowSec * 1.1 + i) * 1.8;
      const oy = Math.cos(phase + i * 1.7) * 3.6 + Math.sin(nowSec * 1.4 + i * 0.7) * 1.2;
      travelerDot(nomadGfx, cx + ox, cy + oy, 1.2 * S, 0x6a5a48, night, 0.6);
    }
  }
  for (let ci = caravans.length - 1; ci >= 0; ci--) {
    const cv = caravans[ci];
    cv.idx += cv.speed * dt;
    if (cv.idx >= cv.pts.length - 1) { caravans.splice(ci, 1); continue; }
    // A train is a long coupled string; cars are a loose stream of traffic; a
    // caravan is a few foot-and-wagon travellers.
    const cars = cv.kind === 'train' ? 6 : 3;
    const gap = cv.kind === 'train' ? 0.32 : cv.kind === 'car' ? 0.85 : 0.5;
    for (let m = 0; m < cars; m++) {
      const bi = cv.idx - m * gap;
      if (bi < 0) continue;
      const bk = Math.floor(bi), bu = bi - bk;
      if (bk + 1 >= cv.pts.length) continue;
      const x = cv.pts[bk].x + (cv.pts[bk + 1].x - cv.pts[bk].x) * bu;
      const y = cv.pts[bk].y + (cv.pts[bk + 1].y - cv.pts[bk].y) * bu;
      let hx = cv.pts[bk + 1].x - cv.pts[bk].x, hy = cv.pts[bk + 1].y - cv.pts[bk].y;
      const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
      const px = -hy, py = hx;
      if (cv.kind === 'train') {
        // A coupled string of boxcars: a dark locomotive at the head with a
        // warm headlamp, followed by civ-coloured cars riding the rails.
        const carL = (m === 0 ? 1.7 : 1.4) * S, carW = 0.85 * S;
        nomadGfx.poly([
          x + hx * carL + px * carW, y + hy * carL + py * carW,
          x + hx * carL - px * carW, y + hy * carL - py * carW,
          x - hx * carL - px * carW, y - hy * carL - py * carW,
          x - hx * carL + px * carW, y - hy * carL + py * carW,
        ]).fill({ color: m === 0 ? 0x2c2c30 : cv.color, alpha: 0.92 });
        if (m === 0) travelerDot(nomadGfx, x + hx * carL, y + hy * carL, 0.7 * S, 0xfff0b0, Math.max(night, 0.5), 0.95);
      } else if (cv.kind === 'car') {
        // A little stream of cars and trucks — varied colours, headlights at night.
        const body = m === 0 ? cv.color : m === 1 ? 0xdadde2 : 0x40434a;
        const carL = 1.25 * S, carW = 0.62 * S;
        nomadGfx.poly([
          x + hx * carL + px * carW, y + hy * carL + py * carW,
          x + hx * carL - px * carW, y + hy * carL - py * carW,
          x - hx * carL - px * carW, y - hy * carL - py * carW,
          x - hx * carL + px * carW, y - hy * carL + py * carW,
        ]).fill({ color: body, alpha: 0.95 });
        // cabin glass, toward the front
        nomadGfx.poly([
          x + hx * carL * 0.5 + px * carW * 0.7, y + hy * carL * 0.5 + py * carW * 0.7,
          x + hx * carL * 0.5 - px * carW * 0.7, y + hy * carL * 0.5 - py * carW * 0.7,
          x - hx * carL * 0.2 - px * carW * 0.7, y - hy * carL * 0.2 - py * carW * 0.7,
          x - hx * carL * 0.2 + px * carW * 0.7, y - hy * carL * 0.2 + py * carW * 0.7,
        ]).fill({ color: 0x9fb4c4, alpha: 0.7 });
        if (night > 0.25) {
          nomadGfx.circle(x + hx * carL, y + hy * carL, 0.55 * S).fill({ color: 0xfff0c0, alpha: 0.8 * night });   // headlights
          nomadGfx.circle(x - hx * carL, y - hy * carL, 0.4 * S).fill({ color: 0xff5a4a, alpha: 0.6 * night });    // tail-light
        }
      } else {
        travelerDot(nomadGfx, x, y, (m === 0 ? 1.2 : 1.0) * S, cv.color, night, m === 0 ? 0.85 : 0.6);
      }
    }
  }
}
const SIM_MIGRATION_TICKS = 900; // mirror of SIM.migrationTicks for the renderer

// Bird flocks: small Vs that lift from one wood and skim the canopy to another,
// arcing over the land. Daylight only — they roost at dusk.
interface BirdFlock { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; n: number; ph: number }
const birdFlocks: BirdFlock[] = [];
const BIRDFLOCK_CAP = 4;
let forestTiles: Array<{ r: number; c: number }> | null = null;

function maybeSpawnBirdFlock(dt: number, night: number) {
  if (night > 0.5 || birdFlocks.length >= BIRDFLOCK_CAP) return;
  if (Math.random() > dt / 5) return; // ~ one attempt every 5s
  if (!forestTiles) {
    forestTiles = [];
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
      if (biomeMap[r][c] === 'forest') forestTiles.push({ r, c });
  }
  if (forestTiles.length < 2) return;
  const a = forestTiles[Math.floor(Math.random() * forestTiles.length)];
  let b: { r: number; c: number } | null = null;
  for (let tries = 0; tries < 12; tries++) {
    const cand = forestTiles[Math.floor(Math.random() * forestTiles.length)];
    const d = Math.hypot(cand.r - a.r, cand.c - a.c);
    if (d >= 5 && d <= 18) { b = cand; break; }
  }
  if (!b) return;
  const start = gridToScreen(a.c, a.r);
  const end = gridToScreen(b.c, b.r);
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  birdFlocks.push({ sx: start.x, sy: start.y, tx: end.x, ty: end.y, t: 0, dur: dist / 65 + 1.0, n: 4 + Math.floor(Math.random() * 4), ph: (a.r * 13 + a.c * 7) % 100 });
}

function drawBird(g: Graphics, x: number, y: number, hx: number, hy: number, flap: number, a: number) {
  const px = -hy, py = hx;
  const wl = 2.2, sweep = 0.6 + 1.3 * (1 - flap); // wings rise on the downbeat
  const lx = x - hx * sweep + px * wl, ly = y - hy * sweep + py * wl;
  const rx = x - hx * sweep - px * wl, ry = y - hy * sweep - py * wl;
  g.moveTo(lx, ly).lineTo(x + hx * 0.8, y + hy * 0.8).lineTo(rx, ry).stroke({ color: 0x3a352e, width: 1, alpha: a });
}

function updateBirdFlocks(dt: number, nowSec: number, night: number) {
  maybeSpawnBirdFlock(dt, night);
  if (!birdFlocks.length) { birdFlockGfx.clear(); return; }
  birdFlockGfx.clear();
  const a = 0.6 * (1 - 0.5 * night);
  for (let i = birdFlocks.length - 1; i >= 0; i--) {
    const f = birdFlocks[i];
    f.t += dt;
    const u = f.t / f.dur;
    if (u >= 1) { birdFlocks.splice(i, 1); continue; }
    const x = f.sx + (f.tx - f.sx) * u;
    const y = f.sy + (f.ty - f.sy) * u - Math.sin(u * Math.PI) * 18; // arc up over the canopy
    let hx = f.tx - f.sx, hy = f.ty - f.sy;
    const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
    const px = -hy, py = hx;
    for (let k = 0; k < f.n; k++) {
      const rank = Math.ceil(k / 2);
      const side = k === 0 ? 0 : (k % 2 === 0 ? 1 : -1);
      const bx = x - hx * rank * 4 + px * side * rank * 3;
      const by = y - hy * rank * 4 + py * side * rank * 3;
      const flap = Math.sin(nowSec * 6 + f.ph + k * 0.7) * 0.5 + 0.5;
      drawBird(birdFlockGfx, bx, by, hx, hy, flap, a);
    }
  }
}

// Wild herds: small clusters of animals ambling across the open, unsettled
// land — darker beasts in the forest verges, paler ones on the steppe. They
// migrate tile to tile and only ever stand on wild land, so as civilizations
// clear the ground the herds are pushed back into the shrinking wilderness.
interface Herd { r: number; c: number; x: number; y: number; tx: number; ty: number; col: number; size: number; wob: number; life: number }
const herds: Herd[] = [];
const HERD_CAP = 16;

// Grazing land: open ground (grass/forest/fertile) that no town stands on and
// no farmer works — pristine wilderness or land gone back to ruin. Herds keep
// to it, so they're squeezed out as cities spread and drift back over ruins.
function wildAt(r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  const b = biomeMap[r][c];
  if (b !== 'grass' && b !== 'fertile' && b !== 'forest') return false;
  const st = simWorld.tiles[r][c].state;
  return st === 'wild' || st === 'ruin';
}

function pickHerdStep(r: number, c: number): { r: number; c: number } | null {
  const opts: Array<{ r: number; c: number }> = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    if (wildAt(r + dr, c + dc)) opts.push({ r: r + dr, c: c + dc });
  }
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
}

function maybeSpawnHerds() {
  if (herds.length >= HERD_CAP) return;
  // Scan for grazing tiles (cheap, runs on the city cadence) and seed a couple
  // of herds among them — reliable regardless of how much wild land is left.
  const cand: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (wildAt(r, c)) cand.push(r * GRID_SIZE + c);
  if (cand.length === 0) return;
  const want = Math.min(2, HERD_CAP - herds.length);
  for (let k = 0; k < want; k++) {
    const key = cand[Math.floor(Math.random() * cand.length)];
    const r = (key / GRID_SIZE) | 0, c = key % GRID_SIZE;
    const { x, y } = gridToScreen(c, r);
    const forest = biomeMap[r][c] === 'forest';
    herds.push({
      r, c, x, y, tx: x, ty: y,
      col: forest ? 0x4f3f2c : (Math.random() < 0.5 ? 0x7a6a52 : 0x6b5a44),
      size: 3 + Math.floor(Math.random() * 4),
      wob: Math.random() * 100, life: 60 + Math.random() * 90,
    });
  }
}

function updateHerds(dt: number, nowSec: number, night: number) {
  wildlifeGfx.clear();
  if (herds.length === 0) return;
  for (let i = herds.length - 1; i >= 0; i--) {
    const h = herds[i];
    h.life -= dt;
    const ddx = h.tx - h.x, ddy = h.ty - h.y;
    const d = Math.hypot(ddx, ddy);
    if (d < 1.2) {
      // Arrived at the target tile: retire, or amble to the next wild step.
      if (h.life <= 0) { herds.splice(i, 1); continue; }
      const step = pickHerdStep(h.r, h.c);
      if (!step) { herds.splice(i, 1); continue; } // hemmed in by town or sea
      h.r = step.r; h.c = step.c;
      const s = gridToScreen(h.c, h.r); h.tx = s.x; h.ty = s.y;
    } else {
      const sp = Math.min(d, 6 * dt); // a slow amble across the land
      h.x += (ddx / d) * sp; h.y += (ddy / d) * sp;
    }
    const lit = 0.62 + 0.18 * night;
    for (let m = 0; m < h.size; m++) {
      const ox = Math.sin(h.wob + m * 2.1) * 8.2 + Math.sin(nowSec * 0.8 + m) * 0.9;
      const oy = Math.cos(h.wob + m * 1.6) * 4.2 + Math.cos(nowSec * 0.9 + m) * 0.6;
      // a soft body with a darker centre — reads as an animal, not a pixel (50% larger)
      wildlifeGfx.circle(h.x + ox, h.y + oy, 2.25).fill({ color: h.col, alpha: lit * 0.85 });
      wildlifeGfx.circle(h.x + ox, h.y + oy, 1.2).fill({ color: h.col, alpha: lit });
    }
  }
}

// Ghost echoes: the land remembers, briefly, at night.
const ghostText = new Text({
  text: '',
  style: new TextStyle({
    fontFamily: LABEL.fontFamily, fontSize: 12, fontStyle: 'italic',
    fill: 0xcfd8e8, stroke: { color: 0x1a2028, width: 2, join: 'round' },
  }),
});
ghostText.anchor.set(0.5);
ghostText.alpha = 0;
labelLayer.addChild(ghostText);
let ghostStart = 0;
let ghostUntil = 0;
let ghostBaseY = 0;

function maybeGhost(dt: number, nightness: number) {
  const now = worldClock;
  if (ghostUntil > now) {
    const u = (now - ghostStart) / (ghostUntil - ghostStart);
    ghostText.alpha = Math.sin(Math.PI * u) * 0.30;
    ghostText.y = ghostBaseY - u * 6;
    return;
  }
  ghostText.alpha = 0;
  if (nightness < 0.7 || Math.random() > dt / 240 || simWorld.nameMemory.length === 0) return;
  for (let tries = 0; tries < 6; tries++) {
    const mem = simWorld.nameMemory[Math.floor(Math.random() * simWorld.nameMemory.length)];
    let nearLiving = false;
    for (const civ of simWorld.civs.values()) {
      if (civ.phase === 'dead') continue;
      if (Math.hypot(civ.originRow - mem.row, civ.originCol - mem.col) < 12) { nearLiving = true; break; }
    }
    if (nearLiving) continue;
    let ruins = 0;
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const r = mem.row + dr, c = mem.col + dc;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
        if (simWorld.tiles[r][c].state === 'ruin') ruins++;
      }
    }
    if (ruins < 2) continue;
    const { x, y } = gridToScreen(mem.col, mem.row);
    ghostText.text = mem.name;
    ghostText.x = x;
    ghostBaseY = y - 6;
    ghostStart = now;
    ghostUntil = now + 12;
    if (Math.random() < 0.18) {
      // The ghost text itself is welcome in a silence — a remembered name is
      // the right thing to see. Its narration line is not: act 4 adds no story.
      if (!simWorld.ending?.silent) {
        pushNarration(`Shepherds at the ruins of ${mem.name} say the stones hum.`, { priority: 'low', anchor: { row: mem.row, col: mem.col } });
      }
    }
    return;
  }
}

// Festivals: a city reaching full prominence burns its lamps all night, once.
const festivalDone = new Set<string>();
let pendingFestivals: Array<{ x: number; y: number; row: number; col: number; name: string }> = [];
let activeFestival: { x: number; y: number; start: number; until: number } | null = null;

function queueFestivals() {
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') continue;
    for (const city of civ.cities) {
      if (city.prominence < 0.995) continue;
      const k = `${city.row},${city.col}`;
      if (festivalDone.has(k)) continue;
      festivalDone.add(k);
      const { x, y } = gridToScreen(city.col, city.row);
      pendingFestivals.push({ x, y, row: city.row, col: city.col, name: city.name });
    }
  }
}

function updateFestival(nightness: number) {
  const now = worldClock;
  if (!activeFestival && pendingFestivals.length > 0 && nightness > 0.5) {
    const f = pendingFestivals.shift()!;
    activeFestival = { x: f.x, y: f.y, start: now, until: now + 45 };
    pushNarration(`In ${f.name}, the lamps burn all night.`, { priority: 'normal', anchor: { row: f.row, col: f.col } });
  }
  if (!activeFestival) { festivalGfx.clear(); return; }
  if (now > activeFestival.until) { activeFestival = null; festivalGfx.clear(); return; }
  const u = (now - activeFestival.start) / (activeFestival.until - activeFestival.start);
  const env = Math.sin(Math.PI * u);
  const pulse = 1 + 0.25 * Math.sin(now / 0.28);   // was now/280 in ms; same rate in seconds
  festivalGfx.clear();
  festivalGfx.circle(activeFestival.x, activeFestival.y, 13 * pulse).fill({ color: 0xffc878, alpha: 0.20 * env * nightness });
  festivalGfx.circle(activeFestival.x, activeFestival.y, 6 * pulse).fill({ color: 0xffe2b0, alpha: 0.28 * env * nightness });
}

// Instrument for the lifetimes that used to run on Date.now(). Every value here
// is world-clock seconds, so all of them freeze when paused and compress with
// the speed control; `wall` is the wall clock for comparison.
(window as any).__clocks = () => ({
  worldClock: +worldClock.toFixed(2),
  wall: Date.now(),
  ghostUntil: +ghostUntil.toFixed(2),
  festivalUntil: activeFestival ? +activeFestival.until.toFixed(2) : null,
  wars: [...warHeat.values()].map((w) => ({
    lastTs: +w.lastTs.toFixed(2),
    narratedAt: +w.narratedAt.toFixed(2),
    quietIn: +(45 - (worldClock - w.lastTs)).toFixed(2),
  })),
});

// Constellations: the first civilization of each era past the neolithic
// names a figure in the stars. The sky accumulates history.
const CONSTELLATION_NAMES = [
  'the Plough', 'the Heron', 'the Ferryman', 'the Broken Crown',
  'the Lantern', 'the Salt Road', 'the Swimmer', 'the Two Sisters',
];
const constellationEraDone = new Set<Era>();
let constellationNameIdx = 0;

function maybeNameConstellations() {
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || civ.era === 'neolithic') continue;
    if (constellationEraDone.has(civ.era)) continue;
    constellationEraDone.add(civ.era);
    if (atmos.nameConstellation()) {
      const name = CONSTELLATION_NAMES[constellationNameIdx++ % CONSTELLATION_NAMES.length];
      pushNarration(colorizeCivNames(`The astronomers of ${civ.name} name ${name}.`), { priority: 'normal' });
    }
  }
}

// Chronicle: a line for whoever just tuned in, every ~5 minutes of sim time.
let lastChronicleTick = 0;

function maybeChronicle() {
  if (simWorld.tick - lastChronicleTick < 9000 || simWorld.tick < 3000) return;
  lastChronicleTick = simWorld.tick;
  const living: Array<{ civ: Civ; count: number }> = [];
  let total = 0;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') continue;
    const n = civStats.tileCounts.get(civ.id) || 0;
    living.push({ civ, count: n });
    total += n;
  }
  if (living.length === 0 || total === 0) return;
  living.sort((a, b) => b.count - a.count);
  const leader = living[0].civ;
  const share = living[0].count / total;
  const text = living.length === 1
    ? `${leader.name} is alone in the world.`
    : share > 0.5
      ? `An age of ${leader.name}: half the known world answers to it.`
      : `The age continues: ${living.length} nations share the land, ${leader.name} first among them.`;
  const seat = leader.cities[0] ?? { row: leader.originRow, col: leader.originCol };
  pushNarration(colorizeCivNames(text), { priority: 'low', anchor: { row: seat.row, col: seat.col } });
}

// Reset for everything above (called wherever the world is rebuilt).
function resetStorySurfaces() {
  roadPathCache.clear();
  roadLines.clear();
  clearFarmland();
  seaTrail.clear(); landTrail.clear(); airTrail.clear(); redrawTrails();
  satellites.length = 0; satelliteGfx.clear();
  ringAlpha = 0; ringGfx.clear(); ringBackGfx.clear();
  debugMegas.length = 0; debugWonders.length = 0; debugRing = false;
  causeways.length = 0; causewayGfx.clear();
  waterRouteCache.clear();
  warHeat.clear();
  conflictFlashes.length = 0;
  battles.length = 0; for (const g of warPool) g.visible = false;
  quietZones.length = 0; drawQuietZones();
  lastIceExtent = -1; lastIceMemory = -1; drawIce(true);
  roadGhosts.length = 0; roadGhostTiles.clear();
  abandonTick.fill(-1); soilMark.fill(0);
  lastSuccessionBake = -1e9; drawSuccession(true);
  boats.length = 0;
  wrecks.length = 0;
  caravans.length = 0;
  planes.length = 0;
  rockets.length = 0;
  herds.length = 0; wildlifeGfx.clear();
  powerLines.length = 0; powerGfx.clear();
  cables.length = 0; cableGfx.clear();
  lighthouses.length = 0; lighthouseGfx.clear();
  fires.length = 0; fireGfx.clear();
  volcanoes.length = 0; lavaGfx.clear(); lavaGlowGfx.clear();
  plagues.length = 0; plagueGfx.clear();
  faiths.length = 0; faithGfx.clear();
  floods.length = 0; floodGfx.clear();
  droughts.length = 0; droughtGfx.clear();
  energyFarms.length = 0; energyGfx.clear();
  megastructures.length = 0; megaGfx.clear();
  riverBoats.length = 0; riverBridges.length = 0; riverCraftGfx.clear();
  curPollution = 0;
  pollutionNarrated = false;
  curBlight = 0;
  blightNarrated = false;
  pollutionGfx.visible = false;
  smogGfx.clear();
  smogGfx.visible = false;
  fishSpots = [];
  whale = null;
  ghostUntil = 0;
  ghostText.alpha = 0;
  festivalDone.clear();
  pendingFestivals = [];
  activeFestival = null;
  lastChronicleTick = 0;
  constellationEraDone.clear();
  atmos.clearConstellations();
  rebuildRoads();
  wonderState.clear();
  rebuildFishSpots();
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
    }
  }
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

// Multiply a packed colour's channels by f (clamped) — quick brightness jitter.
function scaleColor(c: number, f: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * f) | 0;
  const b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}

// Farmland is a living civ's worked countryside — but only on arable ground
// (grass/fertile), so fields grow AROUND forests and mountains rather than
// levelling them; only away from dense city cores; and only in patches, so the
// land is a quilt of fields and open pasture, not wall-to-wall crops.
const FARM_GOLD = 0xcdb96a, FARM_GREEN = 0x9ec06a;

// Coarse, smooth field/pasture mask — organic blobs of cultivation, ~half the
// arable countryside under the plough.
function farmPatch(row: number, col: number): boolean {
  const n = Math.sin(row * 0.45 + 1.7) + Math.sin(col * 0.5 - 0.6)
          + Math.sin((row + col) * 0.28) + Math.sin((row - col) * 0.33);
  return n > 0.4;
}

function isFarmTile(row: number, col: number): boolean {
  const tile = simWorld.tiles[row][col];
  if (tile.civId == null || (tile.state !== 'cleared' && tile.state !== 'built')) return false;
  const b = biomeMap[row][col];
  if (b !== 'grass' && b !== 'fertile') return false; // farms skirt forest/rock/sand
  const civ = simWorld.civs.get(tile.civId);
  if (!civ || civ.phase === 'dead') return false;
  if (computeTileDensity(row, col, civ) >= DENSITY.slot2) return false; // not city cores
  return farmPatch(row, col);
}

// Farmland grows in tile by tile, the way cities sprout building by building:
// each field eases from nothing to full as the sim works the ground, staggered
// naturally by how the land is claimed. Mature fields bake into one cached
// texture (farmGfx) so thousands cost nothing per frame; the handful still
// growing animate in a small uncached layer (farmGrowGfx) — like the building
// fade, the per-frame work is bounded by how many are mid-growth.
const matureFarm = new Set<number>();          // keys fully grown, in the cached layer
const growingFarm = new Map<number, number>(); // key → current alpha (0..1), animating
let farmCacheDirty = false;
let farmGrowDrawn = false;
let lastFarmBake = -1e9;
const FARM_GROW_SPEED = 0.05;     // per-frame ease toward full (~1s grow-in, like buildings)
const FARM_BAKE_INTERVAL = 600;   // ~20s between cache re-bakes — finished fields wait in the
                                  // uncached grow overlay meanwhile, so the cache re-bakes rarely
                                  // (each re-bake can flash garbage for one frame on some GPUs)

// Draw one field tile (its 3×3 sub-diamond quilt) into a target at the given
// opacity multiplier.
function drawFarmTile(g: Graphics, row: number, col: number, alphaMult: number) {
  const sw = 16 / 3, sh = 8 / 3;
  const civId = simWorld.tiles[row][col].civId;
  const civ = civId != null ? simWorld.civs.get(civId) : undefined;
  const civColor = civ ? civ.color : 0xffffff;
  const { x, y } = gridToScreen(col, row);
  for (let gi = -1; gi <= 1; gi++) {
    for (let gj = -1; gj <= 1; gj++) {
      const cx = x + (gi - gj) * sw, cy = y + (gi + gj) * sh;
      const base = ((gi + gj) & 1) ? FARM_GOLD : FARM_GREEN;
      const jit = 0.82 + tileRand(row, col, gi * 5 + gj + 900) * 0.34;
      const color = lerpColor(scaleColor(base, jit), civColor, 0.16);
      g.poly([cx, cy - sh, cx + sw, cy, cx, cy + sh, cx - sw, cy]).fill({ color, alpha: 0.82 * alphaMult });
    }
  }
}

// Re-bake the cached layer from the set of mature fields. We enable the cache
// once and thereafter REFRESH it in place (updateCacheTexture) rather than
// toggling cacheAsTexture off/on — toggling re-allocates a fresh RenderTexture
// each bake, and on some drivers (Mesa/SteamOS) a newly-allocated framebuffer
// shows uninitialised garbage for one frame: the flashing white polygons.
let farmCacheEnabled = false;
// Tile-tint layer cache: simLayer holds thousands of persistent per-tile overlay
// diamonds but only changes on state/owner events — measured at ~half the world
// re-bake. Cache it like the biome (enable once, refresh in place while tiles
// ease; never toggle off/on — that reallocates and flashes on Mesa).
let simCacheEnabled = false;
function bakeFarmCache() {
  farmGfx.clear();
  for (const key of matureFarm) drawFarmTile(farmGfx, (key / GRID_SIZE) | 0, key % GRID_SIZE, 1);
  if (!farmCacheEnabled) { farmGfx.cacheAsTexture?.(true); farmCacheEnabled = true; }
  else (farmGfx as any).updateCacheTexture?.();
  farmCacheDirty = false;
}

// A tile's farm status may have changed: enrol new fields (born at alpha 0,
// so they grow in) and drop fields that are no longer worked.
function noteFarmTile(row: number, col: number) {
  const key = row * GRID_SIZE + col;
  const should = isFarmTile(row, col);
  const tracked = growingFarm.has(key) || matureFarm.has(key);
  if (should && !tracked) growingFarm.set(key, 0);
  else if (!should && tracked) {
    growingFarm.delete(key);
    if (matureFarm.delete(key)) farmCacheDirty = true;
  }
}

// Full sweep — catches farm changes that don't come through the per-tile change
// list (density crossing the city-core line, civ death). Runs on a throttle.
function reconcileFarmland() {
  for (let row = 0; row < GRID_SIZE; row++)
    for (let col = 0; col < GRID_SIZE; col++) noteFarmTile(row, col);
}

// Per-frame: ease the growing fields; on a throttle, fold the finished ones into
// the cached layer and apply any field removals.
function updateFarmGrowth(tick: number) {
  if (growingFarm.size > 0) {
    farmGrowGfx.clear();
    for (const [key, a] of growingFarm) {
      const na = a < 1 ? Math.min(1, a + (1 - a) * ease(FARM_GROW_SPEED)) : 1;
      if (na !== a) growingFarm.set(key, na);
      drawFarmTile(farmGrowGfx, (key / GRID_SIZE) | 0, key % GRID_SIZE, na);
    }
    farmGrowDrawn = true;
  } else if (farmGrowDrawn) {
    farmGrowGfx.clear();
    farmGrowDrawn = false;
  }
  if (tick - lastFarmBake < FARM_BAKE_INTERVAL) return;
  // Promote finished fields into the cached layer.
  let promoted = false;
  for (const [key, a] of growingFarm) if (a >= 0.99) { matureFarm.add(key); growingFarm.delete(key); promoted = true; }
  if (!promoted && !farmCacheDirty) return;
  lastFarmBake = tick;
  bakeFarmCache();
  // Redraw the grow layer without the fields just folded in.
  if (growingFarm.size > 0) {
    farmGrowGfx.clear();
    for (const [key, a] of growingFarm) drawFarmTile(farmGrowGfx, (key / GRID_SIZE) | 0, key % GRID_SIZE, a);
  } else if (farmGrowDrawn) {
    farmGrowGfx.clear();
    farmGrowDrawn = false;
  }
}
let lastFarmReconcile = -1e9;

// Wipe all farmland (fresh world).
function clearFarmland() {
  growingFarm.clear();
  matureFarm.clear();
  farmGrowGfx.clear();
  farmGrowDrawn = false;
  lastFarmBake = -1e9;
  bakeFarmCache();
}

// Snap to the current farmland state with no grow-in animation — for big jumps
// (skip) where staggered growth doesn't make sense.
function snapFarmland() {
  growingFarm.clear();
  matureFarm.clear();
  for (let row = 0; row < GRID_SIZE; row++)
    for (let col = 0; col < GRID_SIZE; col++)
      if (isFarmTile(row, col)) matureFarm.add(row * GRID_SIZE + col);
  farmGrowGfx.clear();
  farmGrowDrawn = false;
  bakeFarmCache();
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

const WORLD_ERA_ORDER: Era[] = ['neolithic', 'classical', 'medieval', 'industrial', 'modern', 'post'];
const WORLD_ERA_NAMES: Record<Era, string> = {
  neolithic: 'The Beginning',
  classical: 'The Ancient World',
  medieval: 'The Middle Ages',
  industrial: 'The Age of Industry',
  modern: 'The Modern Age',
  post: 'The Future',
};

function archiveCurrentWorld(ending: WorldEnding, outcome?: ResolvedWorldEnding): ArchivedWorld | null {
  const observedMs = Date.now() - worldStartedAt;
  if (simWorld.tick < ticksPerSecond * 10 && observedMs < 10_000) return null;

  let peakRank = Math.max(0, Math.min(WORLD_ERA_ORDER.length - 1, Math.floor(simWorld.eraProgress)));
  for (const civ of simWorld.civs.values()) {
    peakRank = Math.max(peakRank, WORLD_ERA_ORDER.indexOf(civ.era));
  }
  const peakEra = outcome?.highestEra ?? WORLD_ERA_ORDER[peakRank];
  const civilizations = simWorld.civs.size;
  const survivingCivilizations = [...simWorld.civs.values()].filter((civ) => civ.phase !== 'dead').length;
  const cities = [...simWorld.civs.values()].reduce((total, civ) => total + civ.cities.length, 0);
  const civilizationText = civilizations === 1 ? 'One civilization lived here' : `${civilizations} civilizations lived here`;
  const survivalText =
    survivingCivilizations === 0 ? 'None remained at the end.' :
    survivingCivilizations === 1 ? 'One people remained at the end.' :
    `${survivingCivilizations} peoples remained at the end.`;
  const epitaph = outcome?.epitaph ?? `${civilizationText}, reaching ${WORLD_ERA_NAMES[peakEra]}. ${survivalText}`;

  const record: ArchivedWorld = {
    seed: currentSeed,
    name: currentWorldName,
    endedAt: Date.now(),
    ending,
    // Only for a world that actually resolved. A viewer who hits "new" mid-
    // ending gets `left_behind` and no outcome, and that world did not have an
    // apocalypse — it was walked away from before one ran.
    apocalypse: outcome ? committedEnding?.apocalypse : undefined,
    ticksLived: simWorld.tick,
    civilizations,
    survivingCivilizations,
    cities,
    peakEra,
    epitaph,
  };
  worldArchive = [record, ...worldArchive.filter((world) => world.seed !== record.seed)]
    .slice(0, WORLD_ARCHIVE_LIMIT);
  saveWorldArchive();
  return record;
}

function resetWorld(newSeed: string, archiveEnding?: WorldEnding, outcome?: ResolvedWorldEnding): ArchivedWorld | null {
  const archived = archiveEnding ? archiveCurrentWorld(archiveEnding, outcome) : null;
  currentSeed = newSeed;
  currentWorldName = worldNameForSeed(newSeed);
  worldStartedAt = Date.now();
  saveSeed(newSeed);
  ({ biomes: biomeMap, elevation: elevationMap } = generateWorldTerrain(newSeed));
  rebuildNaturalWonders();
  simWorld = createSimWorld(GRID_SIZE, GRID_SIZE, currentSeed);
  displayedEraRank = 0;   // a new world starts at the beginning again
  currentWorldFate = worldFateForSeed(newSeed, SIM.worldCycleTicks);
  currentWorldHistory = createWorldHistory(biomeMap);
  committedEnding = null;
  endingOmenSpoken = false;
  seedInitialCivs(simWorld, biomeMap, 1);
  syncSimWonders();
  (window as any).__sim = simWorld;
  fadedDeadCivs.clear();
  civCurSatMult.clear();
  civsTransitioningSat.clear();
  civLastEra.clear();
  eventLog.length = 0;
  atmos.clearScars();
  resetStorySurfaces();
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
  updateClock();
  renderWorldArchive();
  return archived;
}

function resetSimOnly() {
  simWorld = createSimWorld(GRID_SIZE, GRID_SIZE, currentSeed);
  displayedEraRank = 0;   // same world, fresh history: the age starts over too
  // The new sim has not committed to an ending; leaving the old commitment set
  // would make endingCheckpoints() skip commitEnding(), so births and
  // catastrophes would never be held and the turnover would archive the
  // previous run's title.
  committedEnding = null;
  endingOmenSpoken = false;
  seedInitialCivs(simWorld, biomeMap, 1);
  (window as any).__sim = simWorld;
  fadedDeadCivs.clear();
  civCurSatMult.clear();
  civsTransitioningSat.clear();
  civLastEra.clear();
  eventLog.length = 0;
  atmos.clearScars();
  resetStorySurfaces();
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

rebuildNaturalWonders(); // before drawBiomes so its water mask includes the crater lake
syncSimWonders();
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
rebuildCityLights();
rebuildSmokeEmitters();
resetStorySurfaces();

// --- Tick loop ---
let accumulator = 0;
let frameCount = 0;
let breathT = 0;
// World-turnover blackout state.
let blackout = 0;        // current overlay opacity
let blackoutHold = 0;    // seconds left to hold full black before fading up
const BLACKOUT_HOLD = 0.7;  // beat of pure black at the turnover
const BLACKOUT_FADE = 1.8;  // seconds for the new world to rise out of black
const BARS_REFRESH_FRAMES = 10;  // DOM rebuild for civ bar panel; ~6 Hz at 60fps
// Pixi caps deltaMS to protect visual animation after a stall. The simulation
// clock uses raw elapsed time so a world still lasts 10–17 real minutes on a
// slow renderer, with this ceiling preventing a huge catch-up after suspension.
const MAX_SIM_FRAME_MS = 1000;

function beginWorldEnding() {
  // The title was committed ~102 world-seconds ago so the ending could be
  // staged; everything else — epitaph, era, survivors — is measured now, after
  // it has run, so the archive describes the ending rather than predicting it.
  const outcome = resolveWorldEnding(
    simWorld, biomeMap, currentWorldHistory, currentWorldFate, committedEnding?.ending,
  );
  accumulator = 0;
  resetWorld(randomSeed(), outcome.kind, outcome);
  trackEvent('world_generated', { source: 'automatic' });
  blackout = 1; blackoutHold = BLACKOUT_HOLD;
}

// Rare celestial events get a narrated line — wonder, not warning.
atmos.onCelestialEvent((kind) => {
  // A comet still crosses the sky during the silence; nobody narrates it.
  if (simWorld.ending?.silent) return;
  const lines: Record<string, string[]> = {
    comet: [
      'A comet crosses the night. The wise disagree on what it intends.',
      'A long light moves against the stars, and is watched from many hills.',
    ],
    eclipse: [
      'The moon goes dark, and the dogs are quiet about it.',
      'A shadow crosses the moon. Work stops until it passes.',
    ],
    aurora: [
      'Lights move in the winter sky, and no one who sees them sleeps soon.',
      'The night sky stands in curtains of pale fire.',
    ],
    meteors: [
      'Stars fall over the northern sky, one after another.',
      'The night is busy with falling stars. Wishes are made and not spoken of.',
    ],
  };
  pushNarration(pick(lines[kind] ?? ['Something passes overhead.']), { priority: 'normal' });
});

app.ticker.add((ticker) => {
  if (!running) return;
  // ONE clock for the whole world. Turn 01 correctly moved history off Pixi's
  // deltaMS (which is capped at 100ms to protect animation after a stall) and
  // onto raw elapsed time, so a world lasts its advertised 10-17 real minutes.
  // But only history moved: the sky, seasons, weather and every story surface
  // stayed on the capped clock, so below 10fps they fell behind. Measured at
  // 3fps: history ran at 1.05x wall-clock while the day/night cycle ran at
  // 0.37x — a six-minute day taking sixteen real minutes, and worlds reaching
  // the industrial age having barely seen two dawns.
  //
  // Above 10fps a frame is already under the 100ms cap, so elapsedMS and
  // deltaMS are identical and this changes nothing at all. It engages only
  // where the divergence actually exists.
  const frameMS = Math.min(ticker.elapsedMS, MAX_SIM_FRAME_MS);
  // The speed control used to multiply the history accumulator alone, so 4x
  // raced the centuries while the sun, seasons and weather stayed at 1x — the
  // same split Turn 02 fixed for slow frame rates, still present on the button.
  // Scaling here instead means 2x/4x/8x compresses the whole diorama honestly.
  const worldSeconds = (frameMS / 1000) * timeScale;
  worldClock += worldSeconds;
  // Clamped so a long stall completes a transition rather than doing something
  // undefined with a huge exponent; at 90 frames (1.5s) any of these eases is
  // finished anyway.
  easeFrames = Math.max(1, Math.min(90, worldSeconds * 60));
  accumulator += worldSeconds;
  const tickInterval = 1 / ticksPerSecond;
  const frameEvents: SimEvent[] = [];
  while (accumulator >= tickInterval) {
    accumulator -= tickInterval;
    const { changes, events, biomeChanges } = step(simWorld, biomeMap, elevationMap);
    rememberWorldEvents(currentWorldHistory, events);
    frameEvents.push(...events);
    for (const { row, col } of changes) { noteTileChange(row, col); noteSuccession(row, col); refreshTileOverlay(row, col); refreshBuildingSprite(row, col); noteFarmTile(row, col); }
    // Biome changes (the breathing land, plus floods/quakes) crossfade in over
    // the cached base, then commit to the cache when the fade completes.
    for (const { row, col } of biomeChanges) { enrollBiomeTrans(row, col); }
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
    // The ending is staged across the world's last ~102 seconds, so it has to
    // be chosen well before the turnover, and the next world rises through the
    // blackout when it arrives.
    if (endingCheckpoints()) {
      frameEvents.length = 0;
      break;
    }
  }
  pushLogEvents(frameEvents);
  for (const ev of frameEvents) {
    if (ev.kind === 'catastrophe') {
      triggerImpact(ev.catastropheType, ev.severity);
      triggerEpicenter(ev.centerRow, ev.centerCol, ev.catastropheType, ev.severity);
      atmos.addScar(ev.catastropheType, ev.centerRow, ev.centerCol, ev.radius, ev.severity);
      addQuietZone(ev.centerRow, ev.centerCol, ev.radius, worldClock);
    } else if (ev.kind === 'civ_born' || ev.kind === 'civ_died' || ev.kind === 'rally'
        || ev.kind === 'capital_moved' || ev.kind === 'last_flight' || ev.kind === 'refuge_founded') {
      const civ = simWorld.civs.get(ev.civId);
      if (civ) triggerPing(civ.originRow, civ.originCol, civ.color);
    } else if (ev.kind === 'breakaway') {
      const civ = simWorld.civs.get(ev.newCivId);
      if (civ) triggerPing(civ.originRow, civ.originCol, civ.color);
    } else if (ev.kind === 'conquest') {
      noteConquest(ev);
    } else if (ev.kind === 'wonder_built') {
      triggerPing(ev.row, ev.col, 0xfff0d0);
    } else if (ev.kind === 'island_rising' || ev.kind === 'island_born'
        || ev.kind === 'land_bridge' || ev.kind === 'rift_opened') {
      triggerPing(ev.row, ev.col, 0xd8e4ee);
    }
  }
  updateAtmosphere(worldSeconds * 1000);
  // Blight ramps on cycleFrac, which keeps climbing through act 4, so the land
  // would keep draining toward grey during the held beat.
  if (!(simWorld.ending?.silent)) updatePollution();
  // Sky + glaze + weather + scar fades. The sky leans toward the last dread
  // hue while curDread eases, so it releases smoothly after a catastrophe.
  atmos.update(worldSeconds * 1000, curDread, curHue.vignette, dominantEra(simWorld));
  // Dying-world blight: drain the land toward grey as the cataclysm nears.
  // atmos.update just wrote the seasonal tint, so this layers on top each frame.
  if (curBlight > 0.002) {
    biomeLayer.tint = lerpColor(biomeLayer.tint, BLIGHT.color, curBlight * BLIGHT.maxDrain);
  }
  // The ocean apron + scenery belong to the planetary look; scrubbing
  // curvature to ~0 restores the bare flat diamond.
  const planetary = atmos.curvature() >= 0.05 ? 1 : 0;
  if (oceanApron) oceanApron.alpha = planetary;
  sceneryWaterGfx.alpha = planetary;
  sceneryLandGfx.alpha = planetary;
  // Scenery land and the in-flight biome crossfade tiles follow the same
  // seasonal/blight land tint as the cached biomeLayer — otherwise a changed
  // tile renders at full brightness and reads as a bright spot at night.
  if (sceneryLandGfx.tint !== biomeLayer.tint) sceneryLandGfx.tint = biomeLayer.tint;
  if (biomeTransLayer.tint !== biomeLayer.tint) biomeTransLayer.tint = biomeLayer.tint;
  // City lights follow the night; rivers catch the light; smoke drifts.
  const L = atmos.light();
  const n = L.nightness;
  cityLightsGfx.alpha = LIGHTS.maxAlpha * (n * n * (3 - 2 * n));
  // The far air takes the horizon's colour — dread lean and all — so the back
  // of the world is always dissolving into the sky actually behind it.
  depthHazeSprite.tint = atmos.horizonColor();
  depthHazeSprite.alpha = DEPTH.strength * (1 - DEPTH.nightMult * n);
  // Clock text reads dark over the day sky, light over the night sky — softly,
  // with a contrasting glow so it stays legible without a panel.
  if (Math.abs(n - lastClockNight) > 0.01) {
    lastClockNight = n;
    const lum = 1 - n; // 1 day … 0 night
    clock.style.color = hexToCss(lerpColor(0xe2e6ee, 0x363a40, lum)); // night light → day dark, neither stark
    clock.style.textShadow = `0 1px 2px rgba(255,255,255,${(0.45 * lum).toFixed(2)}), 0 1px 3px rgba(0,0,0,${(0.5 * n).toFixed(2)})`;
  }
  riverGfx.tint = lerpColor(0xffffff, L.color, 0.35);
  const dtSec = worldSeconds;   // story surfaces share the world's clock too
  const nowSec = worldClock;
  // World-turnover blackout: hold full black for a beat, then ease it away so
  // the new world rises out of the dark.
  if (blackout > 0) {
    if (blackoutHold > 0) blackoutHold -= dtSec;
    else blackout = Math.max(0, blackout - dtSec / BLACKOUT_FADE);
    blackoutGfx.alpha = blackout;
    blackoutGfx.visible = true;
  } else if (blackoutGfx.visible) {
    blackoutGfx.visible = false;
  }
  updateSmoke(dtSec);
  // Declared here rather than lower down so the land transitions below can be
  // gated too: a field growing into view during act 4 is the world still
  // changing, whatever the tile counts say.
  const worldHeld = simWorld.ending?.silent === true;
  if (!worldHeld) updateFarmGrowth(simWorld.tick);
  updateBiomeTrans();
  flushBiomeChanges(simWorld.tick);
  drawRoads(dtSec);
  updateRoadGhosts(dtSec);   // drawRoads clears roadsGfx, so the ghosts go on after it
  drawPowerLines(dtSec, n);
  drawCables(dtSec, n);
  updateConflictFlashes(dtSec);
  updateWarfare(nowSec);
  updateWater(dtSec, nowSec, n);
  maybeWhale(dtSec);
  updateHerds(dtSec, nowSec, n);
  updateNomads(nowSec, dtSec, n);
  maybeSpawnRockets(dtSec);
  updateAir(dtSec, n);
  maybeSpawnSatellite(dtSec);
  updateSatellites(dtSec, nowSec, n);
  updateOrbitalRing(dtSec, nowSec, n);
  drawCauseways();
  drawLighthouses(nowSec, n);
  // Act 4 holds the world, and freezing step() was not enough to do it: these
  // systems live in the renderer but mutate the map — fire turns forest to
  // grass, plague turns built tiles to ruins, floods and droughts rewrite
  // biomes — or push narration of their own. Left running, the silence could
  // still visibly and permanently change. Atmosphere, light and the drawing
  // passes continue; the world does not.
  if (!worldHeld) {
    updateFires(dtSec, nowSec, n);
    maybeEruptVolcano(dtSec);
    updateVolcanoes(dtSec, nowSec, n);
    maybeOutbreak(dtSec, nowSec);
    updatePlagues(nowSec);
    maybeAwaken(dtSec, nowSec);
    updateFaiths(nowSec, n);
    maybeFlood(dtSec);
    updateFloods(dtSec, nowSec, n);
    maybeGrowDelta(dtSec);
    maybeDrought(dtSec);
    updateDroughts(dtSec, nowSec);
  }
  updateRiverCraft(dtSec, n);
  drawEnergyFarms(nowSec, n);
  drawMegastructures(nowSec, n);
  drawNaturalWonders(nowSec, n);
  drawWonders(nowSec, n);
  drawEraSkylines(nowSec, n);
  updateBirdFlocks(dtSec, nowSec, n);
  maybeGhost(dtSec, n);
  if (!worldHeld) {
    updateFestival(n);   // a festival narrates when it starts
    maybeChronicle();
  }
  // The camera breathes — whole-stage lens scale, leaning in with dread.
  breathT += worldSeconds;   // camera breathing on the world's clock
  app.stage.scale.set(
    1 + ATMOS.camera.breathAmp * 0.5 * (1 + Math.sin((Math.PI * 2 * breathT) / ATMOS.camera.breathPeriodSec))
      + curDread * ATMOS.camera.dreadLean
  );
  frameCount++;
  // Ease per-civ saturation toward era target; refresh tints for any civ mid-transition.
  easeCivSatMults();
  refreshTintsForTransitioningCivs();
  // Periodic density refresh (vitality drift, prominence growth). Walks only owned tiles
  // via the civ index instead of the full 96×96 grid.
  if (simWorld.tick % DENSITY.refreshInterval === 0) {
    // The world's temperament bends across its life, so the weather it drives
    // is refreshed on the same slow cadence rather than every frame.
    atmos.setStormRate(characterOf(simWorld).storm);
    // Reclamation creeps on its own slow cadence (drawSuccession early-returns
    // between bakes), and the soil marks age with it.
    // Succession growth is derived from simWorld.tick, which deliberately keeps
    // advancing through act 4 — so without this the ruins would sprout and the
    // soil marks fade several times during the held snapshot.
    if (!worldHeld && simWorld.tick - lastSuccessionBake >= SUCCESSION.rebakeTicks) { decaySoilMarks(); drawSuccession(); }
    // The ice front is checked on the same cadence; drawIce early-returns
    // unless it has actually moved past ICE.redrawStep, so this is nearly free.
    // Held in act 4: iceMemoryFade() is derived from simWorld.tick, so the pale
    // ground and moraine would keep fading through the aftermath.
    if (!worldHeld) drawIce();
    // The wounds heal on the same cadence: the silhouette pulls in, and the
    // building pass below picks up the receding quiet for free.
    if (quietZones.length) drawQuietZones();
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
    rebuildCityLights();
    rebuildSmokeEmitters();
    rebuildRoads();
    rebuildPowerLines();
    rebuildCables();
    rebuildLighthouses();
    rebuildEnergyFarms();
    rebuildMegastructures();
    rebuildBridges();
    maybeSpawnRiverBoats();
    if (simWorld.tick - lastFarmReconcile >= 45) { lastFarmReconcile = simWorld.tick; reconcileFarmland(); }
    rebuildFishSpots();
    maybeSpawnBoats();
    maybeSpawnCaravans();
    maybeSpawnHerds();
    maybeSpawnPlanes();
    rebuildCauseways();
    maybeSpawnCausewayTrains();
    // Route trails fade slowly toward the unused, then redraw the worn web.
    trailDecay(seaTrail, 0.99); trailDecay(landTrail, 0.99); trailDecay(airTrail, 0.988);
    redrawTrails();
    queueFestivals();
    // checkWarQuiet pushes "the border falls quiet" on its own 45-second
    // threshold, which two surviving civs can cross during act 4.
    if (!worldHeld) checkWarQuiet();
    if (!worldHeld) maybeNameConstellations();   // narrates a new constellation
  }
  // Animate tile color/alpha toward targets. Capped per frame: a "skip 5k" or
  // catastrophe can flood thousands of tiles into animation at once, and
  // redrawing them all every frame tanks the framerate for seconds. Above the
  // budget the overflow simply waits its turn (FIFO), so big bursts settle in
  // gentle waves instead of one stall. Steady-state churn (~200) never hits it.
  const EASE = 0.15; // higher = faster transitions
  const ANIM_BUDGET = 600;
  const done: string[] = [];
  let animWork = 0;
  for (const key of animatingTiles) {
    const [r, c] = key.split(',').map(Number);
    const tv = tileVisuals[r][c];
    if (!tv) { done.push(key); continue; }

    const e = ease(EASE);
    tv.curColor = lerpColor(tv.curColor, tv.targetColor, e);
    tv.curAlpha += (tv.targetAlpha - tv.curAlpha) * e;
    tv.curBorderColor = lerpColor(tv.curBorderColor, tv.targetBorderColor, e);
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
    if (++animWork >= ANIM_BUDGET) break; // overflow waits for a later frame
  }
  for (const key of done) animatingTiles.delete(key);
  // Tile-tint cache (see simCacheEnabled): enable once tiles exist, then refresh
  // only while tiles are easing. In steady state the cached quad stands in for
  // thousands of overlay draws every frame.
  if (!simCacheEnabled && simLayer.children.length > 0) {
    simLayer.cacheAsTexture?.(true); simCacheEnabled = true;
  } else if (simCacheEnabled && (animatingTiles.size > 0 || done.length > 0)) {
    (simLayer as any).updateCacheTexture?.();
  }

  // Animate biome tile color transitions (flood, future terrain mutations).
  const BIOME_EASE = 0.06;
  const biomeDone: string[] = [];
  for (const key of animatingBiomeTiles) {
    const [r, c] = key.split(',').map(Number);
    const btv = biomeTileVisuals[r][c];
    if (!btv) { biomeDone.push(key); continue; }
    btv.curColor = lerpColor(btv.curColor, btv.targetColor, ease(BIOME_EASE));
    redrawBiomeTile(btv.g, btv.curColor);
    if (colorsWithin(btv.curColor, btv.targetColor, 2)) {
      btv.curColor = btv.targetColor;
      redrawBiomeTile(btv.g, btv.curColor);
      biomeDone.push(key);
    }
  }
  for (const key of biomeDone) animatingBiomeTiles.delete(key);
  // Re-render the cached biome texture while tiles are easing (floods).
  if (animatingBiomeTiles.size > 0 || biomeDone.length > 0) (biomeLayer as any).updateCacheTexture?.();

  // Animate building sprite alpha (density), mid-floor alpha (era), and roof Y (era).
  const ROOF_EASE = 0.10;     // per-frame ease for roof Y slide on era change
  const MID_FLOOR_EASE = 0.07; // per-frame ease for mid-floor alpha
  const bldDone: string[] = [];
  scaffoldGfx.clear(); // construction frames are redrawn each frame for rising buildings
  for (const key of animatingBuildingTiles) {
    const [r, c] = key.split(',').map(Number);
    const bts = buildingTileStates[r][c];
    if (!bts) { bldDone.push(key); continue; }

    let settled = true;
    for (let s = 0; s < 4; s++) {
      // Fast path: slot has no sprite and isn't trying to grow one — nothing to animate.
      if (!bts.floor1[s] && bts.targetAlphas[s] === 0 && bts.curAlphas[s] === 0) continue;

      // Building visibility (density driver)
      bts.curAlphas[s] += (bts.targetAlphas[s] - bts.curAlphas[s]) * ease(DENSITY.easeSpeed);
      const slotNotSettled = Math.abs(bts.curAlphas[s] - bts.targetAlphas[s]) > 0.01;
      if (slotNotSettled) settled = false; else bts.curAlphas[s] = bts.targetAlphas[s];
      const a = bts.curAlphas[s];

      const mfs = bts.midFloors[s];

      if (bts.ruined[s]) {
        // A ruin's life: drain to grey stone, collapse the upper floors into a
        // low rubble stub, then let the land reclaim it. Hold at age 0 (intact)
        // until this tile's staggered start, so a fallen city crumbles in a ripple.
        // Held in act 4 with everything else. Ruin decay runs 30s plus stagger
        // and the last scheduled death lands under 35s before the silence, so
        // without this, buildings keep greying and collapsing right through the
        // aftermath — invisible to a tile-count check, because the tiles are
        // already ruins.
        if (nowSec >= bts.ruinStartAt && !(simWorld.ending?.silent)) {
          bts.ruinAge[s] = Math.min(1, bts.ruinAge[s] + worldSeconds / RUIN_DECAY_SECONDS);
        }
        const age = bts.ruinAge[s];
        if (age < 1) settled = false;
        const desat = Math.max(0, Math.min(1, age / RUIN_PHASE.greyBy));
        const collapse = Math.max(0, Math.min(1, (age - RUIN_PHASE.collapseFrom) / (RUIN_PHASE.collapseTo - RUIN_PHASE.collapseFrom)));
        const reclaim = Math.max(0, Math.min(1, (age - RUIN_PHASE.reclaimFrom) / (1 - RUIN_PHASE.reclaimFrom)));
        const biomeColor = biomeTileVisuals[r][c]?.curColor ?? BIOME_COLORS[biomeMap[r][c]];
        const grey = greyOf(bts.ruinColor0[s]);
        // Colour: original → grey (desaturate), then grey → the land (reclaim).
        let tint = lerpColor(bts.ruinColor0[s], grey, desat);
        tint = lerpColor(tint, biomeColor, reclaim * 0.92);
        const elemAlpha = a * (1 - reclaim);

        // floor1 is the rubble base: it squats down as the structure collapses,
        // then sinks into the ground as the land reclaims it.
        if (bts.floor1[s]) {
          const f1 = bts.floor1[s]!;
          f1.tint = tint;
          f1.alpha = elemAlpha;
          f1.scale.y = BUILDING_SCALE * (1 - 0.5 * collapse);
        }
        // Mid-floors collapse top-down — the upper storeys fall first.
        for (let i = mfs.length - 1; i >= 0; i--) {
          const mf = mfs[i];
          mf.sprite.tint = tint;
          const floorFall = Math.max(0, Math.min(1, collapse * mfs.length - (mfs.length - 1 - i)));
          mf.sprite.alpha = elemAlpha * (1 - floorFall);
        }
        // Roof caves in: drops toward the rubble and fades as it collapses.
        if (bts.roof[s]) {
          const rf = bts.roof[s]!;
          rf.tint = tint;
          rf.alpha = elemAlpha * (1 - collapse);
          const groundY = bts.floor1[s] ? bts.floor1[s]!.y : bts.roofCurY[s];
          rf.y = bts.roofCurY[s] + (groundY - bts.roofCurY[s]) * collapse;
        }
      } else {
        // Active building: visibility-driven alpha + era mid-floor/roof eases.
        if (bts.floor1[s]) { bts.floor1[s]!.alpha = a; bts.floor1[s]!.scale.y = BUILDING_SCALE; }
        if (bts.roof[s])   bts.roof[s]!.alpha   = a;
        // A building going up wears a timber/steel scaffold that comes down as
        // it fills in — the frame is strongest before the walls arrive.
        if (bts.floor1[s] && a < 0.9 && bts.targetAlphas[s] - a > 0.02) {
          const f1 = bts.floor1[s]!;
          const topY = bts.roof[s] ? bts.roofCurY[s] : f1.y - 8;
          drawScaffold(f1.x, f1.y, topY, a);
        }
        for (let i = mfs.length - 1; i >= 0; i--) {
          const mf = mfs[i];
          mf.curAlpha += (mf.targetAlpha - mf.curAlpha) * ease(MID_FLOOR_EASE);
          const mfNotSettled = Math.abs(mf.curAlpha - mf.targetAlpha) > 0.01;
          if (mfNotSettled) settled = false; else mf.curAlpha = mf.targetAlpha;
          mf.sprite.alpha = a * mf.curAlpha;
          if (!mfNotSettled && mf.targetAlpha === 0 && i === mfs.length - 1) {
            buildingLayer.removeChild(mf.sprite);
            mf.sprite.destroy();
            mfs.pop();
          }
        }
        if (bts.roof[s]) {
          bts.roofCurY[s] += (bts.roofTargetY[s] - bts.roofCurY[s]) * ease(ROOF_EASE);
          if (Math.abs(bts.roofCurY[s] - bts.roofTargetY[s]) > 0.1) settled = false;
          else bts.roofCurY[s] = bts.roofTargetY[s];
          bts.roof[s]!.y = bts.roofCurY[s];
        }
      }

      // Whole slot torn down — destroy all sprites. Triggered by either:
      //  (a) building visibility hit 0 (tile left 'built' state), or
      //  (b) the ruin fully decayed (rubble reclaimed by the land).
      const ruinCrumbled = bts.ruined[s] && bts.ruinAge[s] >= 1;
      if ((!slotNotSettled && bts.targetAlphas[s] === 0 && !bts.ruined[s]) || ruinCrumbled) {
        if (bts.floor1[s]) { buildingLayer.removeChild(bts.floor1[s]!); bts.floor1[s]!.destroy(); bts.floor1[s] = null; }
        if (bts.roof[s])   { buildingLayer.removeChild(bts.roof[s]!);   bts.roof[s]!.destroy();   bts.roof[s]   = null; }
        for (const mf of bts.midFloors[s]) { buildingLayer.removeChild(mf.sprite); mf.sprite.destroy(); }
        bts.midFloors[s] = [];
        // Reset ruin state in case a new building is later placed in this slot.
        bts.ruined[s] = false;
        bts.curRuinMult[s] = 1.0;
        bts.ruinAge[s] = 0;
      }
    }

    if (settled) {
      bldDone.push(key);
      if (bts.floor1.every(s => s === null)) buildingTileStates[r][c] = null;
    }
  }
  for (const key of bldDone) animatingBuildingTiles.delete(key);

  drawExpeditions();
  updateHud();
  // DOM rebuild for the civ bars is expensive — throttle it.
  if (frameCount % BARS_REFRESH_FRAMES === 0) updateBars();
  updateEventLog();
});

// Capture the world into its RenderTexture every frame. Registered after the
// main tick callback (so it sees this frame's updates) and not gated by
// `running`, so manual actions while paused still show.
app.ticker.add(() => {
  measureFps();
  updateFpsLabel();
  if (!(window as any).__skipRT) {
    app.renderer.render({ container: world, target: worldRT, clear: true });
    if (worldNeedsEdgeErase()) {
      app.renderer.render({ container: worldEdgeEraser, target: worldRT, clear: false });
    }
  }
});

// --- HUD ---
// --- Debug spawn menu: force any event / structure / wonder, for testing ---
function fireCatastrophe() {
  const changes: Array<{ row: number; col: number }> = [];
  const biomeChanges: BiomeChange[] = [];
  const events: SimEvent[] = [];
  applyCatastrophe(simWorld, biomeMap, elevationMap, changes, biomeChanges, events);
  for (const { row, col } of changes) { noteTileChange(row, col); refreshTileOverlay(row, col); refreshBuildingSprite(row, col); noteFarmTile(row, col); }
  for (const { row, col } of biomeChanges) { refreshBiomeTile(row, col); }
  if (biomeChanges.length > 0) { rebuildWaterMask(); (biomeLayer as any).updateCacheTexture?.(); biomeCacheDirty = false; waterMaskDirty = false; }
  pushLogEvents(events);
  for (const ev of events) {
    if (ev.kind === 'catastrophe') {
      triggerImpact(ev.catastropheType, ev.severity);
      triggerEpicenter(ev.centerRow, ev.centerCol, ev.catastropheType, ev.severity);
      atmos.addScar(ev.catastropheType, ev.centerRow, ev.centerCol, ev.radius, ev.severity);
      addQuietZone(ev.centerRow, ev.centerCol, ev.radius, worldClock);
    }
  }
  drawCityMarkers();
}
function dbgCenterLand(): { row: number; col: number } {
  const m = (GRID_SIZE / 2) | 0;
  for (let rad = 0; rad < GRID_SIZE; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    const r = m + dr, c = m + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
    if (biomeMap[r][c] !== 'water' && biomeMap[r][c] !== 'rock') return { row: r, col: c };
  }
  return { row: m, col: m };
}
function dbgRandomCity(): { row: number; col: number; color: number } {
  const civs = [...simWorld.civs.values()].filter((c) => c.phase !== 'dead' && c.cities.length);
  if (!civs.length) { const t = dbgCenterLand(); return { ...t, color: 0x6aa0d0 }; }
  const civ = civs[(Math.random() * civs.length) | 0];
  const city = civ.cities[(Math.random() * civ.cities.length) | 0];
  return { row: city.row, col: city.col, color: civ.color };
}
function dbgMega(kind: MegaKind) {
  const s = dbgRandomCity();
  if (debugMegas.length >= 4) debugMegas.shift();
  debugMegas.push({ row: s.row, col: s.col, kind, color: s.color });
  triggerPing(s.row, s.col, 0xfff0d0);
}
function dbgWonder(era: Era) {
  const s = dbgRandomCity();
  if (debugWonders.length >= 4) debugWonders.shift();
  debugWonders.push({ row: s.row, col: s.col, era, born: worldClock });
  triggerPing(s.row, s.col, 0xfff0d0);
}
function dbgWildfire() {
  const m = (GRID_SIZE / 2) | 0;
  for (let rad = 0; rad < GRID_SIZE; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    const r = m + dr, c = m + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
    if (biomeMap[r][c] === 'forest' && simWorld.tiles[r][c].state === 'wild') { igniteTile(r, c); triggerPing(r, c, 0xff7a30); return; }
  }
}
function dbgBattle() {
  const civs = [...simWorld.civs.values()].filter((c) => c.phase !== 'dead' && c.cities.length);
  if (civs.length < 2) return;
  civs.sort((a, b) => (civStats.tileCounts.get(b.id) || 0) - (civStats.tileCounts.get(a.id) || 0));
  const atk = civs[0], def = civs[1], city = def.cities[0];
  noteBattle({ row: city.row, col: city.col, attackerId: atk.id, defenderId: def.id });
}
function dbgDelta() {
  if (!riverPaths.length) return;
  let rp = riverPaths[0];
  for (const p of riverPaths) if (p.tiles.length > rp.tiles.length) rp = p;
  for (let i = 0; i < 30; i++) depositSilt(rp);
}
function dbgRocket() {
  const civs = [...simWorld.civs.values()].filter((c) => c.phase !== 'dead' && c.cities.length);
  if (!civs.length) return;
  const civ = civs[(Math.random() * civs.length) | 0];
  const city = civ.cities[(Math.random() * civ.cities.length) | 0];
  const s = tileToSky(city.row, city.col);
  rockets.push({ x: s.x, y0: s.y, t: 0, smoke: [] });
  triggerPing(city.row, city.col, 0xfff0d0);
}
function dbgSatellite() {
  const W = window.innerWidth, H = window.innerHeight;
  const ltr = Math.random() < 0.5, sp = 38 + Math.random() * 46;
  satellites.push({ x: ltr ? -24 : W + 24, y: H * (0.06 + Math.random() * 0.48), vx: (ltr ? 1 : -1) * sp, vy: (Math.random() - 0.5) * 0.5 * sp, blink: Math.random() * 10, trail: [] });
}
// label → action; a null action renders as a non-selectable group header.
const DBG_SPAWNS: Array<[string, (() => void) | null]> = [
  ['— land & life —', null],
  ['Volcano (eruption)', () => maybeEruptVolcano(1e6)],
  ['Plague', () => maybeOutbreak(1e6, worldClock)],
  ['Faith (golden tide)', () => maybeAwaken(1e6, worldClock)],
  ['Flood', () => maybeFlood(1e6)],
  ['Drought', () => maybeDrought(1e6)],
  ['River delta growth', dbgDelta],
  ['Wildfire', dbgWildfire],
  ['War / battle', dbgBattle],
  ['Catastrophe (random)', fireCatastrophe],
  ['— sky —', null],
  ['Comet', () => atmos.triggerCelestial('comet')],
  ['Eclipse', () => atmos.triggerCelestial('eclipse')],
  ['Aurora', () => atmos.triggerCelestial('aurora')],
  ['Meteor shower', () => atmos.triggerCelestial('meteors')],
  ['Rocket launch', dbgRocket],
  ['Satellite', dbgSatellite],
  ['Orbital ring (toggle)', () => { debugRing = !debugRing; }],
  ['— megastructures —', null],
  ['Space elevator', () => dbgMega('elevator')],
  ['Megatower', () => dbgMega('megatower')],
  ['Arcology dome', () => dbgMega('dome')],
  ['Fusion reactor', () => dbgMega('reactor')],
  ['Energy farms (solar/wind)', () => rebuildEnergyFarms()],
  ['— wonders —', null],
  ['Stone circle', () => dbgWonder('neolithic')],
  ['Pyramid', () => dbgWonder('classical')],
  ['Cathedral', () => dbgWonder('medieval')],
  ['Iron tower', () => dbgWonder('industrial')],
  ['Obelisk', () => dbgWonder('modern')],
  ['Glass monolith', () => dbgWonder('post')],
  ['— clear —', null],
  ['Clear debug spawns', () => { debugMegas.length = 0; debugWonders.length = 0; debugRing = false; }],
];
// The same spawns, callable from the console, so the ending's hold can be
// tested against an event that is actually in flight.
(window as any).__dbg = Object.fromEntries(
  DBG_SPAWNS.filter(([, fn]) => fn).map(([label, fn]) => [label, fn!]),
);


const hud = document.createElement('div');
hud.style.cssText = `
  position: fixed; top: 12px; left: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px;
  background: rgba(255,255,255,0.78); padding: 6px 10px; border-radius: 4px;
  display: flex; gap: 10px; align-items: center; user-select: none;
`;
hud.innerHTML = `
  <button id="hud-toggle" style="cursor:pointer;font-weight:bold;width:20px;height:20px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1" title="collapse / expand">–</button>
  <span id="hud-body" style="display:flex;gap:10px;align-items:center">
    <span>seed: <strong id="seed-label"></strong></span>
    <button id="reroll" style="cursor:pointer">reroll</button>
    <button id="reset-sim" style="cursor:pointer">reset sim</button>
    <button id="skip" style="cursor:pointer;color:#607080">skip 5k</button>
    <select id="dbg-spawn" style="cursor:pointer;color:#3060a0" title="spawn an event / structure / wonder for testing"></select>
    <button id="quality" style="cursor:pointer;color:#607080" title="graphics quality — lower for more FPS">gfx: high</button>
    <button id="toggle-bars" style="cursor:pointer;color:#607080" title="show / hide the living-civilizations panel">civ panel: on</button>
    <button id="toggle-log" style="cursor:pointer;color:#607080" title="show / hide the event log">log: on</button>
    <span>tick: <strong id="tick-label">0</strong></span>
    <span>fps: <strong id="fps-label">—</strong></span>
  </span>
`;
document.body.appendChild(hud);
hud.hidden = !debugMode;
const hudToggle = document.getElementById('hud-toggle')!;
const hudBody = document.getElementById('hud-body')!;
hudToggle.addEventListener('click', () => {
  const collapsed = hudBody.style.display === 'none';
  hudBody.style.display = collapsed ? 'flex' : 'none';
  hudToggle.textContent = collapsed ? '–' : '+';
});

// Populate the debug spawn dropdown and fire the chosen action on select.
const dbgSelect = document.getElementById('dbg-spawn') as HTMLSelectElement;
{
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = 'spawn…'; ph.selected = true;
  dbgSelect.appendChild(ph);
  DBG_SPAWNS.forEach(([label, fn], i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = label;
    if (fn === null) o.disabled = true; // group header
    dbgSelect.appendChild(o);
  });
}
dbgSelect.addEventListener('change', () => {
  const entry = DBG_SPAWNS[Number(dbgSelect.value)];
  if (entry && entry[1]) entry[1]();
  dbgSelect.value = ''; // snap back to the placeholder so the same item can re-fire
});

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
barPanel.innerHTML = `<div id="bars"></div>`;
document.body.appendChild(barPanel);

// Visibility toggles for the civ panel and the event log.
const toggleBars = document.getElementById('toggle-bars')!;
toggleBars.addEventListener('click', () => {
  showBars = !showBars;
  barPanel.style.display = showBars ? 'flex' : 'none';
  toggleBars.textContent = showBars ? 'civ panel: on' : 'civ panel: off';
});
const toggleLog = document.getElementById('toggle-log')!;
toggleLog.addEventListener('click', () => {
  showLog = !showLog;
  logPanel.style.display = showLog ? 'block' : 'none';
  toggleLog.textContent = showLog ? 'log: on' : 'log: off';
});

// Open clean for screensaver use: log + civ panel hidden, dev bar collapsed.
logPanel.style.display = 'none';
toggleLog.textContent = 'log: off';
barPanel.style.display = 'none';
toggleBars.textContent = 'civ panel: off';
hudBody.style.display = 'none';
hudToggle.textContent = '+';

// --- Clock + deep-time readout, top-right ---
const clock = document.createElement('div');
clock.style.cssText = `
  position: fixed; top: 14px; right: 16px; text-align: right;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  user-select: none; pointer-events: none; line-height: 1.3;
`;
clock.innerHTML = `<div id="clock-world" style="font-family:Georgia,'Times New Roman',serif;font-size:12px;font-weight:600;letter-spacing:0.02em;margin-bottom:2px"></div><div id="clock-time" style="font-size:20px;font-weight:600;letter-spacing:0.5px"></div><div id="clock-date" style="font-size:11px;opacity:0.8"></div><div id="clock-age" style="font-size:10px;opacity:0.66;margin-top:2px;font-style:italic"></div>`;
document.body.appendChild(clock);
const clockWorld = document.getElementById('clock-world')!;
const clockTime = document.getElementById('clock-time')!;
const clockDate = document.getElementById('clock-date')!;
const clockAge = document.getElementById('clock-age')!;
let lastClockNight = -1; // drives the day/night recolour of the clock text
const ERA_NAMES = WORLD_ERA_NAMES;
// Deep-time calendar: the era clock (eraProgress, 0→5) mapped to a real calendar
// year, so the number always sits in its era's true historical window — no more
// "The Ancient World, year 44,000". Breakpoints are the calendar year at each
// integer eraProgress; the last extrapolates the future past the post-era.
const ERA_YEAR_BREAKS = [-10000, -3000, 500, 1500, 1900, 2100, 2300];
function deepTimeYear(world: SimWorld): string {
  // Anchor the year inside the DISPLAYED era's band so name and year never
  // contradict, using eraProgress for the smooth position within that band.
  const dom = ERA_RANK[dominantEra(world)];
  const p = Math.max(dom, Math.min(dom + 1, Math.max(0, world.eraProgress)));
  const i = Math.min(ERA_YEAR_BREAKS.length - 2, Math.floor(p));
  const y = ERA_YEAR_BREAKS[i] + (ERA_YEAR_BREAKS[i + 1] - ERA_YEAR_BREAKS[i]) * (p - i);
  const yr = Math.round(y / 10) * 10;
  return yr < 0 ? `${(-yr).toLocaleString('en-US')} BCE` : `${yr.toLocaleString('en-US')} CE`;
}
function updateClock() {
  const now = new Date();
  clockWorld.textContent = currentWorldName;
  clockTime.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  clockDate.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  clockAge.textContent = `${ERA_NAMES[dominantEra(simWorld)]} · ${deepTimeYear(simWorld)}`;
}
updateClock();
setInterval(updateClock, 1000);

// --- Public viewer controls ---
async function toggleFullscreen(source: 'control' | 'double_click') {
  if (!document.fullscreenEnabled) return;
  const entering = !document.fullscreenElement;
  try {
    if (entering) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
    trackEvent('fullscreen_toggled', { enabled: entering, source });
  } catch {
    // A denied fullscreen request is not usage and should not be counted.
  }
}

const viewerControls = document.createElement('nav');
viewerControls.className = 'viewer-controls';
viewerControls.setAttribute('aria-label', 'World controls');
viewerControls.innerHTML = `
  <button type="button" data-control="pause" title="Pause the world">pause</button>
  <button type="button" data-control="speed" title="Change simulation speed">1x</button>
  <button type="button" data-control="chronicle" title="Show messages beside events in the world">chronicle</button>
  <button type="button" data-control="archive" title="Revisit remembered worlds">worlds</button>
  <button type="button" data-control="new" title="Begin a new world">new world</button>
  <button type="button" data-control="share" title="Share this exact world">share</button>
  <button type="button" data-control="awake" title="Prevent this display from sleeping while The Land is open">stay awake</button>
  <button type="button" data-control="fullscreen" title="Enter fullscreen">fullscreen</button>
`;
document.body.appendChild(viewerControls);

// The control bar wraps to two rows on a phone and three at ~320px, so anything
// sitting above it cannot assume a height. Publish the measured one and let the
// CSS position against it.
const publishControlsHeight = () => {
  document.documentElement.style.setProperty(
    '--controls-height', `${Math.round(viewerControls.getBoundingClientRect().height)}px`,
  );
};
publishControlsHeight();
if ('ResizeObserver' in window) new ResizeObserver(publishControlsHeight).observe(viewerControls);
window.addEventListener('resize', publishControlsHeight);

const worldArchivePanel = document.createElement('section');
worldArchivePanel.className = 'world-archive';
worldArchivePanel.hidden = true;
worldArchivePanel.setAttribute('aria-hidden', 'true');
worldArchivePanel.setAttribute('aria-labelledby', 'world-archive-title');
worldArchivePanel.innerHTML = `
  <header class="world-archive__header">
    <div>
      <p>world memory</p>
      <h2 id="world-archive-title">Past worlds</h2>
    </div>
    <button type="button" data-archive-close aria-label="Close past worlds">close</button>
  </header>
  <p class="world-archive__intro">Worlds enter memory when they pass, or when you choose to begin another.</p>
  <div class="world-archive__list"></div>
`;
document.body.appendChild(worldArchivePanel);
const worldArchiveList = worldArchivePanel.querySelector<HTMLElement>('.world-archive__list')!;



function formatWorldDuration(ticks: number): string {
  const minutes = Math.max(1, Math.round(ticks / ticksPerSecond / 60));
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
function renderWorldArchive() {
  worldArchiveList.replaceChildren();
  if (worldArchive.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'world-archive__empty';
    empty.textContent = 'No worlds have passed into memory yet.';
    worldArchiveList.appendChild(empty);
    return;
  }

  for (const world of worldArchive) {
    const item = document.createElement('article');
    item.className = 'world-archive__item';

    const copy = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = world.name;
    const meta = document.createElement('p');
    const ended = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' }).format(world.endedAt);
    const ending = world.ending === 'left_behind' ? 'left behind' : WORLD_ENDINGS[world.ending]?.archiveLabel ?? 'passed';
    meta.textContent = `${ending} · ${ended} · ${formatWorldDuration(world.ticksLived)} · ${WORLD_ERA_NAMES[world.peakEra]}`;
    const epitaph = document.createElement('span');
    epitaph.textContent = world.epitaph;
    copy.append(name, meta, epitaph);

    const revisit = document.createElement('button');
    revisit.type = 'button';
    revisit.textContent = 'revisit';
    revisit.title = `Return to seed ${world.seed}`;
    revisit.addEventListener('click', () => {
      resetWorld(world.seed, 'left_behind');
      setWorldArchiveOpen(false);
    });

    item.append(copy, revisit);
    worldArchiveList.appendChild(item);
  }
}
function setWorldArchiveOpen(open: boolean) {
  worldArchivePanel.hidden = !open;
  worldArchivePanel.setAttribute('aria-hidden', String(!open));
  archiveControl.classList.toggle('is-active', open);
  if (open) {
    renderWorldArchive();
    hideWorldInspector();
  }
}

const pauseControl = viewerControls.querySelector<HTMLButtonElement>('[data-control="pause"]')!;
const speedControl = viewerControls.querySelector<HTMLButtonElement>('[data-control="speed"]')!;
const chronicleControl = viewerControls.querySelector<HTMLButtonElement>('[data-control="chronicle"]')!;
const archiveControl = viewerControls.querySelector<HTMLButtonElement>('[data-control="archive"]')!;
const shareControl = viewerControls.querySelector<HTMLButtonElement>('[data-control="share"]')!;
const awakeControl = viewerControls.querySelector<HTMLButtonElement>('[data-control="awake"]')!;

pauseControl.addEventListener('click', () => {
  running = !running;
  pauseControl.textContent = running ? 'pause' : 'resume';
  pauseControl.classList.toggle('is-active', !running);
});

const SPEEDS = [1, 2, 4, 8];
speedControl.addEventListener('click', () => {
  timeScale = SPEEDS[(SPEEDS.indexOf(timeScale) + 1) % SPEEDS.length];
  speedControl.textContent = `${timeScale}x`;
  speedControl.classList.toggle('is-active', timeScale !== 1);
  // Accelerated twinkle reads as flashing; hold both reflections at mean brightness.
  atmos.setGlitterSteady(timeScale >= 4);
});

chronicleControl.addEventListener('click', () => {
  showLog = !showLog;
  logPanel.style.display = showLog ? 'block' : 'none';
  toggleLog.textContent = showLog ? 'log: on' : 'log: off';
  chronicleControl.classList.toggle('is-active', showLog);
  trackEvent('chronicle_toggled', { enabled: showLog });
});

archiveControl.addEventListener('click', () => {
  setWorldArchiveOpen(worldArchivePanel.hasAttribute('hidden'));
});
worldArchivePanel.querySelector('[data-archive-close]')!.addEventListener('click', () => {
  setWorldArchiveOpen(false);
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setWorldArchiveOpen(false);
});
renderWorldArchive();

viewerControls.querySelector('[data-control="new"]')!.addEventListener('click', () => {
  resetWorld(randomSeed(), 'left_behind');
  trackEvent('world_generated', { source: 'manual' });
});

shareControl.addEventListener('click', async () => {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('seed', currentSeed);
  const shareData = {
    title: `${currentWorldName} — The Land`,
    text: `Watch ${currentWorldName} live and pass into history.`,
    url: url.toString(),
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      trackEvent('world_shared', { method: 'native' });
    } else {
      await navigator.clipboard.writeText(url.toString());
      trackEvent('world_shared', { method: 'clipboard' });
      shareControl.textContent = 'copied';
      window.setTimeout(() => { shareControl.textContent = 'share'; }, 1600);
    }
  } catch {
    // Dismissing the native share sheet is not an error the viewer needs to see.
  }
});

let keepAwake = false;
let wakeLock: any = null;
async function syncWakeLock() {
  if (!('wakeLock' in navigator)) {
    awakeControl.hidden = true;
    return;
  }
  if (!keepAwake) {
    await wakeLock?.release?.();
    wakeLock = null;
    awakeControl.textContent = 'stay awake';
    awakeControl.classList.remove('is-active');
    return;
  }
  try {
    wakeLock = await (navigator as any).wakeLock.request('screen');
    awakeControl.textContent = 'awake';
    awakeControl.classList.add('is-active');
    wakeLock.addEventListener?.('release', () => {
      wakeLock = null;
      if (document.visibilityState === 'visible' && keepAwake) syncWakeLock();
    }, { once: true });
  } catch {
    keepAwake = false;
    awakeControl.textContent = 'stay awake';
    awakeControl.classList.remove('is-active');
  }
}
awakeControl.addEventListener('click', async () => {
  keepAwake = !keepAwake;
  const requestedState = keepAwake;
  await syncWakeLock();
  if (!requestedState || (keepAwake && wakeLock)) {
    trackEvent('wake_lock_toggled', { enabled: requestedState });
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && keepAwake && !wakeLock) syncWakeLock();
});

viewerControls.querySelector('[data-control="fullscreen"]')!.addEventListener('click', () => toggleFullscreen('control'));
document.addEventListener('dblclick', () => toggleFullscreen('double_click'));

// A passive field guide: hover the curved world to identify what is visible
// without selecting it or turning observation into a game mechanic.
interface InspectorHit {
  rank: number;
  distance: number;
  kind: string;
  title: string;
  detail: string;
}

const worldInspector = document.createElement('aside');
worldInspector.className = 'world-inspector';
worldInspector.setAttribute('aria-hidden', 'true');
worldInspector.innerHTML = `
  <span class="world-inspector__kind"></span>
  <strong class="world-inspector__title"></strong>
  <span class="world-inspector__detail"></span>
`;
document.body.appendChild(worldInspector);
const inspectorKind = worldInspector.querySelector<HTMLElement>('.world-inspector__kind')!;
const inspectorTitle = worldInspector.querySelector<HTMLElement>('.world-inspector__title')!;
const inspectorDetail = worldInspector.querySelector<HTMLElement>('.world-inspector__detail')!;

const BIOME_NAMES: Record<Biome, string> = {
  water: 'open water',
  sand: 'sand flats',
  grass: 'grassland',
  forest: 'forest',
  fertile: 'fertile country',
  rock: 'high stone',
};
const TILE_STATE_NAMES = {
  wild: 'wild land',
  cleared: 'worked land',
  built: 'settled land',
  ruin: 'old ruins',
} as const;

interface InspectorTile {
  row: number;
  col: number;
  x: number;
  y: number;
}
let inspectorTiles: InspectorTile[] = [];
function rebuildInspectorProjection() {
  const projected: InspectorTile[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const p = tileToSky(row, col);
      projected.push({ row, col, x: p.x, y: p.y });
    }
  }
  inspectorTiles = projected;
}
function worldPointToSky(x: number, y: number) {
  const t = toTex(x, y);
  return atmos.project(t.x, t.y);
}
rebuildInspectorProjection();
window.addEventListener('resize', () => {
  requestAnimationFrame(rebuildInspectorProjection);
});

const INSPECTOR_HOVER_DELAY = 320;
const INSPECTOR_RELEASE_DISTANCE = 14;
let inspectorHoverTimer = 0;
let inspectorAnchor: { x: number; y: number } | null = null;

function hideWorldInspector() {
  clearTimeout(inspectorHoverTimer);
  inspectorHoverTimer = 0;
  inspectorAnchor = null;
  worldInspector.classList.remove('is-visible');
  worldInspector.setAttribute('aria-hidden', 'true');
}
function inspectWorldAt(clientX: number, clientY: number) {
  if (document.querySelector('.world-intro')) {
    hideWorldInspector();
    return;
  }

  let best: InspectorHit | null = null;
  const consider = (
    point: { x: number; y: number },
    radius: number,
    rank: number,
    kind: string,
    title: string,
    detail: string,
  ) => {
    const distance = Math.hypot(point.x - clientX, point.y - clientY);
    if (distance > radius) return;
    if (!best || rank > best.rank || (rank === best.rank && distance < best.distance)) {
      best = { rank, distance, kind, title, detail };
    }
  };
  const light = atmos.light();
  const celestial = atmos.celestialPosition();
  if (celestial) {
    const isSun = celestial.kind === 'sun';
    consider(
      celestial,
      isSun ? 36 : 28,
      7,
      celestial.kind,
      isSun ? 'The sun' : 'The moon',
      isSun ? 'The daylight crossing this world' : 'The night light crossing this world',
    );
  }

  const limb = atmos.limbGeometry();
  for (const star of atmos.brightStarPositions()) {
    const onScreen = star.x >= 0 && star.x <= window.innerWidth && star.y >= 0 && star.y <= window.innerHeight;
    const inOpenSky = !limb || Math.hypot(star.x - limb.cx, star.y - limb.cy) >= limb.R;
    if (onScreen && inOpenSky) {
      consider(star, 12, 3, 'night sky', 'A star', 'Part of the turning firmament');
    }
  }

  const pathPoint = (pts: Array<{ x: number; y: number }>, idx: number) => {
    if (pts.length < 2) return null;
    const last = pts.length - 1;
    const k = Math.min(Math.floor(idx), last - 1);
    const u = Math.min(1, idx - k);
    return {
      x: pts[k].x + (pts[k + 1].x - pts[k].x) * u,
      y: pts[k].y + (pts[k + 1].y - pts[k].y) * u,
    };
  };

  for (const fire of fires) {
    consider(
      tileToSky(fire.row, fire.col),
      26,
      9,
      'wildfire',
      fire.wasForest ? 'A forest fire' : 'A grass fire',
      fire.t < FIRE_BURN * 0.45 ? 'The blaze is spreading' : 'The ground is burning out',
    );
  }

  for (const plague of plagues) {
    const civ = simWorld.civs.get(plague.civId);
    for (const district of plague.afflicted.values()) {
      consider(
        tileToSky(district.row, district.col),
        22,
        8,
        'plague',
        district.fate === 'ruin' ? 'A stricken district' : 'An outbreak',
        civ ? `Spreading through ${civ.name}` : 'A fever passing through the city',
      );
    }
  }

  for (const boat of boats) {
    const point = pathPoint(boat.pts, boat.idx);
    if (!point) continue;
    const civ = [...simWorld.civs.values()].find((candidate) => candidate.color === boat.color);
    const title = boat.era >= 4 ? 'A cargo vessel' : boat.era >= 3 ? 'A steamship' : 'A sailing vessel';
    consider(
      worldPointToSky(point.x, point.y),
      24,
      7,
      'vessel',
      title,
      civ ? `${civ.name} · underway` : 'Underway between ports',
    );
  }

  for (const boat of riverBoats) {
    const point = pathPoint(boat.pts, boat.idx);
    if (point) consider(worldPointToSky(point.x, point.y), 22, 7, 'river craft', 'A river barge', 'Carrying goods inland');
  }

  for (const wreck of wrecks) {
    consider(worldPointToSky(wreck.x, wreck.y), 22, 7, 'wreckage', 'A sinking vessel', 'Its voyage ended here');
  }

  for (const flock of birdFlocks) {
    const u = flock.t / flock.dur;
    const x = flock.sx + (flock.tx - flock.sx) * u;
    const y = flock.sy + (flock.ty - flock.sy) * u - Math.sin(u * Math.PI) * 18;
    consider(worldPointToSky(x, y), 24, 6, 'wildlife', 'A flock of birds', `${flock.n} birds crossing between forests`);
  }

  for (const herd of herds) {
    const forest = biomeMap[herd.r][herd.c] === 'forest';
    consider(
      worldPointToSky(herd.x, herd.y),
      22,
      6,
      'wildlife',
      forest ? 'A woodland herd' : 'A grazing herd',
      `${herd.size} animals roaming the wilds`,
    );
  }

  for (const fish of fishSpots) {
    consider(worldPointToSky(fish.x, fish.y), 18, 5, 'sea life', 'A school of fish', 'Circling beneath the surface');
  }
  if (whale) {
    consider(worldPointToSky(whale.x, whale.y), 24, 6, 'sea life', 'A surfacing whale', 'Briefly visible in deep water');
  }


  for (const battle of battles) {
    const attacker = simWorld.civs.get(battle.attackerId);
    const defender = simWorld.civs.get(battle.defenderId);
    const sides = attacker && defender ? `${attacker.name} and ${defender.name}` : 'rival peoples';
    consider(
      tileToSky(battle.row, battle.col),
      30,
      5,
      battle.siege ? 'siege' : 'battle',
      battle.siege ? 'A city under siege' : 'A contested front',
      `War between ${sides}`,
    );
  }

  for (const nomad of simWorld.pendingSettlements) {
    const f = 1 - nomad.ticksLeft / SIM_MIGRATION_TICKS;
    const target = gridToScreen(nomad.col, nomad.row);
    const phase = (nomad.row * 7 + nomad.col * 13) % 100;
    const distance = 80 * (1 - f);
    const angle = phase + f * 2;
    const point = worldPointToSky(
      target.x + Math.cos(angle) * distance,
      target.y + Math.sin(angle) * distance * 0.5,
    );
    consider(point, 28, 5, 'people in motion', 'A roving band', 'Seeking a place to settle');
  }

  for (const wonder of naturalWonders) {
    consider(
      tileToSky(wonder.row, wonder.col),
      24,
      4,
      'natural wonder',
      wonder.name,
      wonder.kind.replaceAll('_', ' '),
    );
  }

  for (const civ of simWorld.civs.values()) {
    for (const city of civ.cities) {
      const fallen = civ.phase === 'dead';
      const litAtNight = !fallen && light.nightness > 0.45 && cityLightsGfx.alpha > 0.08;
      consider(
        tileToSky(city.row, city.col),
        24,
        litAtNight ? 6 : 4,
        fallen ? 'ruined city' : litAtNight ? 'city lights' : 'city',
        fallen ? `Ruins of ${city.name}` : litAtNight ? `${city.name} after dark` : city.name,
        litAtNight ? `${civ.name} · windows and streets alight` : `${civ.name} · ${ERA_NAMES[civ.era]}`,
      );
    }
  }

  let nearestTile: InspectorTile | null = null;
  let nearestDistance = Infinity;
  for (const tile of inspectorTiles) {
    const distance = (tile.x - clientX) ** 2 + (tile.y - clientY) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestTile = tile;
    }
  }

  if (nearestTile && nearestDistance <= 24 ** 2 && !best) {
    const { row, col } = nearestTile;
    const biome = biomeMap[row][col];
    const tile = simWorld.tiles[row][col];
    const civ = tile.civId === null ? null : simWorld.civs.get(tile.civId);
    const kind = TILE_STATE_NAMES[tile.state];
    const title =
      tile.state === 'ruin' ? (tile.ruinEra ? `Ruins from the ${ERA_NAMES[tile.ruinEra].toLowerCase()}` : 'Ruins of an unknown age') :
      civ ? civ.name :
      BIOME_NAMES[biome];
    const detail = civ
      ? `${kind} · ${BIOME_NAMES[biome]}`
      : kind === 'wild land' ? BIOME_NAMES[biome] : `${kind} · ${BIOME_NAMES[biome]}`;
    best = { rank: 1, distance: Math.sqrt(nearestDistance), kind, title, detail };
  }

  if (!best) {
    hideWorldInspector();
    return;
  }

  inspectorKind.textContent = best.kind;
  inspectorTitle.textContent = best.title;
  inspectorDetail.textContent = best.detail;
  worldInspector.style.left = `${Math.min(clientX + 17, window.innerWidth - 224)}px`;
  worldInspector.style.top = `${Math.min(clientY + 19, window.innerHeight - 102)}px`;
  inspectorAnchor = { x: clientX, y: clientY };
  worldInspector.setAttribute('aria-hidden', 'false');
  worldInspector.classList.add('is-visible');
}

let inspectorPointer = { x: 0, y: 0 };
window.addEventListener('pointermove', (event) => {
  const target = event.target;
  if (
    event.pointerType === 'touch' ||
    (target instanceof Element && target.closest('.viewer-controls, .world-intro, .world-archive'))
  ) {
    hideWorldInspector();
    return;
  }
  inspectorPointer = { x: event.clientX, y: event.clientY };
  if (inspectorAnchor) {
    const moved = Math.hypot(
      inspectorPointer.x - inspectorAnchor.x,
      inspectorPointer.y - inspectorAnchor.y,
    );
    if (moved <= INSPECTOR_RELEASE_DISTANCE) return;
    worldInspector.classList.remove('is-visible');
    worldInspector.setAttribute('aria-hidden', 'true');
    inspectorAnchor = null;
  }
  clearTimeout(inspectorHoverTimer);
  inspectorHoverTimer = window.setTimeout(() => {
    inspectorHoverTimer = 0;
    requestAnimationFrame(() => inspectWorldAt(inspectorPointer.x, inspectorPointer.y));
  }, INSPECTOR_HOVER_DELAY);
});
document.documentElement.addEventListener('pointerleave', hideWorldInspector);

// First-time visitors get a brief frame for what they are seeing. The intro can
// always be replayed with ?intro=1, while ?debug=1 opens directly into the tools.
const shouldShowIntro =
  !debugMode &&
  (_qp.get('intro') === '1' || localStorage.getItem('theLand:introSeen') !== '1');
if (shouldShowIntro) {
  running = false;
  // Must match the CSS that hides .world-inspector exactly — which is
  // `(max-width: 720px), (hover: none)`. A narrow but hover-capable desktop
  // window has a pointer and no inspector, so asking it to hover is the same
  // broken promise as asking a phone.
  const canHover = window.matchMedia('(hover: hover) and (min-width: 721px)').matches;
  const intro = document.createElement('section');
  intro.className = 'world-intro';
  intro.setAttribute('aria-labelledby', 'world-intro-title');
  intro.innerHTML = `
    <div class="world-intro__card">
      <p class="world-intro__world">${currentWorldName} · seed ${currentSeed}</p>
      <h1 id="world-intro-title">The Land</h1>
      <p>A world that carries on without you.</p>
      <p class="world-intro__aside">Ten to seventeen minutes is a whole history here: cities, wars, ruins, and a last civilisation that does not know it is the last. Then it ends.${canHover ? ' Hover to see what a place is called.' : ''}</p>
      <button type="button">start watching</button>
    </div>
  `;
  document.body.appendChild(intro);
  intro.querySelector('button')!.addEventListener('click', () => {
    localStorage.setItem('theLand:introSeen', '1');
    running = true;
    intro.classList.add('is-leaving');
    window.setTimeout(() => intro.remove(), 700);
  });
}

// Idle: after a few seconds of stillness, hide the cursor and fade the chrome to
// near-nothing so the scene can stand on its own. The clock remains visible.
const fadeUI = [viewerControls, hud];
for (const el of fadeUI) (el as HTMLElement).style.transition = 'opacity 0.8s ease';
let idleTimer = 0;
function onActivity() {
  document.body.style.cursor = '';
  for (const el of fadeUI) (el as HTMLElement).style.opacity = '1';
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    document.body.style.cursor = 'none';
    for (const el of fadeUI) (el as HTMLElement).style.opacity = '0.12';
  }, 4000);
}
window.addEventListener('mousemove', onActivity);
window.addEventListener('mousedown', onActivity);
window.addEventListener('touchstart', onActivity, { passive: true });
onActivity();

const barsContainer = document.getElementById('bars')!;

function hexToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function updateBars() {
  if (!showBars) return;
  // Reuses the shared civStats cache instead of doing its own grid scan.
  // Connected to the rest of the story surface: names render in civ color
  // (matching map labels and log mentions), each civ shows its capital
  // (the name city_fell / capital_moved lines refer to), and a row flashes
  // for a few seconds when its civ is mentioned in the log.
  const counts = civStats.tileCounts;
  const living: Array<{ civ: Civ; count: number }> = [];
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead') continue;
    living.push({ civ, count: counts.get(civ.id) || 0 });
  }
  living.sort((a, b) => b.count - a.count);
  const shown = living.slice(0, 5);
  const maxCount = Math.max(40, ...living.map((l) => l.count));
  const now = Date.now();

  barsContainer.innerHTML = shown
    .map(({ civ, count }) => {
      const pct = Math.round((count / maxCount) * 100);
      const color = hexToCss(civ.color);
      const mentioned = (civMentionTs.get(civ.id) ?? 0) > now - 6000;
      const rowBg = mentioned ? 'background:rgba(255,236,190,0.95);' : '';
      return `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;padding:1px 3px;border-radius:2px;${rowBg}">
          <span style="width:130px;font-family:Georgia,'Times New Roman',serif;font-size:10px;color:${color};font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${civ.name}</span>
          <div style="flex:1;height:10px;background:rgba(0,0,0,0.06);border-radius:2px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${color};transition:width 0.2s;"></div>
          </div>
        </div>`;
    })
    .join('');
}

const seedLabel = document.getElementById('seed-label')!;
const tickLabel = document.getElementById('tick-label')!;

function updateHud() {
  seedLabel.textContent = currentSeed;
  tickLabel.textContent = String(simWorld.tick);
}
updateHud();

// FPS readout — Pixi's measured render rate, smoothed and color-coded so the
// real-hardware number is always visible (green ≥50, amber ≥30, red below).
const fpsLabel = document.getElementById('fps-label')!;
// Pixi's ticker.FPS is the trustworthy source (verified against a wall-clock
// rAF count). Snap-init the EMA to the first reading so the label never lags
// from a bogus starting value; sample every frame via measureFps().
let fpsSmoothed = -1;
function measureFps() {
  const f = app.ticker.FPS;
  fpsSmoothed = fpsSmoothed < 0 ? f : fpsSmoothed + (f - fpsSmoothed) * 0.1;
}
function updateFpsLabel() {
  if (fpsSmoothed < 0) return;
  const v = Math.round(fpsSmoothed);
  fpsLabel.textContent = String(v);
  fpsLabel.style.color = v >= 50 ? '#2e8540' : v >= 30 ? '#b07a1e' : '#c0392b';
}

document.getElementById('reroll')!.addEventListener('click', () => {
  resetWorld(randomSeed());
});
document.getElementById('reset-sim')!.addEventListener('click', () => {
  resetSimOnly();
});

// Graphics-quality cycle. The biggest lever (the main canvas resolution) is
// set at renderer init, so changing quality saves the choice and reloads —
// a deliberate action, and the seed persists so the same world returns.
const qualityBtn = document.getElementById('quality')!;
qualityBtn.textContent = `gfx: ${QUALITY[qualityLevel].label}`;
qualityBtn.addEventListener('click', () => {
  const order: QualityLevel[] = ['high', 'medium', 'low'];
  const next = order[(order.indexOf(qualityLevel) + 1) % order.length];
  localStorage.setItem('theLand:quality', next);
  location.reload();
});
document.getElementById('skip')!.addEventListener('click', () => {
  const wasRunning = running;
  running = false;
  for (let i = 0; i < SKIP_TICKS; i++) {
    const { events } = step(simWorld, biomeMap, elevationMap);
    // The skipped ticks are still history: without this a skipped ending
    // archives an epitaph that undercounts its own deaths, and a commitment
    // reached mid-skip is scored against stale history.
    rememberWorldEvents(currentWorldHistory, events);
    // The ending's boundaries live inside the skip as well; crossing one here
    // and only noticing on the next frame would bypass the whole sequence.
    if (endingCheckpoints()) break;
  }
  // Full redraw after skip — terrain may have mutated, so rebuild biome layer first.
  // Scars from skipped ticks weren't rendered; drop any stale ones.
  atmos.clearScars();
  drawBiomes();
  resetStorySurfaces();
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
  snapFarmland();
  rebuildCauseways();
  rebuildLighthouses();
  rebuildEnergyFarms();
  rebuildMegastructures();
  seedTrailsAfterSkip();
  seedSuccessionAfterSkip();
  drawCityMarkers();
  eventLog.length = 0;
  // The reset above clears the log, which would swallow an omen the skip had
  // just spoken — and `endingOmenSpoken` is latched, so it would never be said
  // again. If the skip landed inside the ending, say it now instead.
  // ...but not once act 4 has opened: the silence adds no story, including a
  // replayed one.
  if (committedEnding && endingOmenSpoken
      && simWorld.tick < endingActTicks(currentWorldFate.endTick).silence) {
    pushNarration(ENDING_OMENS[committedEnding.ending], { priority: 'high' });
  }
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