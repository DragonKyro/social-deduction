import { describe, expect, it } from 'vitest';
import type { Card } from './state';
import { allClaims, claimExists, compareClaim, isStrictRaise, isValidClaim, normalizeClaim } from './hands';
import type { HandClaim } from './hands';

describe('hand comparison', () => {
  it('orders categories correctly', () => {
    const pair: HandClaim = { kind: 'pair', rank: 14 };
    const trips: HandClaim = { kind: 'threeKind', rank: 2 };
    expect(compareClaim(pair, trips)).toBe(-1);
    expect(compareClaim(trips, pair)).toBe(1);
  });

  it('within a non-flush category, higher rank wins', () => {
    const a: HandClaim = { kind: 'pair', rank: 7 };
    const b: HandClaim = { kind: 'pair', rank: 9 };
    expect(compareClaim(a, b)).toBe(-1);
    expect(compareClaim(b, a)).toBe(1);
  });

  it('inverted flush ranking: LOWER top card is stronger', () => {
    // A flush ending at 6 (rarer — needs 2/3/4/5 below) beats a flush
    // ending at A (needs any 4 of the suit below).
    const lowFlush: HandClaim = { kind: 'flush', topRank: 6, suit: 'spades' };
    const highFlush: HandClaim = { kind: 'flush', topRank: 14, suit: 'spades' };
    expect(compareClaim(highFlush, lowFlush)).toBe(-1);
    expect(compareClaim(lowFlush, highFlush)).toBe(1);
  });

  it('straight-flush uses standard high-rank-wins (not inverted)', () => {
    const a: HandClaim = { kind: 'straightFlush', topRank: 9, suit: 'hearts' };
    const b: HandClaim = { kind: 'straightFlush', topRank: 14, suit: 'hearts' };
    expect(compareClaim(a, b)).toBe(-1);
    expect(compareClaim(b, a)).toBe(1);
  });

  it('flushes break ties by suit (higher suit wins) at equal rank', () => {
    const a: HandClaim = { kind: 'flush', topRank: 9, suit: 'clubs' };
    const b: HandClaim = { kind: 'flush', topRank: 9, suit: 'spades' };
    expect(compareClaim(a, b)).toBe(-1);
  });
});

describe('claimExists', () => {
  function c(rank: number, suit: 'spades' | 'hearts' | 'diamonds' | 'clubs'): Card {
    return { rank: rank as Card['rank'], suit };
  }

  it('matches a pair when 2 cards of the rank exist', () => {
    const pool = [c(7, 'spades'), c(7, 'hearts'), c(3, 'clubs')];
    expect(claimExists({ kind: 'pair', rank: 7 }, pool)).toBe(true);
    expect(claimExists({ kind: 'pair', rank: 3 }, pool)).toBe(false);
  });

  it('flush needs exact top card + 4 strictly lower same-suit', () => {
    const pool = [
      c(10, 'spades'),
      c(9, 'spades'),
      c(7, 'spades'),
      c(5, 'spades'),
      c(3, 'spades'),
      c(2, 'hearts'),
    ];
    // 10-high spades: 9,7,5,3 are 4 lower spades → exists.
    expect(
      claimExists({ kind: 'flush', topRank: 10, suit: 'spades' }, pool),
    ).toBe(true);
    // Q-high spades: no Q present → false.
    expect(
      claimExists({ kind: 'flush', topRank: 12, suit: 'spades' }, pool),
    ).toBe(false);
    // 6-high spades: 6 not present (5,3,2 below) → false.
    expect(
      claimExists({ kind: 'flush', topRank: 6, suit: 'spades' }, pool),
    ).toBe(false);
    // 10-high hearts: top not in hearts → false.
    expect(
      claimExists({ kind: 'flush', topRank: 10, suit: 'hearts' }, pool),
    ).toBe(false);
  });

  it('straight requires 5 consecutive ranks', () => {
    const pool = [
      c(5, 'spades'),
      c(6, 'hearts'),
      c(7, 'spades'),
      c(8, 'clubs'),
      c(9, 'diamonds'),
    ];
    expect(claimExists({ kind: 'straight', topRank: 9 }, pool)).toBe(true);
    expect(claimExists({ kind: 'straight', topRank: 10 }, pool)).toBe(false);
  });

  it('full house requires three + two of distinct ranks', () => {
    const pool = [
      c(3, 'spades'),
      c(3, 'hearts'),
      c(3, 'diamonds'),
      c(7, 'spades'),
      c(7, 'clubs'),
    ];
    expect(
      claimExists({ kind: 'fullHouse', threeRank: 3, twoRank: 7 }, pool),
    ).toBe(true);
    expect(
      claimExists({ kind: 'fullHouse', threeRank: 7, twoRank: 3 }, pool),
    ).toBe(false);
  });

  it('rejects pair where rank equals itself for two-pair', () => {
    const pool = [c(3, 'spades'), c(3, 'hearts')];
    expect(
      claimExists(
        { kind: 'twoPair', highRank: 3, lowRank: 3 },
        pool,
      ),
    ).toBe(false);
  });
});

describe('ace-low straights (wheel)', () => {
  function c(rank: number, suit: 'spades' | 'hearts' | 'diamonds' | 'clubs'): Card {
    return { rank: rank as Card['rank'], suit };
  }
  it('A-2-3-4-5 is a 5-high straight, ranked below a 6-high straight', () => {
    const pool = [c(14, 'spades'), c(2, 'hearts'), c(3, 'clubs'), c(4, 'clubs'), c(5, 'diamonds')];
    expect(claimExists({ kind: 'straight', topRank: 5 }, pool)).toBe(true);
    expect(claimExists({ kind: 'straight', topRank: 6 }, pool)).toBe(false);
    expect(compareClaim({ kind: 'straight', topRank: 5 }, { kind: 'straight', topRank: 6 })).toBe(-1);
  });
  it('steel wheel is a 5-high straight flush', () => {
    const pool = [c(14, 'hearts'), c(2, 'hearts'), c(3, 'hearts'), c(4, 'hearts'), c(5, 'hearts')];
    expect(claimExists({ kind: 'straightFlush', topRank: 5, suit: 'hearts' }, pool)).toBe(true);
    expect(claimExists({ kind: 'straightFlush', topRank: 5, suit: 'spades' }, pool)).toBe(false);
  });
  it('an ace is never low in a plain flush', () => {
    const pool = [c(14, 'hearts'), c(2, 'hearts'), c(3, 'hearts'), c(4, 'hearts'), c(6, 'hearts')];
    expect(claimExists({ kind: 'flush', topRank: 6, suit: 'hearts' }, pool)).toBe(false);
    expect(claimExists({ kind: 'flush', topRank: 14, suit: 'hearts' }, pool)).toBe(true);
  });
});

describe('claim validation', () => {
  it('rejects malformed claims', () => {
    const bad: unknown[] = [
      null,
      { kind: 'royalty', rank: 14 },
      { kind: 'pair', rank: 15 },
      { kind: 'pair', rank: 1 },
      { kind: 'pair', rank: 7.5 },
      { kind: 'twoPair', highRank: 3, lowRank: 9 },
      { kind: 'twoPair', highRank: 9, lowRank: 9 },
      { kind: 'fullHouse', threeRank: 9, twoRank: 9 },
      { kind: 'straight', topRank: 4 },
      { kind: 'flush', topRank: 5, suit: 'hearts' },
      { kind: 'flush', topRank: 9, suit: 'stars' },
      { kind: 'straightFlush', topRank: 9 },
    ];
    for (const b of bad) {
      expect(isValidClaim(b)).toBe(false);
      expect(normalizeClaim(b)).toBeNull();
    }
  });

  it('regression: an impossible "2-high flush" is no longer the strongest flush', () => {
    // compareClaim inverts flush ranks, so topRank 2 used to beat every real
    // flush and was accepted by isStrictRaise.
    const prev: HandClaim = { kind: 'flush', topRank: 6, suit: 'spades' };
    const bogus = { kind: 'flush', topRank: 2, suit: 'spades' } as HandClaim;
    expect(isStrictRaise(prev, bogus)).toBe(false);
    expect(isStrictRaise(null, bogus)).toBe(false);
  });

  it('normalizeClaim strips unknown fields', () => {
    const raw = { kind: 'pair', rank: 9, smuggled: { secret: true } };
    expect(normalizeClaim(raw)).toEqual({ kind: 'pair', rank: 9 });
  });

  it('allClaims is strictly increasing and every entry is valid', () => {
    const all = allClaims();
    for (let i = 1; i < all.length; i++) expect(compareClaim(all[i - 1]!, all[i]!)).toBe(-1);
    for (const cl of all) expect(isValidClaim(cl)).toBe(true);
    // 13 high + 13 pair + 78 two pair + 13 trips + 10 straights + 36 flushes
    // + 156 full houses + 13 quads + 40 straight flushes.
    expect(all.length).toBe(372);
  });

  it('flush evaluation matches a brute-force reference on random pools', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
    for (let t = 0; t < 300; t++) {
      const pool: Card[] = [];
      const used = new Set<string>();
      const n = 5 + Math.floor(rnd() * 25);
      while (pool.length < n) {
        const card = { rank: (2 + Math.floor(rnd() * 13)) as Card['rank'], suit: suits[Math.floor(rnd() * 4)]! };
        const k = `${card.rank}${card.suit}`;
        if (used.has(k)) continue;
        used.add(k);
        pool.push(card);
      }
      for (const suit of suits) {
        for (let top = 6; top <= 14; top++) {
          const suited = pool.filter((x) => x.suit === suit);
          const ref = suited.some((x) => x.rank === top) && suited.filter((x) => x.rank < top).length >= 4;
          expect(claimExists({ kind: 'flush', topRank: top as Card['rank'], suit }, pool)).toBe(ref);
        }
      }
    }
  });
});
