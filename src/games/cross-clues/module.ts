import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CrossCluesAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial, rotateRoles } from './setup';
import {
  DEFAULT_WORD_PACK_ID,
  WORD_PACKS,
  type WordPackId,
} from '@/words';
import { isValidCoord, normalizeClue } from './rules';
import type {
  CellState,
  Coord,
  CrossCluesPrivateState,
  CrossCluesPublicState,
  RoundRecord,
} from './state';
import { crossCluesViewFor } from './view';

// ============================================================================
// Cross Clues — module
//
// Coop word game. Hidden info is narrow: only the active clue-giver's coord
// (and the deck order) is private; everything else (grid words, score,
// history) is shared. `viewFor` (view.ts) is the single redaction
// chokepoint — `yourCoord` / `yourRole` are the only fields that differ
// between seats.
// ============================================================================

export interface CrossCluesSeatConfig {
  name: string;
  isAI: boolean;
}

export interface CrossCluesOptions {
  players: CrossCluesSeatConfig[];
  // Selected word packs (multi-select, shared with Codenames). Words are
  // deduped across packs. If empty/missing we fall back to ['classic'].
  packs?: WordPackId[];
  // Legacy single-pack id — accepted for backwards compatibility. Promoted
  // to `packs: [packId]` when present.
  packId?: WordPackId;
}

function getOptions(config: GameConfig): CrossCluesOptions {
  return config.gameOptions as unknown as CrossCluesOptions;
}

// --- Validation ------------------------------------------------------------

function assertSeat(state: CrossCluesPrivateState, seat: unknown): asserts seat is SeatIndex {
  if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 0 || seat >= state.seats.length) {
    throw new Error(`Unknown seat ${String(seat)}`);
  }
}

// --- Phase transitions -----------------------------------------------------

function everyoneAcked(record: Record<SeatIndex, boolean>, seats: number): boolean {
  for (let i = 0; i < seats; i++) {
    if (!record[i]) return false;
  }
  return true;
}

function resetRevealAcks(state: CrossCluesPrivateState): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
}

// Resolve a guess: place a token, append history, advance score on hit.
// Always marks the clue-giver's TRUE coord cell as resolved (a miss paints
// the true cell red, not the guessed cell — rulebook).
function applyGuess(
  state: CrossCluesPrivateState,
  guess: Coord,
): CrossCluesPrivateState {
  const trueCoord = state.currentCoord!;
  const clueGiver = state.currentClueGiver!;
  const guesser = state.currentGuesser!;
  const clue = state.currentClue!;
  const correct = guess.row === trueCoord.row && guess.col === trueCoord.col;

  const grid = state.grid.map((row) => row.slice());
  const targetCell: CellState = {
    ...grid[trueCoord.row]![trueCoord.col]!,
    resolved: true,
    token: correct ? 'green' : 'red',
    resolvedOnRound: state.roundNumber,
    clueWord: clue,
    guessedCoord: guess,
  };
  grid[trueCoord.row]![trueCoord.col] = targetCell;

  const record: RoundRecord = {
    round: state.roundNumber,
    clueGiverSeat: clueGiver,
    guesserSeat: guesser,
    trueCoord,
    clueWord: clue,
    guessCoord: guess,
    correct,
  };

  return {
    ...state,
    grid,
    phase: 'revealRound',
    history: [...state.history, record],
    score: state.score + (correct ? 1 : 0),
    revealAcked: resetRevealAcks(state),
  };
}

// Advance from a fully-acked revealRound to the next clueGiving (or game
// over if the deck is empty).
function advanceToNextRound(state: CrossCluesPrivateState): CrossCluesPrivateState {
  if (state.remainingDeck.length === 0) {
    return {
      ...state,
      phase: 'gameOver',
      currentCoord: null,
      currentClue: null,
    };
  }
  const remainingDeck = state.remainingDeck.slice();
  const nextCoord = remainingDeck.shift()!;
  const { clueGiver, guesser } = rotateRoles(state);
  return {
    ...state,
    phase: 'clueGiving',
    remainingDeck,
    currentCoord: nextCoord,
    currentClue: null,
    currentClueGiver: clueGiver,
    currentGuesser: guesser,
    roundNumber: state.roundNumber + 1,
    revealAcked: resetRevealAcks(state),
  };
}

// ============================================================================
// Module
// ============================================================================

export const crossCluesModule: GameModule<
  CrossCluesPrivateState,
  CrossCluesPublicState,
  CrossCluesAction
> = {
  id: 'cross-clues',
  displayName: 'Cross Clues',
  minPlayers: 2,
  maxPlayers: 6,

  createInitialState(config: GameConfig): CrossCluesPrivateState {
    const opts = getOptions(config);
    const playerCount = opts.players?.length ?? 0;
    if (playerCount < this.minPlayers || playerCount > this.maxPlayers) {
      throw new Error(
        `Cross Clues requires ${this.minPlayers}-${this.maxPlayers} players (got ${playerCount})`,
      );
    }
    // Resolve packs: explicit packs list wins, else legacy packId, else
    // classic default. Empty array falls back to classic so the deal can
    // never starve.
    const packs: WordPackId[] =
      opts.packs && opts.packs.length > 0
        ? opts.packs
        : opts.packId
          ? [opts.packId]
          : [DEFAULT_WORD_PACK_ID];
    return buildInitial(
      opts.players.map((p) => p.name),
      packs,
      config.seed,
    );
  },

  applyAction(
    state: CrossCluesPrivateState,
    action: CrossCluesAction,
  ): CrossCluesPrivateState {
    switch (action.type) {
      case 'ackSetup': {
        if (state.phase !== 'setup') {
          throw new Error('ackSetup only valid in setup phase');
        }
        assertSeat(state, action.bySeat);
        const setupAcked = { ...state.setupAcked, [action.bySeat]: true };
        const allAcked = everyoneAcked(setupAcked, state.seats.length);
        if (!allAcked) return { ...state, setupAcked };
        // Transition to clueGiving — currentCoord was popped at construction.
        return { ...state, setupAcked, phase: 'clueGiving' };
      }

      case 'submitClue': {
        if (state.phase !== 'clueGiving') {
          throw new Error('submitClue only valid in clueGiving phase');
        }
        if (action.bySeat !== state.currentClueGiver) {
          throw new Error(
            `Only the clue-giver (seat ${state.currentClueGiver}) may submit a clue`,
          );
        }
        const clue = normalizeClue(action.clue, [...state.rowWords, ...state.colWords]);
        return { ...state, phase: 'guessing', currentClue: clue };
      }

      case 'submitGuess': {
        if (state.phase !== 'guessing') {
          throw new Error('submitGuess only valid in guessing phase');
        }
        if (action.bySeat !== state.currentGuesser) {
          throw new Error(
            `Only the guesser (seat ${state.currentGuesser}) may submit a guess`,
          );
        }
        if (!isValidCoord(action.coord)) {
          throw new Error(`Coord out of range: ${JSON.stringify(action.coord)}`);
        }
        const cell = state.grid[action.coord.row]![action.coord.col]!;
        if (cell.resolved) {
          throw new Error('That cell has already been resolved');
        }
        return applyGuess(state, action.coord);
      }

      case 'ackReveal': {
        if (state.phase !== 'revealRound') {
          throw new Error('ackReveal only valid in revealRound phase');
        }
        assertSeat(state, action.bySeat);
        const revealAcked = { ...state.revealAcked, [action.bySeat]: true };
        if (!everyoneAcked(revealAcked, state.seats.length)) {
          return { ...state, revealAcked };
        }
        return advanceToNextRound({ ...state, revealAcked });
      }

      default:
        throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
    }
  },

  viewFor: crossCluesViewFor,

  isFinished(state: CrossCluesPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    const opts: CrossCluesOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
      packs: [DEFAULT_WORD_PACK_ID],
    };
    return {
      gameId: 'cross-clues',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
  },
};

// Re-export for convenience / tests.
export { WORD_PACKS };
