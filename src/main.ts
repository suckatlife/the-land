import { Application, Assets, Container, Graphics, MeshPlane, RenderTexture, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { generateBiomeMap, generateRivers, makeTerrainSampler, classify, BIOME_COLORS, SEA_LEVEL, type Biome } from './biomes';
import { drawTile, drawStateOverlayPersistent, redrawOverlay, redrawBiomeTile, lerpColor, gridToScreen, rgbToHsl, hslToRgb } from './iso';
import { createSimWorld, step, tileOverlayColor, seedInitialCivs, applyCatastrophe, iceDepthAt, SIM, CATASTROPHE, CITY, nearestCityDist, type SimWorld, type Civ, type CivCity, type SimEvent, type Era, type TileOverlay, type BiomeChange, type CatastropheType } from './sim';
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
// Ticks between auto-rerolls — the world ends and a new one is rolled. Driven
// by the single deep-time knob in sim.ts (SIM.worldCycleTicks), which also
// rescales the era arc so the full stone-age-to-post climb always fits.
const CATACLYSM_INTERVAL = SIM.worldCycleTicks;
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
    case 'ice_advance':
      return pick([
        'The cold deepens. Ice creeps down from the poles and the northern holds empty.',
        'Winter without end takes the high latitudes. The people move toward the warm middle of the world.',
        'The glaciers come. Where there were fields, there is white.',
      ]);
    case 'ice_retreat':
      return pick([
        'The long winter breaks. The ice draws back and green follows it north.',
        'The thaw comes at last. The cold lands are open again, and the bold go to settle them.',
        'The glaciers retreat. The world remembers how to be warm.',
      ]);
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
  opts: { priority?: NarrationPriority; variant?: LogEntry['variant']; dedupKey?: string } = {},
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
  eventLog.unshift({ text, ts: now, variant: opts.variant });
  if (eventLog.length > LOG_MAX) eventLog.length = LOG_MAX;
  return true;
}

// Per-sim-event narration priority. High = always shown.
const EVENT_PRIORITY: Partial<Record<SimEvent['kind'], NarrationPriority>> = {
  catastrophe: 'high', omen: 'high', civ_died: 'high', wonder_built: 'high',
  rift_opened: 'high', island_born: 'high', land_bridge: 'high', spared: 'high', rally: 'high',
  civ_declining: 'normal', last_flight: 'normal', refuge_founded: 'normal',
  breakaway: 'normal', civ_born: 'normal', migration: 'normal', island_rising: 'normal',
  ice_advance: 'high', ice_retreat: 'high',
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

function pushLogEvents(evs: SimEvent[]) {
  for (const ev of evs) {
    const text = colorizeCivNames(narrateEvent(ev, simWorld));
    if (!text) continue;
    const variant = ev.kind === 'catastrophe' ? 'catastrophe' as const
      : ev.kind === 'omen' ? 'omen' as const
      : (ev.kind === 'spared' || ev.kind === 'rally') ? 'relief' as const
      : undefined;
    pushNarration(text, { priority: EVENT_PRIORITY[ev.kind] ?? 'normal', variant });
  }
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
const sceneryWaterGfx = new Graphics(); // beyond-the-grid sea (under glitter)
const sceneryLandGfx = new Graphics();  // beyond-the-grid land (over glitter)
// Beyond-the-grid tile positions (+ water/land), precomputed once in
// drawScenery so the ice cap can extend over the whole visible globe, not
// just the sim diamond. r/c keep the same latitude math as the grid.
let sceneryTiles: { x: number; y: number; r: number; c: number; water: boolean; biome: Biome }[] = [];
const roadsGfx = new Graphics();        // paths between cities, era-styled
const conflictGfx = new Graphics();     // war flickers at contested tiles
const wonderGfx = new Graphics();       // monuments (persist as ruins)
const boatsGfx = new Graphics();        // sea craft, fishing dots, whales
const nomadGfx = new Graphics();        // migrating bands, caravans, trains
const wildlifeGfx = new Graphics();     // wandering animal herds on wild land
const powerGfx = new Graphics();        // power grid (industrial+), pulses at night
const airGfx = new Graphics();          // planes (modern+) and rockets (post)
const festivalGfx = new Graphics();     // night festival glow
festivalGfx.blendMode = 'add';
const smokeLayer = new Container();
const iceGfx = new Graphics();         // polar ice sheets (advances/retreats)
const smogGfx = new Graphics();        // end-of-cycle pollution pooling over cities
const cityLightsGfx = new Graphics();
cityLightsGfx.blendMode = 'add';
cityLightsGfx.alpha = 0;

const biomeLayer = new Container();
const simLayer = new Container();
const farmGfx = new Graphics();   // cultivated fields (cached, rebuilt on a throttle)
const buildingLayer = new Container();
buildingLayer.sortableChildren = true;
const expeditionLayer = new Container();
const cityMarkersContainer = new Container();
const labelLayer = new Container();
const world = new Container();
world.addChild(biomeLayer);
// Sun glitter / moon path on the water, masked to water tiles below.
world.addChild(atmos.glitterLayer);
// Scenery land sits over the glitter (so the simple water mask suffices).
world.addChild(sceneryLandGfx);
// Rivers run over the terrain, under settlement tints.
world.addChild(riverGfx);
world.addChild(simLayer);
// Cultivated fields over the ownership tint, under everything built on them.
world.addChild(farmGfx);
// Roads over the tints (still under scars and buildings).
world.addChild(roadsGfx);
// Scars sit above civ tints (catastrophes hit settled land) but below buildings.
world.addChild(atmos.scarLayer);
// Polar ice sheets — over the ground, under the buildings (cities stand in snow).
world.addChild(iceGfx);
// Wild herds graze the open land, beneath the towns that will displace them.
world.addChild(wildlifeGfx);
// Wind shimmer brightens the ground, masked to land below.
world.addChild(atmos.shimmerLayer);
world.addChild(buildingLayer);
// The power grid strings over the rooftops (industrial+).
world.addChild(powerGfx);
// Conflict flickers and monuments stand among the buildings.
world.addChild(conflictGfx);
world.addChild(wonderGfx);
world.addChild(expeditionLayer);
// Nomad bands and sea craft travel the surface.
world.addChild(nomadGfx);
world.addChild(boatsGfx);
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
world.addChild(atmos.stormLayer);
// Bird flocks cross at dawn and dusk.
world.addChild(atmos.birdLayer);
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

// The world is rendered into this texture EVERY frame; its resolution comes
// from the quality setting.
let worldRT = RenderTexture.create({
  width: Math.ceil(WORLD_CAPTURE.w * captureScale),
  height: Math.ceil(WORLD_CAPTURE.h * captureScale),
  antialias: false, // MSAA on a per-frame full-scene RT is costly; the mesh
                    // resampling and the painterly look hide its absence
  resolution: _rtOverride ?? QUALITY[qualityLevel].rt,
});
// Sample the (lower-res) world texture with nearest-neighbour, not linear, so
// the curvature mesh keeps it CRISP instead of softening it into a blur. Lets
// us run at lower resolution for framerate without the image going mushy.
worldRT.source.scaleMode = 'nearest';
world.scale.set(captureScale);
world.x = -WORLD_CAPTURE.x0 * captureScale;
world.y = -WORLD_CAPTURE.y0 * captureScale;
// Dense enough that the curved silhouette reads as a curve, not a polyline.
const worldPlane = new MeshPlane({ texture: worldRT, verticesX: 110, verticesY: 36 });

app.stage.addChild(atmos.skyLayer);
// Stars turn behind the planet; the world plane occludes them below the limb.
app.stage.addChild(atmos.starLayer);
// Comets and aurora share the night sky and set behind the planet.
app.stage.addChild(atmos.cometLayer);
app.stage.addChild(atmos.auroraLayer);
app.stage.addChild(worldPlane);
// The limb mask clips the plane at the circular horizon; it must live in the
// tree. The band lays horizon haze along the arc, above the plane.
app.stage.addChild(atmos.limbMask);
app.stage.addChild(atmos.limbBand);
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
(window as any).__layers = { world, cityMarkersContainer, labelLayer, biomeLayer, buildingLayer, simLayer };
(window as any).__anim = () => ({ tiles: animatingTiles.size, buildings: animatingBuildingTiles.size, biome: animatingBiomeTiles.size });
(window as any).__rt = () => ({ res: worldRT.source.resolution, w: worldRT.source.pixelWidth, h: worldRT.source.pixelHeight, bound: worldPlane.texture === worldRT, tickerFPS: Math.round(app.ticker.FPS) });
(window as any).__perf = { sky: atmos.skyLayer, plane: worldPlane, set skipRT(v: boolean) { (window as any).__skipRT = v; } };
(window as any).__fx = { iceGfx, smogGfx, farmGfx, buildingLayer, sky: atmos.skyLayer, fog: atmos.fogLayer };
(window as any).__life = () => ({ herds: herds.length, power: powerLines.length, caravans: caravans.length, boats: boats.length });

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
// Polar ice overlay — white over the frozen latitudes, eased onto each tile by
// how deep it sits in the ice. Redrawn only when the ice has moved (it
// advances slowly), so per-frame cost is one cheap comparison.
let lastDrawnIce = -1;
function drawIce() {
  const force = (window as any).__forceIce;
  const ext = force != null ? force : simWorld.iceExtent;
  if (force == null && Math.abs(ext - lastDrawnIce) < 0.004) return;
  lastDrawnIce = ext;
  // ~19k filled+stroked polys at glacial peak. They only change when the ice
  // actually moves (throttled above), so cache the result to a texture and let
  // the in-between frames render it as a single quad — the app is fill-bound.
  iceGfx.cacheAsTexture?.(false);
  iceGfx.clear();
  if (ext <= 0.002) { iceGfx.visible = false; return; }
  iceGfx.visible = true;
  // Sample latitude against the (possibly forced) extent; terrain-aware so the
  // front hugs coasts and ridges exactly as the sim computes it.
  const fakeWorld = { iceExtent: ext, height: GRID_SIZE } as any;
  // The sim grid (the known world).
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const biome = biomeMap[r][c];
      const d = iceDepthAt(fakeWorld, r, c, biome);
      if (d <= 0) continue;
      const { x, y } = gridToScreen(c, r);
      paintIce(x, y, d, biome === 'water');
    }
  }
  // The scenery beyond the grid, so the ice cap reaches the whole globe up to
  // the horizon (same latitude math; precomputed positions, no re-sampling).
  for (let i = 0; i < sceneryTiles.length; i++) {
    const t = sceneryTiles[i];
    const d = iceDepthAt(fakeWorld, t.r, t.c, t.biome);
    if (d <= 0) continue;
    paintIce(t.x, t.y, d, t.water);
  }
  iceGfx.cacheAsTexture?.(true);
}

// One iced tile. Snow on land, paler blue on sea; the leading edge carries a
// faint cool rim so the ice reads even against the bright daytime ocean, going
// to near-solid white toward the poles.
function paintIce(x: number, y: number, d: number, water: boolean) {
  // Near-white fill so it brightens whatever it covers, plus a steel-blue seam
  // on every tile. The seams give the sheet a cracked-pack-ice texture that
  // reads even over the pale ocean (where a flat white fill would vanish).
  const color = water ? 0xe6f0f6 : 0xf4f9ff; // sea ice slightly cooler than snow
  const a = Math.min(0.96, 0.5 + d * 0.46);
  iceGfx.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y])
    .fill({ color, alpha: a })
    .stroke({ color: 0x8aa6bc, alpha: 0.55 * a, width: 1 }); // frost seams
}

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
  const cycleFrac = (simWorld.tick % CATACLYSM_INTERVAL) / CATACLYSM_INTERVAL;

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

  // Smog pooling over the cities — denser where settlement is dense, browner
  // in industrial ages. The visible source of the pollution.
  smogGfx.clear();
  if (curPollution > 0.02) {
    smogGfx.visible = true;
    for (const civ of simWorld.civs.values()) {
      if (civ.phase === 'dead') continue;
      const dirty = 0.5 + 0.5 * Math.max(0, Math.min(1, (ERA_RANK[civ.era] - 2) / 3));
      for (const city of civ.cities) {
        const { x, y } = gridToScreen(city.col, city.row);
        const w = Math.min(1, curPollution * dirty * (0.5 + 0.6 * city.prominence) * 1.6);
        if (w < 0.03) continue;
        const r = POLLUTION.smogRadius * (0.6 + 0.9 * w);
        smogGfx.circle(x, y - 4, r).fill({ color: POLLUTION.smogColor, alpha: POLLUTION.smogAlpha * 0.45 * w });
        smogGfx.circle(x, y - 8, r * 0.62).fill({ color: POLLUTION.smogColor, alpha: POLLUTION.smogAlpha * 0.7 * w });
        smogGfx.circle(x, y - 12, r * 0.34).fill({ color: POLLUTION.smogColor, alpha: POLLUTION.smogAlpha * 0.95 * w });
      }
    }
  } else {
    smogGfx.visible = false;
  }

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
const dreadVignette = new Sprite(makeVignetteTexture());
dreadVignette.alpha = 0;
dreadVignette.visible = false;
const omenStarGfx = new Graphics();
const impactFlash = new Graphics();
impactFlash.alpha = 0;
impactFlash.visible = false;
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
  ruined:      boolean[];      // per-slot: abandoned (density dropped) or dead-civ
  curRuinMult: number[];       // per-slot opacity multiplier (1.0 active; only drops in the final reclaim phase)
  ruinAge:     number[];       // per-slot decay progress 0→1: grey → collapse → land reclaims
  ruinColor0:  number[];       // the slot's colour at the moment it ruined (desaturates from here)
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
  // Water tile diamonds, inflated a touch; land diamonds go to the land mask.
  landMaskG.clear();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const water = biomeMap[row][col] === 'water';
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
const SCENERY = {
  moatTiles: 14,    // sea gap beyond the grid before terrain resumes
  edgeDepth: 0.3,   // must match EDGE_DEPTH in biomes.ts
};

function drawScenery() {
  sceneryWaterGfx.clear();
  sceneryLandGfx.clear();
  sceneryTiles = [];
  const sampler = makeTerrainSampler(currentSeed);
  const { x0, y0, w, h } = WORLD_CAPTURE;
  for (let r = -60; r <= 155; r++) {
    for (let c = -60; c <= 155; c++) {
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) continue; // real tiles cover this
      const { x, y } = gridToScreen(c, r);
      if (x < x0 - 16 || x > x0 + w + 16 || y < y0 - 8 || y > y0 + h + 8) continue;
      // Moat blend: grid-edge depth at the boundary, raw terrain beyond.
      const dOut = Math.max(-r, r - (GRID_SIZE - 1), -c, c - (GRID_SIZE - 1), 0);
      const f = Math.min(1, dOut / SCENERY.moatTiles);
      const ease = f * f * (3 - 2 * f);
      const elev = -SCENERY.edgeDepth * (1 - ease) + sampler.elevationAt(r, c) * ease;
      const biome = classify(elev, sampler.moistureAt(r, c));
      const water = biome === 'water';
      const color = water ? waterColorFromElev(elev, r, c) : BIOME_COLORS[biome];
      const target = water ? sceneryWaterGfx : sceneryLandGfx;
      target.poly([x, y - 8, x + 16, y, x, y + 8, x - 16, y])
        .fill(color)
        .stroke({ color: 0x000000, alpha: 0.08, width: 1 });
      sceneryTiles.push({ x, y, r, c, water, biome });
    }
  }
  // Static once drawn — collapse the ~20k polys to one cached quad.
  sceneryLandGfx.cacheAsTexture?.(false);
  sceneryLandGfx.cacheAsTexture?.(true);
}

// Rivers: polylines from the hills to the sea, tapering downstream, tinted
// each frame toward the celestial light so they catch dawn and dusk.
function drawRivers() {
  riverGfx.clear();
  const rivers = generateRivers(elevationMap, biomeMap, currentSeed);
  for (const path of rivers) {
    for (let i = 1; i < path.length; i++) {
      const a = gridToScreen(path[i - 1].col, path[i - 1].row);
      const b = gridToScreen(path[i].col, path[i].row);
      const t = i / path.length;
      riverGfx.moveTo(a.x, a.y).lineTo(b.x, b.y)
        .stroke({ color: 0x6fa8c8, alpha: 0.6 + 0.3 * t, width: 1.0 + 2.4 * t, cap: 'round', join: 'round' });
    }
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
    for (const t of trees) {
      const { ox, oy, s } = t;
      g.ellipse(ox, oy + 1.6 * s, 3.0 * s, 1.2 * s).fill({ color: 0x40583a, alpha: 0.16 }); // cast shadow
      g.rect(ox - 0.5 * s, oy - 1.4 * s, 1.0 * s, 3.4 * s).fill({ color: 0x5a4632, alpha: 0.9 }); // trunk
      if (t.conifer) {
        g.poly([ox, oy - 8.5 * s, ox - 3.2 * s, oy - 0.5 * s, ox + 3.2 * s, oy - 0.5 * s]).fill({ color: 0x3c6636 });
        g.poly([ox, oy - 11 * s, ox - 2.4 * s, oy - 4 * s, ox + 2.4 * s, oy - 4 * s]).fill({ color: 0x4a7a44 });
      } else {
        g.circle(ox, oy - 5 * s, 3.4 * s).fill({ color: 0x437138 });
        g.circle(ox - 1.9 * s, oy - 3.6 * s, 2.4 * s).fill({ color: 0x3c6636 });
        g.circle(ox + 1.9 * s, oy - 4 * s, 2.2 * s).fill({ color: 0x539050 });
      }
    }
  } else if (biome === 'rock') {
    // A shaded peak — lit on the left, shadowed on the right. coreness shapes
    // the range: low foothills at the edge rising to tall, snow-capped peaks at
    // the heart (nudged a little more by raw elevation).
    const core = patchCoreness(row, col, 'rock');
    const elev = Math.min(1, Math.max(0, (elevationMap[row][col] - 0.55) / 0.45));
    const peak = 4 + core * 14 + elev * 3;
    const w = 6 + core * 6, apexX = (rnd(1) - 0.5) * 4;
    g.poly([apexX, -peak, -w, 3, apexX, 6]).fill({ color: 0xccc6bb }); // lit face
    g.poly([apexX, -peak, w, 3, apexX, 6]).fill({ color: 0x8b857a }); // shadow face
    if (peak > 14) {
      const snow = Math.min(6, (peak - 14) * 1.4);
      g.poly([apexX, -peak, apexX - snow * 0.7, -peak + snow, apexX + snow * 0.7, -peak + snow]).fill({ color: 0xeef2f6, alpha: 0.92 });
    }
  } else if (biome === 'sand') {
    for (let i = 0; i < 6; i++) {
      const ox = (rnd(i * 2 + 1) - 0.5) * 24, oy = (rnd(i * 2 + 2) - 0.5) * 11;
      g.circle(ox, oy, 0.7).fill({ color: i % 3 ? 0xd6bd86 : 0xc6ab74, alpha: 0.32 }); // faint grains
    }
  } else { // grass, fertile — a few faint blades, lusher on fertile
    const n = biome === 'fertile' ? 5 : 4;
    const tip = biome === 'fertile' ? 0x7aac58 : 0x82ad68;
    for (let i = 0; i < n; i++) {
      const ox = (rnd(i * 2 + 1) - 0.5) * 22, oy = (rnd(i * 2 + 2) - 0.5) * 10;
      g.moveTo(ox - 0.7, oy).lineTo(ox - 0.7, oy - 2.0).moveTo(ox, oy).lineTo(ox, oy - 2.4)
        .moveTo(ox + 0.7, oy).lineTo(ox + 0.7, oy - 1.9)
        .stroke({ color: tip, alpha: 0.3, width: 0.6, cap: 'round' });
    }
  }
}

function drawBiomes() {
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
      // Forest sits on the same ground as the grass around it — the wood's
      // colour comes from the trees, not the tile — so edges blend seamlessly.
      const color = biome === 'water' ? waterColorAt(row, col)
        : biome === 'forest' ? BIOME_COLORS.grass
        : BIOME_COLORS[biome];
      const g = drawTile(biomeLayer, col, row, biome);
      if (biome === 'water' || biome === 'forest') redrawBiomeTile(g, color);
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

function refreshBiomeTile(row: number, col: number) {
  const btv = biomeTileVisuals[row][col];
  if (!btv) return;
  const biome = biomeMap[row][col];
  btv.targetColor = biome === 'water' ? waterColorAt(row, col) : BIOME_COLORS[biome];
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
    for (let s = 0; s < 4; s++) {
      if (!state.floor1[s]) continue;
      // Begin the decay progression (grey → collapse → reclaim), capturing the
      // colour to drain from. The animation loop drives it from here.
      if (!state.ruined[s]) {
        state.ruined[s] = true;
        state.ruinAge[s] = 0;
        state.ruinColor0[s] = state.floor1[s]!.tint as number;
      }
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
      ruinAge: [0,0,0,0],
      ruinColor0: [0,0,0,0],
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

    // Drawn like the trade boats, a size up — a hull, a sail, a wake — not
    // the old diamond marker.
    const { x, y } = gridToScreen(exp.col, exp.row);
    g.ellipse(x, y + 0.5, 3.2, 1.7).fill({ color: 0x3c352c, alpha: 0.9 });
    g.circle(x, y, 1.2).fill({ color: civ.color, alpha: 0.95 });
    g.poly([x - 0.5, y - 1, x - 0.5, y - 6, x + 3, y - 1.8]).fill({ color: 0xf2ecdc, alpha: 0.85 });
    g.circle(x - exp.dirCol * 5, y - exp.dirRow * 2.5, 1.3).fill({ color: 0xffffff, alpha: 0.25 });
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
    for (const city of civ.cities) {
      const { x, y } = gridToScreen(city.col, city.row);
      cityLightsGfx.circle(x, y, LIGHTS.cityHaloRadius * (0.5 + city.prominence))
        .fill({ color, alpha: 0.10 + 0.08 * city.prominence });
    }
    const ts = civTiles.get(civ.id);
    if (!ts) continue;
    for (const key of ts) {
      const r = (key / GRID_SIZE) | 0;
      const c = key % GRID_SIZE;
      if (simWorld.tiles[r][c].state !== 'built') continue;
      const density = computeTileDensity(r, c, civ);
      if (density < LIGHTS.densityFloor) continue;
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
        const a = Math.min(1, (0.22 + 0.5 * density) * (0.6 + av * 0.6));
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
      const g = g0 + 1;
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
interface RoadLine { pts: Array<{ x: number; y: number }>; progress: number; color: number; width: number; alpha: number }
const roadLines = new Map<string, RoadLine>();

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
        progress: 0, color: style.color, width: style.width, alpha: style.alpha,
      });
    }
  }
  for (const k of [...roadLines.keys()]) if (!live.has(k)) roadLines.delete(k);
}

// Advance each road's build and redraw, drawing only the completed fraction.
function drawRoads(dt: number) {
  if (roadLines.size === 0) { roadsGfx.clear(); return; }
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
    // Running light pulses along the wire at night — the live grid.
    if (night > 0.12) {
      for (let k = 0; k < 2; k++) {
        const t = (powerPulse + k * 0.5) % 1;
        const px = pl.a.x + dx * t, py = pl.a.y + dy * t;
        powerGfx.circle(px, py, 1.7).fill({ color: 0x9fdcff, alpha: 0.5 * night });
        powerGfx.circle(px, py, 0.8).fill({ color: 0xeaffff, alpha: 0.8 * night });
      }
    }
  }
}

// War heat: conquest tile-flips aggregate per civ-pair; sustained contact is
// narrated once, and quiet afterwards is narrated too.
const warHeat = new Map<string, { a: number; b: number; count: number; lastTs: number; narratedAt: number }>();
// At most one war line per minute across the whole map, so a crowded frontier
// stays a minority beat rather than a war bulletin (war was ~40% of the log).
const WAR_GLOBAL_GAP_MS = 60000;
let lastWarNarrationTs = 0;
interface ConflictFlash { x: number; y: number; age: number }
const conflictFlashes: ConflictFlash[] = [];

function noteConquest(ev: { row: number; col: number; attackerId: number; defenderId: number }) {
  const [a, b] = ev.attackerId < ev.defenderId
    ? [ev.attackerId, ev.defenderId] : [ev.defenderId, ev.attackerId];
  const k = `${a}:${b}`;
  const now = Date.now();
  let w = warHeat.get(k);
  if (!w) { w = { a, b, count: 0, lastTs: now, narratedAt: 0 }; warHeat.set(k, w); }
  w.count++;
  w.lastTs = now;
  // A war earns a line only after sustained fighting, rarely after that, and
  // no more than one war line every WAR_GLOBAL_GAP_MS across the whole map —
  // so a crowded frontier doesn't turn the log into a war bulletin.
  if (w.count >= 14 && now - w.narratedAt > 150000 && now - lastWarNarrationTs > WAR_GLOBAL_GAP_MS) {
    const A = simWorld.civs.get(a), B = simWorld.civs.get(b);
    if (A && B) {
      const ok = pushNarration(colorizeCivNames(pick([
        `${A.name} and ${B.name} contest their border.`,
        `There is burning on the line between ${A.name} and ${B.name}.`,
        `${A.name} and ${B.name} have come to blows over the marches.`,
        `War smoulders along the frontier of ${A.name} and ${B.name}.`,
      ])), { priority: 'normal', dedupKey: `war:${k}` });
      if (ok) { w.narratedAt = now; w.count = 0; lastWarNarrationTs = now; }
    }
  }
  if (conflictFlashes.length < 20) {
    const { x, y } = gridToScreen(ev.col, ev.row);
    conflictFlashes.push({ x, y, age: 0 });
  }
}

function checkWarQuiet() {
  const now = Date.now();
  for (const [k, w] of warHeat) {
    if (w.narratedAt > 0 && now - w.lastTs > 45000) {
      const A = simWorld.civs.get(w.a), B = simWorld.civs.get(w.b);
      if (A && B && A.phase !== 'dead' && B.phase !== 'dead') {
        pushNarration(colorizeCivNames(pick([
          `The border between ${A.name} and ${B.name} falls quiet.`,
          `The fighting between ${A.name} and ${B.name} burns itself out.`,
        ])), { priority: 'low', dedupKey: `war:${k}` });
      }
      warHeat.delete(k);
    } else if (w.narratedAt === 0 && now - w.lastTs > 60000) {
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

// Wonders: drawn as small spires; dead civs' wonders dim to ruin tone.
function rebuildWonders() {
  wonderGfx.clear();
  for (const civ of simWorld.civs.values()) {
    if (!civ.wonder) continue;
    const { x, y } = gridToScreen(civ.wonder.col, civ.wonder.row);
    const alive = civ.phase !== 'dead';
    const body = alive ? 0xe9e2d2 : 0x6f695f;
    const edge = alive ? 0x9a9282 : 0x55504a;
    wonderGfx.poly([x - 3, y, x + 3, y, x + 1, y - 24, x - 1, y - 24]).fill({ color: body, alpha: 0.95 });
    wonderGfx.poly([x - 1, y - 24, x + 1, y - 24, x, y - 30]).fill({ color: edge, alpha: 0.95 });
    wonderGfx.ellipse(x, y + 1, 5, 2.2).fill({ color: edge, alpha: 0.5 });
  }
}

// Boats, fishing dots, whales — small life on the water.
interface Boat { pts: Array<{ x: number; y: number }>; idx: number; speed: number; color: number }
const boats: Boat[] = [];
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
    const i = Math.floor(Math.random() * coastal.length);
    let j = Math.floor(Math.random() * (coastal.length - 1));
    if (j >= i) j++;
    const a = coastal[i].w!, b = coastal[j].w!;
    const ck = `${a.row},${a.col}-${b.row},${b.col}`;
    if (!waterRouteCache.has(ck)) waterRouteCache.set(ck, findWaterPath(a.row, a.col, b.row, b.col));
    const route = waterRouteCache.get(ck);
    if (!route || route.length < 6) continue;
    boats.push({
      pts: route.map((p) => gridToScreen(p.col, p.row)),
      idx: 0,
      speed: 1.6 + Math.random() * 0.8, // path points per second
      color: civ.color,
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

function updateWater(dt: number, nowSec: number, night: number) {
  const empty = boats.length === 0 && fishSpots.length === 0 && !whale;
  if (empty) { boatsGfx.clear(); return; }
  const S = TRAVELERS.scale;
  boatsGfx.clear();
  for (let i = boats.length - 1; i >= 0; i--) {
    const b = boats[i];
    b.idx += b.speed * dt;
    if (b.idx >= b.pts.length - 1) { boats.splice(i, 1); continue; }
    const k = Math.floor(b.idx), u = b.idx - k;
    const x = b.pts[k].x + (b.pts[k + 1].x - b.pts[k].x) * u;
    const y = b.pts[k].y + (b.pts[k + 1].y - b.pts[k].y) * u;
    if (k > 1) boatsGfx.circle(b.pts[k - 1].x, b.pts[k - 1].y, 1.2 * S).fill({ color: 0xffffff, alpha: 0.18 });
    boatsGfx.circle(x, y, 1.8 * S).fill({ color: 0x3c352c, alpha: 0.85 });
    travelerDot(boatsGfx, x, y, 0.9 * S, b.color, night);
  }
  for (let i = 0; i < fishSpots.length; i++) {
    const s = fishSpots[i];
    const fx = s.x + Math.sin(nowSec * 0.7 + i * 2.1) * 2, fy = s.y + Math.sin(nowSec * 1.9 + i) * 0.8;
    if (night > 0.2) travelerDot(boatsGfx, fx, fy, 1.0 * S, 0x6a5b48, night, 0.6);
    else boatsGfx.circle(fx, fy, 1.1 * S).fill({ color: 0x4a4338, alpha: 0.55 });
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
interface Caravan { pts: Array<{ x: number; y: number }>; idx: number; speed: number; color: number; train: boolean }
const caravans: Caravan[] = [];

function maybeSpawnCaravans() {
  if (caravans.length >= TRAVELERS.caravanCap) return;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || civ.cities.length < 2) continue;
    if (caravans.filter((c) => c.color === civ.color).length >= TRAVELERS.caravanPerCiv) continue;
    if (Math.random() > TRAVELERS.caravanSpawnChance) continue;
    const cities = civ.cities;
    const i = Math.floor(Math.random() * cities.length);
    let j = Math.floor(Math.random() * (cities.length - 1));
    if (j >= i) j++;
    const path = roadBetween(cities[i], cities[j]);
    if (!path || path.length < 4) continue;
    const train = ERA_RANK[civ.era] >= 3; // industrial onward runs rails
    caravans.push({
      pts: path.map((p) => gridToScreen(p.col, p.row)),
      idx: 0,
      speed: (train ? 2.6 : 1.0) + Math.random() * 0.6,
      color: civ.color,
      train,
    });
    if (caravans.length >= TRAVELERS.caravanCap) return;
  }
}

// Planes (modern+) cross the world in straight lines with a contrail; rockets
// (post) lift off vertically from a city and fade into the sky.
interface Plane { x: number; y: number; vx: number; vy: number; trail: Array<{ x: number; y: number }>; color: number }
interface Rocket { x: number; y0: number; t: number }
const planes: Plane[] = [];
const rockets: Rocket[] = [];

function maybeSpawnPlanes() {
  if (planes.length >= 5) return;
  for (const civ of simWorld.civs.values()) {
    if (civ.phase === 'dead' || ERA_RANK[civ.era] < 4) continue;
    if (Math.random() > 0.4) continue;
    const city = civ.cities[Math.floor(Math.random() * civ.cities.length)];
    if (!city) continue;
    const { x, y } = gridToScreen(city.col, city.row);
    const ang = Math.random() * Math.PI * 2;
    const sp = 130 + Math.random() * 90;
    // Start off to one side so it flies across through the city's region.
    planes.push({ x: x - Math.cos(ang) * 700, y: y - Math.sin(ang) * 350, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.5, trail: [], color: 0xeef2f8 });
    if (planes.length >= 5) return;
  }
}

function maybeSpawnRockets(dt: number) {
  if (rockets.length >= 2 || Math.random() > dt / 25) return;
  const posts = [...simWorld.civs.values()].filter((c) => c.phase !== 'dead' && ERA_RANK[c.era] >= 5 && c.cities.length);
  if (!posts.length) return;
  const civ = posts[Math.floor(Math.random() * posts.length)];
  const city = civ.cities[Math.floor(Math.random() * civ.cities.length)];
  const { x, y } = gridToScreen(city.col, city.row);
  rockets.push({ x, y0: y, t: 0 });
  triggerPing(city.row, city.col, 0xfff0d0);
}

function updateAir(dt: number, night: number) {
  if (planes.length === 0 && rockets.length === 0) { airGfx.clear(); return; }
  airGfx.clear();
  for (let i = planes.length - 1; i >= 0; i--) {
    const pl = planes[i];
    pl.x += pl.vx * dt; pl.y += pl.vy * dt;
    pl.trail.push({ x: pl.x, y: pl.y });
    if (pl.trail.length > 22) pl.trail.shift();
    if (Math.abs(pl.x) > 1900 || pl.y > 1800 || pl.y < -300) { planes.splice(i, 1); continue; }
    for (let t = 0; t < pl.trail.length; t++) {
      airGfx.circle(pl.trail[t].x, pl.trail[t].y, 0.8).fill({ color: 0xffffff, alpha: (t / pl.trail.length) * 0.22 });
    }
    travelerDot(airGfx, pl.x, pl.y, 1.5, pl.color, night, 0.95);
  }
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rk = rockets[i];
    rk.t += dt;
    if (rk.t > 3.5) { rockets.splice(i, 1); continue; }
    const rise = rk.t * rk.t * 70; // accelerating
    const ry = rk.y0 - rise;
    const fade = Math.max(0, 1 - rk.t / 3.5);
    // Flame trail.
    for (let f = 0; f < 6; f++) {
      airGfx.circle(rk.x + (Math.random() - 0.5) * 2, ry + 4 + f * 3, (3 - f * 0.4) * fade)
        .fill({ color: f < 2 ? 0xffe89a : 0xff7a30, alpha: (1 - f / 6) * 0.7 * fade });
    }
    airGfx.circle(rk.x, ry, 1.6).fill({ color: 0xf0f0f0, alpha: fade });
  }
}

// Nomad bands (pending settlements walking in) + caravans, drawn together.
function updateNomads(nowSec: number, dt: number, night: number) {
  nomadGfx.clear();
  const S = TRAVELERS.scale;
  for (const p of simWorld.pendingSettlements) {
    const f = 1 - p.ticksLeft / SIM_MIGRATION_TICKS;
    const { x: tx, y: ty } = gridToScreen(p.col, p.row);
    const phase = (p.row * 7 + p.col * 13) % 100;
    const dist = 80 * (1 - f);
    const ang = phase + f * 2.0;
    const cx = tx + Math.cos(ang) * dist;
    const cy = ty + Math.sin(ang) * dist * 0.5;
    for (let i = 0; i < 5; i++) {
      const ox = Math.sin(phase + i * 2.3) * 4 + Math.sin(nowSec * 1.1 + i) * 1.2;
      const oy = Math.cos(phase + i * 1.7) * 2.4 + Math.sin(nowSec * 1.4 + i * 0.7) * 0.8;
      travelerDot(nomadGfx, cx + ox, cy + oy, 1.2 * S, 0x6a5a48, night, 0.6);
    }
  }
  for (let ci = caravans.length - 1; ci >= 0; ci--) {
    const cv = caravans[ci];
    cv.idx += cv.speed * dt;
    if (cv.idx >= cv.pts.length - 1) { caravans.splice(ci, 1); continue; }
    // A train is a longer string of tighter-packed cars with a headlamp; a
    // caravan is a few loose travellers.
    const cars = cv.train ? 6 : 3;
    const gap = cv.train ? 0.32 : 0.5;
    for (let m = 0; m < cars; m++) {
      const bi = cv.idx - m * gap;
      if (bi < 0) continue;
      const bk = Math.floor(bi), bu = bi - bk;
      if (bk + 1 >= cv.pts.length) continue;
      const x = cv.pts[bk].x + (cv.pts[bk + 1].x - cv.pts[bk].x) * bu;
      const y = cv.pts[bk].y + (cv.pts[bk + 1].y - cv.pts[bk].y) * bu;
      if (cv.train) {
        // Head car gets a warm headlamp; cars are a connected metal string.
        nomadGfx.circle(x, y, (m === 0 ? 1.3 : 1.05) * S).fill({ color: m === 0 ? 0x2c2c30 : cv.color, alpha: 0.9 });
        if (m === 0) travelerDot(nomadGfx, x, y, 0.7 * S, 0xfff0b0, Math.max(night, 0.5), 0.95);
      } else {
        travelerDot(nomadGfx, x, y, (m === 0 ? 1.2 : 1.0) * S, cv.color, night, m === 0 ? 0.85 : 0.6);
      }
    }
  }
}
const SIM_MIGRATION_TICKS = 900; // mirror of SIM.migrationTicks for the renderer

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
      const ox = Math.sin(h.wob + m * 2.1) * 5.5 + Math.sin(nowSec * 0.8 + m) * 0.6;
      const oy = Math.cos(h.wob + m * 1.6) * 2.8 + Math.cos(nowSec * 0.9 + m) * 0.4;
      // a soft body with a darker centre — reads as an animal, not a pixel
      wildlifeGfx.circle(h.x + ox, h.y + oy, 1.5).fill({ color: h.col, alpha: lit * 0.85 });
      wildlifeGfx.circle(h.x + ox, h.y + oy, 0.8).fill({ color: h.col, alpha: lit });
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
  const now = Date.now();
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
    ghostUntil = now + 12000;
    if (Math.random() < 0.18) {
      pushNarration(`Shepherds at the ruins of ${mem.name} say the stones hum.`, { priority: 'low' });
    }
    return;
  }
}

// Festivals: a city reaching full prominence burns its lamps all night, once.
const festivalDone = new Set<string>();
let pendingFestivals: Array<{ x: number; y: number; name: string }> = [];
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
      pendingFestivals.push({ x, y, name: city.name });
    }
  }
}

function updateFestival(nightness: number) {
  const now = Date.now();
  if (!activeFestival && pendingFestivals.length > 0 && nightness > 0.5) {
    const f = pendingFestivals.shift()!;
    activeFestival = { x: f.x, y: f.y, start: now, until: now + 45000 };
    pushNarration(`In ${f.name}, the lamps burn all night.`, { priority: 'normal' });
  }
  if (!activeFestival) { festivalGfx.clear(); return; }
  if (now > activeFestival.until) { activeFestival = null; festivalGfx.clear(); return; }
  const u = (now - activeFestival.start) / (activeFestival.until - activeFestival.start);
  const env = Math.sin(Math.PI * u);
  const pulse = 1 + 0.25 * Math.sin(now / 280);
  festivalGfx.clear();
  festivalGfx.circle(activeFestival.x, activeFestival.y, 13 * pulse).fill({ color: 0xffc878, alpha: 0.20 * env * nightness });
  festivalGfx.circle(activeFestival.x, activeFestival.y, 6 * pulse).fill({ color: 0xffe2b0, alpha: 0.28 * env * nightness });
}

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
  pushNarration(colorizeCivNames(text), { priority: 'low' });
}

// Reset for everything above (called wherever the world is rebuilt).
function resetStorySurfaces() {
  roadPathCache.clear();
  roadLines.clear();
  lastDrawnIce = -1; iceGfx.cacheAsTexture?.(false); iceGfx.clear(); iceGfx.visible = false;
  lastFarmRebuild = -1e9; farmGfx.cacheAsTexture?.(false); farmGfx.clear();
  waterRouteCache.clear();
  warHeat.clear();
  conflictFlashes.length = 0;
  boats.length = 0;
  caravans.length = 0;
  planes.length = 0;
  rockets.length = 0;
  herds.length = 0; wildlifeGfx.clear();
  powerLines.length = 0; powerGfx.clear();
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
  rebuildWonders();
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

// Farmland lives in its own layer, cached to one texture and only rebuilt on a
// slow throttle — so thousands of field tiles cost nothing per frame (the old
// per-tile overlay version dragged a big world from 11 to 5 fps).
let lastFarmRebuild = -1e9;
function rebuildFarmland() {
  farmGfx.cacheAsTexture?.(false);
  farmGfx.clear();
  const sw = 16 / 3, sh = 8 / 3;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (!isFarmTile(row, col)) continue;
      const civ = simWorld.civs.get(simWorld.tiles[row][col].civId!);
      const civColor = civ ? civ.color : 0xffffff;
      const { x, y } = gridToScreen(col, row);
      for (let gi = -1; gi <= 1; gi++) {
        for (let gj = -1; gj <= 1; gj++) {
          const cx = x + (gi - gj) * sw, cy = y + (gi + gj) * sh;
          const base = ((gi + gj) & 1) ? FARM_GOLD : FARM_GREEN;
          const jit = 0.82 + tileRand(row, col, gi * 5 + gj + 900) * 0.34;
          const color = lerpColor(scaleColor(base, jit), civColor, 0.16);
          farmGfx.poly([cx, cy - sh, cx + sw, cy, cx, cy + sh, cx - sw, cy]).fill({ color, alpha: 0.82 });
        }
      }
    }
  }
  farmGfx.cacheAsTexture?.(true);
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
  resetStorySurfaces();
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
  resetStorySurfaces();
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
rebuildCityLights();
rebuildSmokeEmitters();
resetStorySurfaces();

// --- Tick loop ---
let accumulator = 0;
let frameCount = 0;
let breathT = 0;
const BARS_REFRESH_FRAMES = 10;  // DOM rebuild for civ bar panel; ~6 Hz at 60fps

// Rare celestial events get a narrated line — wonder, not warning.
atmos.onCelestialEvent((kind) => {
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
  accumulator += ticker.deltaMS / 1000;
  const tickInterval = 1 / ticksPerSecond;
  const frameEvents: SimEvent[] = [];
  while (accumulator >= tickInterval) {
    accumulator -= tickInterval;
    const { changes, events, biomeChanges } = step(simWorld, biomeMap, elevationMap);
    frameEvents.push(...events);
    for (const { row, col } of changes) { noteTileChange(row, col); refreshTileOverlay(row, col); refreshBuildingSprite(row, col); }
    for (const { row, col } of biomeChanges) { refreshBiomeTile(row, col); }
    // Terrain mutated (flood/quake): the water mask must follow.
    if (biomeChanges.length > 0) rebuildWaterMask();
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
      pushNarration(pick(CATACLYSM_NARRATIONS), { priority: 'high', variant: 'catastrophe' });
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
      rebuildWonders();
      triggerPing(ev.row, ev.col, 0xfff0d0);
    } else if (ev.kind === 'island_rising' || ev.kind === 'island_born'
        || ev.kind === 'land_bridge' || ev.kind === 'rift_opened') {
      triggerPing(ev.row, ev.col, 0xd8e4ee);
    }
  }
  updateAtmosphere(ticker.deltaMS);
  updatePollution();
  // Sky + glaze + weather + scar fades. The sky leans toward the last dread
  // hue while curDread eases, so it releases smoothly after a catastrophe.
  atmos.update(ticker.deltaMS, curDread, curHue.vignette, dominantEra(simWorld));
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
  // Scenery land follows the seasonal land tint (it lives outside biomeLayer).
  if (sceneryLandGfx.tint !== biomeLayer.tint) sceneryLandGfx.tint = biomeLayer.tint;
  // City lights follow the night; rivers catch the light; smoke drifts.
  const L = atmos.light();
  const n = L.nightness;
  cityLightsGfx.alpha = LIGHTS.maxAlpha * (n * n * (3 - 2 * n));
  riverGfx.tint = lerpColor(0xffffff, L.color, 0.35);
  const dtSec = ticker.deltaMS / 1000;
  const nowSec = performance.now() / 1000;
  updateSmoke(dtSec);
  drawRoads(dtSec);
  drawPowerLines(dtSec, n);
  drawIce();
  updateConflictFlashes(dtSec);
  updateWater(dtSec, nowSec, n);
  maybeWhale(dtSec);
  updateHerds(dtSec, nowSec, n);
  updateNomads(nowSec, dtSec, n);
  maybeSpawnRockets(dtSec);
  updateAir(dtSec, n);
  maybeGhost(dtSec, n);
  updateFestival(n);
  maybeChronicle();
  // The camera breathes — whole-stage lens scale, leaning in with dread.
  breathT += ticker.deltaMS / 1000;
  app.stage.scale.set(
    1 + ATMOS.camera.breathAmp * 0.5 * (1 + Math.sin((Math.PI * 2 * breathT) / ATMOS.camera.breathPeriodSec))
      + curDread * ATMOS.camera.dreadLean
  );
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
    rebuildCityLights();
    rebuildSmokeEmitters();
    rebuildRoads();
    rebuildPowerLines();
    if (simWorld.tick - lastFarmRebuild >= 150) { lastFarmRebuild = simWorld.tick; rebuildFarmland(); }
    rebuildWonders();
    rebuildFishSpots();
    maybeSpawnBoats();
    maybeSpawnCaravans();
    maybeSpawnHerds();
    maybeSpawnPlanes();
    queueFestivals();
    checkWarQuiet();
    maybeNameConstellations();
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
    if (++animWork >= ANIM_BUDGET) break; // overflow waits for a later frame
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
  // Re-render the cached biome texture while tiles are easing (floods).
  if (animatingBiomeTiles.size > 0 || biomeDone.length > 0) (biomeLayer as any).updateCacheTexture?.();

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

      const mfs = bts.midFloors[s];

      if (bts.ruined[s]) {
        // A ruin's life: drain to grey stone, collapse the upper floors into a
        // low rubble stub, then let the land reclaim it.
        bts.ruinAge[s] = Math.min(1, bts.ruinAge[s] + (ticker.deltaMS / 1000) / RUIN_DECAY_SECONDS);
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
        for (let i = mfs.length - 1; i >= 0; i--) {
          const mf = mfs[i];
          mf.curAlpha += (mf.targetAlpha - mf.curAlpha) * MID_FLOOR_EASE;
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
          bts.roofCurY[s] += (bts.roofTargetY[s] - bts.roofCurY[s]) * ROOF_EASE;
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
  if (!(window as any).__skipRT) app.renderer.render({ container: world, target: worldRT, clear: true });
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
  <button id="quality" style="cursor:pointer;color:#607080" title="graphics quality — lower for more FPS">gfx: high</button>
  <span>tick: <strong id="tick-label">0</strong></span>
  <span>civs: <strong id="civ-label">0</strong></span>
  <span>eras: <strong id="era-label">—</strong></span>
  <span>exp: <strong id="exp-label">0</strong></span>
  <span>fps: <strong id="fps-label">—</strong></span>
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
  const shown = living.slice(0, 8);
  const more = living.length - shown.length;
  const maxCount = Math.max(40, ...living.map((l) => l.count));
  const now = Date.now();

  barsContainer.innerHTML = shown
    .map(({ civ, count }) => {
      const pct = Math.round((count / maxCount) * 100);
      const color = hexToCss(civ.color);
      const phaseGlyph =
        civ.phase === 'rising' ? '▲' :
        civ.phase === 'stable' ? '■' :
        civ.phase === 'declining' ? '▼' : '·';
      const capital = civ.cities[0]?.name ?? '—';
      const mentioned = (civMentionTs.get(civ.id) ?? 0) > now - 6000;
      const rowBg = mentioned ? 'background:rgba(255,236,190,0.95);' : '';
      return `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;padding:1px 3px;border-radius:2px;${rowBg}">
          <span style="width:150px;font-size:10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${ERA_TINT[civ.era]};margin-right:3px;"></span><span style="color:${color};font-weight:600">${civ.name}</span> <span style="color:#999;">· ${capital}</span> <span style="color:#666;">${phaseGlyph}</span>
</span>
          <div style="flex:1;height:10px;background:rgba(0,0,0,0.06);border-radius:2px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${color};transition:width 0.2s;"></div>
          </div>
          <span style="width:28px;text-align:right;color:#555;font-size:10px;">${count}</span>
        </div>`;
    })
    .join('') + (more > 0
      ? `<div style="color:#999;font-size:10px;padding:2px 4px;">… and ${more} smaller</div>`
      : '');
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
const soundBtn = document.getElementById('sound')!;
soundBtn.addEventListener('click', () => {
  audio.setEnabled(!audio.isEnabled());
  soundBtn.textContent = audio.isEnabled() ? 'sound: on' : 'sound: off';
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
  if (biomeChanges.length > 0) rebuildWaterMask();
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