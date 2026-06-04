import type { Card, CardRank, Suit } from './state';

// ============================================================================
// Liar's Poker — hand comparison + existence
//
// HandClaim categories follow standard poker hierarchy. Within categories,
// higher rank is stronger EXCEPT for plain flushes (lower top card is
// stronger — the rationale is that fewer same-suit cards below it exist,
// so the claim is harder to find in the combined pool).
//
// claimExists checks the combined pool of cards across all players for the
// declared hand. For flushes, the EXACT top card must be present plus four
// strictly lower same-suit cards.
// ============================================================================

export type HandKind =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'threeKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourKind'
  | 'straightFlush';

export const KIND_ORDER: Record<HandKind, number> = {
  highCard: 1,
  pair: 2,
  twoPair: 3,
  threeKind: 4,
  straight: 5,
  flush: 6,
  fullHouse: 7,
  fourKind: 8,
  straightFlush: 9,
};

export const SUIT_ORDER: Record<Suit, number> = {
  spades: 4,
  hearts: 3,
  diamonds: 2,
  clubs: 1,
};

export type HandClaim =
  | { kind: 'highCard'; rank: CardRank }
  | { kind: 'pair'; rank: CardRank }
  | { kind: 'twoPair'; highRank: CardRank; lowRank: CardRank }
  | { kind: 'threeKind'; rank: CardRank }
  | { kind: 'straight'; topRank: CardRank } // 5-card straight; topRank in 6..14
  | { kind: 'flush'; topRank: CardRank; suit: Suit }
  | { kind: 'fullHouse'; threeRank: CardRank; twoRank: CardRank }
  | { kind: 'fourKind'; rank: CardRank }
  | { kind: 'straightFlush'; topRank: CardRank; suit: Suit };

// Compare two claims. Returns -1 if a<b, 1 if a>b, 0 if equal (illegal as a raise).
export function compareClaim(a: HandClaim, b: HandClaim): -1 | 0 | 1 {
  const ka = KIND_ORDER[a.kind];
  const kb = KIND_ORDER[b.kind];
  if (ka !== kb) return ka < kb ? -1 : 1;
  // Same kind — compare details.
  switch (a.kind) {
    case 'highCard':
    case 'pair':
    case 'threeKind':
    case 'fourKind': {
      const ar = a.rank;
      const br = (b as typeof a).rank;
      if (ar === br) return 0;
      return ar < br ? -1 : 1;
    }
    case 'twoPair': {
      const bb = b as typeof a;
      if (a.highRank !== bb.highRank) return a.highRank < bb.highRank ? -1 : 1;
      if (a.lowRank !== bb.lowRank) return a.lowRank < bb.lowRank ? -1 : 1;
      return 0;
    }
    case 'straight': {
      const bb = b as typeof a;
      if (a.topRank === bb.topRank) return 0;
      return a.topRank < bb.topRank ? -1 : 1;
    }
    case 'flush': {
      const bb = b as typeof a;
      // INVERTED: lower top rank is stronger.
      if (a.topRank !== bb.topRank) return a.topRank < bb.topRank ? 1 : -1;
      // Suit tiebreaker — higher suit stronger.
      if (a.suit === bb.suit) return 0;
      return SUIT_ORDER[a.suit] < SUIT_ORDER[bb.suit] ? -1 : 1;
    }
    case 'fullHouse': {
      const bb = b as typeof a;
      if (a.threeRank !== bb.threeRank)
        return a.threeRank < bb.threeRank ? -1 : 1;
      if (a.twoRank !== bb.twoRank) return a.twoRank < bb.twoRank ? -1 : 1;
      return 0;
    }
    case 'straightFlush': {
      const bb = b as typeof a;
      if (a.topRank !== bb.topRank) return a.topRank < bb.topRank ? -1 : 1;
      if (a.suit === bb.suit) return 0;
      return SUIT_ORDER[a.suit] < SUIT_ORDER[bb.suit] ? -1 : 1;
    }
  }
}

export function isStrictRaise(prev: HandClaim | null, next: HandClaim): boolean {
  if (prev === null) return true;
  return compareClaim(prev, next) === -1;
}

// ---------------------------------------------------------------------------
// claimExists
// ---------------------------------------------------------------------------

function countByRank(pool: Card[]): Map<CardRank, number> {
  const m = new Map<CardRank, number>();
  for (const c of pool) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

function countBySuit(pool: Card[]): Map<Suit, Card[]> {
  const m = new Map<Suit, Card[]>();
  for (const c of pool) {
    const arr = m.get(c.suit) ?? [];
    arr.push(c);
    m.set(c.suit, arr);
  }
  return m;
}

function hasNDistinctRanks(pool: Card[], topRank: CardRank): boolean {
  // For a 5-card straight ending at topRank: need ranks topRank, topRank-1,
  // ..., topRank-4 all present in pool.
  for (let r = topRank - 4; r <= topRank; r++) {
    if (!pool.some((c) => c.rank === r)) return false;
  }
  return true;
}

export function claimExists(claim: HandClaim, pool: Card[]): boolean {
  const ranks = countByRank(pool);
  switch (claim.kind) {
    case 'highCard':
      return (ranks.get(claim.rank) ?? 0) >= 1;
    case 'pair':
      return (ranks.get(claim.rank) ?? 0) >= 2;
    case 'twoPair':
      return (
        (ranks.get(claim.highRank) ?? 0) >= 2 &&
        (ranks.get(claim.lowRank) ?? 0) >= 2 &&
        claim.highRank !== claim.lowRank
      );
    case 'threeKind':
      return (ranks.get(claim.rank) ?? 0) >= 3;
    case 'fourKind':
      return (ranks.get(claim.rank) ?? 0) >= 4;
    case 'fullHouse':
      return (
        (ranks.get(claim.threeRank) ?? 0) >= 3 &&
        (ranks.get(claim.twoRank) ?? 0) >= 2 &&
        claim.threeRank !== claim.twoRank
      );
    case 'straight':
      if (claim.topRank < 6 || claim.topRank > 14) return false;
      return hasNDistinctRanks(pool, claim.topRank);
    case 'flush': {
      // Exact top card present + 4 strictly-lower same-suit cards.
      const suited = countBySuit(pool).get(claim.suit) ?? [];
      const hasTop = suited.some((c) => c.rank === claim.topRank);
      if (!hasTop) return false;
      const lower = suited.filter((c) => c.rank < claim.topRank).length;
      return lower >= 4;
    }
    case 'straightFlush': {
      if (claim.topRank < 6 || claim.topRank > 14) return false;
      const suited = countBySuit(pool).get(claim.suit) ?? [];
      // Need all 5 consecutive ranks within this suit.
      for (let r = claim.topRank - 4; r <= claim.topRank; r++) {
        if (!suited.some((c) => c.rank === r)) return false;
      }
      return true;
    }
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const RANK_LABEL: Record<CardRank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export const SUIT_LABEL: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export function claimLabel(claim: HandClaim): string {
  switch (claim.kind) {
    case 'highCard':
      return `High ${RANK_LABEL[claim.rank]}`;
    case 'pair':
      return `Pair of ${RANK_LABEL[claim.rank]}s`;
    case 'twoPair':
      return `Two pair: ${RANK_LABEL[claim.highRank]}s & ${RANK_LABEL[claim.lowRank]}s`;
    case 'threeKind':
      return `Three ${RANK_LABEL[claim.rank]}s`;
    case 'straight':
      return `Straight to ${RANK_LABEL[claim.topRank]}`;
    case 'flush':
      return `Flush ${RANK_LABEL[claim.topRank]}-high ${SUIT_LABEL[claim.suit]}`;
    case 'fullHouse':
      return `Full house: ${RANK_LABEL[claim.threeRank]}s over ${RANK_LABEL[claim.twoRank]}s`;
    case 'fourKind':
      return `Four ${RANK_LABEL[claim.rank]}s`;
    case 'straightFlush':
      return `Straight flush to ${RANK_LABEL[claim.topRank]} ${SUIT_LABEL[claim.suit]}`;
  }
}
