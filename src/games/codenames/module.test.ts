import { describe, expect, it } from 'vitest';
import type { GameConfig } from '@/engine/types';
import { codenamesModule } from './module';
import type { CodenamesOptions, CodenamesSeatConfig } from './module';
import type { CodenamesAction } from './actions';
import type { CodenamesPrivateState, TeamColor } from './state';
import {
  ASSASSIN_CARDS,
  BYSTANDER_CARDS,
  GRID_SIZE,
  OTHER_TEAM_CARDS,
  STARTING_TEAM_CARDS,
  buildBoard,
  pickStartingTeam,
} from './setup';
import { DEFAULT_WORDS } from './words';

function apply(state: CodenamesPrivateState, action: CodenamesAction): CodenamesPrivateState {
  return codenamesModule.applyAction(state, action, '');
}

function configFor(players: CodenamesSeatConfig[], seed = 42): GameConfig {
  const opts: CodenamesOptions = { players };
  return {
    gameId: 'codenames',
    seats: [],
    seed,
    gameOptions: opts as unknown as Record<string, unknown>,
  };
}

function fourPlayerSeats(): CodenamesSeatConfig[] {
  return [
    { name: 'Red Spy', team: 'red', role: 'spymaster', isAI: false },
    { name: 'Red Op', team: 'red', role: 'operative', isAI: false },
    { name: 'Blue Spy', team: 'blue', role: 'spymaster', isAI: false },
    { name: 'Blue Op', team: 'blue', role: 'operative', isAI: false },
  ];
}

// Find the index of the first card of a given kind in the dealt board.
function findCard(
  state: CodenamesPrivateState,
  kind: 'red' | 'blue' | 'bystander' | 'assassin',
  alreadyHit: number[] = [],
): number {
  const idx = state.cards.findIndex((c) => c.kind === kind && !alreadyHit.includes(c.index));
  if (idx === -1) throw new Error(`No ${kind} card found`);
  return idx;
}

describe('Codenames — setup', () => {
  it('deals exactly 25 cards with the rulebook composition (9/8/7/1)', () => {
    const board = buildBoard(123, 'red');
    expect(board).toHaveLength(GRID_SIZE);
    const counts: Record<string, number> = {};
    for (const c of board) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    expect(counts['red']).toBe(STARTING_TEAM_CARDS);
    expect(counts['blue']).toBe(OTHER_TEAM_CARDS);
    expect(counts['bystander']).toBe(BYSTANDER_CARDS);
    expect(counts['assassin']).toBe(ASSASSIN_CARDS);
  });

  it('starting team gets 9 cards regardless of which color started', () => {
    const reds = buildBoard(7, 'red');
    expect(reds.filter((c) => c.kind === 'red')).toHaveLength(9);
    expect(reds.filter((c) => c.kind === 'blue')).toHaveLength(8);
    const blues = buildBoard(7, 'blue');
    expect(blues.filter((c) => c.kind === 'blue')).toHaveLength(9);
    expect(blues.filter((c) => c.kind === 'red')).toHaveLength(8);
  });

  it('default word pool is large enough (>= 25)', () => {
    expect(DEFAULT_WORDS.length).toBeGreaterThanOrEqual(25);
  });

  it('same seed produces the same board + starting team', () => {
    const a = buildBoard(99, 'red');
    const b = buildBoard(99, 'red');
    expect(a.map((c) => c.word)).toEqual(b.map((c) => c.word));
    expect(a.map((c) => c.kind)).toEqual(b.map((c) => c.kind));
    expect(pickStartingTeam(99)).toBe(pickStartingTeam(99));
  });

  it('rejects player counts < 4', () => {
    expect(() =>
      codenamesModule.createInitialState(configFor(fourPlayerSeats().slice(0, 3))),
    ).toThrow();
  });

  it('rejects a team with 0 operatives', () => {
    const bad: CodenamesSeatConfig[] = [
      { name: 'A', team: 'red', role: 'spymaster', isAI: false },
      { name: 'B', team: 'blue', role: 'spymaster', isAI: false },
      { name: 'C', team: 'blue', role: 'operative', isAI: false },
      { name: 'D', team: 'blue', role: 'operative', isAI: false },
    ];
    expect(() => codenamesModule.createInitialState(configFor(bad))).toThrow();
  });

  it('rejects a team with two spymasters', () => {
    const bad: CodenamesSeatConfig[] = [
      { name: 'A', team: 'red', role: 'spymaster', isAI: false },
      { name: 'B', team: 'red', role: 'spymaster', isAI: false },
      { name: 'C', team: 'blue', role: 'spymaster', isAI: false },
      { name: 'D', team: 'blue', role: 'operative', isAI: false },
    ];
    expect(() => codenamesModule.createInitialState(configFor(bad))).toThrow();
  });

  it('initial state starts in clue phase with no clue and current team = starting team', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    expect(state.phase).toBe('clue');
    expect(state.currentClue).toBeNull();
    expect(state.currentTeam).toBe(state.startingTeam);
  });
});

describe('Codenames — clue phase', () => {
  it('only the current team spymaster may give a clue', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const otherTeamSpy = state.seats.find(
      (s) => s.role === 'spymaster' && s.team !== state.currentTeam,
    )!;
    expect(() =>
      apply(state, { type: 'giveClue', bySeat: otherTeamSpy.index, word: 'TEST', number: 2 }),
    ).toThrow();
  });

  it('operatives cannot give clues', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const operative = state.seats.find(
      (s) => s.role === 'operative' && s.team === state.currentTeam,
    )!;
    expect(() =>
      apply(state, { type: 'giveClue', bySeat: operative.index, word: 'TEST', number: 2 }),
    ).toThrow();
  });

  it('rejects multi-word clues', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const spy = state.seats.find(
      (s) => s.role === 'spymaster' && s.team === state.currentTeam,
    )!;
    expect(() =>
      apply(state, { type: 'giveClue', bySeat: spy.index, word: 'TWO WORDS', number: 2 }),
    ).toThrow();
  });

  it('rejects clues that match a word on the board', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const spy = state.seats.find(
      (s) => s.role === 'spymaster' && s.team === state.currentTeam,
    )!;
    const onBoardWord = state.cards[0]!.word;
    expect(() =>
      apply(state, { type: 'giveClue', bySeat: spy.index, word: onBoardWord, number: 2 }),
    ).toThrow();
  });

  it('rejects clue numbers outside 0..9', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const spy = state.seats.find(
      (s) => s.role === 'spymaster' && s.team === state.currentTeam,
    )!;
    expect(() =>
      apply(state, { type: 'giveClue', bySeat: spy.index, word: 'TEST', number: 10 }),
    ).toThrow();
    expect(() =>
      apply(state, { type: 'giveClue', bySeat: spy.index, word: 'TEST', number: -1 }),
    ).toThrow();
  });

  it('valid clue moves the phase to guessing and logs the clue', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const spy = state.seats.find(
      (s) => s.role === 'spymaster' && s.team === state.currentTeam,
    )!;
    const next = apply(state, { type: 'giveClue', bySeat: spy.index, word: 'unique', number: 2 });
    expect(next.phase).toBe('guessing');
    expect(next.currentClue).not.toBeNull();
    expect(next.currentClue!.word).toBe('UNIQUE');
    expect(next.currentClue!.number).toBe(2);
    expect(next.clueHistory).toHaveLength(1);
    expect(next.clueHistory[0]!.closed).toBe(false);
  });
});

describe('Codenames — guessing phase', () => {
  function setupGuessing(clueNumber: number, seed = 42) {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats(), seed));
    const spy = state.seats.find(
      (s) => s.role === 'spymaster' && s.team === state.currentTeam,
    )!;
    return {
      state: apply(state, {
        type: 'giveClue',
        bySeat: spy.index,
        word: 'something',
        number: clueNumber,
      }),
      operative: state.seats.find(
        (s) => s.role === 'operative' && s.team === state.currentTeam,
      )!,
    };
  }

  it('a correct guess flips the card and lets the team keep going', () => {
    const { state, operative } = setupGuessing(2);
    const myColor = state.currentTeam;
    const cardIndex = findCard(state, myColor);
    const next = apply(state, { type: 'guessCard', bySeat: operative.index, cardIndex });
    expect(next.cards[cardIndex]!.revealed).toBe(true);
    expect(next.phase).toBe('guessing');
    expect(next.currentTeam).toBe(myColor);
    expect(next.guessesThisClue).toBe(1);
  });

  it('guessing a bystander ends the turn and passes to the other team', () => {
    const { state, operative } = setupGuessing(2);
    const cardIndex = findCard(state, 'bystander');
    const next = apply(state, { type: 'guessCard', bySeat: operative.index, cardIndex });
    expect(next.phase).toBe('clue');
    expect(next.currentTeam).not.toBe(state.currentTeam);
    expect(next.clueHistory[0]!.closed).toBe(true);
    expect(next.clueHistory[0]!.closedReason).toBe('hitWrong');
  });

  it("guessing the opponent's card flips it for them and ends the turn", () => {
    const { state, operative } = setupGuessing(2);
    const myColor = state.currentTeam;
    const oppColor: TeamColor = myColor === 'red' ? 'blue' : 'red';
    const cardIndex = findCard(state, oppColor);
    const next = apply(state, { type: 'guessCard', bySeat: operative.index, cardIndex });
    expect(next.cards[cardIndex]!.revealed).toBe(true);
    expect(next.phase).toBe('clue');
    expect(next.currentTeam).toBe(oppColor);
  });

  it('guessing the assassin ends the game with the other team winning', () => {
    const { state, operative } = setupGuessing(2);
    const cardIndex = findCard(state, 'assassin');
    const next = apply(state, { type: 'guessCard', bySeat: operative.index, cardIndex });
    expect(next.phase).toBe('gameOver');
    const expectedWinner: TeamColor = state.currentTeam === 'red' ? 'blue' : 'red';
    expect(next.winnerTeam).toBe(expectedWinner);
    expect(next.loserTeam).toBe(state.currentTeam);
    expect(next.clueHistory[0]!.closedReason).toBe('hitAssassin');
  });

  it("a clue of N allows up to N+1 guesses (one above the limit)", () => {
    const { state, operative } = setupGuessing(2);
    const myColor = state.currentTeam;
    const hits: number[] = [];
    let cur = state;
    // Guess 1 (within clue): turn continues.
    let i1 = findCard(cur, myColor, hits);
    cur = apply(cur, { type: 'guessCard', bySeat: operative.index, cardIndex: i1 });
    hits.push(i1);
    expect(cur.phase).toBe('guessing');
    expect(cur.guessesThisClue).toBe(1);

    // Guess 2 (still within clue=2): turn continues.
    let i2 = findCard(cur, myColor, hits);
    cur = apply(cur, { type: 'guessCard', bySeat: operative.index, cardIndex: i2 });
    hits.push(i2);
    expect(cur.phase).toBe('guessing');
    expect(cur.guessesThisClue).toBe(2);

    // Guess 3 (the BONUS guess — exactly one above clue 2): hits cap, turn ends.
    let i3 = findCard(cur, myColor, hits);
    cur = apply(cur, { type: 'guessCard', bySeat: operative.index, cardIndex: i3 });
    expect(cur.phase).toBe('clue');
    expect(cur.currentTeam).not.toBe(myColor);
    expect(cur.clueHistory[0]!.closedReason).toBe('capReached');
  });

  it('endGuessing requires at least one guess', () => {
    const { state, operative } = setupGuessing(2);
    expect(() => apply(state, { type: 'endGuessing', bySeat: operative.index })).toThrow();
  });

  it('endGuessing after a correct guess passes to the other team', () => {
    const { state, operative } = setupGuessing(2);
    const myColor = state.currentTeam;
    const i1 = findCard(state, myColor);
    let cur = apply(state, { type: 'guessCard', bySeat: operative.index, cardIndex: i1 });
    cur = apply(cur, { type: 'endGuessing', bySeat: operative.index });
    expect(cur.phase).toBe('clue');
    expect(cur.currentTeam).not.toBe(myColor);
    expect(cur.clueHistory[0]!.closedReason).toBe('endedVoluntarily');
    expect(cur.clueHistory[0]!.correctGuesses).toBe(1);
  });

  it('clue number 0 (unlimited) does not impose a cap', () => {
    const { state, operative } = setupGuessing(0);
    const myColor = state.currentTeam;
    let cur = state;
    const hits: number[] = [];
    // Guess all your team's cards except the last; should never auto-end.
    const myCardsTotal = cur.cards.filter((c) => c.kind === myColor).length;
    for (let i = 0; i < myCardsTotal - 1; i++) {
      const idx = findCard(cur, myColor, hits);
      cur = apply(cur, { type: 'guessCard', bySeat: operative.index, cardIndex: idx });
      hits.push(idx);
      expect(cur.phase).toBe('guessing');
    }
    expect(cur.guessesThisClue).toBe(myCardsTotal - 1);
  });

  it('flipping the last own card wins the game', () => {
    const { state, operative } = setupGuessing(0);
    const myColor = state.currentTeam;
    let cur = state;
    const hits: number[] = [];
    const myCardsTotal = cur.cards.filter((c) => c.kind === myColor).length;
    for (let i = 0; i < myCardsTotal; i++) {
      const idx = findCard(cur, myColor, hits);
      cur = apply(cur, { type: 'guessCard', bySeat: operative.index, cardIndex: idx });
      hits.push(idx);
    }
    expect(cur.phase).toBe('gameOver');
    expect(cur.winnerTeam).toBe(myColor);
    expect(cur.loserTeam).toBeNull();
  });

  it('opponent-spymaster cannot give clue out of turn', () => {
    const { state } = setupGuessing(2);
    const otherSpy = state.seats.find(
      (s) => s.role === 'spymaster' && s.team !== state.currentTeam,
    )!;
    expect(() =>
      apply(state, { type: 'giveClue', bySeat: otherSpy.index, word: 'X', number: 1 }),
    ).toThrow();
  });
});

describe('Codenames — viewFor redaction', () => {
  it('operatives see no kind on unrevealed cards; spymasters see all', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const spy = state.seats.find((s) => s.role === 'spymaster')!;
    const operative = state.seats.find((s) => s.role === 'operative')!;
    const spyView = codenamesModule.viewFor(state, spy.index);
    const opView = codenamesModule.viewFor(state, operative.index);
    // Spymaster sees every card's kind.
    expect(spyView.cards.every((c) => c.kind !== null)).toBe(true);
    // Operative sees no kind on any card (none revealed yet).
    expect(opView.cards.every((c) => c.kind === null)).toBe(true);
  });

  it('once a card is revealed, every viewer sees its kind', () => {
    const initial = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const spy = initial.seats.find(
      (s) => s.role === 'spymaster' && s.team === initial.currentTeam,
    )!;
    const operative = initial.seats.find(
      (s) => s.role === 'operative' && s.team === initial.currentTeam,
    )!;
    const afterClue = apply(initial, { type: 'giveClue', bySeat: spy.index, word: 'X', number: 1 });
    const myCardIdx = findCard(afterClue, afterClue.currentTeam);
    const afterGuess = apply(afterClue, {
      type: 'guessCard',
      bySeat: operative.index,
      cardIndex: myCardIdx,
    });
    const opView = codenamesModule.viewFor(afterGuess, operative.index);
    expect(opView.cards[myCardIdx]!.kind).not.toBeNull();
    // Other unrevealed cards still hidden from operative.
    const stillHidden = opView.cards.filter((c) => !c.revealed && c.kind === null);
    expect(stillHidden.length).toBe(GRID_SIZE - 1);
  });

  it('spectators (seat = null) see same as operatives', () => {
    const state = codenamesModule.createInitialState(configFor(fourPlayerSeats()));
    const v = codenamesModule.viewFor(state, null);
    expect(v.cards.every((c) => c.kind === null)).toBe(true);
    expect(v.yourSeat).toBeNull();
    expect(v.yourRole).toBeNull();
  });
});
