import { describe, expect, it } from 'vitest';
import { cockroachPokerModule } from './module';
import type { CockroachPokerAction } from './actions';
import { aiChooseAction, pClaimTrue } from './ai';
import { emptyRow } from './setup';
import { CREATURES } from './state';
import type { CockroachPokerPrivateState, Creature } from './state';

const M = cockroachPokerModule;

function apply(s: CockroachPokerPrivateState, a: CockroachPokerAction): CockroachPokerPrivateState {
  return M.applyAction(s, a, '');
}

function start(players = 4, seed = 42): CockroachPokerPrivateState {
  return M.createInitialState({
    gameId: 'cockroach-poker',
    seats: [],
    seed,
    gameOptions: {
      players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: false })),
    },
  });
}

function ackAll(s: CockroachPokerPrivateState): CockroachPokerPrivateState {
  let st = s;
  for (const x of st.seats) {
    if (st.players[x.index]!.lost) continue;
    if (st.phase === 'dealPending' && !st.players[x.index]!.dealAcked) st = apply(st, { type: 'ackDeal', bySeat: x.index });
    else if (st.phase === 'revealing' && !st.revealAcked[x.index]) st = apply(st, { type: 'ackReveal', bySeat: x.index });
  }
  return st;
}

/** Passing phase, seat 0 to act, with the given hands. */
function passing(hands: Record<number, Creature[]>): CockroachPokerPrivateState {
  const n = Object.keys(hands).length;
  let s = start(n);
  const players = { ...s.players };
  for (const [k, h] of Object.entries(hands)) players[Number(k)] = { ...players[Number(k)]!, hand: h };
  s = { ...s, players, currentSeat: 0 };
  return ackAll(s);
}

function setRow(s: CockroachPokerPrivateState, seat: number, row: Partial<Record<Creature, number>>) {
  return {
    ...s,
    players: { ...s.players, [seat]: { ...s.players[seat]!, row: { ...emptyRow(), ...row } } },
  };
}

const HANDS = {
  0: ['rat', 'fly', 'bat'] as Creature[],
  1: ['toad', 'toad', 'spider'] as Creature[],
  2: ['cockroach', 'stinkbug'] as Creature[],
  3: ['scorpion', 'rat'] as Creature[],
};

describe('Cockroach Poker — setup', () => {
  it('builds a 64-card deck of 8 creatures × 8 and deals evenly', () => {
    for (const [n, per] of [[3, 21], [4, 16], [5, 12], [6, 10]] as const) {
      const s = start(n, 7 + n);
      const all = Object.values(s.players).flatMap((p) => p.hand);
      for (const p of Object.values(s.players)) expect(p.hand.length).toBe(per);
      for (const c of CREATURES) expect(all.filter((x) => x === c).length).toBeLessThanOrEqual(8);
      expect(all.length).toBe(n * per);
    }
  });

  it('rejects player counts outside 3–6', () => {
    expect(() => start(2)).toThrow();
    expect(() => start(7)).toThrow();
  });

  it('starts passing only once everyone has acked the deal', () => {
    let s = start(3);
    s = apply(s, { type: 'ackDeal', bySeat: 0 });
    expect(() => apply(s, { type: 'ackDeal', bySeat: 0 })).toThrow();
    expect(() => apply(s, { type: 'ackDeal', bySeat: 9 })).toThrow();
    s = apply(s, { type: 'ackDeal', bySeat: 1 });
    expect(s.phase).toBe('dealPending');
    s = apply(s, { type: 'ackDeal', bySeat: 2 });
    expect(s.phase).toBe('passing');
  });
});

describe('Cockroach Poker — passing & calling', () => {
  it('validates startPass', () => {
    const s = passing(HANDS);
    const ok = { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 } as const;
    expect(() => apply(s, { ...ok, bySeat: 1 })).toThrow(); // not your turn
    expect(() => apply(s, { ...ok, target: 0 })).toThrow(); // self
    expect(() => apply(s, { ...ok, target: 4 })).toThrow(); // no such seat
    expect(() => apply(s, { ...ok, handIndex: 3 })).toThrow();
    expect(() => apply(s, { ...ok, handIndex: 0.5 })).toThrow(); // regression: fractional index
    expect(() => apply(s, { ...ok, claim: 'dragon' as Creature })).toThrow(); // regression: unknown creature
    const t = apply(s, ok);
    expect(t.phase).toBe('decide');
    expect(t.players[0]!.hand).toEqual(['fly', 'bat']);
    expect(t.pass!.card).toBe('rat');
    expect(t.pass!.seenBy).toEqual([0]);
  });

  it('a correct call sends the card to the claimant', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'fly', target: 1 }); // rat, lie
    s = apply(s, { type: 'decide', bySeat: 1, call: 'lie' });
    expect(s.lastReveal!.callerWon).toBe(true);
    expect(s.lastReveal!.receiver).toBe(0);
    expect(s.players[0]!.row.rat).toBe(1);
    s = ackAll(s);
    expect(s.phase).toBe('passing');
    expect(s.currentSeat).toBe(0); // the taker starts the next turn
    expect(s.turnNumber).toBe(1);
  });

  it('a wrong call keeps the card with the caller', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 }); // truth
    s = apply(s, { type: 'decide', bySeat: 1, call: 'lie' });
    expect(s.lastReveal!.callerWon).toBe(false);
    expect(s.lastReveal!.receiver).toBe(1);
    expect(s.players[1]!.row.rat).toBe(1);
    s = ackAll(s);
    expect(s.currentSeat).toBe(1);
  });

  it('only the holder may act on a passed card', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 });
    expect(() => apply(s, { type: 'decide', bySeat: 2, call: 'truth' })).toThrow();
    expect(() => apply(s, { type: 'peek', bySeat: 0 })).toThrow();
    expect(() => apply(s, { type: 'decide', bySeat: 1, call: 'maybe' as 'truth' })).toThrow();
  });
});

describe('Cockroach Poker — peek & pass on', () => {
  it('regression: the holder sees the card BEFORE choosing the new claim', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 2, claim: 'rat', target: 1 }); // bat
    expect(M.viewFor(s, 1).yourPeekedCard).toBeNull();
    s = apply(s, { type: 'peek', bySeat: 1 });
    const v1 = M.viewFor(s, 1);
    expect(v1.yourPeekedCard).toBe('bat');
    expect(v1.passHolderPeeked).toBe(true);
    // Now pass it on, choosing the claim with that knowledge.
    s = apply(s, { type: 'passOn', bySeat: 1, claim: 'toad', target: 2 });
    expect(s.pass!.holder).toBe(2);
    expect(s.pass!.seenBy).toEqual([0, 1]);
    expect(s.pass!.chain.map((h) => h.claim)).toEqual(['rat', 'toad']);
  });

  it('after peeking you must pass on; you must peek before passing on', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 });
    expect(() => apply(s, { type: 'passOn', bySeat: 1, claim: 'rat', target: 2 })).toThrow();
    s = apply(s, { type: 'peek', bySeat: 1 });
    expect(() => apply(s, { type: 'decide', bySeat: 1, call: 'truth' })).toThrow();
    expect(() => apply(s, { type: 'peek', bySeat: 1 })).toThrow();
  });

  it("can't pass to anyone who has already seen the card", () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 });
    s = apply(s, { type: 'peek', bySeat: 1 });
    expect(() => apply(s, { type: 'passOn', bySeat: 1, claim: 'rat', target: 0 })).toThrow();
    expect(() => apply(s, { type: 'passOn', bySeat: 1, claim: 'rat', target: 1 })).toThrow();
    expect(() => apply(s, { type: 'passOn', bySeat: 1, claim: 'unicorn' as Creature, target: 2 })).toThrow();
  });

  it('the last unseen holder cannot peek and must call', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 });
    s = apply(s, { type: 'peek', bySeat: 1 });
    s = apply(s, { type: 'passOn', bySeat: 1, claim: 'rat', target: 2 });
    s = apply(s, { type: 'peek', bySeat: 2 });
    s = apply(s, { type: 'passOn', bySeat: 2, claim: 'bat', target: 3 });
    expect(() => apply(s, { type: 'peek', bySeat: 3 })).toThrow();
    s = apply(s, { type: 'decide', bySeat: 3, call: 'truth' }); // it's a rat, claim "bat" → wrong
    expect(s.lastReveal!.receiver).toBe(3);
  });

  it('a correct call lands on the most recent passer, not the original sender', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 });
    s = apply(s, { type: 'peek', bySeat: 1 });
    s = apply(s, { type: 'passOn', bySeat: 1, claim: 'fly', target: 2 });
    s = apply(s, { type: 'decide', bySeat: 2, call: 'lie' });
    expect(s.lastReveal!.callerWon).toBe(true);
    expect(s.lastReveal!.claimant).toBe(1);
    expect(s.lastReveal!.receiver).toBe(1);
    expect(s.players[1]!.row.rat).toBe(1);
    expect(s.players[0]!.row.rat).toBe(0);
  });
});

describe('Cockroach Poker — losing', () => {
  it('four of one creature face-up loses the game', () => {
    let s = setRow(passing(HANDS), 1, { rat: 3 });
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 });
    s = apply(s, { type: 'decide', bySeat: 1, call: 'lie' }); // wrong → seat 1 takes 4th rat
    expect(s.phase).toBe('revealing');
    s = ackAll(s);
    expect(s.phase).toBe('gameOver');
    expect(s.loserSeat).toBe(1);
    expect(s.lossReason).toBe('fourOfAKind');
    expect(s.matchWinners).toEqual([0, 2, 3]);
    expect(M.isFinished(s)).toBe(true);
    expect(() => apply(s, { type: 'ackReveal', bySeat: 0 })).toThrow();
  });

  it('three of a kind is not a loss', () => {
    let s = setRow(passing(HANDS), 1, { rat: 2, bat: 3 });
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 });
    s = apply(s, { type: 'decide', bySeat: 1, call: 'lie' });
    s = ackAll(s);
    expect(s.phase).toBe('passing');
  });

  it('having to start a turn with an empty hand loses (regression: used to stall)', () => {
    let s = passing({ 0: ['rat'], 1: ['toad'], 2: ['bat'] });
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'fly', target: 1 });
    s = apply(s, { type: 'decide', bySeat: 1, call: 'lie' }); // correct → seat 0 takes it
    s = ackAll(s);
    expect(s.phase).toBe('gameOver');
    expect(s.loserSeat).toBe(0);
    expect(s.lossReason).toBe('emptyHand');
  });
});

describe('Cockroach Poker — redaction', () => {
  it("hands are private: a seat's view ignores everyone else's hand", () => {
    const s = passing(HANDS);
    const t = {
      ...s,
      players: {
        ...s.players,
        0: { ...s.players[0]!, hand: ['spider', 'spider', 'spider'] as Creature[] },
        2: { ...s.players[2]!, hand: ['bat', 'bat'] as Creature[] },
      },
    };
    expect(M.viewFor(t, 1)).toEqual(M.viewFor(s, 1));
    expect(M.viewFor(t, null)).toEqual(M.viewFor(s, null));
  });

  it('the in-transit card is visible only to the sender and peekers', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'fly', target: 1 });
    const swapped = { ...s, pass: { ...s.pass!, card: 'scorpion' as Creature } };
    for (const seat of [1, 2, 3, null]) {
      const v = M.viewFor(s, seat);
      expect(v.yourPeekedCard).toBeNull();
      expect(M.viewFor(swapped, seat)).toEqual(v);
      expect(JSON.stringify(v)).not.toMatch(/"card"/);
    }
    expect(M.viewFor(s, 0).yourPeekedCard).toBe('rat');
    s = apply(s, { type: 'peek', bySeat: 1 });
    expect(M.viewFor(s, 1).yourPeekedCard).toBe('rat');
    expect(M.viewFor(s, 2).yourPeekedCard).toBeNull();
  });

  it('spectators see no hands; no view carries the seed or cursor', () => {
    const s = start(5);
    const spec = M.viewFor(s, null);
    expect(spec.yourHand).toEqual([]);
    expect(spec.yourPeekedCard).toBeNull();
    for (const seat of [0, 3, null]) {
      expect(JSON.stringify(M.viewFor(s, seat))).not.toMatch(/seed|rngCursor|"hand"/);
    }
  });

  it('the revealed card is public and is cleared before the next pass', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'fly', target: 1 });
    s = apply(s, { type: 'decide', bySeat: 1, call: 'truth' });
    expect(M.viewFor(s, 3).lastReveal!.card).toBe('rat');
    s = ackAll(s);
    expect(M.viewFor(s, 3).lastReveal).toBeNull();
  });
});

describe('Cockroach Poker — AI', () => {
  it("regression: an unpeeked AI holder doesn't know the card", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      let s = ackAll(start(4, seed));
      const sender = s.currentSeat;
      const a = aiChooseAction(s, sender)!;
      expect(a.type).toBe('startPass');
      s = apply(s, a);
      const holder = s.pass!.holder;
      const decision = aiChooseAction(s, holder);
      for (const c of CREATURES) {
        const t = { ...s, pass: { ...s.pass!, card: c } };
        expect(aiChooseAction(t, holder)).toEqual(decision);
      }
    }
  });

  it("AI decisions don't depend on other seats' hands", () => {
    for (const seed of [21, 22, 23, 24]) {
      const s = ackAll(start(5, seed));
      const seat = s.currentSeat;
      const a = aiChooseAction(s, seat);
      const players = { ...s.players };
      for (const x of s.seats) {
        if (x.index === seat) continue;
        players[x.index] = { ...players[x.index]!, hand: players[x.index]!.hand.map(() => 'stinkbug' as Creature) };
      }
      expect(aiChooseAction({ ...s, players }, seat)).toEqual(a);
    }
  });

  it('a creature with every copy accounted for is known to be a lie', () => {
    let s = passing(HANDS);
    s = setRow(s, 2, { toad: 6 }); // + 2 toads in seat 1's hand = all 8
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'toad', target: 1 });
    expect(pClaimTrue(M.viewFor(s, 1), 'toad')).toBe(0);
    const a = aiChooseAction(s, 1)!;
    expect(a.type === 'decide' && a.call === 'lie').toBe(true);
  });

  it('AI acts only when its seat must', () => {
    const s = ackAll(start(4));
    for (const x of s.seats) {
      const a = aiChooseAction(s, x.index);
      if (x.index === s.currentSeat) expect(a?.type).toBe('startPass');
      else expect(a).toBeNull();
    }
    const fresh = start(4);
    expect(aiChooseAction(fresh, 2)).toEqual({ type: 'ackDeal', bySeat: 2 });
    expect(aiChooseAction(apply(fresh, { type: 'ackDeal', bySeat: 2 }), 2)).toBeNull();
  });

  it('an AI that peeked passes on to an unseen seat', () => {
    let s = passing(HANDS);
    s = apply(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'rat', target: 1 });
    s = apply(s, { type: 'peek', bySeat: 1 });
    const a = aiChooseAction(s, 1)!;
    expect(a.type).toBe('passOn');
    if (a.type === 'passOn') expect([2, 3]).toContain(a.target);
  });

  function selfPlay(seed: number, players: number) {
    let s = start(players, seed);
    let cursor = 0;
    let steps = 0;
    let peeks = 0;
    while (!M.isFinished(s)) {
      let acted = false;
      for (let k = 0; k < players; k++) {
        const seat = (cursor + k) % players;
        const a = M.aiChooseAction!(s, seat);
        if (!a) continue;
        expect(a.bySeat).toBe(seat);
        if (a.type === 'peek') peeks += 1;
        s = M.applyAction(s, a, `ai:${seat}`);
        cursor = (seat + 1) % players;
        acted = true;
        break;
      }
      if (!acted) throw new Error(`stalled in ${s.phase} (seed ${seed})`);
      if (++steps > 5000) throw new Error(`did not finish (seed ${seed})`);
    }
    return { s, peeks };
  }

  it('all-AI self-play finishes with exactly one loser', () => {
    let totalPeeks = 0;
    for (const players of [3, 4, 5, 6]) {
      for (const seed of [5, 50, 500, 5000]) {
        const { s, peeks } = selfPlay(seed, players);
        totalPeeks += peeks;
        expect(s.loserSeat).not.toBeNull();
        expect(s.matchWinners.length).toBe(players - 1);
        expect(['fourOfAKind', 'emptyHand']).toContain(s.lossReason);
      }
    }
    expect(totalPeeks).toBeGreaterThan(0); // the AI does use peek-and-pass
  });
});
