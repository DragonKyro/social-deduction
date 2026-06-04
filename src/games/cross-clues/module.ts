import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CrossCluesAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial, rotateRoles } from './setup';
import {
  DEFAULT_WORD_PACK_ID,
  WORD_PACKS,
  type WordPackId,
} from '@/words';
import type {
  CellState,
  Coord,
  CrossCluesPlayerRole,
  CrossCluesPrivateState,
  CrossCluesPublicCell,
  CrossCluesPublicState,
  CrossCluesScoreRating,
  RoundRecord,
} from './state';

// ============================================================================
// Cross Clues — module
//
// Coop word game. Hidden info is narrow: only the active clue-giver's coord
// is private; everything else (grid words, score, history) is shared.
// `viewFor` is the single redaction chokepoint — `yourCoord` is the only
// field that ever differs between seats.
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

const MAX_CLUE_LENGTH = 32;

// Trim and validate a clue. Rules: non-empty, no internal whitespace,
// allow hyphens and apostrophes, ≤ MAX_CLUE_LENGTH chars. Returns the
// canonical trimmed form or throws.
function normalizeClue(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) throw new Error('Clue must not be empty');
  if (trimmed.length > MAX_CLUE_LENGTH) {
    throw new Error(`Clue must be ≤ ${MAX_CLUE_LENGTH} chars`);
  }
  if (/\s/.test(trimmed)) {
    throw new Error('Clue must be a single word (no spaces)');
  }
  return trimmed;
}

function assertCoordInBounds(c: Coord): void {
  if (
    !Number.isInteger(c.row) ||
    !Number.isInteger(c.col) ||
    c.row < 0 ||
    c.row > 4 ||
    c.col < 0 ||
    c.col > 4
  ) {
    throw new Error(`Coord out of range: ${JSON.stringify(c)}`);
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

function scoreRatingFor(score: number): CrossCluesScoreRating {
  if (score >= 25) return 'perfect';
  if (score >= 21) return 'legendary';
  if (score >= 16) return 'great';
  return 'rookie';
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

// --- Public view -----------------------------------------------------------

function publicCell(cell: CellState): CrossCluesPublicCell {
  return {
    resolved: cell.resolved,
    token: cell.token,
    clueWord: cell.resolved ? cell.clueWord : null,
    resolvedOnRound: cell.resolvedOnRound,
  };
}

function roleFor(
  state: CrossCluesPrivateState,
  seat: SeatIndex | null,
): CrossCluesPlayerRole {
  if (seat === null) return 'observer';
  if (seat === state.currentClueGiver) return 'clueGiver';
  if (seat === state.currentGuesser) return 'guesser';
  return 'observer';
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyAction(
    state: CrossCluesPrivateState,
    action: CrossCluesAction,
  ): CrossCluesPrivateState {
    switch (action.type) {
      case 'ackSetup': {
        if (state.phase !== 'setup') {
          throw new Error('ackSetup only valid in setup phase');
        }
        if (action.bySeat < 0 || action.bySeat >= state.seats.length) {
          throw new Error(`Unknown seat ${action.bySeat}`);
        }
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
        const clue = normalizeClue(action.clue);
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
        assertCoordInBounds(action.coord);
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
        if (action.bySeat < 0 || action.bySeat >= state.seats.length) {
          throw new Error(`Unknown seat ${action.bySeat}`);
        }
        const revealAcked = { ...state.revealAcked, [action.bySeat]: true };
        if (!everyoneAcked(revealAcked, state.seats.length)) {
          return { ...state, revealAcked };
        }
        return advanceToNextRound({ ...state, revealAcked });
      }
    }
  },

  viewFor(
    state: CrossCluesPrivateState,
    seat: SeatIndex | null,
  ): CrossCluesPublicState {
    const isClueGiver =
      seat !== null &&
      state.phase === 'clueGiving' &&
      seat === state.currentClueGiver;
    const lastRound =
      state.phase === 'revealRound' && state.history.length > 0
        ? state.history[state.history.length - 1]!
        : null;
    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: s.name,
        hasAckedSetup: !!state.setupAcked[s.index],
        hasAckedReveal: !!state.revealAcked[s.index],
      })),
      rowWords: state.rowWords,
      colWords: state.colWords,
      grid: state.grid.map((row) => row.map(publicCell)),
      roundNumber: state.roundNumber,
      remainingCount: state.remainingDeck.length,
      currentClueGiver: state.currentClueGiver,
      currentGuesser: state.currentGuesser,
      currentClue: state.phase === 'guessing' || state.phase === 'revealRound'
        ? state.currentClue
        : null,
      lastRound,
      score: state.score,
      scoreRating: state.phase === 'gameOver' ? scoreRatingFor(state.score) : null,
      packs: state.packs,
      yourSeat: seat,
      yourCoord: isClueGiver ? state.currentCoord : null,
      yourRole: roleFor(state, seat),
    };
  },

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
