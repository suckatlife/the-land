import { type Era } from './sim';

// Syllable pools per era. Each name = 1-3 syllables depending on era.
const SYLLABLES: Record<Era, { parts: string[]; suffixes: string[]; minParts: number; maxParts: number }> = {
  neolithic: {
    parts: ['ur', 'gok', 'ta', 'na', 'mo', 'ka', 'lu', 'ash', 'om', 'ig', 'da', 'un', 'esh', 'ku'],
    suffixes: ['', '', 'a', 'i', 'u'],
    minParts: 1, maxParts: 2,
  },
  classical: {
    parts: ['ath', 'cor', 'vel', 'tyr', 'rho', 'pely', 'mira', 'tha', 'lyn', 'dor', 'kala', 'sera'],
    suffixes: ['os', 'a', 'ai', 'on', 'is', 'ea'],
    minParts: 2, maxParts: 2,
  },
  medieval: {
    parts: ['est', 'dun', 'wic', 'thorn', 'brak', 'gald', 'morn', 'fen', 'hald', 'ryd', 'caer', 'win'],
    suffixes: ['mark', 'hold', 'burg', 'gard', 'shire', 'fell', 'ton'],
    minParts: 1, maxParts: 2,
  },
  industrial: {
    parts: ['iron', 'coal', 'steam', 'forge', 'grim', 'black', 'cobb', 'slag', 'ash', 'hammer'],
    suffixes: ['gate', 'heath', 'works', 'foundry', 'haven', 'port', 'cross'],
    minParts: 1, maxParts: 2,
  },
  modern: {
    parts: ['nor', 'pem', 'val', 'sel', 'mar', 'ket', 'lin', 'dav', 'tor', 'wes', 'cal'],
    suffixes: ['lund', 'ora', 'ton', 'ville', 'stad', 'opolis', 'mont'],
    minParts: 1, maxParts: 2,
  },
  post: {
    parts: ['xe', 'aur', 'vyn', 'zel', 'nyx', 'oth', 'kry', 'lum', 'vex', 'syl'],
    suffixes: ['-9', 'evon', 'ax', 'eth', 'ux', '-prime', 'is'],
    minParts: 1, maxParts: 2,
  },
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate a fresh name for a given era.
export function generateName(era: Era): string {
  const pool = SYLLABLES[era];
  const nParts = pool.minParts + Math.floor(Math.random() * (pool.maxParts - pool.minParts + 1));
  let name = '';
  for (let i = 0; i < nParts; i++) {
    name += pick(pool.parts);
  }
  name += pick(pool.suffixes);
  return capitalize(name);
}

// Evolve an existing name into a successor, keeping a recognizable root.
// Used when a new civ rises near an old civ's capital — the place keeps
// its identity but the name shifts with the new era.
export function evolveName(oldName: string, newEra: Era): string {
  // Take the root: first 2-4 letters of the old name, lowercased.
  const rootLen = 2 + Math.floor(Math.random() * 3);
  const root = oldName.slice(0, Math.min(rootLen, oldName.length)).toLowerCase();
  const pool = SYLLABLES[newEra];

  // Three evolution strategies, picked at random:
  const strategy = Math.floor(Math.random() * 3);
  let name: string;
  if (strategy === 0) {
    // Root + era suffix: "Ur" -> "Urmark"
    name = root + pick(pool.suffixes);
  } else if (strategy === 1) {
    // Root + era part + suffix: "Ur" -> "Urthanos"
    name = root + pick(pool.parts) + pick(pool.suffixes);
  } else {
    // "New" / "Greater" prefix on the old name
    const prefix = pick(['New ', 'Old ', 'Greater ', 'High ', '']);
    name = prefix + capitalize(oldName);
    return name; // already capitalized, prefix handled
  }
  return capitalize(name);
}