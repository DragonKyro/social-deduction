import { describe, expect, it } from 'vitest';
import { liarsDiceModule } from './module';
import type { LiarsDiceOptions } from './module';
import type { LiarsDiceAction } from './actions';
import { aiChooseAction } from './ai';
import { isLegalRaise } from './rules';
import type { DieFace, LiarsDicePrivateState } from './state';

function apply(state: LiarsDicePrivateState, action: LiarsDiceAction): LiarsDicePrivateState {
  return liarsDiceModule.applyAction(state, action, '');
}

function start(
  players = 3,
  opts: Partial<Omit<LiarsDiceOptions, 'players'>> = {},
  seed = 42,
): LiarsDicePrivateState {
  const options: LiarsDiceOptions = {
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: false })),
    wildOnes: true,
    spotOn: true,
    startingDice: 5,
    ...opts,
  };
  return liarsDiceModule.createInitialState({
    gameId: 'liars-dice',
    seats: [],
    seed,
    gameOptions: options as unknown as Record<string, unknown>,
  });
}

function withDice(s: LiarsDicePrivateState, dice: Record<number, DieFace[]>): LiarsDicePrivateState {
  const players = { ...s.players };
  for (const [k, d] of Object.entries(dice)) {
    players[Number(k)] = { ...players[Number(k)]!, dice: d, diceCount: d.length };
  }
  return { ...s, players };
}

function ackAll(s: LiarsDicePrivateState): LiarsDicePrivateState {
  let st = s;
  for (const seat of st.seats.map((x) => x.index)) {
    if (st.players[seat]!.eliminated) continue;
    if (st.phase === 'rollPending' && !st.players[seat]!.rollAcked) st = apply(st, { type: 'ackRoll', bySeat: seat });
    else if (st.phase === 'revealing' && !st.revealAcked[seat]) st = apply(st, { type: 'ackReveal', bySeat: seat });
    else if (st.phase === 'roundOver' && !st.roundOverAcked[seat]) st = apply(st, { type: 'ackRoundOver', bySeat: seat });
  }
  return st;
}

/** Bidding state with the given dice and a forced leader. */
function bidding(dice: Record<number, DieFace[]>, opts: Partial<Omit<LiarsDiceOptions, 'players'>> = {}) {
  const n = Object.keys(dice).length;
  let s = withDice(start(n, opts), dice);
  s = { ...s, roundLeader: 0, currentSeat: 0 };
  return ackAll(s);
}

describe("Liar's Dice — basics", () => {
  it('starts in rollPending with 5 dice each', () => {
    const s = start();
    expect(s.phase).toBe('rollPending');
    for (const p of Object.values(s.players)) {
      expect(p.dice.length).toBe(5);
      expect(p.diceCount).toBe(5);
    }
  });

  it('moves to bidding after all roll acks', () => {
    let s = start();
    for (let i = 0; i < 3; i++) s = apply(s, { type: 'ackRoll', bySeat: i });
    expect(s.phase).toBe('bidding');
  });

  it('resolves a liar call correctly', () => {
    let s = bidding({ 0: [2, 2, 2, 2, 2], 1: [3, 3, 3, 3, 3] });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 8, face: 6 } });
    s = apply(s, { type: 'call', bySeat: 1, kind: 'liar' });
    expect(s.phase).toBe('revealing');
    expect(s.lastReveal!.callerWon).toBe(true);
    expect(s.lastReveal!.loserSeat).toBe(0);
    expect(s.lastReveal!.bidder).toBe(0);
    expect(s.players[0]!.diceCount).toBe(4);
  });

  it('wildOnes rule counts 1s for non-1 bid faces', () => {
    let s = bidding({ 0: [1, 1, 1, 1, 1], 1: [3, 3, 3, 3, 3] });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 8, face: 3 } });
    s = apply(s, { type: 'call', bySeat: 1, kind: 'liar' });
    expect(s.lastReveal!.actual).toBe(10);
    expect(s.lastReveal!.callerWon).toBe(false);
    expect(s.lastReveal!.loserSeat).toBe(1);
  });

  it('a bid on 1s counts only 1s', () => {
    let s = bidding({ 0: [1, 1, 3, 3, 3], 1: [1, 3, 3, 3, 3] });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 2, face: 3 } });
    s = apply(s, { type: 'placeBid', bySeat: 1, bid: { count: 3, face: 1 } });
    s = apply(s, { type: 'call', bySeat: 0, kind: 'liar' });
    expect(s.lastReveal!.actual).toBe(3);
    expect(s.lastReveal!.callerWon).toBe(false);
  });

  it('spot-on call wins when actual exactly matches', () => {
    let s = bidding({ 0: [2, 2, 3, 3, 3], 1: [3, 3, 4, 4, 4] });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 5, face: 3 } });
    s = apply(s, { type: 'call', bySeat: 1, kind: 'spotOn' });
    expect(s.lastReveal!.callerWon).toBe(true);
    expect(s.lastReveal!.loserSeat).toBe(0);
  });

  it('spot-on is rejected when the option is off', () => {
    let s = bidding({ 0: [2, 2, 3, 3, 3], 1: [3, 3, 4, 4, 4] }, { spotOn: false });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 5, face: 3 } });
    expect(() => apply(s, { type: 'call', bySeat: 1, kind: 'spotOn' })).toThrow();
  });

  it('cannot call before any bid; cannot bid more dice than are in play', () => {
    const s = bidding({ 0: [2, 2, 3, 3, 3], 1: [3, 3, 4, 4, 4] });
    expect(() => apply(s, { type: 'call', bySeat: 0, kind: 'liar' })).toThrow();
    expect(() => apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 11, face: 3 } })).toThrow();
  });
});

describe("Liar's Dice — bid ordering", () => {
  it('wild ones: the opening bid may not be on 1s', () => {
    expect(isLegalRaise(null, { count: 2, face: 1 }, true)).toBe(false);
    expect(isLegalRaise(null, { count: 2, face: 1 }, false)).toBe(true);
    const s = bidding({ 0: [1, 1, 1, 1, 1], 1: [3, 3, 3, 3, 3] });
    expect(() => apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 2, face: 1 } })).toThrow();
  });

  it('wild ones: switching to 1s needs at least half the count (rounded up)', () => {
    expect(isLegalRaise({ count: 5, face: 4 }, { count: 3, face: 1 }, true)).toBe(true);
    expect(isLegalRaise({ count: 5, face: 4 }, { count: 2, face: 1 }, true)).toBe(false);
    expect(isLegalRaise({ count: 6, face: 6 }, { count: 3, face: 1 }, true)).toBe(true);
    // Regression: the old ordering treated 1 as the lowest face, so any
    // higher count of 1s was "legal" and N 1s ranked below N 2s.
    expect(isLegalRaise({ count: 3, face: 1 }, { count: 3, face: 2 }, true)).toBe(false);
  });

  it('wild ones: leaving 1s needs double plus one', () => {
    expect(isLegalRaise({ count: 3, face: 1 }, { count: 7, face: 2 }, true)).toBe(true);
    expect(isLegalRaise({ count: 3, face: 1 }, { count: 6, face: 6 }, true)).toBe(false);
    expect(isLegalRaise({ count: 3, face: 1 }, { count: 4, face: 1 }, true)).toBe(true);
    expect(isLegalRaise({ count: 3, face: 1 }, { count: 3, face: 1 }, true)).toBe(false);
  });

  it('without wild ones, 1s are just the lowest face', () => {
    expect(isLegalRaise({ count: 3, face: 1 }, { count: 3, face: 2 }, false)).toBe(true);
    expect(isLegalRaise({ count: 3, face: 6 }, { count: 3, face: 1 }, false)).toBe(false);
    expect(isLegalRaise({ count: 3, face: 6 }, { count: 4, face: 1 }, false)).toBe(true);
  });

  it('standard raise: more dice, or same dice and a higher face', () => {
    expect(isLegalRaise({ count: 3, face: 4 }, { count: 3, face: 5 }, true)).toBe(true);
    expect(isLegalRaise({ count: 3, face: 4 }, { count: 3, face: 4 }, true)).toBe(false);
    expect(isLegalRaise({ count: 3, face: 4 }, { count: 3, face: 3 }, true)).toBe(false);
    expect(isLegalRaise({ count: 3, face: 4 }, { count: 4, face: 2 }, true)).toBe(true);
  });

  it('rejects malformed bids from the wire', () => {
    const s = bidding({ 0: [2, 2, 3, 3, 3], 1: [3, 3, 4, 4, 4] });
    const bad = [
      { count: 2.5, face: 3 },
      { count: 3, face: 7 },
      { count: 0, face: 3 },
      { count: '3', face: 3 },
      null,
    ];
    for (const bid of bad) {
      expect(() =>
        apply(s, { type: 'placeBid', bySeat: 0, bid } as unknown as LiarsDiceAction),
      ).toThrow();
    }
  });
});

describe("Liar's Dice — validation & flow", () => {
  it('rejects acting out of turn, unknown seats, double acks and eliminated seats', () => {
    let s = start(3);
    expect(() => apply(s, { type: 'ackRoll', bySeat: 7 })).toThrow();
    expect(() => apply(s, { type: 'ackRoll', bySeat: -1 })).toThrow();
    s = apply(s, { type: 'ackRoll', bySeat: 0 });
    expect(() => apply(s, { type: 'ackRoll', bySeat: 0 })).toThrow();

    let b = bidding({ 0: [2, 2, 3, 3, 3], 1: [3, 3, 4, 4, 4], 2: [5, 5, 5, 6, 6] });
    expect(() => apply(b, { type: 'placeBid', bySeat: 1, bid: { count: 2, face: 3 } })).toThrow();
    b = apply(b, { type: 'placeBid', bySeat: 0, bid: { count: 2, face: 3 } });
    expect(() => apply(b, { type: 'call', bySeat: 2, kind: 'liar' })).toThrow();

    // Eliminated seats may not ack.
    const elim = {
      ...b,
      players: { ...b.players, 2: { ...b.players[2]!, eliminated: true, diceCount: 0, dice: [] } },
      currentSeat: 1,
    };
    const r = apply(elim, { type: 'call', bySeat: 1, kind: 'liar' });
    expect(() => apply(r, { type: 'ackReveal', bySeat: 2 })).toThrow();
  });

  it('the loser starts the next round', () => {
    let s = bidding({ 0: [2, 2, 2, 2, 2], 1: [3, 3, 3, 3, 3], 2: [4, 4, 4, 4, 4] });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 3, face: 2 } });
    s = apply(s, { type: 'call', bySeat: 1, kind: 'liar' }); // true bid → caller (1) loses
    expect(s.lastReveal!.loserSeat).toBe(1);
    s = ackAll(s); // → roundOver
    expect(s.phase).toBe('roundOver');
    s = ackAll(s); // → reroll
    expect(s.phase).toBe('rollPending');
    expect(s.roundLeader).toBe(1);
    expect(s.players[1]!.dice.length).toBe(4);
    expect(s.roundBids).toEqual([]);
  });

  it('an eliminated loser hands the lead to the next live seat and the match can end', () => {
    let s = bidding({ 0: [2], 1: [3, 3], 2: [4] });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 3, face: 6 } });
    s = apply(s, { type: 'call', bySeat: 1, kind: 'liar' });
    expect(s.players[0]!.eliminated).toBe(true);
    s = ackAll(s);
    expect(s.history.at(-1)!.eliminatedThisRound).toEqual([0]);
    s = ackAll(s);
    expect(s.roundLeader).toBe(1);

    // Seat 2 (1 die) loses → only seat 1 remains.
    s = ackAll(s);
    s = { ...s, currentSeat: 1 };
    s = withDice(s, { 1: [3, 3], 2: [4] });
    s = apply(s, { type: 'placeBid', bySeat: 1, bid: { count: 2, face: 3 } });
    s = apply(s, { type: 'call', bySeat: 2, kind: 'liar' });
    s = ackAll(s);
    expect(s.phase).toBe('gameOver');
    expect(s.matchWinners).toEqual([1]);
    expect(liarsDiceModule.isFinished(s)).toBe(true);
    expect(() => apply(s, { type: 'ackRoundOver', bySeat: 1 })).toThrow();
  });
});

describe("Liar's Dice — redaction", () => {
  it('viewFor redacts opponent dice', () => {
    const s = start();
    const v0 = liarsDiceModule.viewFor(s, 0);
    expect(v0.yourDice.length).toBe(5);
    expect(v0.players[1]!.diceCount).toBe(5);
    expect((v0.players[1]! as unknown as { dice?: unknown }).dice).toBeUndefined();
    expect(v0.lastReveal).toBeNull();
  });

  it("a seat's view is identical whatever the other seats rolled", () => {
    const base = bidding({ 0: [2, 2, 3, 3, 3], 1: [3, 3, 4, 4, 4], 2: [5, 5, 5, 6, 6] });
    const s1 = apply(base, { type: 'placeBid', bySeat: 0, bid: { count: 3, face: 3 } });
    const s2 = withDice(s1, { 0: [6, 6, 6, 6, 6], 2: [1, 1, 1, 1, 1] });
    expect(liarsDiceModule.viewFor(s2, 1)).toEqual(liarsDiceModule.viewFor(s1, 1));
    expect(liarsDiceModule.viewFor(s2, null)).toEqual(liarsDiceModule.viewFor(s1, null));
  });

  it('spectators see no live dice and no seed / cursor', () => {
    const s = start(4);
    const spec = liarsDiceModule.viewFor(s, null);
    expect(spec.yourDice).toEqual([]);
    expect(spec.yourSeat).toBeNull();
    const json = JSON.stringify(spec) + JSON.stringify(liarsDiceModule.viewFor(s, 0));
    expect(json).not.toMatch(/seed|rngCursor|"dice"/);
  });

  it("the next round's fresh dice never ride along in the old reveal", () => {
    let s = bidding({ 0: [2, 2, 2, 2, 2], 1: [3, 3, 3, 3, 3] });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 9, face: 6 } });
    s = apply(s, { type: 'call', bySeat: 1, kind: 'liar' });
    s = ackAll(ackAll(s)); // → next round rollPending
    expect(s.phase).toBe('rollPending');
    const v1 = liarsDiceModule.viewFor(s, 1);
    expect(v1.lastReveal).toBeNull();
    expect(v1.history[0]!.reveal.allDice[0]).toEqual([2, 2, 2, 2, 2]);
    // And seat 1's view is invariant to seat 0's brand-new roll.
    const tweaked = withDice(s, { 0: [6, 6, 6, 6] });
    expect(liarsDiceModule.viewFor(tweaked, 1)).toEqual(v1);
  });

  it('the view is a copy: mutating it cannot touch host state', () => {
    let s = bidding({ 0: [2, 2, 2, 2, 2], 1: [3, 3, 3, 3, 3] });
    s = apply(s, { type: 'placeBid', bySeat: 0, bid: { count: 9, face: 6 } });
    s = apply(s, { type: 'call', bySeat: 1, kind: 'liar' });
    const v = liarsDiceModule.viewFor(s, 1);
    v.lastReveal!.allDice[0]!.push(6);
    v.yourDice.push(6);
    expect(s.lastReveal!.allDice[0]).toEqual([2, 2, 2, 2, 2]);
    expect(s.players[1]!.dice).toEqual([3, 3, 3, 3, 3]);
  });
});

describe("Liar's Dice — AI", () => {
  it("AI decisions don't depend on opponents' hidden dice", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let s = ackAll(start(4, {}, seed));
      for (let turn = 0; turn < 4 && s.phase === 'bidding'; turn++) {
        const seat = s.currentSeat;
        const a = aiChooseAction(s, seat);
        const scrambled = { ...s, players: { ...s.players } };
        for (const other of s.seats.map((x) => x.index)) {
          if (other === seat) continue;
          const p = s.players[other]!;
          scrambled.players[other] = { ...p, dice: p.dice.map((d) => ((d % 6) + 1) as DieFace) };
        }
        expect(aiChooseAction(scrambled, seat)).toEqual(a);
        if (!a || a.type !== 'placeBid') break;
        s = apply(s, a);
      }
    }
  });

  it('AI only acts when its seat must', () => {
    const s = ackAll(start(3));
    for (const seat of [0, 1, 2]) {
      const a = aiChooseAction(s, seat);
      if (seat === s.currentSeat) expect(a).not.toBeNull();
      else expect(a).toBeNull();
    }
    const fresh = start(3);
    expect(aiChooseAction(fresh, 0)).toEqual({ type: 'ackRoll', bySeat: 0 });
    const acked = apply(fresh, { type: 'ackRoll', bySeat: 0 });
    expect(aiChooseAction(acked, 0)).toBeNull();
  });

  it('never opens on 1s with wild ones and never spot-ons when disabled', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const s = ackAll(start(3, { spotOn: false }, seed));
      const a = aiChooseAction(s, s.currentSeat)!;
      expect(a.type).toBe('placeBid');
      if (a.type === 'placeBid') expect(a.bid.face).not.toBe(1);
    }
  });

  function selfPlay(seed: number, players: number, opts: Partial<Omit<LiarsDiceOptions, 'players'>> = {}) {
    let s = start(players, opts, seed);
    let cursor = 0;
    let steps = 0;
    while (!liarsDiceModule.isFinished(s)) {
      let acted = false;
      for (let k = 0; k < players; k++) {
        const seat = (cursor + k) % players;
        const a = liarsDiceModule.aiChooseAction!(s, seat);
        if (!a) continue;
        expect(a.bySeat).toBe(seat);
        s = liarsDiceModule.applyAction(s, a, `ai:${seat}`);
        cursor = (seat + 1) % players;
        acted = true;
        break;
      }
      if (!acted) throw new Error(`stalled in ${s.phase} (seed ${seed})`);
      if (++steps > 20000) throw new Error(`did not finish (seed ${seed})`);
    }
    return s;
  }

  it('all-AI self-play finishes for many seeds and option mixes', () => {
    const combos: Array<[number, Partial<Omit<LiarsDiceOptions, 'players'>>]> = [
      [2, {}],
      [3, { wildOnes: false }],
      [4, { spotOn: false }],
      [6, {}],
      [8, { wildOnes: false, spotOn: false }],
    ];
    for (const [players, opts] of combos) {
      for (const seed of [101, 202, 303, 404]) {
        const end = selfPlay(seed, players, opts);
        expect(end.matchWinners.length).toBe(1);
        const alive = end.seats.filter((x) => !end.players[x.index]!.eliminated);
        expect(alive.map((x) => x.index)).toEqual(end.matchWinners);
      }
    }
  });
});
