import { describe, expect, it } from 'vitest';
import { coupModule } from './module';
import { buildInitialState } from './setup';
import { CLASSIC_FIVE } from './characters';
import type { CoupOptions } from './module';

function freshClassicState(seats = 3) {
  return buildInitialState(
    seats,
    CLASSIC_FIVE,
    Array.from({ length: seats }, (_, i) => `P${i + 1}`),
    /*seed*/ 42,
    'classic',
    [],
  );
}

describe('coup — classic base', () => {
  it('deals 2 cards × N players + retains the remaining deck', () => {
    const s = freshClassicState(4);
    expect(s.seats).toHaveLength(4);
    for (const seat of s.seats) {
      expect(seat.influences).toHaveLength(2);
      expect(seat.coins).toBe(2);
      expect(seat.eliminated).toBe(false);
    }
    // 5 chars × 3 copies = 15; 4 players × 2 = 8 dealt; 7 remain.
    expect(s.deck).toHaveLength(7);
    expect(s.phase).toBe('turnStart');
    expect(s.currentSeat).toBe(0);
  });

  it('income gives +1 coin and advances the turn', () => {
    let s = freshClassicState(3);
    s = coupModule.applyAction(s, { type: 'declareGeneral', generalId: 'income' }, '');
    expect(s.seats[0]!.coins).toBe(3);
    expect(s.currentSeat).toBe(1);
    expect(s.phase).toBe('turnStart');
  });

  it('coup costs 7 coins and forces a target to lose an influence', () => {
    let s = freshClassicState(3);
    s.seats[0]!.coins = 7;
    s = coupModule.applyAction(
      s,
      { type: 'declareGeneral', generalId: 'coup', target: 1 },
      '',
    );
    expect(s.seats[0]!.coins).toBe(0);
    expect(s.phase).toBe('loseInfluence');
    // Seat 1 still has 2 unrevealed cards → they pick.
    s = coupModule.applyAction(s, { type: 'pickInfluenceToLose', bySeat: 1, cardIndex: 0 }, '');
    expect(s.seats[1]!.influences[0]!.revealed).toBe(true);
    expect(s.phase).toBe('turnStart');
    expect(s.currentSeat).toBe(1);
  });

  it('honest Duke tax resolves +3 when nobody challenges', () => {
    let s = freshClassicState(3);
    // Seat 0 will claim Duke (regardless of their actual hand) — they may
    // bluff but in this test we just route the no-challenge path.
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'duke',
        characterActionId: 'tax',
      },
      '',
    );
    expect(s.phase).toBe('awaitingChallenge');
    // Both other living seats pass.
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    // Tax is non-blockable, so it resolves to +3.
    expect(s.seats[0]!.coins).toBe(5);
    expect(s.phase).toBe('turnStart');
  });

  it('foreign aid is challenge-skipped but blockable; passes go to resolve', () => {
    let s = freshClassicState(3);
    s = coupModule.applyAction(s, { type: 'declareGeneral', generalId: 'foreignAid' }, '');
    expect(s.phase).toBe('awaitingBlock');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    expect(s.seats[0]!.coins).toBe(4);
    expect(s.phase).toBe('turnStart');
  });

  it('10-coin rule: must coup', () => {
    let s = freshClassicState(3);
    s.seats[0]!.coins = 10;
    expect(() =>
      coupModule.applyAction(s, { type: 'declareGeneral', generalId: 'income' }, ''),
    ).toThrow(/must coup/i);
  });

  it('viewFor redacts other seats’ face-down cards', () => {
    const s = freshClassicState(3);
    const v0 = coupModule.viewFor(s, 0);
    // Own influences: full identities.
    expect(v0.yourInfluences[0]!.char).toBe(s.seats[0]!.influences[0]!.char);
    // Other seats' face-down cards: char === null.
    expect(v0.seats[1]!.influences[0]!.char).toBeNull();
    expect(v0.seats[2]!.influences[1]!.char).toBeNull();
  });

  it('viewFor with seat = null (spectator) reveals no hand', () => {
    const s = freshClassicState(3);
    const v = coupModule.viewFor(s, null);
    expect(v.yourInfluences).toEqual([]);
    for (const seat of v.seats) {
      for (const inf of seat.influences) {
        expect(inf.char).toBeNull();
      }
    }
  });
});

describe('coup — G54 ruleset', () => {
  it('createInitialState refuses non-implemented characters', () => {
    const opts: CoupOptions = {
      players: [
        { name: 'A', isAI: false },
        { name: 'B', isAI: false },
        { name: 'C', isAI: false },
      ],
      ruleset: 'g54',
      expansions: [],
      // Anarchist is not implemented — set must be rejected.
      characters: ['banker', 'thief', 'spy', 'soldier', 'anarchist'],
    };
    expect(() =>
      coupModule.createInitialState({
        gameId: 'coup',
        seats: [],
        seed: 1,
        gameOptions: opts as unknown as Record<string, unknown>,
      }),
    ).toThrow(/isn't implemented/i);
  });

  it('Tax Collector levies 1 from every other living player', () => {
    let s = buildInitialState(
      4,
      ['banker', 'thief', 'spy', 'soldier', 'taxCollector'],
      ['A', 'B', 'C', 'D'],
      7,
      'g54',
      [],
    );
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'taxCollector',
        characterActionId: 'taxLevy',
      },
      '',
    );
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    // Seat 0 starts at 2 coins, gains 1 from each of the 3 others = 5.
    expect(s.seats[0]!.coins).toBe(5);
    expect(s.seats[1]!.coins).toBe(1);
    expect(s.seats[2]!.coins).toBe(1);
    expect(s.seats[3]!.coins).toBe(1);
  });
});
