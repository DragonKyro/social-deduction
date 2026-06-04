import { STANDARD_WORDS } from './standard';
import { SPICY_WORDS } from './spicy';
import { KIDS_WORDS } from './kids';

// Word packs. Each must have at least 10 entries to deal a single match
// (we recommend ≥ 25 for variety across multiple plays). The host picks
// one packId at setup; an unknown id falls back to 'standard'.

export interface WordPack {
  id: string;
  displayName: string;
  description: string;
  words: readonly string[];
}

export const PACKS: Record<string, WordPack> = {
  standard: {
    id: 'standard',
    displayName: 'Standard',
    description: 'Everyday concrete nouns. Good for any group.',
    words: STANDARD_WORDS,
  },
  spicy: {
    id: 'spicy',
    displayName: 'Spicy',
    description: 'Abstract concepts and double meanings. Harder to clue.',
    words: SPICY_WORDS,
  },
  kids: {
    id: 'kids',
    displayName: 'Kids',
    description: 'Family-friendly nouns. Great for younger players.',
    words: KIDS_WORDS,
  },
};

export const DEFAULT_PACK_ID = 'standard';

export function getPack(packId: string): WordPack {
  return PACKS[packId] ?? PACKS[DEFAULT_PACK_ID]!;
}
