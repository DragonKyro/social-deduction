import { describe, expect, it } from 'vitest';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { crossCluesModule } from './module';
import type { CrossCluesOptions } from './module';
import type { CrossCluesAction } from './actions';
import type { Coord, CrossCluesPrivateState } from './state';
import { PACKS } from './word-packs';

// Drop the unused `byUuid` arg the GameModule contract takes — tests don't
// care about identity. Same wrapper Avalon's tests use.
function apply(
  state: CrossCluesPrivateState,
  action: CrossCluesAction,
): CrossCluesPrivateState {
  return crossCluesModule.applyAction(state, action, '');
}

function configFor(
  playerCount: number,
  packId = 'standard',
  seed = 42,
): GameConfig {
  const opts: CrossCluesOptions = {
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `P${i + 1}`,
      isAI: false,
    })),
    packId,
  };
  return {
    gameId: 'cross-clues',
    seats: [],
    seed,
    gameOptions: opts as unknown as Record<string, unknown>,
  };
}

function ackEveryoneSetup(state: CrossCluesPrivateState): CrossCluesPrivateState {
  let s = state;
  for (let i = 0; i < s.seats.length; i++) {
    s = apply(s, { type: 'ackSetup', bySeat: i });
  }
  return s;
}

function ackEveryoneReveal(state: CrossCluesPrivateState): CrossCluesPrivateState {
  let s = state;
  for (let i = 0; i < s.seats.length; i++) {
    s = apply(s, { type: 'ackReveal', bySeat: i });
  }
  return s;
}

// Drive one full round (clue + guess + ack-by-everyone). `picker` decides
// which cell the guesser submits given the current state.
function playRound(
  state: CrossCluesPrivateState,
  clueWord: string,
  picker: (s: CrossCluesPrivateState) => Coord,
): CrossCluesPrivateState {
  let s = state;
  s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: clueWord });
  const guess = picker(s);
  s = apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: guess });
  s = ackEveryoneReveal(s);
  return s;
}

// Sigh, `submitGuess` rejects already-resolved cells. Find any unresolved
// cell. Used when we want a wrong-on-purpose guess.
function firstUnresolved(s: CrossCluesPrivateState): Coord {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!s.grid[r]![c]!.resolved) return { row: r, col: c };
    }
  }
  throw new Error('Grid fully resolved');
}

describe('Cross Clues — setup', () => {
  it('rejects player counts outside 2-6', () => {
    expect(() => crossCluesModule.createInitialState(configFor(1))).toThrow();
    expect(() => crossCluesModule.createInitialState(configFor(7))).toThrow();
  });

  it('deals 5 row words and 5 col words from the chosen pack', () => {
    const s = crossCluesModule.createInitialState(configFor(4, 'standard'));
    expect(s.rowWords).toHaveLength(5);
    expect(s.colWords).toHaveLength(5);
    // No overlap between row and col words (slices of one shuffled list).
    const overlap = s.rowWords.filter((w) => s.colWords.includes(w));
    expect(overlap).toHaveLength(0);
    // Every dealt word comes from the chosen pack.
    const pool = new Set(PACKS['standard']!.words);
    for (const w of [...s.rowWords, ...s.colWords]) {
      expect(pool.has(w)).toBe(true);
    }
  });

  it('falls back to the standard pack on unknown packId', () => {
    const s = crossCluesModule.createInitialState(configFor(4, 'no-such-pack'));
    // The state records the actual pack used.
    expect(s.packId).toBe('standard');
  });

  it('seeds the deck so the same seed produces the same deal', () => {
    const a = crossCluesModule.createInitialState(configFor(4, 'standard', 7));
    const b = crossCluesModule.createInitialState(configFor(4, 'standard', 7));
    expect(b.rowWords).toEqual(a.rowWords);
    expect(b.colWords).toEqual(a.colWords);
    expect(b.remainingDeck).toEqual(a.remainingDeck);
    expect(b.currentCoord).toEqual(a.currentCoord);
    expect(b.currentClueGiver).toBe(a.currentClueGiver);
  });

  it('changing the seed diverges at least one of the dealt slots', () => {
    const a = crossCluesModule.createInitialState(configFor(4, 'standard', 1));
    const b = crossCluesModule.createInitialState(configFor(4, 'standard', 2));
    const differ =
      a.rowWords.join() !== b.rowWords.join() ||
      a.colWords.join() !== b.colWords.join() ||
      JSON.stringify(a.remainingDeck) !== JSON.stringify(b.remainingDeck) ||
      a.currentClueGiver !== b.currentClueGiver;
    expect(differ).toBe(true);
  });

  it('starts in setup phase with no acks and round 1 coord pre-popped', () => {
    const s = crossCluesModule.createInitialState(configFor(4));
    expect(s.phase).toBe('setup');
    expect(s.roundNumber).toBe(1);
    expect(s.currentCoord).not.toBeNull();
    // 24 cards remain after popping the round-1 card.
    expect(s.remainingDeck).toHaveLength(24);
    expect(Object.values(s.setupAcked).every((v) => v === false)).toBe(true);
  });
});

describe('Cross Clues — setup ack gate', () => {
  it('rejects actions other than ackSetup while in setup', () => {
    const s = crossCluesModule.createInitialState(configFor(3));
    expect(() =>
      apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'foo' }),
    ).toThrow();
  });

  it('advances to clueGiving only after every seat acks', () => {
    const initial = crossCluesModule.createInitialState(configFor(4));
    let s = apply(initial, { type: 'ackSetup', bySeat: 0 });
    expect(s.phase).toBe('setup');
    s = apply(s, { type: 'ackSetup', bySeat: 1 });
    s = apply(s, { type: 'ackSetup', bySeat: 2 });
    expect(s.phase).toBe('setup');
    s = apply(s, { type: 'ackSetup', bySeat: 3 });
    expect(s.phase).toBe('clueGiving');
  });

  it('ackSetup is idempotent per seat', () => {
    const initial = crossCluesModule.createInitialState(configFor(3));
    let s = apply(initial, { type: 'ackSetup', bySeat: 1 });
    s = apply(s, { type: 'ackSetup', bySeat: 1 });
    expect(s.setupAcked[1]).toBe(true);
    expect(s.phase).toBe('setup');
  });
});

describe('Cross Clues — clue + guess validation', () => {
  function startGame(playerCount = 4): CrossCluesPrivateState {
    return ackEveryoneSetup(crossCluesModule.createInitialState(configFor(playerCount)));
  }

  it('only the current clue-giver may submit a clue', () => {
    const s = startGame();
    const notGiver = (s.currentClueGiver! + 2) % s.seats.length;
    expect(() =>
      apply(s, { type: 'submitClue', bySeat: notGiver, clue: 'cat' }),
    ).toThrow();
  });

  it('rejects multi-word clues, blank clues, and overlong clues', () => {
    const s = startGame();
    const giver = s.currentClueGiver!;
    expect(() =>
      apply(s, { type: 'submitClue', bySeat: giver, clue: 'two words' }),
    ).toThrow();
    expect(() =>
      apply(s, { type: 'submitClue', bySeat: giver, clue: '   ' }),
    ).toThrow();
    expect(() =>
      apply(s, { type: 'submitClue', bySeat: giver, clue: 'a'.repeat(33) }),
    ).toThrow();
  });

  it('accepts hyphenated clues and trims surrounding whitespace', () => {
    let s = startGame();
    s = apply(s, {
      type: 'submitClue',
      bySeat: s.currentClueGiver!,
      clue: '  fire-river  ',
    });
    expect(s.currentClue).toBe('fire-river');
    expect(s.phase).toBe('guessing');
  });

  it('only the current guesser may submit a guess', () => {
    let s = startGame();
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'cat' });
    const notGuesser = (s.currentGuesser! + 1) % s.seats.length;
    expect(() =>
      apply(s, { type: 'submitGuess', bySeat: notGuesser, coord: { row: 0, col: 0 } }),
    ).toThrow();
  });

  it('rejects out-of-range coordinates', () => {
    let s = startGame();
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'cat' });
    expect(() =>
      apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: { row: 5, col: 0 } }),
    ).toThrow();
    expect(() =>
      apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: { row: -1, col: 0 } }),
    ).toThrow();
  });

  it('rejects guesses aimed at already-resolved cells', () => {
    let s = startGame();
    const firstTrueCoord = s.currentCoord!;
    s = playRound(s, 'one', () => firstTrueCoord); // correct → cell resolved
    // Next round, try to guess that same (now resolved) cell.
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'two' });
    expect(() =>
      apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: firstTrueCoord }),
    ).toThrow();
  });
});

describe('Cross Clues — round scoring + token placement', () => {
  it('correct guess places a green token on the held coord and increments score', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3, 'standard', 99)));
    const trueCoord = s.currentCoord!;
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'cat' });
    s = apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: trueCoord });
    expect(s.phase).toBe('revealRound');
    expect(s.score).toBe(1);
    const cell = s.grid[trueCoord.row]![trueCoord.col]!;
    expect(cell.token).toBe('green');
    expect(cell.resolved).toBe(true);
    expect(cell.clueWord).toBe('cat');
  });

  it('wrong guess places a red token on the held coord (not the guess) and leaves score', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3, 'standard', 100)));
    const trueCoord = s.currentCoord!;
    // Find any other unresolved cell to wrong-guess at.
    let wrong: Coord | null = null;
    for (let r = 0; r < 5 && !wrong; r++) {
      for (let c = 0; c < 5 && !wrong; c++) {
        if (r !== trueCoord.row || c !== trueCoord.col) wrong = { row: r, col: c };
      }
    }
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'dog' });
    s = apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: wrong! });
    expect(s.phase).toBe('revealRound');
    expect(s.score).toBe(0);
    const trueCell = s.grid[trueCoord.row]![trueCoord.col]!;
    expect(trueCell.token).toBe('red');
    expect(trueCell.resolved).toBe(true);
    expect(trueCell.guessedCoord).toEqual(wrong);
    // The wrong cell is NOT resolved (rulebook).
    const wrongCell = s.grid[wrong!.row]![wrong!.col]!;
    expect(wrongCell.resolved).toBe(false);
  });

  it('records the round in history with correct flag', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3, 'standard', 7)));
    const trueCoord = s.currentCoord!;
    s = playRound(s, 'sun', () => trueCoord);
    expect(s.history).toHaveLength(1);
    const rec = s.history[0]!;
    expect(rec.correct).toBe(true);
    expect(rec.clueWord).toBe('sun');
    expect(rec.trueCoord).toEqual(trueCoord);
    expect(rec.guessCoord).toEqual(trueCoord);
  });
});

describe('Cross Clues — reveal ack + role rotation', () => {
  it('reveal ack waits for every seat before advancing', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(4)));
    const trueCoord = s.currentCoord!;
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'sun' });
    s = apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: trueCoord });
    expect(s.phase).toBe('revealRound');
    s = apply(s, { type: 'ackReveal', bySeat: 0 });
    s = apply(s, { type: 'ackReveal', bySeat: 1 });
    s = apply(s, { type: 'ackReveal', bySeat: 2 });
    expect(s.phase).toBe('revealRound');
    s = apply(s, { type: 'ackReveal', bySeat: 3 });
    expect(s.phase).toBe('clueGiving');
  });

  it('rotates clue-giver by +1 mod N each round; guesser is the next seat', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(4)));
    const initialGiver = s.currentClueGiver!;
    expect(s.currentGuesser).toBe((initialGiver + 1) % 4);
    for (let r = 0; r < 3; r++) {
      const expectedGiver = (initialGiver + r) % 4;
      expect(s.currentClueGiver).toBe(expectedGiver);
      expect(s.currentGuesser).toBe((expectedGiver + 1) % 4);
      s = playRound(s, `r${r}`, firstUnresolved);
    }
  });

  it('2-player game alternates roles every round', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(2)));
    const startGiver = s.currentClueGiver!;
    expect(s.currentGuesser).toBe(1 - startGiver);
    s = playRound(s, 'one', firstUnresolved);
    expect(s.currentClueGiver).toBe(1 - startGiver);
    expect(s.currentGuesser).toBe(startGiver);
    s = playRound(s, 'two', firstUnresolved);
    expect(s.currentClueGiver).toBe(startGiver);
    expect(s.currentGuesser).toBe(1 - startGiver);
  });

  it('pops a new coord on advance and increments roundNumber', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3)));
    expect(s.roundNumber).toBe(1);
    expect(s.remainingDeck).toHaveLength(24);
    s = playRound(s, 'a', firstUnresolved);
    expect(s.roundNumber).toBe(2);
    expect(s.remainingDeck).toHaveLength(23);
    expect(s.currentCoord).not.toBeNull();
  });
});

describe('Cross Clues — viewFor redaction', () => {
  it('yourCoord is exposed ONLY to the active clue-giver during clueGiving', () => {
    const s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(4)));
    expect(s.phase).toBe('clueGiving');
    for (let seat: SeatIndex = 0; seat < s.seats.length; seat++) {
      const view = crossCluesModule.viewFor(s, seat);
      if (seat === s.currentClueGiver) {
        expect(view.yourCoord).toEqual(s.currentCoord);
        expect(view.yourRole).toBe('clueGiver');
      } else {
        expect(view.yourCoord).toBeNull();
        expect(view.yourRole).toBe(seat === s.currentGuesser ? 'guesser' : 'observer');
      }
    }
  });

  it('spectator (seat=null) never sees a coord', () => {
    const s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(4)));
    const v = crossCluesModule.viewFor(s, null);
    expect(v.yourCoord).toBeNull();
    expect(v.yourRole).toBe('observer');
    expect(v.yourSeat).toBeNull();
  });

  it('no seat sees yourCoord during guessing/revealRound (clue already public)', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3)));
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'sun' });
    expect(s.phase).toBe('guessing');
    for (let seat: SeatIndex = 0; seat < s.seats.length; seat++) {
      expect(crossCluesModule.viewFor(s, seat).yourCoord).toBeNull();
    }
    s = apply(s, {
      type: 'submitGuess',
      bySeat: s.currentGuesser!,
      coord: s.currentCoord!,
    });
    expect(s.phase).toBe('revealRound');
    for (let seat: SeatIndex = 0; seat < s.seats.length; seat++) {
      expect(crossCluesModule.viewFor(s, seat).yourCoord).toBeNull();
    }
  });

  it('full-game hidden-info audit: yourCoord never leaks across 25 rounds', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3, 'standard', 314)));
    for (let r = 0; r < 25; r++) {
      // During clueGiving, exactly one seat sees the coord; everyone else is null.
      const exposers: SeatIndex[] = [];
      for (let seat: SeatIndex = 0; seat < s.seats.length; seat++) {
        const v = crossCluesModule.viewFor(s, seat);
        if (v.yourCoord !== null) exposers.push(seat);
      }
      expect(exposers).toEqual([s.currentClueGiver!]);
      s = playRound(s, `r${r}`, firstUnresolved);
    }
    expect(s.phase).toBe('gameOver');
  });

  it('currentClue is null during clueGiving and visible during guessing/reveal', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3)));
    expect(crossCluesModule.viewFor(s, 0).currentClue).toBeNull();
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'moon' });
    expect(crossCluesModule.viewFor(s, 0).currentClue).toBe('moon');
    s = apply(s, {
      type: 'submitGuess',
      bySeat: s.currentGuesser!,
      coord: s.currentCoord!,
    });
    expect(crossCluesModule.viewFor(s, 0).currentClue).toBe('moon');
  });
});

describe('Cross Clues — end of game', () => {
  it('all 25 rounds → gameOver, isFinished true, scoreRating populated', () => {
    let s = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3, 'standard', 5)));
    for (let r = 0; r < 25; r++) {
      // Guess correctly every time so score = 25.
      const trueCoord = s.currentCoord!;
      s = playRound(s, `r${r}`, () => trueCoord);
    }
    expect(s.phase).toBe('gameOver');
    expect(crossCluesModule.isFinished(s)).toBe(true);
    expect(s.score).toBe(25);
    expect(s.history).toHaveLength(25);
    const view = crossCluesModule.viewFor(s, 0);
    expect(view.scoreRating).toBe('perfect');
    expect(view.remainingCount).toBe(0);
  });

  it('rating tiers map by score: <16 rookie, 16-20 great, 21-24 legendary, 25 perfect', () => {
    // viewFor computes scoreRating inline from score + phase, so we just
    // fabricate gameOver states at the boundary scores. Simulating exact
    // mid-range scores is hard because a wrong guess still resolves the
    // held cell, so by round 25 the only unresolved cell is forced.
    const base = ackEveryoneSetup(crossCluesModule.createInitialState(configFor(3)));
    function ratingAtScore(score: number): string {
      const s: CrossCluesPrivateState = { ...base, phase: 'gameOver', score };
      return crossCluesModule.viewFor(s, 0).scoreRating!;
    }
    expect(ratingAtScore(0)).toBe('rookie');
    expect(ratingAtScore(15)).toBe('rookie');
    expect(ratingAtScore(16)).toBe('great');
    expect(ratingAtScore(20)).toBe('great');
    expect(ratingAtScore(21)).toBe('legendary');
    expect(ratingAtScore(24)).toBe('legendary');
    expect(ratingAtScore(25)).toBe('perfect');
  });
});

describe('Cross Clues — AI smoke', () => {
  it('AI-only simulation completes 25 rounds without throwing', () => {
    const aiChoose = crossCluesModule.aiChooseAction!;
    let s = crossCluesModule.createInitialState(configFor(3, 'standard', 7));
    // Bound the loop to avoid runaway if the AI ever returns null with no
    // forward progress.
    const HARD_CAP = 300;
    let steps = 0;
    while (!crossCluesModule.isFinished(s) && steps < HARD_CAP) {
      let advanced = false;
      for (let seat: SeatIndex = 0; seat < s.seats.length; seat++) {
        const action = aiChoose(s, seat);
        if (action) {
          s = apply(s, action);
          advanced = true;
        }
      }
      if (!advanced) throw new Error(`No seat had an action at step ${steps}, phase=${s.phase}`);
      steps++;
    }
    expect(crossCluesModule.isFinished(s)).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(25);
  });
});

describe('Cross Clues — defaults', () => {
  it('defaultConfig produces a usable initial state at 4p', () => {
    const cfg = crossCluesModule.defaultConfig(4);
    expect(cfg.gameId).toBe('cross-clues');
    const s = crossCluesModule.createInitialState(cfg);
    expect(s.seats).toHaveLength(4);
    expect(s.packId).toBe('standard');
    expect(s.phase).toBe('setup');
  });
});
