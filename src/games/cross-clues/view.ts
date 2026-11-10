import type { SeatIndex } from '@/engine/types';
import type {
  CellState,
  CrossCluesPlayerRole,
  CrossCluesPrivateState,
  CrossCluesPublicCell,
  CrossCluesPublicState,
  CrossCluesScoreRating,
} from './state';

export function scoreRatingFor(score: number): CrossCluesScoreRating {
  if (score >= 25) return 'perfect';
  if (score >= 21) return 'legendary';
  if (score >= 16) return 'great';
  return 'rookie';
}

function publicCell(cell: CellState): CrossCluesPublicCell {
  return {
    resolved: cell.resolved,
    token: cell.token,
    clueWord: cell.resolved ? cell.clueWord : null,
    resolvedOnRound: cell.resolvedOnRound,
  };
}

function roleFor(state: CrossCluesPrivateState, seat: SeatIndex | null): CrossCluesPlayerRole {
  if (seat === null) return 'observer';
  if (seat === state.currentClueGiver) return 'clueGiver';
  if (seat === state.currentGuesser) return 'guesser';
  return 'observer';
}

// The single redaction chokepoint. The held coordinate is the only hidden
// information: it reaches the clue-giver alone, while they hold the card
// (clue writing + the guess that follows), and nobody else until the round
// is resolved (then `lastRound` / the grid make it public). The deck order
// and the seed are never copied into a view.
export function crossCluesViewFor(
  state: CrossCluesPrivateState,
  seat: SeatIndex | null,
): CrossCluesPublicState {
  const holding = state.phase === 'clueGiving' || state.phase === 'guessing';
  const isHolder = seat !== null && holding && seat === state.currentClueGiver;
  const lastRound =
    state.phase === 'revealRound' && state.history.length > 0
      ? { ...state.history[state.history.length - 1]! }
      : null;
  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({
      index: s.index,
      name: s.name,
      hasAckedSetup: !!state.setupAcked[s.index],
      hasAckedReveal: !!state.revealAcked[s.index],
    })),
    rowWords: state.rowWords.slice(),
    colWords: state.colWords.slice(),
    grid: state.grid.map((row) => row.map(publicCell)),
    roundNumber: state.roundNumber,
    remainingCount: state.remainingDeck.length,
    currentClueGiver: state.currentClueGiver,
    currentGuesser: state.currentGuesser,
    currentClue:
      state.phase === 'guessing' || state.phase === 'revealRound' ? state.currentClue : null,
    lastRound,
    score: state.score,
    scoreRating: state.phase === 'gameOver' ? scoreRatingFor(state.score) : null,
    packs: state.packs.slice(),
    yourSeat: seat !== null && state.seats[seat] ? seat : null,
    yourCoord: isHolder && state.currentCoord ? { ...state.currentCoord } : null,
    yourRole: roleFor(state, seat !== null && state.seats[seat] ? seat : null),
  };
}
