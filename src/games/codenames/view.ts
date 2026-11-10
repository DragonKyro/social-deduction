import type { SeatIndex } from '@/engine/types';
import type {
  CodenamesPrivateState,
  CodenamesPublicCard,
  CodenamesPublicState,
  TeamColor,
} from './state';

function teamRemaining(state: CodenamesPrivateState, team: TeamColor): number {
  return state.cards.filter((c) => c.kind === team && !c.revealed).length;
}

// The single redaction chokepoint. Only a spymaster's view (or the final
// reveal) carries the kind of an unrevealed card. Spectators (seat = null)
// and operatives get `kind: null` for every face-up word, and nothing else
// in the view is derived from the key. The seed is never copied into the
// view. Everything is freshly allocated so a view never aliases host state.
export function codenamesViewFor(
  state: CodenamesPrivateState,
  seat: SeatIndex | null,
): CodenamesPublicState {
  const own = seat === null ? null : (state.seats[seat] ?? null);
  const isSpymaster = own?.role === 'spymaster';
  const gameOver = state.phase === 'gameOver';

  const cards: CodenamesPublicCard[] = state.cards.map((c) => ({
    index: c.index,
    word: c.word,
    revealed: c.revealed,
    kind: c.revealed || isSpymaster || gameOver ? c.kind : null,
  }));

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({
      index: s.index,
      name: s.name,
      team: s.team,
      role: s.role,
      isAI: s.isAI,
    })),
    cards,
    startingTeam: state.startingTeam,
    currentTeam: state.currentTeam,
    currentClue: state.currentClue ? { ...state.currentClue } : null,
    guessesThisClue: state.guessesThisClue,
    // Public in the physical game: everyone can count the agent cards left
    // in each team's stack.
    remaining: {
      red: teamRemaining(state, 'red'),
      blue: teamRemaining(state, 'blue'),
    },
    clueHistory: state.clueHistory.map((r) => ({ ...r })),
    // Only revealed cards ever appear here, so `kind` is public.
    guessHistory: state.guessHistory.map((g) => ({ ...g })),
    winnerTeam: state.winnerTeam,
    loserTeam: state.loserTeam,
    yourSeat: own ? seat : null,
    yourTeam: own?.team ?? null,
    yourRole: own?.role ?? null,
  };
}
