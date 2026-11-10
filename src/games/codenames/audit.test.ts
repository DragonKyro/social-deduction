import { describe, expect, it } from 'vitest';
import type { GameConfig } from '@/engine/types';
import { codenamesModule } from './module';
import type { CodenamesOptions, CodenamesSeatConfig } from './module';
import type { CodenamesAction } from './actions';
import type { CodenamesPrivateState } from './state';
import { buildBoard } from './setup';

// ============================================================================
// Audit fixes (2026-11): launcher option shape, clue forms, index hardening,
// redaction invariants, AI fairness + self-play.
// ============================================================================

function apply(state: CodenamesPrivateState, action: CodenamesAction): CodenamesPrivateState {
  return codenamesModule.applyAction(state, action, '');
}

function configFor(players: CodenamesSeatConfig[], seed = 42): GameConfig {
  const opts: CodenamesOptions = { players };
  return { gameId: 'codenames', seats: [], seed, gameOptions: opts as unknown as Record<string, unknown> };
}

function fourPlayerSeats(): CodenamesSeatConfig[] {
  return [
    { name: 'Red Spy', team: 'red', role: 'spymaster', isAI: false },
    { name: 'Red Op', team: 'red', role: 'operative', isAI: false },
    { name: 'Blue Spy', team: 'blue', role: 'spymaster', isAI: false },
    { name: 'Blue Op', team: 'blue', role: 'operative', isAI: false },
  ];
}

function launcherConfig(
  count: number,
  teams: CodenamesOptions['teams'],
  seed = 42,
  aiSeats: number[] = [],
): GameConfig {
  // Exactly what `launchGame` / the online lobby build: `players` is
  // overwritten with plain `{ name, isAI }`, everything else is kept.
  const opts = {
    players: Array.from({ length: count }, (_, i) => ({ name: `P${i + 1}`, isAI: aiSeats.includes(i) })),
    teams,
    packs: ['classic'],
  };
  return { gameId: 'codenames', seats: [], seed, gameOptions: opts as unknown as Record<string, unknown> };
}

function findCard(state: CodenamesPrivateState, kind: string): number {
  const idx = state.cards.findIndex((c) => c.kind === kind && !c.revealed);
  if (idx === -1) throw new Error(`No ${kind} card found`);
  return idx;
}

function seatOf(state: CodenamesPrivateState, role: 'spymaster' | 'operative', current = true): number {
  return state.seats.find((x) => x.role === role && (x.team === state.currentTeam) === current)!.index;
}

/** Permute the kinds of every UNREVEALED card (a different hidden key). */
function scrambleKey(state: CodenamesPrivateState, seed: number): CodenamesPrivateState {
  const hidden = state.cards.filter((c) => !c.revealed);
  const kinds = hidden.map((c) => c.kind);
  const k = 1 + (seed % Math.max(1, kinds.length - 1));
  const rotated = kinds.slice(k).concat(kinds.slice(0, k));
  let j = 0;
  return {
    ...state,
    cards: state.cards.map((c) => (c.revealed ? c : { ...c, kind: rotated[j++]! })),
  };
}

/** Drive the game the way the store's AI loop does. */
function selfPlay(state: CodenamesPrivateState, maxSteps = 600): CodenamesPrivateState {
  let s = state;
  let steps = 0;
  let cursor = 0;
  while (!codenamesModule.isFinished(s)) {
    if (steps++ > maxSteps) throw new Error('self-play did not finish');
    let acted = false;
    for (let k = 0; k < s.seats.length; k++) {
      const seat = (cursor + k) % s.seats.length;
      const a = codenamesModule.aiChooseAction!(s, seat);
      if (!a) continue;
      expect(a.bySeat).toBe(seat);
      s = apply(s, a); // throws if the AI proposed an illegal move
      cursor = (seat + 1) % s.seats.length;
      acted = true;
      break;
    }
    if (!acted) throw new Error(`stall in phase ${s.phase} (team ${s.currentTeam})`);
  }
  return s;
}

function assertNoKeyLeak(state: CodenamesPrivateState) {
  const viewers: Array<number | null> = [null];
  for (const s of state.seats) if (s.role === 'operative') viewers.push(s.index);
  for (const v of viewers) {
    const view = codenamesModule.viewFor(state, v);
    if (state.phase !== 'gameOver') {
      for (const c of view.cards) if (!c.revealed) expect(c.kind).toBeNull();
    }
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/"seed"/);
    for (const g of view.guessHistory) expect(state.cards[g.cardIndex]!.revealed).toBe(true);
    if (state.phase !== 'gameOver') {
      // The view must be byte-identical under a different hidden key.
      const other = codenamesModule.viewFor(scrambleKey(state, 7), v);
      expect(JSON.stringify(other)).toBe(json);
    }
  }
}

describe('Codenames audit — launcher / lobby option shape (bug: players overwritten)', () => {
  it('takes team/role from options.teams when players carry only {name, isAI}', () => {
    const teams = [
      { team: 'blue' as const, role: 'operative' as const },
      { team: 'red' as const, role: 'spymaster' as const },
      { team: 'blue' as const, role: 'spymaster' as const },
      { team: 'red' as const, role: 'operative' as const },
    ];
    const s = codenamesModule.createInitialState(launcherConfig(4, teams));
    expect(s.seats.map((x) => [x.team, x.role])).toEqual(teams.map((t) => [t.team, t.role]));
  });

  it('falls back to the default split when teams are missing or the seat count changed', () => {
    for (const teams of [undefined, [{ team: 'red' as const, role: 'spymaster' as const }]]) {
      const s = codenamesModule.createInitialState(launcherConfig(6, teams));
      expect(s.seats.map((x) => x.team)).toEqual(['red', 'red', 'red', 'blue', 'blue', 'blue']);
      expect(s.seats.filter((x) => x.role === 'spymaster').map((x) => x.index)).toEqual([0, 3]);
    }
  });

  it('rejects an invalid teams assignment', () => {
    const bad = [
      { team: 'red' as const, role: 'spymaster' as const },
      { team: 'red' as const, role: 'spymaster' as const },
      { team: 'blue' as const, role: 'spymaster' as const },
      { team: 'blue' as const, role: 'operative' as const },
    ];
    expect(() => codenamesModule.createInitialState(launcherConfig(4, bad))).toThrow();
  });

  it('records isAI per seat from players', () => {
    const s = codenamesModule.createInitialState(launcherConfig(4, undefined, 1, [1, 3]));
    expect(s.seats.map((x) => x.isAI)).toEqual([false, true, false, true]);
  });

  it('defaultConfig round-trips through the lobby players overwrite', () => {
    const cfg = codenamesModule.defaultConfig(5);
    const opts = cfg.gameOptions as unknown as CodenamesOptions;
    const lobbyShaped = { ...opts, players: opts.players.map((p) => ({ name: p.name, isAI: false })) };
    const s = codenamesModule.createInitialState({
      ...cfg,
      seed: 3,
      gameOptions: lobbyShaped as unknown as Record<string, unknown>,
    });
    expect(s.seats).toHaveLength(5);
  });
});

describe('Codenames audit — clue rules (forms of visible words)', () => {
  function clueState(): CodenamesPrivateState {
    return codenamesModule.createInitialState(configFor(fourPlayerSeats(), 11));
  }

  it('rejects plural / tense forms of a visible word', () => {
    const s = clueState();
    const spy = seatOf(s, 'spymaster');
    const w = s.cards[3]!.word;
    expect(() => apply(s, { type: 'giveClue', bySeat: spy, word: `${w}S`, number: 1 })).toThrow(/form of/);
    expect(() => apply(s, { type: 'giveClue', bySeat: spy, word: w.toLowerCase(), number: 1 })).toThrow();
  });

  it('allows a covered (revealed) word as a clue again, per the rulebook', () => {
    const s0 = clueState();
    const op = seatOf(s0, 'operative');
    let s = apply(s0, { type: 'giveClue', bySeat: seatOf(s0, 'spymaster'), word: 'QWERTYZ', number: 2 });
    const own = findCard(s, s.currentTeam);
    s = apply(s, { type: 'guessCard', bySeat: op, cardIndex: own });
    s = apply(s, { type: 'endGuessing', bySeat: op });
    const word = s.cards[own]!.word;
    expect(() => apply(s, { type: 'giveClue', bySeat: seatOf(s, 'spymaster'), word, number: 1 })).not.toThrow();
  });

  it('rejects overlong, non-string, and punctuation-only clues; accepts hyphenated', () => {
    const s = clueState();
    const spy = seatOf(s, 'spymaster');
    expect(() => apply(s, { type: 'giveClue', bySeat: spy, word: 'A'.repeat(25), number: 1 })).toThrow();
    expect(() =>
      apply(s, { type: 'giveClue', bySeat: spy, word: 42 as unknown as string, number: 1 }),
    ).toThrow();
    expect(() => apply(s, { type: 'giveClue', bySeat: spy, word: '!!!', number: 1 })).toThrow();
    expect(() => apply(s, { type: 'giveClue', bySeat: spy, word: 'ROCK-N-ROLL', number: 1 })).not.toThrow();
  });
});

describe('Codenames audit — action hardening', () => {
  it('rejects non-integer / out-of-range card indexes (e.g. "constructor")', () => {
    const s0 = codenamesModule.createInitialState(configFor(fourPlayerSeats(), 5));
    const op = seatOf(s0, 'operative');
    const s = apply(s0, { type: 'giveClue', bySeat: seatOf(s0, 'spymaster'), word: 'QWERTYZ', number: 1 });
    for (const bad of ['constructor', 1.5, -1, 25, null]) {
      expect(() => apply(s, { type: 'guessCard', bySeat: op, cardIndex: bad as unknown as number })).toThrow();
    }
  });

  it('rejects a non-integer bySeat', () => {
    const s = codenamesModule.createInitialState(configFor(fourPlayerSeats(), 5));
    expect(() =>
      apply(s, { type: 'giveClue', bySeat: '0' as unknown as number, word: 'QWERTYZ', number: 1 }),
    ).toThrow();
  });

  it('clue record counts only correct contacts (bug: counted the wrong guess too)', () => {
    const s0 = codenamesModule.createInitialState(configFor(fourPlayerSeats(), 5));
    const op = seatOf(s0, 'operative');
    let s = apply(s0, { type: 'giveClue', bySeat: seatOf(s0, 'spymaster'), word: 'QWERTYZ', number: 3 });
    s = apply(s, { type: 'guessCard', bySeat: op, cardIndex: findCard(s, s.currentTeam) });
    s = apply(s, { type: 'guessCard', bySeat: op, cardIndex: findCard(s, 'bystander') });
    expect(s.clueHistory[0]!.closedReason).toBe('hitWrong');
    expect(s.clueHistory[0]!.correctGuesses).toBe(1);
  });
});

describe('Codenames audit — redaction invariants', () => {
  it('operative + spectator views carry no unrevealed colour, and are identical under a different key', () => {
    assertNoKeyLeak(codenamesModule.createInitialState(configFor(fourPlayerSeats(), 21)));
  });

  it('holds at every step of an all-AI game', () => {
    let s = codenamesModule.createInitialState(launcherConfig(6, undefined, 77, [0, 1, 2, 3, 4, 5]));
    let steps = 0;
    while (!codenamesModule.isFinished(s) && steps < 400) {
      assertNoKeyLeak(s);
      let acted = false;
      for (let seat = 0; seat < s.seats.length && !acted; seat++) {
        const a = codenamesModule.aiChooseAction!(s, seat);
        if (a) {
          s = apply(s, a);
          acted = true;
        }
      }
      expect(acted).toBe(true);
      steps++;
    }
    expect(codenamesModule.isFinished(s)).toBe(true);
    // Final reveal: everyone sees the whole key.
    expect(codenamesModule.viewFor(s, null).cards.every((c) => c.kind !== null)).toBe(true);
  });

  it('spymaster view carries the whole key; an out-of-range seat is treated as a spectator', () => {
    const s = codenamesModule.createInitialState(configFor(fourPlayerSeats(), 21));
    const spy = s.seats.find((x) => x.role === 'spymaster')!.index;
    expect(codenamesModule.viewFor(s, spy).cards.map((c) => c.kind)).toEqual(s.cards.map((c) => c.kind));
    const ghost = codenamesModule.viewFor(s, 99);
    expect(ghost.cards.every((c) => c.kind === null)).toBe(true);
    expect(ghost.yourSeat).toBeNull();
  });

  it('public and private streams both depend on the whole 53-bit seed (no 32-bit shortcut)', () => {
    // Changing only bits above 2^32 changes the public layout as well as the
    // key, so brute-forcing a 32-bit value from the visible word order can't
    // pin down the deal.
    const lo = 123456;
    const a = buildBoard(lo, 'red');
    const b = buildBoard(lo + 2 ** 33, 'red');
    expect(b.map((c) => c.word)).not.toEqual(a.map((c) => c.word));
    expect(b.map((c) => c.kind)).not.toEqual(a.map((c) => c.kind));
  });
});

describe('Codenames audit — AI', () => {
  it('an AI operative decides identically under any hidden key (no peeking)', () => {
    for (const seed of [3, 8, 13, 21]) {
      const s0 = codenamesModule.createInitialState(launcherConfig(4, undefined, seed, [0, 1, 2, 3]));
      const team = s0.currentTeam;
      const op = seatOf(s0, 'operative');
      let s = apply(s0, codenamesModule.aiChooseAction!(s0, seatOf(s0, 'spymaster'))!);
      for (let step = 0; step < 3 && s.phase === 'guessing' && s.currentTeam === team; step++) {
        const a = codenamesModule.aiChooseAction!(s, op);
        const b = codenamesModule.aiChooseAction!(scrambleKey(s, seed + step), op);
        expect(b).toEqual(a);
        s = apply(s, a!);
      }
    }
  });

  it('returns null for seats that are not up (other team, wrong role, game over)', () => {
    const s = codenamesModule.createInitialState(launcherConfig(4, undefined, 9, [0, 1, 2, 3]));
    for (const seat of s.seats) {
      const a = codenamesModule.aiChooseAction!(s, seat.index);
      expect(a !== null).toBe(seat.team === s.currentTeam && seat.role === 'spymaster');
    }
    const over: CodenamesPrivateState = { ...s, phase: 'gameOver', winnerTeam: 'red' };
    for (const seat of s.seats) expect(codenamesModule.aiChooseAction!(over, seat.index)).toBeNull();
  });

  it('an AI operative defers to a human operative on its team', () => {
    const teams = [
      { team: 'red' as const, role: 'spymaster' as const },
      { team: 'red' as const, role: 'operative' as const },
      { team: 'red' as const, role: 'operative' as const },
      { team: 'blue' as const, role: 'spymaster' as const },
      { team: 'blue' as const, role: 'operative' as const },
    ];
    // Seat 1 (red operative) is human; seat 2 (red operative) is AI.
    const s0 = codenamesModule.createInitialState(launcherConfig(5, teams, 4, [0, 2, 3, 4]));
    let s: CodenamesPrivateState = { ...s0, currentTeam: 'red' };
    s = apply(s, { type: 'giveClue', bySeat: 0, word: 'QWERTYZ', number: 1 });
    expect(codenamesModule.aiChooseAction!(s, 2)).toBeNull();
  });

  it('AI spymaster gives a legal clue covering at least one agent', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = codenamesModule.createInitialState(launcherConfig(4, undefined, seed, [0, 1, 2, 3]));
      const a = codenamesModule.aiChooseAction!(s, seatOf(s, 'spymaster'))!;
      expect(a.type).toBe('giveClue');
      expect(() => apply(s, a)).not.toThrow();
      if (a.type === 'giveClue') expect(a.number).toBeGreaterThanOrEqual(1);
    }
  });

  it('all-AI self-play finishes without throwing or stalling across seeds and table sizes', () => {
    let assassinated = 0;
    let games = 0;
    for (const count of [4, 5, 6, 8]) {
      for (let seed = 1; seed <= 8; seed++) {
        const all = Array.from({ length: count }, (_, i) => i);
        const end = selfPlay(codenamesModule.createInitialState(launcherConfig(count, undefined, seed * 101, all)));
        expect(end.phase).toBe('gameOver');
        expect(end.winnerTeam === 'red' || end.winnerTeam === 'blue').toBe(true);
        games++;
        if (end.loserTeam) assassinated++;
      }
    }
    // Sanity: most games are won by finding agents, not assassin roulette.
    expect(assassinated).toBeLessThan(games / 2);
  });

  it('human-spymaster clue: AI operatives still make a legal guess, then a legal follow-up', () => {
    const s0 = codenamesModule.createInitialState(launcherConfig(4, undefined, 31, [1, 3]));
    const op = seatOf(s0, 'operative');
    let s = apply(s0, { type: 'giveClue', bySeat: seatOf(s0, 'spymaster'), word: 'ZZYZX', number: 1 });
    const first = codenamesModule.aiChooseAction!(s, op)!;
    expect(first.type).toBe('guessCard');
    s = apply(s, first);
    if (s.phase === 'guessing') {
      const next = codenamesModule.aiChooseAction!(s, op)!;
      expect(() => apply(s, next)).not.toThrow();
    }
  });
});
