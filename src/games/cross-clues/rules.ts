import { isFormOf } from '@/games/codenames/lexicon';
import type { Coord } from './state';

// Clue + coordinate validation shared by the reducer, the AI, and the UI.

export const MAX_CLUE_LENGTH = 32;
export const GRID = 5;

/**
 * Trim + validate a clue against the 10 grid words. Returns the canonical
 * trimmed clue, or throws with a human-readable reason.
 *
 * Rules: one word (no whitespace), ≤ 32 chars; hyphens / apostrophes are
 * allowed, but neither the clue nor any hyphen/apostrophe-separated part of
 * it may be (a form of) a grid word — otherwise "OCEAN-PIANO" would just
 * name the answer.
 */
export function normalizeClue(raw: unknown, gridWords: readonly string[]): string {
  const problem = clueProblem(raw, gridWords);
  if (problem) throw new Error(problem);
  return (raw as string).trim();
}

export function clueProblem(raw: unknown, gridWords: readonly string[]): string | null {
  if (typeof raw !== 'string') return 'Clue must not be empty';
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'Clue must not be empty';
  if (trimmed.length > MAX_CLUE_LENGTH) return `Clue must be ≤ ${MAX_CLUE_LENGTH} chars`;
  if (/\s/.test(trimmed)) return 'Clue must be a single word (no spaces)';
  const parts = [trimmed, ...trimmed.split(/['’-]+/).filter(Boolean)];
  for (const part of parts) {
    const clash = gridWords.find((w) => isFormOf(part, w));
    if (clash) return `Clue may not use a grid word (${clash})`;
  }
  return null;
}

export function isValidCoord(c: unknown): c is Coord {
  if (!c || typeof c !== 'object') return false;
  const { row, col } = c as { row?: unknown; col?: unknown };
  return (
    typeof row === 'number' &&
    typeof col === 'number' &&
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < GRID &&
    col >= 0 &&
    col < GRID
  );
}

export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
export const COL_LABELS = ['1', '2', '3', '4', '5'] as const;

export function coordLabel(c: Coord): string {
  return `${ROW_LABELS[c.row] ?? '?'}${COL_LABELS[c.col] ?? '?'}`;
}
