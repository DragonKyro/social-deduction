import { describe, expect, it } from 'vitest';
import type { CoupGameAction } from './actions';
import { CLASSIC_FIVE } from './characters';
import { coupModule } from './module';
import { buildInitialState } from './setup';
import type { CoupCharacter, CoupPrivateState } from './state';

// Hidden-information tests for viewFor.
//
// The strongest check is indistinguishability: scramble everything a seat is
// NOT allowed to know (other hands, the deck and its order, the seed, the
// force-swap drawn card) and assert that seat's view is byte-identical. If
// any hidden value leaked into the view by any path (field, log, event,
// derived count), the views would differ.

const act = (s: CoupPrivateState, a: CoupGameAction) => coupModule.applyAction(s, a, '');

function classic(seats = 4, seed = 99): CoupPrivateState {
  return buildInitialState(seats, CLASSIC_FIVE, Array.from({ length: seats }, (_, i) => `P${i + 1}`), seed, 'classic', []);
}

function g54(chars: CoupCharacter[], seats = 4, seed = 3, anarchy = false): CoupPrivateState {
  return buildInitialState(seats, chars, Array.from({ length: seats }, (_, i) => `P${i + 1}`), seed, 'g54', anarchy ? ['anarchy'] : []);
}

// Scramble every face-down card NOT owned by `keep` together with the deck,
// change seed / rng cursor and the force-swap drawn card. Preserves multiset
// sizes so public counts stay valid.
function scrambleHiddenFrom(state: CoupPrivateState, keep: number | null, salt: number): CoupPrivateState {
  const s: CoupPrivateState = JSON.parse(JSON.stringify(state));
  const slots: Array<{ get: () => CoupCharacter; set: (c: CoupCharacter) => void }> = [];
  s.seats.forEach((seat) => {
    if (seat.index === keep) return;
    seat.influences.forEach((inf) => {
      if (!inf.revealed) slots.push({ get: () => inf.char, set: (c) => (inf.char = c) });
    });
  });
  s.deck.forEach((_, i) => slots.push({ get: () => s.deck[i]!, set: (c) => (s.deck[i] = c) }));
  // Replace with a rotation over the active character set: different values.
  slots.forEach((slot, i) => {
    const pool = s.activeCharacters;
    slot.set(pool[(i + salt) % pool.length]!);
  });
  if (s.pending?.swapInProgress) {
    s.pending.swapInProgress.drawnCard = s.activeCharacters[(salt + 1) % s.activeCharacters.length]!;
  }
  s.seed = (s.seed + 1234567 * (salt + 1)) >>> 0;
  s.rngCursor = (s.rngCursor + 7654321 * (salt + 1)) >>> 0;
  // The exchange offer belongs to the exchanger; scramble it for everyone else.
  if (s.exchangeOffer && s.pending?.by !== keep) {
    s.exchangeOffer.cards = s.exchangeOffer.cards.map((_, i) => s.activeCharacters[(i + salt) % s.activeCharacters.length]!);
  }
  // Other seats' peeks are theirs alone.
  for (const k of Object.keys(s.privatePeeks)) {
    const idx = Number(k);
    if (idx === keep) continue;
    s.privatePeeks[idx] = (s.privatePeeks[idx] ?? []).map((pk) => ({ ...pk, card: s.activeCharacters[salt % s.activeCharacters.length]! }));
  }
  return s;
}

function expectIndistinguishable(state: CoupPrivateState) {
  const seats: Array<number | null> = [null, ...state.seats.map((s) => s.index)];
  for (const seat of seats) {
    const base = JSON.stringify(coupModule.viewFor(state, seat));
    for (const salt of [1, 2, 3]) {
      const other = JSON.stringify(coupModule.viewFor(scrambleHiddenFrom(state, seat, salt), seat));
      expect(other, `seat ${seat} view changed when hidden info changed`).toBe(base);
    }
  }
}

const FORBIDDEN_KEYS = ['deck', 'seed', 'rngCursor', 'drawnCard', 'swapInProgress', 'privatePeeks', 'exchangeOffer', 'resumeAfterLose'];

function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      allKeys(x, out);
    }
  }
  return out;
}

function expectStructurallyRedacted(state: CoupPrivateState) {
  for (const seat of [null, ...state.seats.map((s) => s.index)]) {
    const v = coupModule.viewFor(state, seat);
    const keys = allKeys(v);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `view for ${seat} has key ${k}`).toBe(false);
    v.seats.forEach((ps) =>
      ps.influences.forEach((inf, i) => {
        const real = state.seats[ps.index]!.influences[i]!;
        expect(inf.revealed).toBe(real.revealed);
        expect(inf.char).toBe(real.revealed ? real.char : null);
      }),
    );
    if (seat === null) {
      expect(v.yourInfluences).toEqual([]);
      expect(v.yourExchangeOffer).toBeNull();
      expect(v.yourPeeks).toEqual([]);
    } else {
      expect(v.yourInfluences).toEqual(state.seats[seat]!.influences);
      if (state.pending?.by !== seat) expect(v.yourExchangeOffer).toBeNull();
    }
    // Events only name cards that are face-up right now.
    for (const e of v.events) {
      if (e.kind === 'influenceLost') {
        expect(state.seats[e.seat]!.influences[e.cardIndex]).toEqual({ char: e.character, revealed: true });
      }
    }
  }
}

describe('coup redaction — indistinguishability across phases', () => {
  it('turnStart (fresh deal)', () => {
    const s = classic();
    expectStructurallyRedacted(s);
    expectIndistinguishable(s);
  });

  it('awaitingChallenge / awaitingBlock / awaitingBlockChallenge', () => {
    let s = classic();
    s = act(s, { type: 'declareGeneral', bySeat: 0, generalId: 'foreignAid' });
    expectIndistinguishable(s);
    s = act(s, { type: 'declareBlock', bySeat: 2, character: 'duke' });
    expectIndistinguishable(s);
    s = classic();
    s.seats[0]!.coins = 3;
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'assassin', characterActionId: 'assassinate', target: 1 });
    expectStructurallyRedacted(s);
    expectIndistinguishable(s);
  });

  it('after a successful challenge the replacement card stays private', () => {
    let s = classic(3, 5);
    s.seats[0]!.influences = [
      { char: 'duke', revealed: false },
      { char: 'captain', revealed: false },
    ];
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'duke', characterActionId: 'tax' });
    s = act(s, { type: 'challenge', bySeat: 1 });
    expect(s.events.some((e) => e.kind === 'redraw')).toBe(true);
    expectStructurallyRedacted(s);
    expectIndistinguishable(s);
    // The new card itself appears nowhere in seat 1's / the spectator's view
    // except where the claimed character is legitimately public.
    const replacement = s.seats[0]!.influences[0]!.char;
    const v1 = coupModule.viewFor(s, 1);
    expect(v1.seats[0]!.influences[0]!.char).toBeNull();
    expect(v1.yourInfluences.map((i) => i.char)).toEqual(s.seats[1]!.influences.map((i) => i.char));
    void replacement;
  });

  it('exchange: drawn cards are visible to the exchanger only', () => {
    let s = classic(4, 21);
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'ambassador', characterActionId: 'exchange' });
    for (const seat of [1, 2, 3]) s = act(s, { type: 'pass', bySeat: seat });
    expect(s.phase).toBe('exchangePick');
    expect(coupModule.viewFor(s, 0).yourExchangeOffer!.cards).toHaveLength(4);
    for (const seat of [null, 1, 2, 3]) expect(coupModule.viewFor(s, seat).yourExchangeOffer).toBeNull();
    expectStructurallyRedacted(s);
    expectIndistinguishable(s);
    // Completing the exchange returns cards to the deck without naming them.
    s = act(s, { type: 'exchangeReturn', bySeat: 0, keepIndices: [2, 3] });
    expectIndistinguishable(s);
    expect(s.log.join('\n')).not.toMatch(/returned .*(Duke|Assassin|Captain|Ambassador|Contessa)/);
  });

  it('spy peek: only the peeker learns the card', () => {
    let s = g54(['banker', 'spy', 'soldier', 'judge', 'inquisitor']);
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'spy', characterActionId: 'spyPeek', target: 2, inquisitorPeekCardIndex: 0 });
    for (const seat of [1, 2, 3]) s = act(s, { type: 'pass', bySeat: seat });
    expect(s.phase).toBe('spyPeek');
    expect(coupModule.viewFor(s, 0).yourPeeks).toHaveLength(1);
    for (const seat of [null, 1, 2, 3]) expect(coupModule.viewFor(s, seat).yourPeeks).toEqual([]);
    expectStructurallyRedacted(s);
    expectIndistinguishable(s);
  });

  it('force-swap: the drawn card is hidden from everyone while the target picks', () => {
    let s = g54(['banker', 'lobbyist', 'soldier', 'judge', 'inquisitor']);
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'lobbyist', characterActionId: 'forceSwap', target: 1 });
    for (const seat of [1, 2, 3]) s = act(s, { type: 'pass', bySeat: seat });
    expect(s.phase).toBe('targetSwapPick');
    expectStructurallyRedacted(s);
    expectIndistinguishable(s);
  });

  it('the seed and rng cursor never reach any view', () => {
    const s = classic();
    const t: CoupPrivateState = { ...JSON.parse(JSON.stringify(s)), seed: 1, rngCursor: 2 };
    for (const seat of [null, 0, 1, 2, 3]) {
      expect(JSON.stringify(coupModule.viewFor(t, seat))).toBe(JSON.stringify(coupModule.viewFor(s, seat)));
    }
  });

  it('views do not alias host state', () => {
    const s = classic();
    const v = coupModule.viewFor(s, 0);
    v.yourInfluences[0]!.char = 'contessa';
    v.yourInfluences[0]!.revealed = true;
    v.activeCharacters.push('duke');
    expect(s.seats[0]!.influences[0]!.revealed).toBe(false);
    expect(s.activeCharacters).toHaveLength(5);
  });
});
