import { describe, expect, it } from 'vitest';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { loveLetterModule } from './module';
import type { LoveLetterOptions } from './module';
import type { LoveLetterAction } from './actions';
import type {
  Card,
  LoveLetterPrivateState,
  Rank,
} from './state';
import { RANK_COUNTS } from './state';

// Drop the unused `byUuid` arg. Same wrapper Avalon / Cross Clues tests use.
function apply(
  state: LoveLetterPrivateState,
  action: LoveLetterAction,
): LoveLetterPrivateState {
  return loveLetterModule.applyAction(state, action, '');
}

function configFor(playerCount: number, seed = 42): GameConfig {
  const opts: LoveLetterOptions = {
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `P${i + 1}`,
      isAI: false,
    })),
  };
  return {
    gameId: 'love-letter',
    seats: [],
    seed,
    gameOptions: opts as unknown as Record<string, unknown>,
  };
}

function ackEveryoneStart(state: LoveLetterPrivateState): LoveLetterPrivateState {
  let s = state;
  for (let i = 0; i < s.seats.length; i++) {
    s = apply(s, { type: 'ackStart', bySeat: i });
  }
  return s;
}

function ackEveryoneEffect(state: LoveLetterPrivateState): LoveLetterPrivateState {
  let s = state;
  for (let i = 0; i < s.seats.length; i++) {
    s = apply(s, { type: 'ackEffect', bySeat: i });
  }
  return s;
}

// Force a specific hand on a seat by direct state surgery — only OK in
// tests, where we want to drive specific card-effect paths deterministically.
function withHand(
  state: LoveLetterPrivateState,
  seat: SeatIndex,
  hand: Card[],
): LoveLetterPrivateState {
  return {
    ...state,
    players: {
      ...state.players,
      [seat]: { ...state.players[seat]!, hand: hand.slice() },
    },
  };
}

describe('Love Letter — setup', () => {
  it('rejects player counts outside 2-4', () => {
    expect(() => loveLetterModule.createInitialState(configFor(1))).toThrow();
    expect(() => loveLetterModule.createInitialState(configFor(5))).toThrow();
  });

  it('deals 1 to every seat + 1 extra to the active seat, removes 1 face-down', () => {
    const s = loveLetterModule.createInitialState(configFor(3));
    // Active seat has 2 cards; others have 1.
    for (const seat of s.seats) {
      const expected = seat.index === s.currentSeat ? 2 : 1;
      expect(s.players[seat.index]!.hand.length).toBe(expected);
    }
    expect(s.setAside).not.toBeNull();
    expect(s.setAsideFaceUp).toEqual([]);
    // 16 - 1 face-down - 3 hands - 1 draw = 11 left.
    expect(s.deck.length).toBe(11);
  });

  it('2-player game reveals 3 cards face up', () => {
    const s = loveLetterModule.createInitialState(configFor(2));
    expect(s.setAside).not.toBeNull();
    expect(s.setAsideFaceUp).toHaveLength(3);
    // 16 - 1 face-down - 3 face-up - 2 hands - 1 draw = 9 left.
    expect(s.deck.length).toBe(9);
  });

  it('token target scales with player count', () => {
    expect(loveLetterModule.createInitialState(configFor(2)).tokensToWin).toBe(7);
    expect(loveLetterModule.createInitialState(configFor(3)).tokensToWin).toBe(5);
    expect(loveLetterModule.createInitialState(configFor(4)).tokensToWin).toBe(4);
  });

  it('seeds the deal so the same seed produces the same start', () => {
    const a = loveLetterModule.createInitialState(configFor(4, 7));
    const b = loveLetterModule.createInitialState(configFor(4, 7));
    for (const s of a.seats) {
      expect(b.players[s.index]!.hand).toEqual(a.players[s.index]!.hand);
    }
    expect(b.setAside).toBe(a.setAside);
    expect(b.deck).toEqual(a.deck);
    expect(b.currentSeat).toBe(a.currentSeat);
  });

  it('every dealt card adds up to the canonical 16-card distribution', () => {
    const s = loveLetterModule.createInitialState(configFor(4));
    const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8];
    const tally: Record<Rank, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    if (s.setAside !== null) tally[s.setAside]++;
    for (const c of s.setAsideFaceUp) tally[c]++;
    for (const seat of s.seats) {
      for (const c of s.players[seat.index]!.hand) tally[c]++;
    }
    for (const c of s.deck) tally[c]++;
    for (const r of ranks) {
      expect(tally[r]).toBe(RANK_COUNTS[r]);
    }
  });
});

describe('Love Letter — round start', () => {
  it('every seat must ack before play begins', () => {
    let s = loveLetterModule.createInitialState(configFor(3));
    expect(s.phase).toBe('roundStart');
    s = apply(s, { type: 'ackStart', bySeat: 0 });
    expect(s.phase).toBe('roundStart');
    s = apply(s, { type: 'ackStart', bySeat: 1 });
    expect(s.phase).toBe('roundStart');
    s = apply(s, { type: 'ackStart', bySeat: 2 });
    expect(s.phase).toBe('turn');
  });
});

describe('Love Letter — viewFor redaction', () => {
  it("never exposes another seat's hand", () => {
    const s = loveLetterModule.createInitialState(configFor(4));
    const v0 = loveLetterModule.viewFor(s, 0);
    expect(v0.yourHand).toEqual(s.players[0]!.hand);
    expect(v0.players.find((p) => p.index === 1)?.handSize).toBe(
      s.players[1]!.hand.length,
    );
    // Hand size is the only thing leaked for non-self.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v0.players.find((p) => p.index === 1) as any).hand).toBeUndefined();
  });

  it('never exposes the face-down setAside or the deck', () => {
    const s = loveLetterModule.createInitialState(configFor(3));
    const v = loveLetterModule.viewFor(s, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vAny = v as any;
    expect(vAny.deck).toBeUndefined();
    expect(vAny.setAside).toBeUndefined();
    // The face-up extras in 2p are public; 3p has none.
    expect(v.setAsideFaceUp).toEqual([]);
  });

  it('spectator view (seat=null) sees no hand at all', () => {
    const s = loveLetterModule.createInitialState(configFor(3));
    const v = loveLetterModule.viewFor(s, null);
    expect(v.yourHand).toEqual([]);
    expect(v.yourSeat).toBeNull();
    expect(v.yourPriestPeek).toBeNull();
  });
});

describe('Love Letter — Guard effect', () => {
  function setUpGuardScenario(): LoveLetterPrivateState {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    // Force seat 0 (active) to hold Guard + something safe; seat 1 to
    // hold Priest so a Guard guess of "Priest" lands.
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [1, 4]); // Guard + Handmaid
    s = withHand(s, 1, [2]); // Priest
    return s;
  }

  it('correct guess eliminates the target', () => {
    let s = setUpGuardScenario();
    s = apply(s, { type: 'playCard', bySeat: 0, card: 1 });
    expect(s.phase).toBe('guardTargeting');
    s = apply(s, { type: 'guardGuess', bySeat: 0, target: 1, guess: 2 });
    expect(s.phase).toBe('effectReveal');
    expect(s.lastEffect?.kind).toBe('guardHit');
    expect(s.players[1]!.eliminated).toBe(true);
  });

  it('wrong guess does nothing to the target', () => {
    let s = setUpGuardScenario();
    s = apply(s, { type: 'playCard', bySeat: 0, card: 1 });
    s = apply(s, { type: 'guardGuess', bySeat: 0, target: 1, guess: 5 });
    expect(s.lastEffect?.kind).toBe('guardMiss');
    expect(s.players[1]!.eliminated).toBe(false);
  });

  it('refuses to guess Guard', () => {
    let s = setUpGuardScenario();
    s = apply(s, { type: 'playCard', bySeat: 0, card: 1 });
    expect(() =>
      apply(s, { type: 'guardGuess', bySeat: 0, target: 1, guess: 1 }),
    ).toThrow();
  });
});

describe('Love Letter — Priest effect', () => {
  it('shows the target card only to the actor', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [2, 4]); // Priest + Handmaid
    s = withHand(s, 1, [6]);
    s = apply(s, { type: 'playCard', bySeat: 0, card: 2 });
    expect(s.phase).toBe('priestTargeting');
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    expect(s.phase).toBe('priestReveal');
    // viewFor(0): receives the peek.
    const v0 = loveLetterModule.viewFor(s, 0);
    expect(v0.yourPriestPeek).toEqual({ target: 1, card: 6 });
    // viewFor(1) and viewFor(2): no peek surfaced.
    expect(loveLetterModule.viewFor(s, 1).yourPriestPeek).toBeNull();
    expect(loveLetterModule.viewFor(s, 2).yourPriestPeek).toBeNull();
  });
});

describe('Love Letter — Baron effect', () => {
  it('lower card loses', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [3, 5]); // Baron + Prince — actor holds Prince(5)
    s = withHand(s, 1, [2]); // Priest
    s = apply(s, { type: 'playCard', bySeat: 0, card: 3 });
    // Actor now holds [5]; target holds [2]. After Baron resolve actor's
    // remaining hand should be [5] still (Baron discards itself but actor
    // still has Prince).
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    expect(s.phase).toBe('effectReveal');
    expect(s.players[1]!.eliminated).toBe(true);
    expect(s.players[0]!.eliminated).toBe(false);
  });

  it('tie does nothing', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [3, 6]); // Baron + King
    s = withHand(s, 1, [6]); // King
    s = apply(s, { type: 'playCard', bySeat: 0, card: 3 });
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    expect(s.players[0]!.eliminated).toBe(false);
    expect(s.players[1]!.eliminated).toBe(false);
    expect(s.lastEffect?.loserSeat).toBeNull();
  });
});

describe('Love Letter — Handmaid effect', () => {
  it('protects the actor and prevents being targeted', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [4, 5]); // Handmaid + Prince
    s = apply(s, { type: 'playCard', bySeat: 0, card: 4 });
    expect(s.phase).toBe('effectReveal');
    expect(s.players[0]!.protected).toBe(true);
    s = ackEveryoneEffect(s);
    // Turn advances; seat 1 cannot target seat 0.
    expect(s.phase).toBe('turn');
    expect(s.currentSeat).toBe(1);
    // Force seat 1 to hold a Guard so it would otherwise target seat 0.
    s = withHand(s, 1, [1, 2]);
    s = apply(s, { type: 'playCard', bySeat: 1, card: 1 });
    expect(() =>
      apply(s, { type: 'guardGuess', bySeat: 1, target: 0, guess: 5 }),
    ).toThrow();
  });

  it("protection ends at the actor's next turn", () => {
    let s = loveLetterModule.createInitialState(configFor(2, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [4, 1]); // Handmaid + Guard
    s = withHand(s, 1, [2, 4]);
    // Seat 0 plays Handmaid → protected.
    s = apply(s, { type: 'playCard', bySeat: 0, card: 4 });
    s = ackEveryoneEffect(s);
    expect(s.players[0]!.protected).toBe(true);
    // Seat 1's turn; they play Handmaid too.
    s = withHand(s, 1, [4, 2]);
    s = apply(s, { type: 'playCard', bySeat: 1, card: 4 });
    s = ackEveryoneEffect(s);
    // Back to seat 0; their protection clears as the turn opens.
    expect(s.currentSeat).toBe(0);
    expect(s.players[0]!.protected).toBe(false);
  });
});

describe('Love Letter — Prince effect', () => {
  it('forces target to discard and redraw', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [5, 4]); // Prince + Handmaid
    s = withHand(s, 1, [6]); // King
    const deckLenBefore = s.deck.length;
    s = apply(s, { type: 'playCard', bySeat: 0, card: 5 });
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    expect(s.players[1]!.discard).toContain(6); // discarded King
    expect(s.players[1]!.hand.length).toBe(1); // redrew
    expect(s.deck.length).toBe(deckLenBefore - 1);
    expect(s.lastEffect?.princeWasPrincess).toBe(false);
  });

  it('Princess discarded via Prince → out', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [5, 4]);
    s = withHand(s, 1, [8]); // Princess
    s = apply(s, { type: 'playCard', bySeat: 0, card: 5 });
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    expect(s.players[1]!.eliminated).toBe(true);
    expect(s.lastEffect?.princeWasPrincess).toBe(true);
  });

  it('redraws from setAside when deck is empty', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [5, 4]);
    s = withHand(s, 1, [6]);
    s = { ...s, deck: [], setAside: 7 };
    s = apply(s, { type: 'playCard', bySeat: 0, card: 5 });
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    expect(s.players[1]!.hand).toEqual([7]);
    expect(s.setAside).toBeNull();
  });
});

describe('Love Letter — King effect', () => {
  it('swaps actor and target hands', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [6, 8]); // King + Princess
    s = withHand(s, 1, [2]); // Priest
    s = apply(s, { type: 'playCard', bySeat: 0, card: 6 });
    s = apply(s, { type: 'chooseTarget', bySeat: 0, target: 1 });
    // After King played, actor's hand was reduced to [8]; swap exchanges
    // with target's [2]. Final: actor [2], target [8].
    expect(s.players[0]!.hand).toEqual([2]);
    expect(s.players[1]!.hand).toEqual([8]);
  });
});

describe('Love Letter — Countess + Princess', () => {
  it('Countess forces discard with King', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [7, 6]); // Countess + King
    expect(() => apply(s, { type: 'playCard', bySeat: 0, card: 6 })).toThrow();
    // Countess play is legal.
    s = apply(s, { type: 'playCard', bySeat: 0, card: 7 });
    // Countess is a pure discard — turn advances.
    expect(s.phase).toBe('turn');
    expect(s.currentSeat).toBe(1);
  });

  it('Countess forces discard with Prince', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [7, 5]); // Countess + Prince
    expect(() => apply(s, { type: 'playCard', bySeat: 0, card: 5 })).toThrow();
  });

  it('discarding the Princess eliminates the actor', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [8, 4]); // Princess + Handmaid
    s = apply(s, { type: 'playCard', bySeat: 0, card: 8 });
    expect(s.players[0]!.eliminated).toBe(true);
    expect(s.lastEffect?.princeWasPrincess).toBe(true);
  });
});

describe('Love Letter — round-end conditions', () => {
  it('last-standing wins a token', () => {
    let s = loveLetterModule.createInitialState(configFor(2, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [1, 1]); // Guard + Guard
    s = withHand(s, 1, [2]); // Priest
    s = apply(s, { type: 'playCard', bySeat: 0, card: 1 });
    s = apply(s, { type: 'guardGuess', bySeat: 0, target: 1, guess: 2 });
    // Eliminate seat 1 → round ends; ack to advance.
    s = ackEveryoneEffect(s);
    expect(s.phase).toBe('roundOver');
    expect(s.history[0]!.winnerSeats).toEqual([0]);
    expect(s.players[0]!.tokens).toBe(1);
  });

  it('match ends when a seat reaches the token target', () => {
    let s = loveLetterModule.createInitialState(configFor(2, 1));
    // Inflate seat 0's tokens so the next round-win triggers match-over.
    s = {
      ...s,
      players: {
        ...s.players,
        0: { ...s.players[0]!, tokens: 6 },
      },
    };
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    s = withHand(s, 0, [1, 1]);
    s = withHand(s, 1, [2]);
    s = apply(s, { type: 'playCard', bySeat: 0, card: 1 });
    s = apply(s, { type: 'guardGuess', bySeat: 0, target: 1, guess: 2 });
    s = ackEveryoneEffect(s);
    expect(s.phase).toBe('gameOver');
    expect(s.matchWinners).toEqual([0]);
    expect(loveLetterModule.isFinished(s)).toBe(true);
  });
});

describe('Love Letter — AI smoke', () => {
  it('drives a full match without throwing', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 99));
    let safety = 5000;
    while (!loveLetterModule.isFinished(s) && safety-- > 0) {
      // Find any seat with a pending AI action.
      let progressed = false;
      for (const seat of s.seats) {
        const action = loveLetterModule.aiChooseAction?.(s, seat.index);
        if (action) {
          s = apply(s, action);
          progressed = true;
          break;
        }
      }
      if (!progressed) {
        throw new Error(`AI deadlock in phase ${s.phase}`);
      }
    }
    expect(loveLetterModule.isFinished(s)).toBe(true);
    expect(s.matchWinners.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Love Letter — no-targets edge case', () => {
  it('resolves to noTargets when every other seat is protected', () => {
    let s = loveLetterModule.createInitialState(configFor(3, 1));
    s = ackEveryoneStart(s);
    s = { ...s, currentSeat: 0 };
    // Protect both opponents; give actor a Priest (target-required card).
    s = {
      ...s,
      players: {
        ...s.players,
        1: { ...s.players[1]!, protected: true },
        2: { ...s.players[2]!, protected: true },
      },
    };
    s = withHand(s, 0, [2, 4]); // Priest + Handmaid
    s = apply(s, { type: 'playCard', bySeat: 0, card: 2 });
    expect(s.phase).toBe('effectReveal');
    expect(s.lastEffect?.kind).toBe('noTargets');
  });
});
