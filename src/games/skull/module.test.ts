import { describe, expect, it } from 'vitest';
import { skullModule } from './module';
import type { SkullOptions } from './module';
import type { SkullAction } from './actions';
import type { SkullPrivateState } from './state';

function apply(state: SkullPrivateState, action: SkullAction): SkullPrivateState {
  return skullModule.applyAction(state, action, '');
}

function startGame(players = 4, target: 1 | 2 | 3 = 2): SkullPrivateState {
  const opts: SkullOptions = {
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i + 1}`,
      isAI: false,
    })),
    challengeTarget: target,
  };
  return skullModule.createInitialState({
    gameId: 'skull',
    seats: [],
    seed: 12345,
    gameOptions: opts as unknown as Record<string, unknown>,
  });
}

describe('Skull engine', () => {
  it('starts in placeOpening with no stacks', () => {
    const s = startGame();
    expect(s.phase).toBe('placeOpening');
    for (const p of Object.values(s.players)) {
      expect(p.stack.length).toBe(0);
      expect(p.remaining.roses).toBe(3);
      expect(p.remaining.skulls).toBe(1);
    }
  });

  it('moves to placing phase once every seat has placed', () => {
    let s = startGame(3);
    // 3 placements (rose each).
    for (let i = 0; i < 3; i++) {
      s = apply(s, {
        type: 'placeDisk',
        bySeat: s.currentSeat,
        disk: 'rose',
      });
    }
    expect(s.phase).toBe('placing');
  });

  it('viewFor redacts opponent stacks', () => {
    let s = startGame(3);
    for (let i = 0; i < 3; i++) {
      s = apply(s, {
        type: 'placeDisk',
        bySeat: s.currentSeat,
        disk: 'rose',
      });
    }
    // Seat 0's view.
    const v0 = skullModule.viewFor(s, 0);
    expect(v0.yourStack).toEqual(['rose']);
    expect(v0.players[1]!.stackSize).toBe(1);
    // Seat 1's view shouldn't reveal seat 0's stack.
    const v1 = skullModule.viewFor(s, 1);
    expect(v1.yourStack).toEqual(['rose']);
    // No leakage path: opponents only get stackSize.
    expect(v1.players[0]!.stackSize).toBe(1);
  });

  it('successful challenge awards a win counter', () => {
    let s = startGame(3, 1); // target 1 → match-ends-on-first-success
    // Every seat places rose (so total table = 3 roses).
    for (let i = 0; i < 3; i++) {
      s = apply(s, {
        type: 'placeDisk',
        bySeat: s.currentSeat,
        disk: 'rose',
      });
    }
    expect(s.phase).toBe('placing');
    const opener = s.currentSeat;
    // Opener bids 3 (max) → immediate challenge.
    s = apply(s, { type: 'openBid', bySeat: opener, bid: 3 });
    expect(s.phase).toBe('revealing');
    // Flip 3 times — all should be roses.
    s = apply(s, { type: 'flipNext', bySeat: opener });
    // Now ownStackCleared; need to pick another seat.
    expect(s.ownStackCleared).toBe(true);
    const candidate = (opener + 1) % 3;
    s = apply(s, {
      type: 'flipNext',
      bySeat: opener,
      fromSeat: candidate,
    });
    const candidate2 = (opener + 2) % 3;
    s = apply(s, {
      type: 'flipNext',
      bySeat: opener,
      fromSeat: candidate2,
    });
    expect(s.phase).toBe('gameOver');
    expect(s.matchWinners).toEqual([opener]);
  });

  it('failed challenge costs the challenger a rose', () => {
    let s = startGame(3, 2);
    // Seat 0 places skull; others place roses.
    s = apply(s, {
      type: 'placeDisk',
      bySeat: s.currentSeat,
      disk: 'skull',
    });
    while (s.phase === 'placeOpening') {
      s = apply(s, {
        type: 'placeDisk',
        bySeat: s.currentSeat,
        disk: 'rose',
      });
    }
    expect(s.phase).toBe('placing');
    // Whoever opens bids 3 (full table). If that opener is seat 0, they hit
    // their own skull first; if it's someone else, they hit seat 0's skull
    // after their own. Either way → fail.
    const opener = s.currentSeat;
    const initialRoses = s.players[opener]!.remaining.roses;
    s = apply(s, { type: 'openBid', bySeat: opener, bid: 3 });
    expect(s.phase).toBe('revealing');
    // Keep flipping until phase changes.
    while (s.phase === 'revealing') {
      const myStackSize = s.players[opener]!.stack.length;
      if (!s.ownStackCleared && myStackSize > 0) {
        s = apply(s, { type: 'flipNext', bySeat: opener });
      } else {
        // Pick the first non-self seat with disks.
        const nextSeat = s.seats
          .map((x) => x.index)
          .find(
            (i) => i !== opener && s.players[i]!.stack.length > 0,
          );
        if (nextSeat === undefined) break;
        s = apply(s, {
          type: 'flipNext',
          bySeat: opener,
          fromSeat: nextSeat,
        });
      }
    }
    expect(s.phase).toBe('roundOver');
    const last = s.history[s.history.length - 1]!;
    expect(last.success).toBe(false);
    // Challenger should lose a disk (rose preferred).
    expect(
      s.players[opener]!.remaining.roses + s.players[opener]!.remaining.skulls,
    ).toBeLessThan(initialRoses + 1);
  });
});
