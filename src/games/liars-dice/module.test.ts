import { describe, expect, it } from 'vitest';
import { liarsDiceModule } from './module';
import type { LiarsDiceOptions } from './module';
import type { LiarsDiceAction } from './actions';
import type { LiarsDicePrivateState } from './state';

function apply(
  state: LiarsDicePrivateState,
  action: LiarsDiceAction,
): LiarsDicePrivateState {
  return liarsDiceModule.applyAction(state, action, '');
}

function start(players = 3): LiarsDicePrivateState {
  const opts: LiarsDiceOptions = {
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i + 1}`,
      isAI: false,
    })),
    wildOnes: true,
    spotOn: true,
    startingDice: 5,
  };
  return liarsDiceModule.createInitialState({
    gameId: 'liars-dice',
    seats: [],
    seed: 42,
    gameOptions: opts as unknown as Record<string, unknown>,
  });
}

describe("Liar's Dice", () => {
  it('starts in rollPending with 5 dice each', () => {
    const s = start();
    expect(s.phase).toBe('rollPending');
    for (const p of Object.values(s.players)) {
      expect(p.dice.length).toBe(5);
      expect(p.diceCount).toBe(5);
    }
  });

  it('viewFor redacts opponent dice', () => {
    const s = start();
    const v0 = liarsDiceModule.viewFor(s, 0);
    expect(v0.yourDice.length).toBe(5);
    expect(v0.players[1]!.diceCount).toBe(5);
    // Sanity: there is no "dice" field on PublicPlayer.
    expect((v0.players[1]! as unknown as { dice?: unknown }).dice).toBeUndefined();
  });

  it('moves to bidding after all roll acks', () => {
    let s = start();
    for (let i = 0; i < 3; i++) {
      s = apply(s,{ type: 'ackRoll', bySeat: i });
    }
    expect(s.phase).toBe('bidding');
  });

  it('resolves a liar call correctly', () => {
    let s = start(2);
    // Force known dice (skip RNG): assign manually.
    s = {
      ...s,
      players: {
        ...s.players,
        0: { ...s.players[0]!, dice: [2, 2, 2, 2, 2] },
        1: { ...s.players[1]!, dice: [3, 3, 3, 3, 3] },
      },
    };
    s = apply(s,{ type: 'ackRoll', bySeat: 0 });
    s = apply(s,{ type: 'ackRoll', bySeat: 1 });
    expect(s.phase).toBe('bidding');
    const leader = s.currentSeat;
    // Leader bids "8 × 6s" — impossible. Other seat calls liar.
    s = apply(s,{
      type: 'placeBid',
      bySeat: leader,
      bid: { count: 8, face: 6 },
    });
    const next = s.currentSeat;
    s = apply(s,{ type: 'call', bySeat: next, kind: 'liar' });
    expect(s.phase).toBe('revealing');
    expect(s.lastReveal!.callerWon).toBe(true);
    expect(s.lastReveal!.loserSeat).toBe(leader);
    expect(s.players[leader]!.diceCount).toBe(4);
  });

  it('wildOnes rule counts 1s for non-1 bid faces', () => {
    let s = start(2);
    s = {
      ...s,
      players: {
        ...s.players,
        0: { ...s.players[0]!, dice: [1, 1, 1, 1, 1] },
        1: { ...s.players[1]!, dice: [3, 3, 3, 3, 3] },
      },
    };
    s = apply(s,{ type: 'ackRoll', bySeat: 0 });
    s = apply(s,{ type: 'ackRoll', bySeat: 1 });
    const leader = s.currentSeat;
    // Bid "8 × 3s" — actual 3s = 5, but wildOnes adds 5 ones → 10. Caller loses.
    s = apply(s,{
      type: 'placeBid',
      bySeat: leader,
      bid: { count: 8, face: 3 },
    });
    const next = s.currentSeat;
    s = apply(s,{ type: 'call', bySeat: next, kind: 'liar' });
    expect(s.lastReveal!.actual).toBe(10);
    expect(s.lastReveal!.callerWon).toBe(false);
    expect(s.lastReveal!.loserSeat).toBe(next);
  });

  it('spot-on call wins when actual exactly matches', () => {
    let s = start(2);
    s = {
      ...s,
      players: {
        ...s.players,
        0: { ...s.players[0]!, dice: [2, 2, 3, 3, 3] },
        1: { ...s.players[1]!, dice: [3, 3, 4, 4, 4] },
      },
    };
    s = apply(s,{ type: 'ackRoll', bySeat: 0 });
    s = apply(s,{ type: 'ackRoll', bySeat: 1 });
    const leader = s.currentSeat;
    // Bid "5 × 3s" — actual = 5 exactly (no wild ones in any hand).
    s = apply(s,{
      type: 'placeBid',
      bySeat: leader,
      bid: { count: 5, face: 3 },
    });
    const next = s.currentSeat;
    s = apply(s,{ type: 'call', bySeat: next, kind: 'spotOn' });
    expect(s.lastReveal!.callerWon).toBe(true);
    expect(s.lastReveal!.loserSeat).toBe(leader);
  });
});
