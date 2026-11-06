import { isFormOf } from './lexicon';

// Clue validation shared by the reducer, the AI, and the UI (so the UI can
// explain a rejection before the host throws).

export const MAX_CLUE_LENGTH = 24;
export const MAX_CLUE_NUMBER = 9;

// One token: letters / digits plus inner hyphens and apostrophes.
const CLUE_SHAPE = /^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u;

/**
 * Why `raw` can't be a clue on a board whose still-visible (unrevealed)
 * words are `visibleWords`, or null if it's fine. Rulebook: one word, and
 * not any form of a visible word ("until BOW is covered, BOWED / BOWING
 * are not legal"). Covered words become legal again.
 */
export function clueProblem(raw: unknown, visibleWords: readonly string[]): string | null {
  if (typeof raw !== 'string') return 'Clue word is required';
  const trimmed = raw.trim();
  if (!trimmed) return 'Clue word is required';
  if (/\s/.test(trimmed)) return 'Clue must be a single word';
  if (trimmed.length > MAX_CLUE_LENGTH) return `Clue must be at most ${MAX_CLUE_LENGTH} letters`;
  if (!CLUE_SHAPE.test(trimmed)) return 'Clue may only use letters, digits, hyphens, and apostrophes';
  const upper = trimmed.toUpperCase();
  const clash = visibleWords.find((w) => isFormOf(upper, w));
  if (clash) return `Clue may not be a form of ${clash}, which is still on the board`;
  return null;
}

export function clueNumberProblem(n: unknown): string | null {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_CLUE_NUMBER) {
    return `Clue number must be an integer 0–${MAX_CLUE_NUMBER}`;
  }
  return null;
}

/** Words still face-up (not yet covered by an agent card). */
export function visibleWords(cards: ReadonlyArray<{ word: string; revealed: boolean }>): string[] {
  return cards.filter((c) => !c.revealed).map((c) => c.word);
}

// A clue of N permits up to N+1 guesses in total (rulebook: "you may always
// make one guess in addition to your clue number"). N = 0 is the "zero /
// unlimited" clue — operatives may keep going as long as they hit their own
// cards, with no cap (they must still make at least one guess).
export function maxGuesses(clueNumber: number): number {
  if (clueNumber <= 0) return Infinity;
  return clueNumber + 1;
}
