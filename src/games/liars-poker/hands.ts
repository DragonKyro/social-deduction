import type { Card, CardRank, Suit } from './state';

// ============================================================================
// Liar's Poker — hand comparison + existence
//
// HandClaim categories follow standard poker hierarchy. Within categories,
// higher rank is stronger EXCEPT for plain flushes (lower top card is
// stronger — fewer same-suit cards exist below it, so the claim is harder
// to find in the combined pool).
//
// claimExists checks the combined pool of cards across all players for the
// declared hand. For flushes, the EXACT top card must be present plus four
// strictly lower same-suit cards. Straights (and straight flushes) may be
// ace-low: a 5-high straight is A-2-3-4-5.
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

export const HAND_KINDS: readonly HandKind[] = [
  'highCard',
  'pair',
  'twoPair',
  'threeKind',
  'straight',
  'flush',
  'fullHouse',
  'fourKind',
  'straightFlush',
];

export const SUIT_ORDER: Record<Suit, number> = {
  spades: 4,
  hearts: 3,
  diamonds: 2,
  clubs: 1,
};

export const ALL_SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const ALL_RANKS: readonly CardRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** Lowest legal top card: straights may be ace-low (5-high); flushes need 4 below. */
export const MIN_STRAIGHT_TOP = 5;
export const MIN_FLUSH_TOP = 6;

export type HandClaim =
  | { kind: 'highCard'; rank: CardRank }
  | { kind: 'pair'; rank: CardRank }
  | { kind: 'twoPair'; highRank: CardRank; lowRank: CardRank }
  | { kind: 'threeKind'; rank: CardRank }
  | { kind: 'straight'; topRank: CardRank } // 5-card straight; topRank 5..14 (5 = A-2-3-4-5)
  | { kind: 'flush'; topRank: CardRank; suit: Suit } // topRank 6..14
  | { kind: 'fullHouse'; threeRank: CardRank; twoRank: CardRank }
  | { kind: 'fourKind'; rank: CardRank }
  | { kind: 'straightFlush'; topRank: CardRank; suit: Suit };

// ---------------------------------------------------------------------------
// Validation (claims arrive off the wire from peers)
// ---------------------------------------------------------------------------

function isRank(r: unknown, min = 2): r is CardRank {
  return typeof r === 'number' && Number.isInteger(r) && r >= min && r <= 14;
}

function isSuit(s: unknown): s is Suit {
  return s === 'spades' || s === 'hearts' || s === 'diamonds' || s === 'clubs';
}

/**
 * Rebuild a claim from untrusted input. Returns a clean object (no extra
 * fields) or null if the claim is malformed: unknown kind, ranks out of
 * range, two pair / full house on one rank, two pair given low-first,
 * straights topping below 5, flushes topping below 6.
 */
export function normalizeClaim(raw: unknown): HandClaim | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.kind) {
    case 'highCard':
    case 'pair':
    case 'threeKind':
    case 'fourKind':
      return isRank(c.rank) ? { kind: c.kind, rank: c.rank } : null;
    case 'twoPair':
      return isRank(c.highRank) && isRank(c.lowRank) && c.highRank > c.lowRank
        ? { kind: 'twoPair', highRank: c.highRank, lowRank: c.lowRank }
        : null;
    case 'fullHouse':
      return isRank(c.threeRank) && isRank(c.twoRank) && c.threeRank !== c.twoRank
        ? { kind: 'fullHouse', threeRank: c.threeRank, twoRank: c.twoRank }
        : null;
    case 'straight':
      return isRank(c.topRank, MIN_STRAIGHT_TOP) ? { kind: 'straight', topRank: c.topRank } : null;
    case 'flush':
      return isRank(c.topRank, MIN_FLUSH_TOP) && isSuit(c.suit)
        ? { kind: 'flush', topRank: c.topRank, suit: c.suit }
        : null;
    case 'straightFlush':
      return isRank(c.topRank, MIN_STRAIGHT_TOP) && isSuit(c.suit)
        ? { kind: 'straightFlush', topRank: c.topRank, suit: c.suit }
        : null;
    default:
      return null;
  }
}

export function isValidClaim(raw: unknown): raw is HandClaim {
  return normalizeClaim(raw) !== null;
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

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
      if (a.threeRank !== bb.threeRank) return a.threeRank < bb.threeRank ? -1 : 1;
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

/** True when `next` is a well-formed claim strictly stronger than `prev`. */
export function isStrictRaise(prev: HandClaim | null, next: HandClaim): boolean {
  if (!isValidClaim(next)) return false;
  if (prev === null) return true;
  return compareClaim(prev, next) === -1;
}

/** Every well-formed claim, weakest first. */
export function allClaims(): HandClaim[] {
  const out: HandClaim[] = [];
  for (const rank of ALL_RANKS) out.push({ kind: 'highCard', rank });
  for (const rank of ALL_RANKS) out.push({ kind: 'pair', rank });
  for (const highRank of ALL_RANKS)
    for (const lowRank of ALL_RANKS) if (lowRank < highRank) out.push({ kind: 'twoPair', highRank, lowRank });
  for (const rank of ALL_RANKS) out.push({ kind: 'threeKind', rank });
  for (const topRank of ALL_RANKS) if (topRank >= MIN_STRAIGHT_TOP) out.push({ kind: 'straight', topRank });
  for (const topRank of ALL_RANKS)
    if (topRank >= MIN_FLUSH_TOP) for (const suit of ALL_SUITS) out.push({ kind: 'flush', topRank, suit });
  for (const threeRank of ALL_RANKS)
    for (const twoRank of ALL_RANKS) if (twoRank !== threeRank) out.push({ kind: 'fullHouse', threeRank, twoRank });
  for (const rank of ALL_RANKS) out.push({ kind: 'fourKind', rank });
  for (const topRank of ALL_RANKS)
    if (topRank >= MIN_STRAIGHT_TOP) for (const suit of ALL_SUITS) out.push({ kind: 'straightFlush', topRank, suit });
  return out.sort(compareClaim);
}

// ---------------------------------------------------------------------------
// claimExists
// ---------------------------------------------------------------------------

/** Rank counts + per-suit rank bitmasks for a pool (bit r = rank r present). */
export interface PoolStats {
  rankCount: number[];
  suitMask: Record<Suit, number>;
}

export function poolStats(pool: readonly Card[]): PoolStats {
  const rankCount = new Array<number>(15).fill(0);
  const suitMask: Record<Suit, number> = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
  for (const c of pool) {
    rankCount[c.rank] = (rankCount[c.rank] ?? 0) + 1;
    suitMask[c.suit] |= 1 << c.rank;
  }
  return { rankCount, suitMask };
}

/** The five ranks a straight to `topRank` needs (5 → A-2-3-4-5). */
export function straightRanks(topRank: CardRank): CardRank[] {
  if (topRank === 5) return [14, 2, 3, 4, 5];
  return [0, 1, 2, 3, 4].map((d) => (topRank - 4 + d) as CardRank);
}

function popcount(x: number): number {
  let n = 0;
  let v = x >>> 0;
  while (v) {
    v &= v - 1;
    n += 1;
  }
  return n;
}

export function claimExistsIn(claim: HandClaim, stats: PoolStats): boolean {
  const rc = stats.rankCount;
  switch (claim.kind) {
    case 'highCard':
      return (rc[claim.rank] ?? 0) >= 1;
    case 'pair':
      return (rc[claim.rank] ?? 0) >= 2;
    case 'twoPair':
      return claim.highRank !== claim.lowRank && (rc[claim.highRank] ?? 0) >= 2 && (rc[claim.lowRank] ?? 0) >= 2;
    case 'threeKind':
      return (rc[claim.rank] ?? 0) >= 3;
    case 'fourKind':
      return (rc[claim.rank] ?? 0) >= 4;
    case 'fullHouse':
      return claim.threeRank !== claim.twoRank && (rc[claim.threeRank] ?? 0) >= 3 && (rc[claim.twoRank] ?? 0) >= 2;
    case 'straight':
      if (claim.topRank < MIN_STRAIGHT_TOP || claim.topRank > 14) return false;
      return straightRanks(claim.topRank).every((r) => (rc[r] ?? 0) >= 1);
    case 'flush': {
      if (claim.topRank < MIN_FLUSH_TOP || claim.topRank > 14) return false;
      // Exact top card present + 4 strictly-lower same-suit cards.
      const mask = stats.suitMask[claim.suit];
      if (!(mask & (1 << claim.topRank))) return false;
      return popcount(mask & ((1 << claim.topRank) - 1)) >= 4;
    }
    case 'straightFlush': {
      if (claim.topRank < MIN_STRAIGHT_TOP || claim.topRank > 14) return false;
      const mask = stats.suitMask[claim.suit];
      return straightRanks(claim.topRank).every((r) => (mask & (1 << r)) !== 0);
    }
  }
}

export function claimExists(claim: HandClaim, pool: readonly Card[]): boolean {
  return claimExistsIn(claim, poolStats(pool));
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

export const RANK_NAME: Record<CardRank, string> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};

export const SUIT_LABEL: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const KIND_LABEL: Record<HandKind, string> = {
  highCard: 'High card',
  pair: 'Pair',
  twoPair: 'Two pair',
  threeKind: 'Three of a kind',
  straight: 'Straight',
  flush: 'Flush',
  fullHouse: 'Full house',
  fourKind: 'Four of a kind',
  straightFlush: 'Straight flush',
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

/** Cards from `pool` that make up `claim` (for highlighting at showdown). */
export function claimWitness(claim: HandClaim, pool: readonly Card[]): Card[] {
  const byRank = (r: CardRank, n: number) => pool.filter((c) => c.rank === r).slice(0, n);
  switch (claim.kind) {
    case 'highCard':
      return byRank(claim.rank, 1);
    case 'pair':
      return byRank(claim.rank, 2);
    case 'threeKind':
      return byRank(claim.rank, 3);
    case 'fourKind':
      return byRank(claim.rank, 4);
    case 'twoPair':
      return [...byRank(claim.highRank, 2), ...byRank(claim.lowRank, 2)];
    case 'fullHouse':
      return [...byRank(claim.threeRank, 3), ...byRank(claim.twoRank, 2)];
    case 'straight':
      return straightRanks(claim.topRank).flatMap((r) => byRank(r, 1));
    case 'flush': {
      const suited = pool.filter((c) => c.suit === claim.suit);
      const top = suited.filter((c) => c.rank === claim.topRank).slice(0, 1);
      const lower = suited.filter((c) => c.rank < claim.topRank).sort((a, b) => b.rank - a.rank).slice(0, 4);
      return [...top, ...lower];
    }
    case 'straightFlush':
      return straightRanks(claim.topRank).flatMap((r) =>
        pool.filter((c) => c.rank === r && c.suit === claim.suit).slice(0, 1),
      );
  }
}
