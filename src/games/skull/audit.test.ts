import { describe, expect, it } from 'vitest';
import type { SeatIndex } from '@/engine/types';
import { skullModule } from './module';
import type { SkullOptions } from './module';
import type { SkullAction } from './actions';
import type { Disk, PlayerState, SkullPrivateState } from './state';
import { chooseFromView } from './ai';

// Audit regressions: rules fixes, hidden-info redaction, validation, AI
// fairness and all-AI self-play. Basic flow tests live in module.test.ts.

function apply(state: SkullPrivateState, action: SkullAction): SkullPrivateState {
  return skullModule.applyAction(state, action, '');
}

function startGame(players = 4, seed = 12345, target: 1 | 2 | 3 = 2): SkullPrivateState {
  const opts: SkullOptions = {
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: true })),
    challengeTarget: target,
  };
  return skullModule.createInitialState({
    gameId: 'skull',
    seats: [],
    seed,
    gameOptions: opts as unknown as Record<string, unknown>,
  });
}

const count = (ds: Disk[], d: Disk) => ds.filter((x) => x === d).length;

// A table in the `placing` phase with the given face-down stacks. `owned`
// optionally overrides how many disks each seat owns in total.
function tableWith(
  stacks: Disk[][],
  opts: { leader?: SeatIndex; seed?: number; owned?: Array<{ roses: number; skulls: number }> } = {},
): SkullPrivateState {
  const leader = opts.leader ?? 0;
  const s = startGame(stacks.length, opts.seed ?? 12345);
  const players: Record<SeatIndex, PlayerState> = {};
  stacks.forEach((stack, i) => {
    const own = opts.owned?.[i] ?? { roses: 3, skulls: 1 };
    players[i] = {
      ...s.players[i]!,
      stack: stack.slice(),
      remaining: { roses: own.roses - count(stack, 'rose'), skulls: own.skulls - count(stack, 'skull') },
    };
  });
  return { ...s, players, phase: 'placing', currentSeat: leader, roundLeader: leader };
}

function totalOwned(p: PlayerState): number {
  return p.remaining.roses + p.remaining.skulls + p.stack.length + p.revealed.length;
}

function ackAll(s: SkullPrivateState): SkullPrivateState {
  let t = s;
  for (const seat of t.seats) {
    if (t.phase !== 'roundOver') break;
    if (!t.players[seat.index]!.eliminated) t = apply(t, { type: 'ackRoundOver', bySeat: seat.index });
  }
  return t;
}

function playAllAI(n: number, seed: number, onStep?: (s: SkullPrivateState) => void): SkullPrivateState {
  let s = startGame(n, seed);
  let steps = 0;
  while (!skullModule.isFinished(s)) {
    if (++steps > 20000) throw new Error(`stalled in ${s.phase} (seed ${seed})`);
    let progressed = false;
    for (const seat of s.seats) {
      const action = skullModule.aiChooseAction!(s, seat.index);
      if (!action) continue;
      expect(action.bySeat).toBe(seat.index);
      s = apply(s, action);
      onStep?.(s);
      progressed = true;
      break;
    }
    if (!progressed) throw new Error(`AI deadlock in ${s.phase} (seed ${seed})`);
  }
  return s;
}

describe('Skull — flipped disks stay with their owner (bug: every flip destroyed a disk)', () => {
  it('a successful challenge leaves everyone with all four disks', () => {
    let s = tableWith([['rose'], ['rose'], ['rose']]);
    s = apply(s, { type: 'openBid', bySeat: 0, bid: 3 });
    s = apply(s, { type: 'flipNext', bySeat: 0 });
    s = apply(s, { type: 'flipNext', bySeat: 0, fromSeat: 1 });
    s = apply(s, { type: 'flipNext', bySeat: 0, fromSeat: 2 });
    expect(s.phase).toBe('roundOver');
    for (const seat of [0, 1, 2]) {
      expect(s.players[seat]!.remaining).toEqual({ roses: 3, skulls: 1 });
      expect(skullModule.viewFor(s, 1).players[seat]!.disksTotal).toBe(4);
    }
    s = ackAll(s);
    expect(s.phase).toBe('placeOpening');
    expect(s.currentSeat).toBe(0); // the challenger starts the next round
  });
});

describe("Skull — hitting someone else's skull (bug: engine always took a rose and announced it)", () => {
  function failOnSeat1(seed: number) {
    let s = tableWith([['rose'], ['skull'], ['rose']], { seed });
    s = apply(s, { type: 'openBid', bySeat: 0, bid: 2 });
    s = apply(s, { type: 'passBid', bySeat: 1 });
    s = apply(s, { type: 'passBid', bySeat: 2 });
    expect(s.phase).toBe('revealing');
    s = apply(s, { type: 'flipNext', bySeat: 0 });
    return apply(s, { type: 'flipNext', bySeat: 0, fromSeat: 1 });
  }

  it('removes a random disk that only the challenger learns', () => {
    const s = failOnSeat1(1);
    expect(s.phase).toBe('roundOver');
    const r = s.history[s.history.length - 1]!;
    expect(r).toMatchObject({ success: false, skullOwner: 1, loserSeat: 0, lossMethod: 'random' });
    expect(r.diskLost).not.toBeNull();
    // Every disk is back in hand; table shows nothing that hints at it.
    for (const seat of [0, 1, 2]) expect(s.players[seat]!.stack).toEqual([]);
    expect(totalOwned(s.players[0]!)).toBe(3);
    expect(skullModule.viewFor(s, 0).lastRound!.diskLost).toBe(r.diskLost);
    for (const seat of [1, 2, null] as const) {
      const v = skullModule.viewFor(s, seat);
      expect(v.lastRound!.diskLost).toBeNull();
      expect(v.history.every((h) => h.diskLost === null)).toBe(true);
      expect(v.players[0]!.disksTotal).toBe(3);
      expect(JSON.stringify(v)).not.toMatch(/"diskLost":"/);
    }
  });

  it('is genuinely random (sometimes the skull goes)', () => {
    const lost = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) lost.add(failOnSeat1(seed).history.at(-1)!.diskLost!);
    expect(lost).toEqual(new Set(['rose', 'skull']));
  });

  it("if that knocks the challenger out, the skull's owner starts the next round", () => {
    let s = tableWith([['rose'], ['rose'], ['skull']], {
      leader: 0,
      owned: [{ roses: 1, skulls: 0 }, { roses: 3, skulls: 1 }, { roses: 3, skulls: 1 }],
    });
    s = apply(s, { type: 'openBid', bySeat: 0, bid: 3 });
    s = apply(s, { type: 'flipNext', bySeat: 0 });
    s = apply(s, { type: 'flipNext', bySeat: 0, fromSeat: 2 });
    expect(s.players[0]!.eliminated).toBe(true);
    expect(s.history.at(-1)).toMatchObject({ eliminatedSeat: 0, nextLeader: 2 });
    s = ackAll(s);
    expect(s.phase).toBe('placeOpening');
    expect(s.currentSeat).toBe(2);
  });
});

describe('Skull — hitting your own skull', () => {
  it('lets the challenger choose the discard, hidden from everyone else', () => {
    let s = tableWith([['rose', 'skull'], ['rose'], ['rose']]);
    s = apply(s, { type: 'openBid', bySeat: 0, bid: 1 });
    s = apply(s, { type: 'passBid', bySeat: 1 });
    s = apply(s, { type: 'passBid', bySeat: 2 });
    s = apply(s, { type: 'flipNext', bySeat: 0 }); // top of own stack = skull
    expect(s.phase).toBe('discarding');
    expect(() => apply(s, { type: 'discardDisk', bySeat: 1, disk: 'rose' })).toThrow();
    s = apply(s, { type: 'discardDisk', bySeat: 0, disk: 'skull' });
    expect(s.phase).toBe('roundOver');
    expect(s.players[0]!.remaining).toEqual({ roses: 3, skulls: 0 });
    expect(s.history.at(-1)).toMatchObject({ lossMethod: 'chosen', diskLost: 'skull', skullOwner: 0 });
    expect(skullModule.viewFor(s, 1).lastRound!.diskLost).toBeNull();
    expect(skullModule.viewFor(s, 0).yourRemaining).toEqual({ roses: 3, skulls: 0 });
    expect(skullModule.viewFor(s, 1).yourRemaining).toEqual({ roses: 3, skulls: 1 });
  });

  it('knocked out by your own last disk → you choose who starts next', () => {
    let s = tableWith([['skull'], ['rose'], ['rose']], {
      owned: [{ roses: 0, skulls: 1 }, { roses: 3, skulls: 1 }, { roses: 3, skulls: 1 }],
    });
    s = apply(s, { type: 'openBid', bySeat: 0, bid: 3 });
    s = apply(s, { type: 'flipNext', bySeat: 0 });
    expect(s.phase).toBe('chooseLeader');
    expect(s.players[0]!.eliminated).toBe(true);
    expect(() => apply(s, { type: 'chooseLeader', bySeat: 0, seat: 0 })).toThrow();
    expect(skullModule.aiChooseAction!(s, 0)?.type).toBe('chooseLeader');
    s = apply(s, { type: 'chooseLeader', bySeat: 0, seat: 2 });
    expect(s.phase).toBe('roundOver');
    expect(s.history.at(-1)).toMatchObject({ eliminatedSeat: 0, nextLeader: 2 });
    expect(() => apply(s, { type: 'ackRoundOver', bySeat: 0 })).toThrow();
    s = ackAll(s);
    expect(s.currentSeat).toBe(2);
  });
});

describe('Skull — last player standing (bug: game continued with one player)', () => {
  it('wins the match outright', () => {
    let s = tableWith([['rose'], ['skull'], ['rose']], {
      owned: [{ roses: 1, skulls: 0 }, { roses: 3, skulls: 1 }, { roses: 0, skulls: 0 }],
    });
    // Seat 2 is already out.
    s = { ...s, players: { ...s.players, 2: { ...s.players[2]!, stack: [], remaining: { roses: 0, skulls: 0 }, eliminated: true } } };
    s = apply(s, { type: 'openBid', bySeat: 0, bid: 2 });
    s = apply(s, { type: 'flipNext', bySeat: 0 });
    s = apply(s, { type: 'flipNext', bySeat: 0, fromSeat: 1 });
    expect(s.phase).toBe('gameOver');
    expect(s.matchWinners).toEqual([1]);
  });
});

describe('Skull — validation', () => {
  it('rejects bad seats, fractional or oversize bids and out-of-order flips', () => {
    let s = tableWith([['rose', 'rose'], ['rose'], ['rose']]);
    expect(() => apply(s, { type: 'placeDisk', bySeat: 9, disk: 'rose' })).toThrow();
    expect(() => apply(s, { type: 'placeDisk', bySeat: 0, disk: 'gold' as Disk })).toThrow();
    expect(() => apply(s, { type: 'openBid', bySeat: 0, bid: 1.5 })).toThrow();
    expect(() => apply(s, { type: 'openBid', bySeat: 0, bid: 5 })).toThrow();
    expect(() => apply(s, { type: 'openBid', bySeat: 1, bid: 1 })).toThrow();
    s = apply(s, { type: 'openBid', bySeat: 0, bid: 1 });
    expect(() => apply(s, { type: 'raiseBid', bySeat: 1, bid: 2.5 })).toThrow();
    expect(() => apply(s, { type: 'raiseBid', bySeat: 1, bid: 1 })).toThrow();
    expect(() => apply(s, { type: 'raiseBid', bySeat: 2, bid: 2 })).toThrow();
    s = apply(s, { type: 'raiseBid', bySeat: 1, bid: 3 });
    s = apply(s, { type: 'passBid', bySeat: 2 });
    s = apply(s, { type: 'passBid', bySeat: 0 });
    expect(s.phase).toBe('revealing');
    expect(s.challenger).toBe(1);
    // Own stack first.
    expect(() => apply(s, { type: 'flipNext', bySeat: 1, fromSeat: 0 })).toThrow();
    expect(() => apply(s, { type: 'flipNext', bySeat: 0 })).toThrow();
    s = apply(s, { type: 'flipNext', bySeat: 1 });
    expect(() => apply(s, { type: 'flipNext', bySeat: 1 })).toThrow();
    expect(() => apply(s, { type: 'flipNext', bySeat: 1, fromSeat: 1 })).toThrow();
    expect(() => apply(s, { type: 'flipNext', bySeat: 1, fromSeat: 7 })).toThrow();
    s = apply(s, { type: 'flipNext', bySeat: 1, fromSeat: 0 });
    expect(s.phase).toBe('revealing');
  });
});

describe('Skull — redaction invariants across whole AI games', () => {
  it('no view carries stack contents, disk splits, the seed or a lost disk', () => {
    for (const seed of [11, 222, 3333]) {
      for (const n of [3, 4, 6]) {
        playAllAI(n, seed, (s) => {
          for (const seat of [...s.seats.map((x) => x.index), null]) {
            const v = skullModule.viewFor(s, seat);
            expect(JSON.stringify(v)).not.toMatch(/"(stack|remaining|seed|rngCursor|pendingSummary)":/);
            for (const h of v.history) {
              if (h.diskLost !== null) expect(h.loserSeat).toBe(seat);
            }
            if (seat === null) {
              expect(v.yourStack).toEqual([]);
              expect(v.yourRemaining).toEqual({ roses: 0, skulls: 0 });
            } else {
              expect(v.yourStack).toEqual(s.players[seat]!.stack);
            }
            // Counts are consistent with what's really there.
            for (const p of v.players) expect(p.disksTotal).toBe(totalOwned(s.players[p.index]!));
          }
        });
      }
    }
  });
});

describe('Skull — AI fairness (bug: AI read opponents’ remaining skulls)', () => {
  it('flip choice is the same whether or not an opponent holds a skull', () => {
    // Two tables identical from seat 0's point of view; only the hidden
    // contents of seats 1 and 2 differ.
    const a = tableWith([['rose'], ['rose', 'skull'], ['rose', 'rose']]);
    const b = tableWith([['rose'], ['rose', 'rose'], ['rose', 'skull']]);
    const toReveal = (s: SkullPrivateState) => {
      let t = apply(s, { type: 'openBid', bySeat: 0, bid: 5 });
      t = apply(t, { type: 'flipNext', bySeat: 0 });
      return t;
    };
    const ra = toReveal(a);
    const rb = toReveal(b);
    expect(skullModule.viewFor(ra, 0)).toEqual(skullModule.viewFor(rb, 0));
    expect(skullModule.aiChooseAction!(ra, 0)).toEqual(skullModule.aiChooseAction!(rb, 0));
  });

  it('bidding decisions ignore hidden opponent disks', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = tableWith([['rose', 'rose'], ['skull'], ['rose']], { seed, leader: 0 });
      const b = tableWith([['rose', 'rose'], ['rose'], ['skull']], { seed: seed + 1000, leader: 0 });
      expect(skullModule.viewFor(a, 0)).toEqual(skullModule.viewFor(b, 0));
      expect(skullModule.aiChooseAction!(a, 0)).toEqual(skullModule.aiChooseAction!(b, 0));
    }
  });

  it('never bids past a skull of its own when it can avoid it', () => {
    const s = tableWith([['skull', 'rose'], ['rose'], ['rose']]);
    let t = apply(s, { type: 'openBid', bySeat: 0, bid: 1 });
    t = { ...t, currentBidder: 1, currentBid: 2, currentSeat: 0, phase: 'bidding' };
    // Seat 0 has one safe rose on top of its skull: raising to 3 is a
    // certain loss, and too close to the table total (4) to be a bait raise.
    const act = chooseFromView(skullModule.viewFor(t, 0), 0);
    expect(act).toEqual({ type: 'passBid', bySeat: 0 });
  });

  it('returns null when it has nothing to do', () => {
    const s = tableWith([['rose'], ['rose'], ['rose']]);
    expect(skullModule.aiChooseAction!(s, 1)).toBeNull();
    expect(skullModule.aiChooseAction!(s, 2)).toBeNull();
  });
});

describe('Skull — all-AI self-play', () => {
  it('finishes full matches for 3–6 players over many seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const n of [3, 4, 5, 6]) {
        const s = playAllAI(n, seed * 104729);
        expect(s.phase).toBe('gameOver');
        expect(s.matchWinners.length).toBe(1);
        const w = s.players[s.matchWinners[0]!]!;
        const alive = s.seats.filter((x) => !s.players[x.index]!.eliminated).length;
        expect(w.wins >= s.challengeTarget || alive === 1).toBe(true);
      }
    }
  });
});
