import type { Bid, DieFace } from './state';

// ============================================================================
// Liar's Dice — pure bid rules, shared by the module, the AI and the UI.
// ============================================================================

export const FACES: readonly DieFace[] = [1, 2, 3, 4, 5, 6];

/** Shape check for a bid arriving off the wire. */
export function isValidBidShape(bid: unknown): bid is Bid {
  if (!bid || typeof bid !== 'object') return false;
  const b = bid as { count?: unknown; face?: unknown };
  return (
    typeof b.count === 'number' &&
    Number.isInteger(b.count) &&
    b.count >= 1 &&
    typeof b.face === 'number' &&
    Number.isInteger(b.face) &&
    b.face >= 1 &&
    b.face <= 6
  );
}

/**
 * Is `next` a legal bid after `prev`?
 *
 * Without wild ones: 1 is simply the lowest face. Raise the count, or keep
 * the count and raise the face.
 *
 * With wild ones (Perudo convention), 1s ("aces") are worth roughly double
 * because every other face also counts them:
 *  - The opening bid of a round may not be on 1s.
 *  - Non-1s → non-1s: the normal rule.
 *  - Non-1s → 1s: count ≥ ceil(previous count / 2).
 *  - 1s → 1s: count must go up.
 *  - 1s → non-1s: count ≥ previous count × 2 + 1.
 */
export function isLegalRaise(prev: Bid | null, next: Bid, wildOnes: boolean): boolean {
  if (!isValidBidShape(next)) return false;
  if (!wildOnes) {
    if (prev === null) return true;
    return next.count > prev.count || (next.count === prev.count && next.face > prev.face);
  }
  if (prev === null) return next.face !== 1;
  const prevOnes = prev.face === 1;
  const nextOnes = next.face === 1;
  if (!prevOnes && !nextOnes) {
    return next.count > prev.count || (next.count === prev.count && next.face > prev.face);
  }
  if (!prevOnes && nextOnes) return next.count >= Math.ceil(prev.count / 2);
  if (prevOnes && nextOnes) return next.count > prev.count;
  return next.count >= prev.count * 2 + 1;
}

/** Every legal bid given the previous bid and the dice cap. */
export function legalBids(prev: Bid | null, totalDice: number, wildOnes: boolean): Bid[] {
  const out: Bid[] = [];
  for (let count = 1; count <= totalDice; count++) {
    for (const face of FACES) {
      const b: Bid = { count, face };
      if (isLegalRaise(prev, b, wildOnes)) out.push(b);
    }
  }
  return out;
}

/** The smallest legal count for `face` after `prev` (null if none ≤ cap). */
export function minCountFor(
  prev: Bid | null,
  face: DieFace,
  totalDice: number,
  wildOnes: boolean,
): number | null {
  for (let count = 1; count <= totalDice; count++) {
    if (isLegalRaise(prev, { count, face }, wildOnes)) return count;
  }
  return null;
}

/** Does this die count toward a bid on `face`? */
export function dieMatches(die: DieFace, face: DieFace, wildOnes: boolean): boolean {
  return die === face || (wildOnes && face !== 1 && die === 1);
}

export function countMatching(dice: readonly DieFace[], face: DieFace, wildOnes: boolean): number {
  let n = 0;
  for (const d of dice) if (dieMatches(d, face, wildOnes)) n += 1;
  return n;
}
