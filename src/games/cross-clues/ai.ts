import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { CrossCluesAction } from './actions';
import type { Coord, CrossCluesPrivateState } from './state';

// Cross Clues AI. Cooperative game, so the only thing the AI is good for
// is filling empty seats during local testing — it isn't trying to win
// (you can't beat a random word-association game with heuristics anyway).
//
// Behavior:
//  - In `setup` / `revealRound`: ack on this seat's behalf.
//  - As clue-giver: hyphenate the row/col words into a single token. Not a
//    real clue; just plausibly shaped so the round can advance.
//  - As guesser: pick a deterministic unresolved cell.
//
// Pure file. No DOM/net/store imports (same purity as the avalon/ai.ts file).

function deterministicClue(state: CrossCluesPrivateState, coord: Coord): string {
  const rowWord = state.rowWords[coord.row] ?? 'row';
  const colWord = state.colWords[coord.col] ?? 'col';
  // Cap at the same length the validator allows.
  return `${rowWord}-${colWord}`.slice(0, 32);
}

function pickUnresolvedCell(
  state: CrossCluesPrivateState,
  seat: SeatIndex,
): Coord | null {
  const candidates: Coord[] = [];
  for (let r = 0; r < state.grid.length; r++) {
    for (let c = 0; c < state.grid[r]!.length; c++) {
      if (!state.grid[r]![c]!.resolved) candidates.push({ row: r, col: c });
    }
  }
  if (candidates.length === 0) return null;
  const rng = makeRng(state.seed ^ (state.roundNumber * 31) ^ seat);
  return candidates[rngInt(rng, candidates.length)]!;
}

export function aiChooseAction(
  state: CrossCluesPrivateState,
  seat: SeatIndex,
): CrossCluesAction | null {
  switch (state.phase) {
    case 'setup':
      if (state.setupAcked[seat]) return null;
      return { type: 'ackSetup', bySeat: seat };

    case 'clueGiving':
      if (seat !== state.currentClueGiver) return null;
      if (!state.currentCoord) return null;
      return {
        type: 'submitClue',
        bySeat: seat,
        clue: deterministicClue(state, state.currentCoord),
      };

    case 'guessing':
      if (seat !== state.currentGuesser) return null;
      {
        const pick = pickUnresolvedCell(state, seat);
        if (!pick) return null;
        return { type: 'submitGuess', bySeat: seat, coord: pick };
      }

    case 'revealRound':
      if (state.revealAcked[seat]) return null;
      return { type: 'ackReveal', bySeat: seat };

    case 'gameOver':
      return null;
  }
}
