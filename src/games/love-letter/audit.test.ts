import { describe, expect, it } from 'vitest';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { loveLetterModule } from './module';
import type { LoveLetterOptions } from './module';
import type { LoveLetterAction } from './actions';
import type { Card, LoveLetterPrivateState, Rank } from './state';
import { RANK_NAMES } from './state';
import { chooseFromView } from './ai';

// Audit regressions: hidden-info redaction, validation, AI fairness and
// all-AI self-play. Rules tests live in module.test.ts.

function apply(state: LoveLetterPrivateState, action: LoveLetterAction): LoveLetterPrivateState {
  return loveLetterModule.applyAction(state, action, '');
}

function configFor(playerCount: number, seed = 42): GameConfig {
  const opts: LoveLetterOptions = {
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}`, isAI: true })),
  };
  return { gameId: 'love-letter', seats: [], seed, gameOptions: opts as unknown as Record<string, unknown> };
}

function ackEveryoneStart(state: LoveLetterPrivateState): LoveLetterPrivateState {
  let s = state;
  for (let i = 0; i < s.seats.length; i++) s = apply(s, { type: 'ackStart', bySeat: i });
  return s;
}

function ackEveryoneEffect(state: LoveLetterPrivateState): LoveLetterPrivateState {
  let s = state;
  for (let i = 0; i < s.seats.length; i++) s = apply(s, { type: 'ackEffect', bySeat: i });
  return s;
}

function withHand(state: LoveLetterPrivateState, seat: SeatIndex, hand: Card[]): LoveLetterPrivateState {
  return { ...state, players: { ...state.players, [seat]: { ...state.players[seat]!, hand: hand.slice() } } };
}

function cardNamesIn(text: string): string[] {
  return Object.values(RANK_NAMES).filter((n) => text.includes(n));
}

// Hidden cards = everything not in a discard / face-up set-aside.
function hiddenPool(s: LoveLetterPrivateState): Card[] {
  const out: Card[] = [...s.deck];
  if (s.setAside !== null) out.push(s.setAside);
  for (const seat of s.seats) out.push(...s.players[seat.index]!.hand);
  return out;
}

function playAllAI(playerCount: number, seed: number, onStep?: (s: LoveLetterPrivateState) => void) {
  let s = loveLetterModule.createInitialState(configFor(playerCount, seed));
  let steps = 0;
  while (!loveLetterModule.isFinished(s)) {
    if (++steps > 20000) throw new Error(`stalled in ${s.phase} (seed ${seed})`);
    let progressed = false;
    for (const seat of s.seats) {
      const action = loveLetterModule.aiChooseAction!(s, seat.index);
      if (!action) continue;
      expect(action.bySeat).toBe(seat.index);
      s = apply(s, action); // throws if the AI proposed something illegal
      onStep?.(s);
      progressed = true;
      break;
    }
    if (!progressed) throw new Error(`AI deadlock in phase ${s.phase} (seed ${seed})`);
  }
  return s;
}

describe('Love Letter — Baron redaction (bug: both compared cards were public)', () => {
  function baronGame(actorHand: Card[], targetHand: Card[]) {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, actorHand);
    s = withHand(s, 1, targetHand);
    s = withHand(s, 2, [1]);
    s = apply(s, { type: 'playCard', bySeat: 0, card: 3 });
    return apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
  }

  it("bystanders learn only the loser and the loser's card", () => {
    const s = baronGame([3, 8], [2]); // keeps Princess; target has Priest
    expect(s.players[1]!.eliminated).toBe(true);
    for (const seat of [2, null] as const) {
      const v = loveLetterModule.viewFor(s, seat);
      expect(v.lastEffect?.loserSeat).toBe(1);
      expect(v.lastEffect?.revealedCards).toEqual([2]);
      expect(v.yourSecret).toBeNull();
      expect(JSON.stringify(v)).not.toContain('Princess');
    }
    // Both participants see both cards.
    expect(loveLetterModule.viewFor(s, 0).yourSecret).toMatchObject({ kind: 'baron', actorCard: 8, targetCard: 2 });
    expect(loveLetterModule.viewFor(s, 1).yourSecret).toMatchObject({ kind: 'baron', actorCard: 8, targetCard: 2 });
  });

  it('a tie reveals nothing to bystanders; the two players learn each other', () => {
    const s = baronGame([3, 6], [6]);
    const v2 = loveLetterModule.viewFor(s, 2);
    expect(v2.lastEffect?.loserSeat).toBeNull();
    expect(v2.lastEffect?.revealedCards).toBeUndefined();
    expect(cardNamesIn(v2.lastEffect!.message)).toEqual(['Baron']);
    expect(JSON.stringify(v2)).not.toContain('King');
    expect(loveLetterModule.viewFor(s, 0).yourKnowledge).toEqual([{ seat: 1, card: 6, source: 'baron' }]);
    expect(loveLetterModule.viewFor(s, 1).yourKnowledge).toEqual([{ seat: 0, card: 6, source: 'baron' }]);
    expect(v2.yourKnowledge).toEqual([]);
  });
});

describe('Love Letter — King swap is known to both participants only', () => {
  it('participants see what was traded; bystanders do not', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [6, 8]);
    s = withHand(s, 1, [2]);
    s = withHand(s, 2, [1]);
    s = apply(s, { type: 'playCard', bySeat: 0, card: 6 });
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    const v0 = loveLetterModule.viewFor(s, 0);
    expect(v0.yourHand).toEqual([2]);
    expect(v0.yourSecret).toMatchObject({ kind: 'king', actorCard: 8, targetCard: 2 });
    expect(v0.yourKnowledge).toEqual([{ seat: 1, card: 8, source: 'king' }]);
    expect(loveLetterModule.viewFor(s, 1).yourKnowledge).toEqual([{ seat: 0, card: 2, source: 'king' }]);
    for (const seat of [2, null] as const) {
      const v = loveLetterModule.viewFor(s, seat);
      expect(v.yourSecret).toBeNull();
      expect(JSON.stringify(v)).not.toContain('Princess');
    }
  });

  it("a bystander's Priest knowledge follows the swapped card", () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [6, 5]);
    s = withHand(s, 1, [3]);
    s = withHand(s, 2, [1]);
    s = { ...s, knowledge: { 0: {}, 1: {}, 2: { 1: { card: 3, source: 'priest' } } } };
    s = apply(s, { type: 'playCard', bySeat: 0, card: 6 });
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    expect(loveLetterModule.viewFor(s, 2).yourKnowledge).toEqual([{ seat: 0, card: 3, source: 'priest' }]);
  });
});

describe('Love Letter — Priest knowledge bookkeeping', () => {
  it('survives the target playing a different card; dropped once the known rank is played', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [2, 4]);
    s = withHand(s, 1, [3]);
    s = apply(s, { type: 'playCard', bySeat: 0, card: 2 });
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    expect(loveLetterModule.viewFor(s, 0).yourKnowledge).toEqual([{ seat: 1, card: 3, source: 'priest' }]);
    expect(loveLetterModule.viewFor(s, 2).yourPriestPeek).toBeNull();
    s = apply(s, { type: 'ackPriest', bySeat: 0 });
    expect(s.currentSeat).toBe(1);
    // Seat 1 keeps the Baron and plays the drawn Handmaid.
    s = withHand(s, 1, [3, 4]);
    s = apply(s, { type: 'playCard', bySeat: 1, card: 4 });
    s = ackEveryoneEffect(s);
    expect(loveLetterModule.viewFor(s, 0).yourKnowledge).toEqual([{ seat: 1, card: 3, source: 'priest' }]);
    // Seats 2 and 0 shield up; then seat 1 plays the Baron into no targets.
    s = withHand(s, 2, [4, 1]);
    s = apply(s, { type: 'playCard', bySeat: 2, card: 4 });
    s = ackEveryoneEffect(s);
    s = withHand(s, 0, [4, 4]);
    s = apply(s, { type: 'playCard', bySeat: 0, card: 4 });
    s = ackEveryoneEffect(s);
    s = withHand(s, 1, [3, 1]);
    s = apply(s, { type: 'playCard', bySeat: 1, card: 3 });
    expect(s.lastEffect?.kind).toBe('noTargets');
    expect(loveLetterModule.viewFor(s, 0).yourKnowledge).toEqual([]);
  });
});

describe('Love Letter — round end', () => {
  it('a last-standing winner keeps their card hidden (bug: finalHands showed it)', () => {
    let s = loveLetterModule.createInitialState(configFor(2, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [1, 8]);
    s = withHand(s, 1, [2]);
    s = apply(s, { type: 'playCard', bySeat: 0, card: 1 });
    s = apply(s, { type: 'guardGuess', bySeat: 0, target: 1, guess: 2 });
    s = ackEveryoneEffect(s);
    expect(s.phase).toBe('roundOver');
    const v1 = loveLetterModule.viewFor(s, 1);
    expect(v1.lastRound?.reason).toBe('lastStanding');
    expect(v1.lastRound?.finalHands[0]).toEqual([]);
    expect(JSON.stringify(v1)).not.toContain('Princess');
  });

  it('deckout shows every surviving hand and breaks ties by discard sum', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0, deck: [] };
    s = withHand(s, 0, [4, 5]);
    s = withHand(s, 1, [5]);
    s = withHand(s, 2, [2]);
    s = { ...s, players: { ...s.players, 1: { ...s.players[1]!, discard: [1, 1] } } };
    s = apply(s, { type: 'playCard', bySeat: 0, card: 4 }); // keeps Prince; discard sum 4
    s = ackEveryoneEffect(s);
    expect(s.phase).toBe('roundOver');
    const r = s.history[s.history.length - 1]!;
    expect(r.reason).toBe('deckExhausted');
    expect(r.finalHands).toEqual({ 0: [5], 1: [5], 2: [2] });
    expect(r.winnerSeats).toEqual([0]); // 4 > 1 + 1
  });
});

describe('Love Letter — validation', () => {
  it('rejects unknown seats, out-of-turn plays and malformed guesses', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    expect(() => apply(s, { type: 'ackStart', bySeat: 7 })).toThrow();
    expect(() => apply(s, { type: 'ackStart', bySeat: -1 })).toThrow();
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [1, 4]);
    s = withHand(s, 1, [2]);
    expect(() => apply(s, { type: 'playCard', bySeat: 1, card: 2 })).toThrow();
    expect(() => apply(s, { type: 'playCard', bySeat: 0, card: 9 as Rank })).toThrow();
    expect(() => apply(s, { type: 'ackEffect', bySeat: 0 })).toThrow();
    s = apply(s, { type: 'playCard', bySeat: 0, card: 1 });
    for (const guess of [0, 9, 2.5] as unknown as Rank[]) {
      expect(() => apply(s, { type: 'guardGuess', bySeat: 0, target: 1, guess })).toThrow();
    }
    expect(() => apply(s, { type: 'guardGuess', bySeat: 0, target: 0, guess: 2 })).toThrow();
    expect(() => apply(s, { type: 'guardGuess', bySeat: 2, target: 1, guess: 2 })).toThrow();
    expect(() => apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 })).toThrow();
  });

  it('an unknown seat index gets a spectator view instead of crashing', () => {
    const s = loveLetterModule.createInitialState(configFor(3, 1));
    const v = loveLetterModule.viewFor(s, 9);
    expect(v.yourSeat).toBeNull();
    expect(v.yourHand).toEqual([]);
  });
});

describe('Love Letter — redaction invariants across whole AI games', () => {
  it('no view ever carries the deck, set-aside card, seed, or another hand', () => {
    for (const seed of [3, 17, 2024]) {
      for (const n of [2, 3, 4]) {
        playAllAI(n, seed, (s) => {
          for (const seat of [...s.seats.map((x) => x.index), null]) {
            const v = loveLetterModule.viewFor(s, seat);
            expect(JSON.stringify(v)).not.toMatch(
              /"(deck|setAside|seed|rngCursor|knowledge|priestPeek|effectSecret|hand)":/,
            );
            if (seat === null) {
              expect(v.yourHand).toEqual([]);
              expect(v.yourPriestPeek).toBeNull();
              expect(v.yourSecret).toBeNull();
              expect(v.yourKnowledge).toEqual([]);
            } else {
              expect(v.yourHand).toEqual(s.players[seat]!.hand);
              if (v.yourPriestPeek) expect(s.priestPeek?.byActor).toBe(seat);
              if (v.yourSecret) expect([v.yourSecret.actorSeat, v.yourSecret.targetSeat]).toContain(seat);
              // Knowledge is always true.
              for (const k of v.yourKnowledge) expect(s.players[k.seat]!.hand).toContain(k.card);
            }
          }
        });
      }
    }
  });
});

describe('Love Letter — AI fairness', () => {
  it("decisions don't change when hidden cards are reshuffled", () => {
    // Permute the hidden pool among other hands / deck / set-aside: the AI's
    // view is identical, so its choice must be too.
    for (const seed of [5, 6, 7, 8, 9, 10]) {
      let s = loveLetterModule.createInitialState(configFor(4, seed));
      s = ackEveryoneStart(s);
      const me = s.currentSeat;
      const before = loveLetterModule.aiChooseAction!(s, me);
      const pool = hiddenPool(s);
      for (const c of s.players[me]!.hand) pool.splice(pool.indexOf(c), 1);
      pool.push(pool.shift()!);
      let i = 0;
      const players = { ...s.players };
      for (const seat of s.seats) {
        if (seat.index === me) continue;
        players[seat.index] = { ...players[seat.index]!, hand: [pool[i++]!] };
      }
      const deck = s.deck.map(() => pool[i++]!);
      const setAside = pool[i++]!;
      const t: LoveLetterPrivateState = { ...s, players, deck, setAside, seed: s.seed + 99 };
      expect(loveLetterModule.viewFor(t, me)).toEqual(loveLetterModule.viewFor(s, me));
      expect(loveLetterModule.aiChooseAction!(t, me)).toEqual(before);
    }
  });

  it('a Guard with a known target card always names it', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [1, 2]);
    s = withHand(s, 1, [6]);
    s = { ...s, knowledge: { 0: { 1: { card: 6, source: 'priest' } }, 1: {}, 2: {} } };
    s = apply(s, { type: 'playCard', bySeat: 0, card: 1 });
    expect(chooseFromView(loveLetterModule.viewFor(s, 0), 0)).toEqual({
      type: 'guardGuess',
      bySeat: 0,
      target: 1,
      guess: 6,
    });
  });

  it('returns null when it is not its decision', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 4));
    s = ackEveryoneStart(s);
    const other = (s.currentSeat + 1) % 3;
    expect(loveLetterModule.aiChooseAction!(s, other)).toBeNull();
  });
});

describe('Love Letter — all-AI self-play', () => {
  it('finishes full matches for 2/3/4 players over many seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const n of [2, 3, 4]) {
        const s = playAllAI(n, seed * 7919);
        expect(s.phase).toBe('gameOver');
        expect(s.matchWinners.length).toBeGreaterThanOrEqual(1);
        for (const w of s.matchWinners) expect(s.players[w]!.tokens).toBeGreaterThanOrEqual(s.tokensToWin);
      }
    }
  });
});
