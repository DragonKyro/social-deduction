import { describe, expect, it } from 'vitest';
import { coupModule } from './module';
import { buildInitialState, validateCharacterSetFull } from './setup';
import { CLASSIC_FIVE } from './characters';
import type { CoupOptions } from './module';
import type { CoupCharacter } from './state';

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
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
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
  it('createInitialState rejects sets with wrong total', () => {
    const opts: CoupOptions = {
      players: [
        { name: 'A', isAI: false },
        { name: 'B', isAI: false },
        { name: 'C', isAI: false },
      ],
      ruleset: 'g54',
      expansions: [],
      // G54 (no anarchy) requires exactly 5 — give 4.
      characters: ['banker', 'thief', 'spy', 'soldier'],
    };
    expect(() =>
      coupModule.createInitialState({
        gameId: 'coup',
        seats: [],
        seed: 1,
        gameOptions: opts as unknown as Record<string, unknown>,
      }),
    ).toThrow(/exactly 5/i);
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
    expect(s.seats[0]!.coins).toBe(5);
    expect(s.seats[1]!.coins).toBe(1);
    expect(s.seats[2]!.coins).toBe(1);
    expect(s.seats[3]!.coins).toBe(1);
  });
});

describe('coup — setup validation', () => {
  it('classic requires exactly 5 characters', () => {
    const less = validateCharacterSetFull(['duke', 'assassin', 'captain'], 'classic', false);
    expect(less.error).toMatch(/exactly 5/i);
    const ok = validateCharacterSetFull(CLASSIC_FIVE, 'classic', false);
    expect(ok.error).toBeNull();
  });

  it('G54 + Anarchy requires exactly 6 characters', () => {
    const five = validateCharacterSetFull(
      ['banker', 'spy', 'soldier', 'judge', 'inquisitor'],
      'g54',
      true,
    );
    expect(five.error).toMatch(/exactly 6/i);

    const six = validateCharacterSetFull(
      ['banker', 'spy', 'soldier', 'judge', 'inquisitor', 'plantationOwner'],
      'g54',
      true,
    );
    expect(six.error).toBeNull();
    expect(six.warning).toBeNull();
  });

  it('G54 warns when category distribution is off-balance', () => {
    // Two finance, no force.
    const unbalanced = validateCharacterSetFull(
      ['banker', 'taxCollector', 'spy', 'judge', 'inquisitor'],
      'g54',
      false,
    );
    expect(unbalanced.error).toBeNull();
    expect(unbalanced.warning).toMatch(/off-balance/i);
  });
});

// =============================================================================
// Exotic mechanics — one test per family
// =============================================================================

function freshG54(chars: CoupCharacter[], seats = 4, seed = 11, anarchy = false) {
  return buildInitialState(
    seats,
    chars,
    Array.from({ length: seats }, (_, i) => `P${i + 1}`),
    seed,
    'g54',
    anarchy ? ['anarchy'] : [],
  );
}

describe('coup — speculator (custom steal)', () => {
  it('steals min(own coins, 5) capped at target coins', () => {
    const set: CoupCharacter[] = ['speculator', 'spy', 'soldier', 'judge', 'inquisitor'];
    let s = freshG54(set);
    s.seats[0]!.coins = 3;
    s.seats[1]!.coins = 10;
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'speculator',
        characterActionId: 'customSteal',
        target: 1,
      },
      '',
    );
    // Pass challenges (3 opponents).
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    // Block window — Speculator blocks steal in our table. Pass.
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    expect(s.seats[0]!.coins).toBe(3 + 3); // stole 3 (own coins)
    expect(s.seats[1]!.coins).toBe(10 - 3);
  });

  it('caps at 5 even with more own coins', () => {
    const set: CoupCharacter[] = ['speculator', 'spy', 'soldier', 'judge', 'inquisitor'];
    let s = freshG54(set);
    s.seats[0]!.coins = 8;
    s.seats[1]!.coins = 10;
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'speculator',
        characterActionId: 'customSteal',
        target: 1,
      },
      '',
    );
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    expect(s.seats[0]!.coins).toBe(8 + 5);
    expect(s.seats[1]!.coins).toBe(10 - 5);
  });
});

describe('coup — capitalist pile-on', () => {
  it('multiple joiners each get +2 coins on resolve', () => {
    const set: CoupCharacter[] = ['capitalist', 'spy', 'soldier', 'judge', 'inquisitor'];
    let s = freshG54(set);
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'capitalist',
        characterActionId: 'pileOnIncome',
      },
      '',
    );
    // All pass challenge.
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    expect(s.phase).toBe('pileOnWindow');
    s = coupModule.applyAction(s, { type: 'joinPileOn', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'joinPileOn', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'closePileOn', bySeat: 0 }, '');
    expect(s.seats[0]!.coins).toBe(2 + 2);
    expect(s.seats[1]!.coins).toBe(2 + 2);
    expect(s.seats[2]!.coins).toBe(2 + 2);
    expect(s.seats[3]!.coins).toBe(2); // did not join
  });
});

describe('coup — protestor chip-in', () => {
  it('threshold reached forces target lose-influence', () => {
    const set: CoupCharacter[] = ['protestor', 'spy', 'soldier', 'judge', 'inquisitor'];
    let s = freshG54(set);
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'protestor',
        characterActionId: 'chipInEliminate',
        target: 1,
      },
      '',
    );
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    expect(s.phase).toBe('chipInWindow');
    // Threshold for 3 opponents = ceil(3/2) = 2.
    s = coupModule.applyAction(s, { type: 'chipIn', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'chipIn', bySeat: 3 }, '');
    expect(s.phase).toBe('loseInfluence');
    expect(s.pending!.loseInfluencePending!.seat).toBe(1);
  });
});

describe('coup — foreign consular treaty', () => {
  it('places treaty bond between two seats and bars cross-targeting', () => {
    const set: CoupCharacter[] = ['banker', 'spy', 'soldier', 'judge', 'foreignConsular'];
    let s = freshG54(set);
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'foreignConsular',
        characterActionId: 'foreignConsularTreaty',
        treatyPair: [1, 2],
      },
      '',
    );
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    expect(s.seats[1]!.tokens.treaty).toBe(2);
    expect(s.seats[2]!.tokens.treaty).toBe(1);
    // Seat 1 tries to coup seat 2 — should be barred.
    s.seats[1]!.coins = 7;
    s.currentSeat = 1;
    s.phase = 'turnStart';
    expect(() =>
      coupModule.applyAction(
        s,
        { type: 'declareGeneral', generalId: 'coup', target: 2 },
        '',
      ),
    ).toThrow(/Treaty/i);
  });
});

describe('coup — peacekeeper shield', () => {
  it('peacekeeping token bars opponents from targeting', () => {
    const set: CoupCharacter[] = ['banker', 'spy', 'soldier', 'judge', 'peacekeeper'];
    let s = freshG54(set);
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'peacekeeper',
        characterActionId: 'peacekeeperShield',
      },
      '',
    );
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    expect(s.seats[0]!.tokens.peacekeeping).toBe(true);
    // Now seat 1 tries to coup seat 0.
    s.seats[1]!.coins = 7;
    expect(() =>
      coupModule.applyAction(
        s,
        { type: 'declareGeneral', generalId: 'coup', target: 0 },
        '',
      ),
    ).toThrow(/Peacekeeping/i);
  });
});

describe('coup — arms dealer sell influence', () => {
  it('sells a face-down card for 4 coins + 1 weapon token', () => {
    const set: CoupCharacter[] = ['banker', 'spy', 'soldier', 'judge', 'inquisitor', 'armsDealer'];
    let s = freshG54(set, 4, 5, true);
    expect(s.seats[0]!.influences).toHaveLength(2);
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'armsDealer',
        characterActionId: 'armsDealerSell',
      },
      '',
    );
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    expect(s.phase).toBe('sellInfluencePick');
    s = coupModule.applyAction(s, { type: 'sellInfluence', bySeat: 0, cardIndex: 0 }, '');
    expect(s.seats[0]!.coins).toBe(2 + 4);
    expect(s.seats[0]!.tokens.weapons).toBe(1);
    expect(s.seats[0]!.influences[0]!.revealed).toBe(true);
  });
});

describe('coup — judge blocks coup (G54)', () => {
  it('coup attacker still pays 7 but no influence is lost when block stands', () => {
    const set: CoupCharacter[] = ['banker', 'spy', 'soldier', 'judge', 'inquisitor'];
    let s = freshG54(set);
    s.seats[0]!.coins = 7;
    s = coupModule.applyAction(
      s,
      { type: 'declareGeneral', generalId: 'coup', target: 1 },
      '',
    );
    expect(s.seats[0]!.coins).toBe(0);
    expect(s.phase).toBe('awaitingBlock');
    s = coupModule.applyAction(
      s,
      { type: 'declareBlock', bySeat: 1, character: 'judge' },
      '',
    );
    expect(s.phase).toBe('awaitingBlockChallenge');
    // 4 seats (default freshG54 size), challenger is everyone except the
    // blocker (seat 1) — pass for seats 0, 2, 3.
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 0 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    // Block stands — seat 1 keeps both influences.
    expect(s.seats[1]!.influences[0]!.revealed).toBe(false);
    expect(s.seats[1]!.influences[1]!.revealed).toBe(false);
    expect(s.phase).toBe('turnStart');
  });
});

describe('coup — bishop revive token', () => {
  it('blessed seat keeps their last influence on death', () => {
    const set: CoupCharacter[] = ['banker', 'spy', 'soldier', 'judge', 'bishop'];
    let s = freshG54(set, 3);
    // Pre-seed: seat 1 has a revive token + 1 living card.
    s.seats[1]!.tokens.reviveBlessed = true;
    s.seats[1]!.influences[0]!.revealed = true;
    // Seat 0 coups seat 1.
    s.seats[0]!.coins = 7;
    s = coupModule.applyAction(
      s,
      { type: 'declareGeneral', generalId: 'coup', target: 1 },
      '',
    );
    // Coup is blockable in G54 (Judge), so we land in awaitingBlock.
    expect(s.phase).toBe('awaitingBlock');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    // Coup resolves — target has only 1 unrevealed influence, blessed kicks in.
    expect(s.seats[1]!.tokens.reviveBlessed).toBe(false);
    expect(s.seats[1]!.influences[1]!.revealed).toBe(false);
    expect(s.seats[1]!.eliminated).toBe(false);
  });
});

describe('coup — world bank (wealth redistribute)', () => {
  it('grants +1 coin to every living player', () => {
    const set: CoupCharacter[] = ['banker', 'spy', 'soldier', 'judge', 'inquisitor', 'worldBank'];
    let s = freshG54(set, 4, 9, true);
    const before = s.seats.map((x) => x.coins);
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'worldBank',
        characterActionId: 'wealthRedistribute',
      },
      '',
    );
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    for (let i = 0; i < s.seats.length; i++) {
      if (!s.seats[i]!.eliminated) {
        expect(s.seats[i]!.coins).toBe(before[i]! + 1);
      }
    }
  });
});

describe('coup — force-swap (lobbyist)', () => {
  it('target picks a card; drawn card lands in their hand, old card returns to deck', () => {
    const set: CoupCharacter[] = ['banker', 'lobbyist', 'soldier', 'judge', 'inquisitor'];
    let s = freshG54(set);
    const originalCard = s.seats[1]!.influences[0]!.char;
    s = coupModule.applyAction(
      s,
      {
        type: 'declareCharacter',
        claimedCharacter: 'lobbyist',
        characterActionId: 'forceSwap',
        target: 1,
      },
      '',
    );
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 1 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 2 }, '');
    s = coupModule.applyAction(s, { type: 'pass', bySeat: 3 }, '');
    expect(s.phase).toBe('targetSwapPick');
    s = coupModule.applyAction(s, { type: 'targetSwapPick', bySeat: 1, cardIndex: 0 }, '');
    // The original card should have been returned to the deck.
    expect(s.deck).toContain(originalCard);
    // Turn advanced.
    expect(s.phase).toBe('turnStart');
    expect(s.currentSeat).toBe(1);
  });
});
