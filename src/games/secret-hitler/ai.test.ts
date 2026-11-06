import { describe, expect, it } from 'vitest';
import { secretHitlerModule as mod } from './module';
import { SHARED_ACK_PHASES } from './rules';
import { configFor, playSelf } from './testkit';

describe('Secret Hitler AI — self-play', () => {
  it('all-AI games finish without throwing or stalling at every table size', () => {
    const winners = { liberal: 0, fascist: 0 };
    const reasons = new Set<string>();
    for (let n = 5; n <= 10; n++) {
      for (let seed = 1; seed <= 8; seed++) {
        const { state, steps } = playSelf(configFor(n, seed * 7919, { aiSeats: 'all' }));
        expect(state.phase).toBe('gameOver');
        expect(state.winnerTeam).not.toBeNull();
        expect(steps).toBeGreaterThan(n); // at least the role acks + a round
        winners[state.winnerTeam!]++;
        reasons.add(state.winReason!);
      }
    }
    // Sanity: the heuristics aren't degenerate — both teams can win.
    expect(winners.liberal).toBeGreaterThan(0);
    expect(winners.fascist).toBeGreaterThan(0);
    expect(reasons.size).toBeGreaterThanOrEqual(2);
  });

  it('the rebalanced 6-player variant plays to completion', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { state } = playSelf(configFor(6, seed, { aiSeats: 'all', rebalanced6p: true }));
      expect(state.phase).toBe('gameOver');
    }
  });

  it('acts in every phase its seat is required, and only then', () => {
    // Over a long game, whenever an AI seat proposes something it is for its
    // own seat and legal (playSelf throws otherwise); dead seats stay quiet.
    playSelf(configFor(9, 4242, { aiSeats: 'all' }), {
      visit: (s) => {
        if (s.phase === 'gameOver') return;
        for (const seat of s.seats) {
          const a = mod.aiChooseAction!(s, seat.index);
          if (!seat.alive && !SHARED_ACK_PHASES.has(s.phase)) expect(a).toBeNull();
          if (a) expect(a.bySeat).toBe(seat.index);
        }
      },
    });
  });

  it('leaves shared reveal screens for a human to dismiss', () => {
    let sawSharedPhase = false;
    for (let seed = 1; seed <= 4; seed++) {
      const { state } = playSelf(configFor(7, seed, { aiSeats: [1, 2, 3, 4, 5, 6] }), {
        humanSeats: [0],
        visit: (s) => {
          if (!SHARED_ACK_PHASES.has(s.phase)) return;
          sawSharedPhase = true;
          for (let seat = 1; seat < 7; seat++) expect(mod.aiChooseAction!(s, seat)).toBeNull();
        },
      });
      expect(state.phase).toBe('gameOver');
    }
    expect(sawSharedPhase).toBe(true);
  });
});
