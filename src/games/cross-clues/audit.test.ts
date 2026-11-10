import { describe, expect, it } from 'vitest';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { crossCluesModule } from './module';
import type { CrossCluesOptions } from './module';
import type { CrossCluesAction } from './actions';
import type { Coord, CrossCluesPrivateState } from './state';
import { blendScore, chooseCrossClue, scoreCells } from './ai';
import { clueProblem } from './rules';
import { buildInitial } from './setup';

// ============================================================================
// Audit fixes (2026-11): grid-word clue rule, holder visibility, seat /
// coord hardening, deck redaction, AI fairness + self-play.
// ============================================================================

function apply(state: CrossCluesPrivateState, action: CrossCluesAction): CrossCluesPrivateState {
  return crossCluesModule.applyAction(state, action, '');
}

function configFor(playerCount: number, seed = 42): GameConfig {
  const opts: CrossCluesOptions = {
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}`, isAI: true })),
    packs: ['classic'],
  };
  return { gameId: 'cross-clues', seats: [], seed, gameOptions: opts as unknown as Record<string, unknown> };
}

function started(playerCount = 4, seed = 42): CrossCluesPrivateState {
  let s = crossCluesModule.createInitialState(configFor(playerCount, seed));
  for (let i = 0; i < s.seats.length; i++) s = apply(s, { type: 'ackSetup', bySeat: i });
  return s;
}

function sameCoord(a: Coord | null, b: Coord | null): boolean {
  return !!a && !!b && a.row === b.row && a.col === b.col;
}

/** A different open coordinate than the held one (another "hidden card"). */
function swapHeldCoord(s: CrossCluesPrivateState): CrossCluesPrivateState {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const coord = { row: r, col: c };
      if (!s.grid[r]![c]!.resolved && !sameCoord(coord, s.currentCoord)) {
        return {
          ...s,
          currentCoord: coord,
          remainingDeck: s.remainingDeck.map((d) => (sameCoord(d, coord) ? s.currentCoord! : d)),
        };
      }
    }
  }
  return s;
}

function selfPlay(state: CrossCluesPrivateState, cap = 400): CrossCluesPrivateState {
  let s = state;
  let steps = 0;
  while (!crossCluesModule.isFinished(s)) {
    if (steps++ > cap) throw new Error('self-play did not finish');
    let acted = false;
    for (let seat: SeatIndex = 0; seat < s.seats.length; seat++) {
      const a = crossCluesModule.aiChooseAction!(s, seat);
      if (!a) continue;
      expect(a.bySeat).toBe(seat);
      s = apply(s, a);
      acted = true;
      break;
    }
    if (!acted) throw new Error(`stall in phase ${s.phase}`);
  }
  return s;
}

describe('Cross Clues audit — clue rules (bug: clue could name the grid words)', () => {
  it('rejects a grid word, a form of one, or a hyphenated pair of them', () => {
    const s = started();
    const giver = s.currentClueGiver!;
    const row = s.rowWords[0]!;
    const col = s.colWords[0]!;
    for (const bad of [row, row.toLowerCase(), `${row}S`, `${row}-${col}`, `zz-${col}`]) {
      expect(() => apply(s, { type: 'submitClue', bySeat: giver, clue: bad }), bad).toThrow(/grid word/);
    }
    expect(() => apply(s, { type: 'submitClue', bySeat: giver, clue: 'zz-top' })).not.toThrow();
  });

  it('rejects a non-string clue', () => {
    const s = started();
    expect(() =>
      apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 7 as unknown as string }),
    ).toThrow();
  });
});

describe('Cross Clues audit — action hardening', () => {
  it('rejects non-integer seats on acks', () => {
    const s = crossCluesModule.createInitialState(configFor(3));
    for (const bad of [1.5, '1', -1, 3, null]) {
      expect(() => apply(s, { type: 'ackSetup', bySeat: bad as unknown as number })).toThrow();
    }
  });

  it('rejects malformed coordinates (fractional, missing, null)', () => {
    let s = started();
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'zzyzx' });
    for (const bad of [{ row: 0.5, col: 1 }, { row: 1 }, null, { row: '1', col: '1' }]) {
      expect(() =>
        apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: bad as unknown as Coord }),
      ).toThrow();
    }
  });

  it('a clue-giver may not guess their own clue', () => {
    let s = started(3);
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'zzyzx' });
    expect(() =>
      apply(s, { type: 'submitGuess', bySeat: s.currentClueGiver!, coord: s.currentCoord! }),
    ).toThrow();
  });
});

describe('Cross Clues audit — redaction', () => {
  it('non-holder and spectator views are byte-identical whichever card is held', () => {
    let s = started(4, 9);
    for (let round = 0; round < 6; round++) {
      for (const phase of ['clueGiving', 'guessing'] as const) {
        if (phase === 'guessing') s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: `zq${round}` });
        expect(s.phase).toBe(phase);
        const swapped = swapHeldCoord(s);
        for (const seat of [null, ...s.seats.map((x) => x.index)]) {
          if (seat === s.currentClueGiver) continue;
          const a = JSON.stringify(crossCluesModule.viewFor(s, seat));
          const b = JSON.stringify(crossCluesModule.viewFor(swapped, seat));
          expect(b).toBe(a);
          expect(a).not.toMatch(/"seed"|remainingDeck|currentCoord/);
        }
      }
      s = apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: s.currentCoord! });
      for (let i = 0; i < s.seats.length; i++) s = apply(s, { type: 'ackReveal', bySeat: i });
    }
  });

  it('words and deck both depend on the whole 53-bit seed (no 32-bit shortcut)', () => {
    // Bits above 2^32 change the public words too, so a 32-bit value
    // brute-forced from the visible layout doesn't reveal the deck order.
    const lo = 4242;
    const a = buildInitial(['A', 'B', 'C'], ['classic'], lo);
    const b = buildInitial(['A', 'B', 'C'], ['classic'], lo + 2 ** 35);
    expect([...b.rowWords, ...b.colWords]).not.toEqual([...a.rowWords, ...a.colWords]);
    expect(JSON.stringify(b.remainingDeck)).not.toBe(JSON.stringify(a.remainingDeck));
  });
});

describe('Cross Clues audit — AI', () => {
  it('an AI guesser decides identically whichever card the clue-giver holds (no peeking)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let s = started(3, seed);
      s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'zzyzx' });
      const g = s.currentGuesser!;
      expect(crossCluesModule.aiChooseAction!(swapHeldCoord(s), g)).toEqual(
        crossCluesModule.aiChooseAction!(s, g),
      );
    }
  });

  it('AI clues are legal and never contain the grid words', () => {
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const s = started(4, seed);
      const a = crossCluesModule.aiChooseAction!(s, s.currentClueGiver!)!;
      expect(a.type).toBe('submitClue');
      if (a.type !== 'submitClue') continue;
      expect(clueProblem(a.clue, [...s.rowWords, ...s.colWords])).toBeNull();
      for (const w of [...s.rowWords, ...s.colWords]) expect(a.clue.toUpperCase()).not.toContain(w);
    }
  });

  it('only the seat that must act gets an action', () => {
    const s = started(4, 3);
    for (const seat of s.seats) {
      const a = crossCluesModule.aiChooseAction!(s, seat.index);
      expect(a !== null).toBe(seat.index === s.currentClueGiver);
    }
  });

  it('the blend fallback decodes to the intended cell', () => {
    expect(blendScore('OCEAIANO', 'OCEAN', 'PIANO')).toBeGreaterThan(0.6);
    expect(blendScore('OCEAIANO', 'PIANO', 'OCEAN')).toBe(0);
  });

  it('AI clue-giver + AI guesser find the cell much more often than chance', () => {
    let hits = 0;
    let rounds = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const end = selfPlay(crossCluesModule.createInitialState(configFor(3, seed * 97)));
      hits += end.score;
      rounds += end.history.length;
    }
    // Random guessing averages ~15% over a 25-round game.
    expect(hits / rounds).toBeGreaterThan(0.4);
  });

  it('all-AI self-play finishes for every table size without throwing or stalling', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      for (const seed of [5, 50, 500]) {
        const end = selfPlay(crossCluesModule.createInitialState(configFor(n, seed + n)));
        expect(end.phase).toBe('gameOver');
        expect(end.history).toHaveLength(25);
        expect(end.score).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('scoreCells only uses open cells', () => {
    let s = started(3, 8);
    s = apply(s, { type: 'submitClue', bySeat: s.currentClueGiver!, clue: 'zzyzx' });
    s = apply(s, { type: 'submitGuess', bySeat: s.currentGuesser!, coord: s.currentCoord! });
    const v = crossCluesModule.viewFor(s, 0);
    expect(scoreCells(v, 'zzyzx')).toHaveLength(24);
    void chooseCrossClue;
  });
});
