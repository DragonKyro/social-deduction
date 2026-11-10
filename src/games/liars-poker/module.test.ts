import { describe, expect, it } from 'vitest';
import { liarsPokerModule } from './module';
import type { LiarsPokerOptions } from './module';
import type { LiarsPokerAction } from './actions';
import { aiChooseAction } from './ai';
import type { HandClaim } from './hands';
import type { Card, CardRank, LiarsPokerPrivateState, Suit } from './state';

function apply(s: LiarsPokerPrivateState, a: LiarsPokerAction): LiarsPokerPrivateState {
  return liarsPokerModule.applyAction(s, a, '');
}

function start(
  players = 3,
  opts: Partial<Omit<LiarsPokerOptions, 'players'>> = {},
  seed = 42,
): LiarsPokerPrivateState {
  const options: LiarsPokerOptions = {
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: false })),
    cardsPerPlayer: 3,
    dummyHand: true,
    ...opts,
  };
  return liarsPokerModule.createInitialState({
    gameId: 'liars-poker',
    seats: [],
    seed,
    gameOptions: options as unknown as Record<string, unknown>,
  });
}

const c = (rank: number, suit: Suit): Card => ({ rank: rank as CardRank, suit });

function withHands(s: LiarsPokerPrivateState, hands: Record<number, Card[]>): LiarsPokerPrivateState {
  const players = { ...s.players };
  for (const [k, h] of Object.entries(hands)) players[Number(k)] = { ...players[Number(k)]!, hand: h };
  return { ...s, players };
}

function ackAll(s: LiarsPokerPrivateState): LiarsPokerPrivateState {
  let st = s;
  for (const seat of st.seats.map((x) => x.index)) {
    if (st.players[seat]!.eliminated) continue;
    if (st.phase === 'dealPending' && !st.players[seat]!.dealAcked) st = apply(st, { type: 'ackDeal', bySeat: seat });
    else if (st.phase === 'revealing' && !st.revealAcked[seat]) st = apply(st, { type: 'ackReveal', bySeat: seat });
    else if (st.phase === 'roundOver' && !st.roundOverAcked[seat]) st = apply(st, { type: 'ackRoundOver', bySeat: seat });
  }
  return st;
}

function bidding(hands: Record<number, Card[]>, opts: Partial<Omit<LiarsPokerOptions, 'players'>> = {}) {
  const n = Object.keys(hands).length;
  let s = withHands(start(n, opts), hands);
  s = { ...s, roundLeader: 0, currentSeat: 0 };
  return ackAll(s);
}

const pair = (rank: number): HandClaim => ({ kind: 'pair', rank: rank as CardRank });

describe("Liar's Poker — deal & flow", () => {
  it('deals cardsPerPlayer distinct cards to each seat', () => {
    for (const cpp of [1, 3, 5]) {
      const s = start(8, { cardsPerPlayer: cpp });
      const all = Object.values(s.players).flatMap((p) => p.hand);
      expect(all.length).toBe(8 * cpp);
      expect(new Set(all.map((x) => `${x.rank}${x.suit}`)).size).toBe(all.length);
    }
  });

  it('checks the claim against the combined pool of every hand', () => {
    // A pair of 9s split across two players exists.
    let s = bidding({ 0: [c(9, 'spades'), c(2, 'clubs')], 1: [c(9, 'hearts'), c(4, 'clubs')] }, { cardsPerPlayer: 2 });
    s = apply(s, { type: 'placeClaim', bySeat: 0, claim: pair(9) });
    s = apply(s, { type: 'callLiar', bySeat: 1 });
    expect(s.lastReveal!.claimExists).toBe(true);
    expect(s.lastReveal!.loserSeat).toBe(1);
    expect(s.players[1]!.cardCount).toBe(1);
  });

  it('a false claim costs the bidder a card; the loser leads the next deal with fewer cards', () => {
    let s = bidding({ 0: [c(9, 'spades'), c(2, 'clubs')], 1: [c(8, 'hearts'), c(4, 'clubs')] }, { cardsPerPlayer: 2 });
    s = apply(s, { type: 'placeClaim', bySeat: 0, claim: pair(9) });
    s = apply(s, { type: 'callLiar', bySeat: 1 });
    expect(s.lastReveal!.callerWon).toBe(true);
    expect(s.lastReveal!.loserSeat).toBe(0);
    s = ackAll(ackAll(s));
    expect(s.phase).toBe('dealPending');
    expect(s.roundLeader).toBe(0);
    expect(s.players[0]!.hand.length).toBe(1);
    expect(s.players[1]!.hand.length).toBe(2);
    expect(s.roundClaims).toEqual([]);
  });

  it('claims must strictly increase and be well-formed', () => {
    let s = bidding({ 0: [c(9, 'spades')], 1: [c(8, 'hearts')], 2: [c(7, 'clubs')] }, { cardsPerPlayer: 1 });
    s = apply(s, { type: 'placeClaim', bySeat: 0, claim: pair(9) });
    expect(() => apply(s, { type: 'placeClaim', bySeat: 1, claim: pair(9) })).toThrow();
    expect(() => apply(s, { type: 'placeClaim', bySeat: 1, claim: pair(8) })).toThrow();
    expect(() =>
      apply(s, { type: 'placeClaim', bySeat: 1, claim: { kind: 'twoPair', highRank: 2, lowRank: 14 } as HandClaim }),
    ).toThrow();
    expect(() =>
      apply(s, { type: 'placeClaim', bySeat: 1, claim: { kind: 'flush', topRank: 3, suit: 'spades' } as HandClaim }),
    ).toThrow();
    s = apply(s, { type: 'placeClaim', bySeat: 1, claim: { kind: 'twoPair', highRank: 3, lowRank: 2 } });
    expect(s.currentBidder).toBe(1);
    expect(s.roundClaims.map((r) => r.seat)).toEqual([0, 1]);
  });

  it('rejects out-of-turn, unknown-seat, double and eliminated acks', () => {
    let s = start(3);
    expect(() => apply(s, { type: 'ackDeal', bySeat: 3 })).toThrow();
    s = apply(s, { type: 'ackDeal', bySeat: 0 });
    expect(() => apply(s, { type: 'ackDeal', bySeat: 0 })).toThrow();
    const b = bidding({ 0: [c(9, 'spades')], 1: [c(8, 'hearts')], 2: [c(7, 'clubs')] }, { cardsPerPlayer: 1 });
    expect(() => apply(b, { type: 'placeClaim', bySeat: 2, claim: pair(9) })).toThrow();
    expect(() => apply(b, { type: 'callLiar', bySeat: 0 })).toThrow(); // nothing to call
  });
});

describe("Liar's Poker — dummy hand", () => {
  function toDummy() {
    // Seat 0 has 1 card and loses it.
    let s = bidding({ 0: [c(9, 'spades')], 1: [c(8, 'hearts')], 2: [c(7, 'clubs')] }, { cardsPerPlayer: 1 });
    s = apply(s, { type: 'placeClaim', bySeat: 0, claim: pair(9) });
    s = apply(s, { type: 'callLiar', bySeat: 1 });
    expect(s.lastReveal!.loserSeat).toBe(0);
    expect(s.players[0]!.isDummy).toBe(true);
    expect(s.players[0]!.eliminated).toBe(false);
    return ackAll(ackAll(s)); // next deal
  }

  it('the dummy cannot see their own card but everyone else can', () => {
    const s = toDummy();
    expect(s.phase).toBe('dealPending');
    expect(s.players[0]!.hand.length).toBe(1);
    const card = s.players[0]!.hand[0]!;

    const own = liarsPokerModule.viewFor(s, 0);
    expect(own.yourHand).toEqual([]);
    expect(own.players[0]!.visibleHand).toEqual([]);
    expect(JSON.stringify(own)).not.toContain(JSON.stringify(card));

    for (const viewer of [1, 2, null]) {
      const v = liarsPokerModule.viewFor(s, viewer);
      expect(v.players[0]!.visibleHand).toEqual([card]);
    }
  });

  it("the dummy's view is the same whatever their card is", () => {
    const s = toDummy();
    const other = s.players[0]!.hand[0]!.rank === 14 ? c(13, 'clubs') : c(14, 'clubs');
    const t = withHands(s, { 0: [other] });
    expect(liarsPokerModule.viewFor(t, 0)).toEqual(liarsPokerModule.viewFor(s, 0));
  });

  it('losing the dummy round eliminates the seat', () => {
    let s = ackAll(toDummy());
    s = withHands(s, { 0: [c(2, 'spades')], 1: [c(8, 'hearts')], 2: [c(7, 'clubs')] });
    s = { ...s, currentSeat: 0 };
    s = apply(s, { type: 'placeClaim', bySeat: 0, claim: pair(14) });
    s = apply(s, { type: 'callLiar', bySeat: 1 });
    expect(s.players[0]!.eliminated).toBe(true);
    s = ackAll(s);
    expect(s.history.at(-1)!.eliminatedThisRound).toEqual([0]);
    s = ackAll(s);
    expect(s.players[0]!.hand).toEqual([]);
    expect(s.roundLeader).toBe(1);
  });

  it('with the dummy option off, losing your last card eliminates you', () => {
    let s = bidding({ 0: [c(9, 'spades')], 1: [c(8, 'hearts')], 2: [c(7, 'clubs')] }, { cardsPerPlayer: 1, dummyHand: false });
    s = apply(s, { type: 'placeClaim', bySeat: 0, claim: pair(9) });
    s = apply(s, { type: 'callLiar', bySeat: 1 });
    expect(s.players[0]!.eliminated).toBe(true);
    expect(s.players[0]!.isDummy).toBe(false);
  });
});

describe("Liar's Poker — redaction", () => {
  it("a seat's view is identical whatever the other seats hold", () => {
    const s = bidding({ 0: [c(9, 'spades'), c(3, 'clubs')], 1: [c(8, 'hearts'), c(5, 'clubs')], 2: [c(7, 'clubs'), c(6, 'diamonds')] }, { cardsPerPlayer: 2 });
    const t = withHands(s, { 0: [c(14, 'spades'), c(14, 'hearts')], 2: [c(13, 'clubs'), c(12, 'diamonds')] });
    expect(liarsPokerModule.viewFor(t, 1)).toEqual(liarsPokerModule.viewFor(s, 1));
    expect(liarsPokerModule.viewFor(t, null)).toEqual(liarsPokerModule.viewFor(s, null));
  });

  it('spectators get no live hands; no view carries the seed or cursor', () => {
    const s = start(4);
    const spec = liarsPokerModule.viewFor(s, null);
    expect(spec.yourHand).toEqual([]);
    expect(spec.players.every((p) => p.visibleHand.length === 0)).toBe(true);
    for (const seat of [0, 1, null]) {
      expect(JSON.stringify(liarsPokerModule.viewFor(s, seat))).not.toMatch(/seed|rngCursor|"hand"/);
    }
  });

  it('after the next deal the old reveal is gone from the live view', () => {
    let s = bidding({ 0: [c(9, 'spades')], 1: [c(8, 'hearts')], 2: [c(7, 'clubs')] }, { cardsPerPlayer: 2 });
    s = apply(s, { type: 'placeClaim', bySeat: 0, claim: pair(9) });
    s = apply(s, { type: 'callLiar', bySeat: 1 });
    expect(liarsPokerModule.viewFor(s, 2).lastReveal).not.toBeNull();
    s = ackAll(ackAll(s));
    const v = liarsPokerModule.viewFor(s, 2);
    expect(v.lastReveal).toBeNull();
    expect(v.players[0]!.visibleHand).toEqual([]);
    expect(v.history[0]!.reveal.allHands[0]).toEqual([c(9, 'spades')]);
  });
});

describe("Liar's Poker — AI", () => {
  function scrambleHidden(s: LiarsPokerPrivateState, viewer: number): LiarsPokerPrivateState {
    // Replace every card the viewer can't see with a different card.
    const players = { ...s.players };
    for (const x of s.seats) {
      const p = s.players[x.index]!;
      const hidden = x.index === viewer ? p.isDummy : !p.isDummy;
      if (!hidden) continue;
      players[x.index] = {
        ...p,
        hand: p.hand.map((card) => ({ rank: (((card.rank - 2 + 5) % 13) + 2) as CardRank, suit: card.suit })),
      };
    }
    return { ...s, players };
  }

  it("AI decisions don't depend on cards its seat can't see", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let s = ackAll(start(4, { cardsPerPlayer: 3 }, seed));
      for (let turn = 0; turn < 4 && s.phase === 'bidding'; turn++) {
        const seat = s.currentSeat;
        const a = aiChooseAction(s, seat);
        expect(aiChooseAction(scrambleHidden(s, seat), seat)).toEqual(a);
        if (!a || a.type !== 'placeClaim') break;
        s = apply(s, a);
      }
    }
  });

  it('a dummy AI does not use its own card', () => {
    let s = bidding({ 0: [c(9, 'spades')], 1: [c(8, 'hearts')], 2: [c(7, 'clubs')] }, { cardsPerPlayer: 1 });
    s = apply(s, { type: 'placeClaim', bySeat: 0, claim: pair(9) });
    s = apply(s, { type: 'callLiar', bySeat: 1 });
    s = ackAll(ackAll(ackAll(s))); // dummy deal acked → bidding
    s = { ...s, currentSeat: 0, roundLeader: 0 };
    const a = aiChooseAction(s, 0);
    expect(aiChooseAction(scrambleHidden(s, 0), 0)).toEqual(a);
  });

  it('AI only acts when its seat must', () => {
    const s = ackAll(start(3));
    for (const seat of [0, 1, 2]) {
      const a = aiChooseAction(s, seat);
      if (seat === s.currentSeat) expect(a).not.toBeNull();
      else expect(a).toBeNull();
    }
    const fresh = start(3);
    expect(aiChooseAction(fresh, 1)).toEqual({ type: 'ackDeal', bySeat: 1 });
    expect(aiChooseAction(apply(fresh, { type: 'ackDeal', bySeat: 1 }), 1)).toBeNull();
  });

  function selfPlay(seed: number, players: number, opts: Partial<Omit<LiarsPokerOptions, 'players'>>) {
    let s = start(players, opts, seed);
    let cursor = 0;
    let steps = 0;
    while (!liarsPokerModule.isFinished(s)) {
      let acted = false;
      for (let k = 0; k < players; k++) {
        const seat = (cursor + k) % players;
        const a = liarsPokerModule.aiChooseAction!(s, seat);
        if (!a) continue;
        expect(a.bySeat).toBe(seat);
        s = liarsPokerModule.applyAction(s, a, `ai:${seat}`);
        cursor = (seat + 1) % players;
        acted = true;
        break;
      }
      if (!acted) throw new Error(`stalled in ${s.phase} (seed ${seed})`);
      if (++steps > 20000) throw new Error(`did not finish (seed ${seed})`);
    }
    return s;
  }

  it('all-AI self-play finishes across seeds, player counts and options', () => {
    const combos: Array<[number, Partial<Omit<LiarsPokerOptions, 'players'>>]> = [
      [2, { cardsPerPlayer: 1 }],
      [3, { cardsPerPlayer: 3, dummyHand: false }],
      [5, { cardsPerPlayer: 2 }],
      [8, { cardsPerPlayer: 5 }],
    ];
    for (const [players, opts] of combos) {
      for (const seed of [11, 22, 33]) {
        const end = selfPlay(seed, players, opts);
        expect(end.matchWinners.length).toBe(1);
      }
    }
  });
});
