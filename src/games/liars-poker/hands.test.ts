import { describe, expect, it } from 'vitest';
import type { Card } from './state';
import { claimExists, compareClaim } from './hands';
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
