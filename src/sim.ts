import { type Biome } from './biomes';

export type TileState = 'wild' | 'cleared' | 'built' | 'ruin';
export type CivPhase = 'rising' | 'stable' | 'declining' | 'dead';

export interface SimTile {
  state: TileState;
  civId: number | null;
  lastChangedTick: number;
}

export interface Civ {
  id: number;
  originRow: number;
  originCol: number;
  birthTick: number;
  phase: CivPhase;
  vitality: number;
  phaseAge: number;
  color: number;
  constitution: number;
  // Slow random walk in -fortuneMax..+fortuneMax. Modulates effective
  // vitality, representing good times (technology, leadership) and bad
  // times (famine, strife, plague). Borders shift as fortune drifts.
  fortune: number;
}

// --- Tunable knobs ---

export const SIM = {
  // Tile-level
  clearedToBuilt: 0.3,
  ruinReclaimTicks: 800,
  ruinReclaimChance: 0.005,

  // Civ-level
  maxLivingCivs: 6,
  baseCivSpawnChance: 0.003,
  newCivMinDistance: 12,

  // Lifecycle phase durations (in ticks).
  risingDuration: 1200,
  stableDuration: 2000,
  decliningDuration: 800,
  phaseVariation: 0.6,

  // Vitality curve targets per phase.
  vitalityRising: 0.9,
  vitalityStable: 0.7,
  vitalityDeclining: 0.3,
  vitalityDying: 0.0,
  vitalityLerp: 0.02,

  // Spread/decay/conquest rates.
  spreadBase: 0.06,
  decayBase: 0.0125,
  decayEdgeBonus: 1.5,
  conquestBase: 0.04,

    // Geographic shaping.
    coreRadius: 8,
    peripheryDecayMultiplier: 1.5,
    coreProtectionFactor: 0.3,
    isolationMultiplier: 5.0,
    spreadIntoRuinFactor: 0.5,
    deathPeripheryAmp: 2.0,           // was 3.0 — less aggressive
    deathPeripheryRampTicks: 600,     // was 200 implicitly — much slower ramp
    deathDecayMultiplier: 0.4,        // NEW — dead civs decay at 40% the rate of living
    maxDecaysPerCivPerTick: 1,        // NEW — at most 1 tile of a civ ruins per tick

  // Civ fortune (random walk modeling internal events).
  fortuneStep: 0.008,
  fortuneRevert: 0.005,
  fortuneMax: 0.35,
};

const CIV_COLORS = [
  0xc06846, // rust
  0x7a98a8, // dusty teal
  0xc7a063, // ochre
  0x8b6a8e, // muted plum
  0x5a7560, // forest green-gray
  0xbf8060, // terracotta
  0x6b7a99, // slate blue
  0xa68a5b, // antique gold
];

// --- World state ---

export interface SimWorld {
  width: number;
  height: number;
  tiles: SimTile[][];
  civs: Map<number, Civ>;
  nextCivId: number;
  tick: number;
}

export function createSimWorld(width: number, height: number): SimWorld {
  const tiles: SimTile[][] = [];
  for (let row = 0; row < height; row++) {
    tiles[row] = [];
    for (let col = 0; col < width; col++) {
      tiles[row][col] = { state: 'wild', civId: null, lastChangedTick: 0 };
    }
  }
  return {
    width,
    height,
    tiles,
    civs: new Map(),
    nextCivId: 1,
    tick: 0,
  };
}

// --- Helpers ---

function distance(r1: number, c1: number, r2: number, c2: number): number {
  const dr = r1 - r2;
  const dc = c1 - c2;
  return Math.sqrt(dr * dr + dc * dc);
}

function pickRandomWildLandTile(
  world: SimWorld,
  biomes: Biome[][]
): { row: number; col: number } | null {
  for (let attempt = 0; attempt < 60; attempt++) {
    const row = Math.floor(Math.random() * world.height);
    const col = Math.floor(Math.random() * world.width);
    if (biomes[row][col] === 'water') continue;
    if (world.tiles[row][col].state !== 'wild') continue;
    let okay = true;
    for (const civ of world.civs.values()) {
      if (civ.phase === 'dead') continue;
      if (distance(row, col, civ.originRow, civ.originCol) < SIM.newCivMinDistance) {
        okay = false;
        break;
      }
    }
    if (okay) return { row, col };
  }
  return null;
}

function livingCivCount(world: SimWorld): number {
  let n = 0;
  for (const civ of world.civs.values()) {
    if (civ.phase !== 'dead') n++;
  }
  return n;
}

function spawnCiv(world: SimWorld, row: number, col: number): Civ {
  const constitution = 0.6 + Math.random() * 0.6;
  const civ: Civ = {
    id: world.nextCivId++,
    originRow: row,
    originCol: col,
    birthTick: world.tick,
    phase: 'rising',
    vitality: 0.4,
    phaseAge: 0,
    color: CIV_COLORS[(world.nextCivId - 2) % CIV_COLORS.length],
    constitution,
    fortune: 0,
  };
  world.civs.set(civ.id, civ);
  const t = world.tiles[row][col];
  t.state = 'cleared';
  t.civId = civ.id;
  t.lastChangedTick = world.tick;
  return civ;
}

// --- Phase + fortune transitions ---

function advanceCivPhase(civ: Civ) {
  civ.phaseAge++;
  let target = 0;
  switch (civ.phase) {
    case 'rising':    target = SIM.vitalityRising * civ.constitution; break;
    case 'stable':    target = SIM.vitalityStable * civ.constitution; break;
    case 'declining': target = SIM.vitalityDeclining * civ.constitution; break;
    case 'dead':      target = SIM.vitalityDying; break;
  }
  target = Math.min(target, 1.0);
  // Dead civs ease toward 0 vitality slowly — "long collapse" feel.
  const lerpRate = civ.phase === 'dead' ? SIM.vitalityLerp * 0.25 : SIM.vitalityLerp;
  civ.vitality += (target - civ.vitality) * lerpRate;

  function vary(base: number): number {
    return base * (1 + (Math.random() * 2 - 1) * SIM.phaseVariation);
  }

  if (civ.phase === 'rising' && civ.phaseAge > vary(SIM.risingDuration)) {
    civ.phase = 'stable';
    civ.phaseAge = 0;
  } else if (civ.phase === 'stable' && civ.phaseAge > vary(SIM.stableDuration)) {
    civ.phase = 'declining';
    civ.phaseAge = 0;
  } else if (civ.phase === 'declining' && civ.phaseAge > vary(SIM.decliningDuration)) {
    civ.phase = 'dead';
    civ.phaseAge = 0;
  }
}

function advanceCivFortune(civ: Civ) {
  const drift = (Math.random() * 2 - 1) * SIM.fortuneStep;
  const pullback = -civ.fortune * SIM.fortuneRevert;
  civ.fortune += drift + pullback;
  if (civ.fortune > SIM.fortuneMax) civ.fortune = SIM.fortuneMax;
  if (civ.fortune < -SIM.fortuneMax) civ.fortune = -SIM.fortuneMax;
}

// Effective "weakness" for decay (0..1, higher = more decay).
function effectiveDecayPressure(civ: Civ): number {
  const v = civ.vitality + civ.fortune;
  return Math.max(0, Math.min(1, 1 - v));
}

// Effective strength for spread and conquest (0..~1.3).
function effectiveStrength(civ: Civ): number {
  return Math.max(0, civ.vitality + civ.fortune);
}

// --- Main step ---

export function step(
  world: SimWorld,
  biomes: Biome[][]
): Array<{ row: number; col: number }> {
  world.tick++;
  const changed: Array<{ row: number; col: number }> = [];

  const snapshot: { state: TileState; civId: number | null }[][] = world.tiles.map((rowArr) =>
    rowArr.map((t) => ({ state: t.state, civId: t.civId }))
  );

  // 1. Count tiles per civ and advance phases + fortune.
  const civTileCounts = new Map<number, number>();
  for (let r = 0; r < world.height; r++) {
    for (let c = 0; c < world.width; c++) {
      const cid = world.tiles[r][c].civId;
      if (cid != null) {
        civTileCounts.set(cid, (civTileCounts.get(cid) || 0) + 1);
      }
    }
  }
  for (const civ of world.civs.values()) {
    advanceCivPhase(civ);
    advanceCivFortune(civ);
  }

  // Track decay candidates per civ. We'll apply them at the end, capped 
  // at maxDecaysPerCivPerTick. This prevents end-of-life civs from 
  // dropping huge numbers of tiles in a single tick.
  const decayCandidates = new Map<number, Array<{ row: number; col: number; severity: number }>>();

  // 2. Per-tile transitions.
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

        // Exposure: count of non-same-civ neighbors. 0 = interior.
        let exposure = 0;
        let sameCivNeighbors = 0;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= world.height || nc < 0 || nc >= world.width) {
            exposure++;
            continue;
          }
          if (snapshot[nr][nc].civId !== civ.id) {
            exposure++;
          } else {
            sameCivNeighbors++;
          }
        }

        // Capital is immortal while the civ has any other tile.
        const isCapital = row === civ.originRow && col === civ.originCol;
        const civTileCount = civTileCounts.get(civ.id) || 0;
        const capitalProtected = isCapital && civTileCount > 1;

        if (capitalProtected) {
          // Skip decay.
        } else if (exposure === 0) {
          // Interior tile — structurally safe.
        } else {
          const exposureFactor = exposure / 4;

          const distFromCapital = distance(row, col, civ.originRow, civ.originCol);
          const distNormalized = distFromCapital / SIM.coreRadius;
          let distanceFactor: number;
          if (distNormalized < 1) {
            distanceFactor = SIM.coreProtectionFactor + (1 - SIM.coreProtectionFactor) * distNormalized;
          } else {
            distanceFactor = 1 + Math.pow(distNormalized - 1, 2) * SIM.peripheryDecayMultiplier;
          }

          // Isolated tiles collapse fast — but only at the periphery.
          // Near-core tiles, even if temporarily isolated, hold out.
          const isolationDampener = Math.min(1, distNormalized);
          const isolationFactor = sameCivNeighbors === 0
            ? 1 + (SIM.isolationMultiplier - 1) * isolationDampener
            : 1.0;

          // Dead civs collapse from periphery inward. Ramps up gradually.
          const deathPeripheryAmp = civ.phase === 'dead'
            ? 1.0 + (SIM.deathPeripheryAmp - 1.0) * Math.min(1, civ.phaseAge / SIM.deathPeripheryRampTicks)
            : 1.0;

          const decayP =
            SIM.decayBase
            * effectiveDecayPressure(civ)
            * exposureFactor
            * distanceFactor
            * isolationFactor
            * deathPeripheryAmp;

          // Apply dead-civ decay multiplier (extra dampening).
          const deadDamp = civ.phase === 'dead' ? SIM.deathDecayMultiplier : 1.0;
          const decayPFinal = decayP * deadDamp;
          
          if (Math.random() < decayPFinal) {
            // Don't ruin immediately — register as a candidate and pick 
            // the worst ones per civ at end of tick.
            const list = decayCandidates.get(civ.id) || [];
            list.push({ row, col, severity: decayPFinal });
            decayCandidates.set(civ.id, list);
          }
        }

        // Spread and conquest. Only living civs act.
        if (civ.phase !== 'dead') {
          const myStrength = effectiveStrength(civ);
          const spreadP = SIM.spreadBase * myStrength;
          const neighbors = [
            [row - 1, col],
            [row + 1, col],
            [row, col - 1],
            [row, col + 1],
          ];
          for (const [r, c] of neighbors) {
            if (r < 0 || r >= world.height || c < 0 || c >= world.width) continue;
            if (biomes[r][c] === 'water') continue;
            const neighborSnap = snapshot[r][c];
            const neighborTile = world.tiles[r][c];

            // Spread into wild
            if (neighborSnap.state === 'wild') {
              if (Math.random() < spreadP) {
                if (neighborTile.state === 'wild') {
                  neighborTile.state = 'cleared';
                  neighborTile.civId = civ.id;
                  neighborTile.lastChangedTick = world.tick;
                  changed.push({ row: r, col: c });
                }
              }
              continue;
            }

            // Spread into ruins — slower than wild.
            if (neighborSnap.state === 'ruin') {
              const ruinSpreadP = spreadP * SIM.spreadIntoRuinFactor;
              if (Math.random() < ruinSpreadP) {
                if (neighborTile.state === 'ruin') {
                  neighborTile.state = 'cleared';
                  neighborTile.civId = civ.id;
                  neighborTile.lastChangedTick = world.tick;
                  changed.push({ row: r, col: c });
                }
              }
              continue;
            }

            // Conquest: attack weaker neighbors.
            if (neighborSnap.civId != null && neighborSnap.civId !== civ.id) {
              const otherCiv = world.civs.get(neighborSnap.civId);
              if (otherCiv && otherCiv.phase !== 'dead' && neighborSnap.state === 'built') {
                const otherStrength = Math.max(0.1, effectiveStrength(otherCiv));
                const strengthRatio = myStrength / otherStrength;
                if (strengthRatio > 1.3) {
                  const defenderDistFromCapital = distance(r, c, otherCiv.originRow, otherCiv.originCol);
                  const defenderDistNorm = defenderDistFromCapital / SIM.coreRadius;
                  const defenderVulnerability = 1 + Math.pow(Math.max(0, defenderDistNorm - 1), 2) * SIM.peripheryDecayMultiplier * 0.5;
                  const conquestP = SIM.conquestBase * myStrength * (strengthRatio - 1) * defenderVulnerability;
                  if (Math.random() < conquestP) {
                    if (Math.random() < 0.6) {
                      neighborTile.state = 'cleared';
                      neighborTile.civId = civ.id;
                    } else {
                      neighborTile.state = 'ruin';
                      neighborTile.civId = null;
                    }
                    neighborTile.lastChangedTick = world.tick;
                    changed.push({ row: r, col: c });
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
          tile.lastChangedTick = world.tick;
          changed.push({ row, col });
        }
        continue;
      }
    }
  }

  // Apply decay candidates, capped per civ. We pick the highest-severity 
  // tiles first (most exposed, most isolated, furthest from capital) so 
  // the contraction looks geographically coherent.
  for (const [civId, candidates] of decayCandidates) {
    candidates.sort((a, b) => b.severity - a.severity);
    const count = Math.min(candidates.length, SIM.maxDecaysPerCivPerTick);
    for (let i = 0; i < count; i++) {
      const { row, col } = candidates[i];
      const tile = world.tiles[row][col];
      if (tile.state === 'built' && tile.civId === civId) {
        tile.state = 'ruin';
        tile.civId = null;
        tile.lastChangedTick = world.tick;
        changed.push({ row, col });
      }
    }
  }

  // 3. Maybe spawn a new civ.
  if (livingCivCount(world) < SIM.maxLivingCivs) {
    const spawnP = SIM.baseCivSpawnChance;
    if (Math.random() < spawnP) {
      const spot = pickRandomWildLandTile(world, biomes);
      if (spot) {
        spawnCiv(world, spot.row, spot.col);
        changed.push(spot);
      }
    }
  }

  return changed;
}

// Convenience: get a tile's color overlay info given the world state.
export function tileOverlayColor(
  tile: SimTile,
  world: SimWorld
): { color: number; alpha: number } | null {
  if (tile.state === 'wild') return null;
  if (tile.state === 'ruin') return { color: 0x3d3a36, alpha: 0.55 };
  if (tile.civId == null) return null;
  const civ = world.civs.get(tile.civId);
  if (!civ) return null;
  if (civ.phase === 'dead') {
    return { color: 0x4d4843, alpha: 0.7 };
  }
  const alpha = tile.state === 'cleared' ? 0.55 : 0.85;
  return { color: civ.color, alpha };
}

// Seed the world with N initial civs immediately.
export function seedInitialCivs(
  world: SimWorld,
  biomes: Biome[][],
  count: number
): Array<{ row: number; col: number }> {
  const seeded: Array<{ row: number; col: number }> = [];
  for (let i = 0; i < count; i++) {
    const spot = pickRandomWildLandTile(world, biomes);
    if (!spot) break;
    spawnCiv(world, spot.row, spot.col);
    seeded.push(spot);
  }
  return seeded;
}