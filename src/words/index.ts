// Shared word packs.
//
// One pack list used by both Codenames (multi-select pool for the 5×5
// grid) and Cross Clues (single pool the host picks for the 10-word
// match). Each pack must:
//
// - have a unique kebab-case id,
// - contain only uppercase, single-token entries (no spaces, no hyphens),
// - hold at least 25 words so it can carry a Codenames board on its own
//   (Cross Clues only needs 10, so this is the tighter constraint),
// - be tagged `adultsOnly` if its theme isn't appropriate for kids.
//
// Adding a pack: drop a file under `packs/`, add an entry below.

import { CLASSIC_WORDS } from './packs/classic';
import { FANTASY_WORDS } from './packs/fantasy';
import { FOOD_WORDS } from './packs/food';
import { HISTORY_WORDS } from './packs/history';
import { HORROR_WORDS } from './packs/horror';
import { KIDS_WORDS } from './packs/kids';
import { MOVIES_WORDS } from './packs/movies';
import { MUSIC_WORDS } from './packs/music';
import { MYTHOLOGY_WORDS } from './packs/mythology';
import { NATURE_WORDS } from './packs/nature';
import { OFFICE_WORDS } from './packs/office';
import { SPACE_WORDS } from './packs/space';
import { SPICY_WORDS } from './packs/spicy';
import { SPORTS_WORDS } from './packs/sports';
import { TECH_WORDS } from './packs/tech';
import { TRAVEL_WORDS } from './packs/travel';

export type WordPackId =
  | 'classic'
  | 'fantasy'
  | 'space'
  | 'food'
  | 'movies'
  | 'sports'
  | 'tech'
  | 'nature'
  | 'mythology'
  | 'horror'
  | 'office'
  | 'travel'
  | 'spicy'
  | 'history'
  | 'music'
  | 'kids';

export interface WordPack {
  id: WordPackId;
  name: string;
  blurb: string; // one short line for the setup picker
  emoji: string; // visual hint on the pack chip
  words: readonly string[];
  adultsOnly?: boolean;
}

export const WORD_PACKS: Record<WordPackId, WordPack> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    blurb: 'The standard mix of everyday nouns, verbs, and places.',
    emoji: '🎯',
    words: CLASSIC_WORDS,
  },
  fantasy: {
    id: 'fantasy',
    name: 'Fantasy & Magic',
    blurb: 'Wizards, dragons, dungeons, and dwarves.',
    emoji: '🐉',
    words: FANTASY_WORDS,
  },
  space: {
    id: 'space',
    name: 'Space & Sci-Fi',
    blurb: 'Planets, probes, plasma, and aliens.',
    emoji: '🚀',
    words: SPACE_WORDS,
  },
  food: {
    id: 'food',
    name: 'Food & Drink',
    blurb: 'Pantry, produce, prepared dishes, and drinks.',
    emoji: '🍕',
    words: FOOD_WORDS,
  },
  movies: {
    id: 'movies',
    name: 'Movies & TV',
    blurb: 'Film grammar, genres, jobs, and cliches.',
    emoji: '🎬',
    words: MOVIES_WORDS,
  },
  sports: {
    id: 'sports',
    name: 'Sports',
    blurb: 'Gear, plays, positions, and venues.',
    emoji: '🏟️',
    words: SPORTS_WORDS,
  },
  tech: {
    id: 'tech',
    name: 'Tech & Code',
    blurb: 'Git, servers, bugs, and the cloud.',
    emoji: '💻',
    words: TECH_WORDS,
  },
  nature: {
    id: 'nature',
    name: 'Nature & Animals',
    blurb: 'Wildlife, plants, weather, and terrain.',
    emoji: '🦁',
    words: NATURE_WORDS,
  },
  mythology: {
    id: 'mythology',
    name: 'Mythology',
    blurb: 'Gods and monsters from world traditions.',
    emoji: '⚡',
    words: MYTHOLOGY_WORDS,
  },
  horror: {
    id: 'horror',
    name: 'Horror & Halloween',
    blurb: 'Ghosts, graves, and things that go bump.',
    emoji: '👻',
    words: HORROR_WORDS,
  },
  office: {
    id: 'office',
    name: 'Office Life',
    blurb: 'Cubicles, KPIs, and watercooler talk.',
    emoji: '🖇️',
    words: OFFICE_WORDS,
  },
  travel: {
    id: 'travel',
    name: 'Travel & World',
    blurb: 'Cities, landmarks, and how to get there.',
    emoji: '✈️',
    words: TRAVEL_WORDS,
  },
  history: {
    id: 'history',
    name: 'History & War',
    blurb: 'Empires, eras, figures, and battles.',
    emoji: '⚔️',
    words: HISTORY_WORDS,
  },
  music: {
    id: 'music',
    name: 'Music',
    blurb: 'Instruments, genres, gear, and bandlife.',
    emoji: '🎸',
    words: MUSIC_WORDS,
  },
  kids: {
    id: 'kids',
    name: 'Family & Kids',
    blurb: 'Simple concrete words for younger players.',
    emoji: '🧸',
    words: KIDS_WORDS,
  },
  spicy: {
    id: 'spicy',
    name: 'Spicy (18+)',
    blurb: 'Adult-party flavor — double entendre and bar humor. PG-13.',
    emoji: '🌶️',
    words: SPICY_WORDS,
    adultsOnly: true,
  },
};

export const WORD_PACK_LIST: WordPack[] = Object.values(WORD_PACKS);

// Build the deduped pool for a list of selected pack ids. Order is stable
// (input order; ties broken by first-seen). Duplicates across packs are
// merged. Unknown ids are skipped silently.
export function buildPoolFromPacks(packIds: readonly WordPackId[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of packIds) {
    const pack = WORD_PACKS[id];
    if (!pack) continue;
    for (const w of pack.words) {
      const upper = w.toUpperCase();
      if (seen.has(upper)) continue;
      seen.add(upper);
      out.push(upper);
    }
  }
  return out;
}

export const DEFAULT_WORD_PACK_ID: WordPackId = 'classic';

// Re-export the raw classic list for callers that want the underlying
// array directly (e.g. Codenames' explicit `wordPool` legacy option).
export { CLASSIC_WORDS };
