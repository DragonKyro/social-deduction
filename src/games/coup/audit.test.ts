import { describe, expect, it } from 'vitest';
import type { CoupGameAction } from './actions';
import { aiChooseAction } from './ai';
import { CLASSIC_FIVE } from './characters';
import { coupModule } from './module';
import { buildInitialState } from './setup';
import type { CoupCharacter, CoupPrivateState } from './state';

// Regression tests for the rules / validation audit. One block per bug.

function classic(seats = 3, seed = 42): CoupPrivateState {
  return buildInitialState(seats, CLASSIC_FIVE, Array.from({ length: seats }, (_, i) => `P${i + 1}`), seed, 'classic', []);
}

function g54(chars: CoupCharacter[], seats = 4, seed = 11, anarchy = false): CoupPrivateState {
  return buildInitialState(
    seats,
    chars,
    Array.from({ length: seats }, (_, i) => `P${i + 1}`),
    seed,
    'g54',
    anarchy ? ['anarchy'] : [],
  );
}

const act = (s: CoupPrivateState, a: CoupGameAction) => coupModule.applyAction(s, a, '');

function setHand(s: CoupPrivateState, seat: number, a: CoupCharacter, b: CoupCharacter) {
  s.seats[seat]!.influences = [
    { char: a, revealed: false },
    { char: b, revealed: false },
  ];
}

describe('audit: turn ownership (bySeat on declarations)', () => {
  it('rejects a declaration from a seat whose turn it is not', () => {
    const s = classic();
    expect(() => act(s, { type: 'declareGeneral', bySeat: 1, generalId: 'income' })).toThrow(/turn/i);
    expect(() =>
      act(s, { type: 'declareCharacter', bySeat: 2, claimedCharacter: 'duke', characterActionId: 'tax' }),
    ).toThrow(/turn/i);
  });

  it('rejects actions with no bySeat at all', () => {
    const s = classic();
    expect(() =>
      act(s, { type: 'declareGeneral', generalId: 'income' } as unknown as CoupGameAction),
    ).toThrow(/seat/i);
  });

  it('accepts the current seat', () => {
    const s = act(classic(), { type: 'declareGeneral', bySeat: 0, generalId: 'income' });
    expect(s.seats[0]!.coins).toBe(3);
  });
});

describe('audit: eliminated / non-responding seats', () => {
  it("an eliminated seat can't pass or challenge", () => {
    let s = classic(3);
    s.seats[2]!.influences.forEach((i) => (i.revealed = true));
    s.seats[2]!.eliminated = true;
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'duke', characterActionId: 'tax' });
    expect(() => act(s, { type: 'challenge', bySeat: 2 })).toThrow(/eliminated/i);
    expect(() => act(s, { type: 'pass', bySeat: 2 })).toThrow(/eliminated/i);
    // The window only waits on living opponents: seat 1's pass resolves it.
    s = act(s, { type: 'pass', bySeat: 1 });
    expect(s.seats[0]!.coins).toBe(5);
  });

  it("the claimer can't challenge or pass on their own claim", () => {
    const s = act(classic(), { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'duke', characterActionId: 'tax' });
    expect(() => act(s, { type: 'challenge', bySeat: 0 })).toThrow();
    expect(() => act(s, { type: 'pass', bySeat: 0 })).toThrow();
  });

  it('removed no-op actions are rejected instead of silently "succeeding"', () => {
    const s = classic();
    expect(() => act(s, { type: 'ackTurn', bySeat: 0 } as unknown as CoupGameAction)).toThrow();
    expect(() => act(s, { type: 'revealCard', bySeat: 0, cardIndex: 0 } as unknown as CoupGameAction)).toThrow();
  });
});

describe('audit: block window is target-only for targeted actions', () => {
  it('only the assassination target may block (or is waited on)', () => {
    let s = classic(4);
    s.seats[0]!.coins = 3;
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'assassin', characterActionId: 'assassinate', target: 2 });
    for (const seat of [1, 2, 3]) s = act(s, { type: 'pass', bySeat: seat });
    expect(s.phase).toBe('awaitingBlock');
    expect(coupModule.viewFor(s, null).awaitingSeats).toEqual([2]);
    expect(() => act(s, { type: 'declareBlock', bySeat: 1, character: 'contessa' })).toThrow(/target/i);
    expect(() => act(s, { type: 'pass', bySeat: 3 })).toThrow();
    s = act(s, { type: 'pass', bySeat: 2 });
    expect(s.phase).toBe('loseInfluence');
    expect(s.pending!.loseInfluencePending!.seat).toBe(2);
  });

  it('anyone may block Foreign Aid as Duke', () => {
    let s = classic(3);
    s = act(s, { type: 'declareGeneral', bySeat: 0, generalId: 'foreignAid' });
    expect(coupModule.viewFor(s, null).awaitingSeats).toEqual([1, 2]);
    s = act(s, { type: 'declareBlock', bySeat: 2, character: 'duke' });
    expect(s.phase).toBe('awaitingBlockChallenge');
  });

  it('Captain steal is blockable by Captain or Ambassador in Classic', () => {
    let s = classic(3);
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'captain', characterActionId: 'steal', target: 1 });
    s = act(s, { type: 'pass', bySeat: 1 });
    s = act(s, { type: 'pass', bySeat: 2 });
    expect(coupModule.viewFor(s, 1).pending!.validBlockers.sort()).toEqual(['ambassador', 'captain']);
    s = act(s, { type: 'declareBlock', bySeat: 1, character: 'ambassador' });
    expect(s.pending!.blocker).toEqual({ by: 1, character: 'ambassador' });
  });
});

describe('audit: challenge resolution', () => {
  it('honest claim: proven card is replaced from the deck, challenger loses', () => {
    let s = classic(3, 7);
    setHand(s, 0, 'duke', 'contessa');
    const deckBefore = s.deck.length;
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'duke', characterActionId: 'tax' });
    s = act(s, { type: 'challenge', bySeat: 1 });
    expect(s.phase).toBe('loseInfluence');
    expect(s.pending!.loseInfluencePending).toEqual({ seat: 1, reason: 'failedChallenge' });
    expect(s.deck.length).toBe(deckBefore);
    expect(s.seats[0]!.influences.every((i) => !i.revealed)).toBe(true);
    s = act(s, { type: 'pickInfluenceToLose', bySeat: 1, cardIndex: 0 });
    // Tax still resolves.
    expect(s.seats[0]!.coins).toBe(5);
    expect(s.phase).toBe('turnStart');
  });

  it('bluff caught: claimer chooses which card to lose and the action fails', () => {
    let s = classic(3, 7);
    setHand(s, 0, 'captain', 'contessa');
    s.deck = s.deck.map((c) => c);
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'duke', characterActionId: 'tax' });
    s = act(s, { type: 'challenge', bySeat: 2 });
    expect(s.pending!.loseInfluencePending).toEqual({ seat: 0, reason: 'lostBluff' });
    s = act(s, { type: 'pickInfluenceToLose', bySeat: 0, cardIndex: 1 });
    expect(s.seats[0]!.influences[1]).toEqual({ char: 'contessa', revealed: true });
    expect(s.seats[0]!.coins).toBe(2);
    expect(s.currentSeat).toBe(1);
  });

  it('a caught Assassin bluff fails and the 3 coins are returned (official rule)', () => {
    let s = classic(3, 7);
    setHand(s, 0, 'captain', 'contessa');
    s.seats[0]!.coins = 3;
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'assassin', characterActionId: 'assassinate', target: 1 });
    expect(s.seats[0]!.coins).toBe(0);
    s = act(s, { type: 'challenge', bySeat: 1 });
    s = act(s, { type: 'pickInfluenceToLose', bySeat: 0, cardIndex: 0 });
    expect(s.seats[0]!.coins).toBe(3);
    expect(s.seats[1]!.influences.every((i) => !i.revealed)).toBe(true);
  });

  it('double loss: target challenges an honest assassin, then the assassination lands', () => {
    let s = classic(3, 7);
    setHand(s, 0, 'assassin', 'duke');
    setHand(s, 1, 'captain', 'ambassador');
    s.seats[0]!.coins = 3;
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'assassin', characterActionId: 'assassinate', target: 1 });
    s = act(s, { type: 'challenge', bySeat: 1 });
    s = act(s, { type: 'pickInfluenceToLose', bySeat: 1, cardIndex: 0 });
    // Still alive with one card: may still block with Contessa.
    expect(s.phase).toBe('awaitingBlock');
    s = act(s, { type: 'pass', bySeat: 1 });
    expect(s.seats[1]!.eliminated).toBe(true);
  });

  it('challenging a block: bluffing blocker loses and the action resolves', () => {
    let s = classic(3, 7);
    setHand(s, 1, 'captain', 'ambassador');
    s = act(s, { type: 'declareGeneral', bySeat: 0, generalId: 'foreignAid' });
    s = act(s, { type: 'declareBlock', bySeat: 1, character: 'duke' });
    s = act(s, { type: 'challenge', bySeat: 0 });
    s = act(s, { type: 'pickInfluenceToLose', bySeat: 1, cardIndex: 0 });
    expect(s.seats[0]!.coins).toBe(4);
  });
});

describe('audit: revive token cannot be dodged', () => {
  it('picking an already-revealed card while blessed is rejected', () => {
    let s = g54(['banker', 'spy', 'soldier', 'judge', 'bishop'], 3);
    s.seats[1]!.tokens.reviveBlessed = true;
    s.seats[1]!.influences[0]!.revealed = true;
    // Seat 1 gets put in a loseInfluence pick via a failed challenge.
    setHand(s, 0, 'banker', 'spy');
    s.seats[1]!.influences[1]!.char = 'judge';
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'banker', characterActionId: 'tax' });
    s = act(s, { type: 'challenge', bySeat: 1 });
    // Only one card left → auto-loss → token spent, card kept.
    expect(s.seats[1]!.tokens.reviveBlessed).toBe(false);
    expect(s.seats[1]!.influences[1]!.revealed).toBe(false);
  });

  it('pickInfluenceToLose on an already-revealed slot is rejected', () => {
    let s = classic(3);
    s.seats[0]!.coins = 7;
    s = act(s, { type: 'declareGeneral', bySeat: 0, generalId: 'coup', target: 1 });
    expect(s.phase).toBe('loseInfluence');
    s.seats[1]!.influences[0]!.revealed = true; // simulate a stale UI click
    expect(() => act(s, { type: 'pickInfluenceToLose', bySeat: 1, cardIndex: 0 })).toThrow(/face-down/i);
  });
});

describe('audit: G54 deadlocks', () => {
  it('10+ coins with no legal Coup target waives the must-coup rule', () => {
    let s = g54(['banker', 'spy', 'soldier', 'judge', 'peacekeeper'], 2);
    s.seats[1]!.tokens.peacekeeping = true;
    s.seats[0]!.coins = 10;
    expect(() => act(s, { type: 'declareGeneral', bySeat: 0, generalId: 'coup', target: 1 })).toThrow(/Peacekeeping/);
    s = act(s, { type: 'declareGeneral', bySeat: 0, generalId: 'income' });
    expect(s.seats[0]!.coins).toBe(11);
  });

  it('a treaty is void once the bonded pair are the last two alive', () => {
    let s = g54(['banker', 'spy', 'soldier', 'judge', 'foreignConsular'], 3);
    s.seats[1]!.tokens.treaty = 2;
    s.seats[2]!.tokens.treaty = 1;
    s.seats[0]!.influences.forEach((i) => (i.revealed = true));
    s.seats[0]!.eliminated = true;
    s.currentSeat = 1;
    s.seats[1]!.coins = 7;
    s = act(s, { type: 'declareGeneral', bySeat: 1, generalId: 'coup', target: 2 });
    expect(s.phase === 'awaitingBlock' || s.phase === 'loseInfluence').toBe(true);
  });

  it('Inquisitor peek needs a legal target and resolves privately (used to crash on resolve)', () => {
    let s = g54(['banker', 'spy', 'soldier', 'judge', 'inquisitor']);
    expect(() =>
      act(s, {
        type: 'declareCharacter',
        bySeat: 0,
        claimedCharacter: 'inquisitor',
        characterActionId: 'inquisitorExchange',
        inquisitorBranch: 'peek',
      }),
    ).toThrow(/target/i);
    s = act(s, {
      type: 'declareCharacter',
      bySeat: 0,
      claimedCharacter: 'inquisitor',
      characterActionId: 'inquisitorExchange',
      inquisitorBranch: 'peek',
      target: 2,
      inquisitorPeekCardIndex: 1,
    });
    for (const seat of [1, 2, 3]) s = act(s, { type: 'pass', bySeat: seat });
    expect(s.phase).toBe('spyPeek');
    expect(s.privatePeeks[0]).toEqual([
      { byActionId: 'inquisitorPeek', target: 2, card: s.seats[2]!.influences[1]!.char, cardIndex: 1 },
    ]);
    expect(coupModule.viewFor(s, 1).yourPeeks).toEqual([]);
    s = act(s, { type: 'ackPeek', bySeat: 0 });
    expect(s.phase).toBe('turnStart');
  });

  it('Arms Dealer on a last influence no longer strands the game in sellInfluencePick', () => {
    let s = g54(['banker', 'spy', 'soldier', 'judge', 'inquisitor', 'armsDealer'], 3, 5, true);
    s.seats[0]!.influences[0]!.revealed = true;
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'armsDealer', characterActionId: 'armsDealerSell' });
    s = act(s, { type: 'pass', bySeat: 1 });
    s = act(s, { type: 'pass', bySeat: 2 });
    expect(s.phase).toBe('turnStart');
    expect(s.currentSeat).toBe(1);
  });

  it('pile-on closes itself once every opponent has decided', () => {
    let s = g54(['capitalist', 'spy', 'soldier', 'judge', 'inquisitor'], 3);
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'capitalist', characterActionId: 'pileOnIncome' });
    s = act(s, { type: 'pass', bySeat: 1 });
    s = act(s, { type: 'pass', bySeat: 2 });
    expect(s.phase).toBe('pileOnWindow');
    expect(() => act(s, { type: 'closePileOn', bySeat: 1 })).toThrow(/opener/i);
    s = act(s, { type: 'joinPileOn', bySeat: 1 });
    s = act(s, { type: 'joinPileOn', bySeat: 2 });
    expect(s.phase).toBe('turnStart');
    expect(s.seats.map((x) => x.coins)).toEqual([4, 4, 4]);
  });

  it("the rally's target can't chip in against themselves", () => {
    let s = g54(['protestor', 'spy', 'soldier', 'judge', 'inquisitor']);
    s = act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'protestor', characterActionId: 'chipInEliminate', target: 1 });
    for (const seat of [1, 2, 3]) s = act(s, { type: 'pass', bySeat: seat });
    expect(s.phase).toBe('chipInWindow');
    expect(() => act(s, { type: 'chipIn', bySeat: 1 })).toThrow();
    s = act(s, { type: 'pass', bySeat: 2 });
    s = act(s, { type: 'pass', bySeat: 3 });
    expect(s.phase).toBe('turnStart');
  });
});

describe('audit: AI never proposes an illegal move in tricky spots', () => {
  it('Mercenary claims always name a partner', () => {
    const s = g54(['banker', 'spy', 'mercenary', 'judge', 'inquisitor']);
    setHand(s, 0, 'mercenary', 'mercenary');
    s.seats[0]!.coins = 5;
    for (let k = 0; k < 40; k++) {
      s.actionCount = k;
      const a = aiChooseAction(s, 0);
      expect(a).not.toBeNull();
      expect(() => act(s, a!)).not.toThrow();
    }
  });

  it('respects a treaty when the bond was overwritten on one side only', () => {
    const s = g54(['banker', 'spy', 'soldier', 'judge', 'foreignConsular'], 4);
    // 1<->2 bonded, then a new Treaty bonded 0<->2: seat 1 still points at 2.
    s.seats[1]!.tokens.treaty = 2;
    s.seats[0]!.tokens.treaty = 2;
    s.seats[2]!.tokens.treaty = 0;
    s.seats[1]!.coins = 9; // richest, so a naive AI would aim here
    s.currentSeat = 2;
    s.seats[2]!.coins = 10;
    const a = aiChooseAction(s, 2);
    expect(a).toMatchObject({ type: 'declareGeneral', generalId: 'coup', target: 3 });
    expect(() => act(s, a!)).not.toThrow();
  });
});

describe('audit: G54 infinite-game breakers (found by self-play)', () => {
  it('a Coup forced by 10+ coins skips the G54 block window', () => {
    let s = g54(['banker', 'spy', 'guerrilla', 'judge', 'inquisitor'], 3);
    s.seats[0]!.coins = 7;
    s = act(s, { type: 'declareGeneral', bySeat: 0, generalId: 'coup', target: 1 });
    expect(s.phase).toBe('awaitingBlock'); // voluntary coup: Judge / Guerrilla may block
    s = classicToG54Forced();
    expect(s.phase).toBe('loseInfluence');
    expect(s.pending!.unblockable).toBe(true);
    expect(coupModule.viewFor(s, 1).pending!.validBlockers).toEqual([]);

    function classicToG54Forced() {
      let t = g54(['banker', 'spy', 'guerrilla', 'judge', 'inquisitor'], 3);
      t.seats[0]!.coins = 10;
      t = act(t, { type: 'declareGeneral', bySeat: 0, generalId: 'coup', target: 1 });
      return t;
    }
  });

  it('a revive token saves a seat only once per game', () => {
    let s = g54(['banker', 'spy', 'soldier', 'lawyer', 'inquisitor'], 3);
    s.seats[1]!.influences[0]!.revealed = true;
    s.seats[1]!.tokens.reviveBlessed = true;
    s.seats[0]!.coins = 10;
    s = act(s, { type: 'declareGeneral', bySeat: 0, generalId: 'coup', target: 1 });
    expect(s.seats[1]!.eliminated).toBe(false);
    expect(s.seats[1]!.tokens).toMatchObject({ reviveBlessed: false, reviveUsed: true });
    // Seat 1 claims Lawyer again: coins, but no new token.
    s.seats[1]!.influences[1]!.char = 'lawyer';
    s = act(s, { type: 'declareCharacter', bySeat: 1, claimedCharacter: 'lawyer', characterActionId: 'lawyerSwing' });
    s = act(s, { type: 'pass', bySeat: 0 });
    s = act(s, { type: 'pass', bySeat: 2 });
    expect(s.seats[1]!.tokens.reviveBlessed).toBe(false);
  });
});

describe('audit: action cost on a challenge vs a block', () => {
  function assassinTurn() {
    const s = classic(3);
    s.currentSeat = 0;
    s.seats[0]!.coins = 5;
    setHand(s, 0, 'duke', 'captain'); // bluffing Assassin
    setHand(s, 1, 'contessa', 'ambassador');
    setHand(s, 2, 'duke', 'captain');
    return act(s, { type: 'declareCharacter', bySeat: 0, claimedCharacter: 'assassin', characterActionId: 'assassinate', target: 1 });
  }

  it('a successfully challenged Assassin gets the 3 coins back (official rule)', () => {
    let s = assassinTurn();
    expect(s.seats[0]!.coins).toBe(2);
    s = act(s, { type: 'challenge', bySeat: 2 });
    expect(s.seats[0]!.coins).toBe(5);
  });

  it('a Contessa block leaves the fee spent', () => {
    let s = assassinTurn();
    for (const seat of [1, 2]) s = act(s, { type: 'pass', bySeat: seat });
    expect(s.phase).toBe('awaitingBlock');
    s = act(s, { type: 'declareBlock', bySeat: 1, character: 'contessa' } as CoupGameAction);
    for (const seat of [0, 2]) {
      if (s.phase === 'awaitingBlockChallenge') s = act(s, { type: 'pass', bySeat: seat });
    }
    expect(s.seats[0]!.coins).toBe(2);
  });
});
