import type { SeatIndex } from '@/engine/types';

// Codenames action union. The spymaster gives a clue; the team operatives
// guess cards or end their turn early. All other state transitions
// (revealing cards, switching teams, finishing the game) are derived by
// the reducer.

export type CodenamesAction =
  // Spymaster of the current team submits their clue. `number` is the
  // number of words on the board that match the clue. `0` is the
  // rulebook-sanctioned "Unlimited" — operatives may keep guessing as
  // long as they hit their team's cards.
  | { type: 'giveClue'; bySeat: SeatIndex; word: string; number: number }
  // An operative on the current team guesses a card.
  | { type: 'guessCard'; bySeat: SeatIndex; cardIndex: number }
  // An operative on the current team ends their guessing turn early.
  // Always allowed once they've made at least one guess; before that the
  // spymaster's clue forces them to attempt at least one (rulebook).
  | { type: 'endGuessing'; bySeat: SeatIndex };
