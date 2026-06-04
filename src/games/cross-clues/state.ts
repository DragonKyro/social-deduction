import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Cross Clues — host state
//
// Cooperative word game. A 5x5 grid is built from 10 secret words: 5 as row
// labels (rows A..E, index 0..4) and 5 as column labels (cols 1..5, index
// 0..4). A shuffled 25-card coordinate deck drives play; each round one
// seat (the clue-giver) holds the top card and writes a one-word clue, the
// next seat (the guesser) submits the team's guess. The held coordinate is
// the ONLY hidden info — it's redacted from every seat that isn't the
// active clue-giver.
// ============================================================================

export type CrossCluesPhase =
  | 'setup' // grid words dealt; every seat must ack the reveal
  | 'clueGiving' // active clue-giver privately holds a coord card; writes a clue
  | 'guessing' // clue is public; the designated guesser picks a cell
  | 'revealRound' // result tile placed; every seat must ack before advancing
  | 'gameOver'; // all 25 coords played

export interface Coord {
  row: number; // 0..4
  col: number; // 0..4
}

export type TokenColor = 'green' | 'red';

export interface CellState {
  resolved: boolean;
  token: TokenColor | null;
  // 1..25 — the round this cell was marked. null while unresolved.
  resolvedOnRound: number | null;
  // The clue word the clue-giver wrote for this cell. Surfaced on resolve.
  clueWord: string | null;
  // What the guesser actually picked (may differ from this cell on miss).
  guessedCoord: Coord | null;
}

export interface RoundRecord {
  round: number; // 1..25
  clueGiverSeat: SeatIndex;
  guesserSeat: SeatIndex;
  trueCoord: Coord; // the coord card the clue-giver actually drew
  clueWord: string;
  guessCoord: Coord; // what the guesser submitted
  correct: boolean;
}

export interface CrossCluesPrivateState {
  phase: CrossCluesPhase;
  seats: Array<{ index: SeatIndex; name: string }>;

  rowWords: string[]; // length 5
  colWords: string[]; // length 5
  grid: CellState[][]; // 5x5; grid[row][col]

  // Shuffled coord deck. Top is index 0; consumed via shift() on advance.
  remainingDeck: Coord[];
  // The card currently held by the clue-giver. Populated when phase enters
  // 'clueGiving' (and at construction for round 1).
  currentCoord: Coord | null;
  currentClue: string | null; // set when entering 'guessing'
  currentClueGiver: SeatIndex | null;
  currentGuesser: SeatIndex | null;
  roundNumber: number; // 1..25

  setupAcked: Record<SeatIndex, boolean>;
  // Reset on every advance into the next round.
  revealAcked: Record<SeatIndex, boolean>;

  history: RoundRecord[];
  score: number; // running 0..25 (correct guesses)
  packId: string;
  seed: number;
}

// ============================================================================
// Public view
// ============================================================================

export interface CrossCluesPublicCell {
  resolved: boolean;
  token: TokenColor | null;
  // Only populated after resolve. Lets the UI overlay the clue word.
  clueWord: string | null;
  resolvedOnRound: number | null;
}

export interface CrossCluesPublicSeat {
  index: SeatIndex;
  name: string;
  hasAckedSetup: boolean;
  hasAckedReveal: boolean;
}

export type CrossCluesScoreRating = 'rookie' | 'great' | 'legendary' | 'perfect';

export type CrossCluesPlayerRole = 'clueGiver' | 'guesser' | 'observer';

export interface CrossCluesPublicState {
  phase: CrossCluesPhase;
  seats: CrossCluesPublicSeat[];
  rowWords: string[];
  colWords: string[];
  grid: CrossCluesPublicCell[][];

  roundNumber: number;
  // Length of the remaining deck; the actual cards are never exposed.
  remainingCount: number;

  currentClueGiver: SeatIndex | null;
  currentGuesser: SeatIndex | null;
  // null during 'clueGiving'; populated once the clue-giver submits.
  currentClue: string | null;
  // Populated during 'revealRound' so the UI can replay the just-finished
  // round (true coord + clue + guess + outcome).
  lastRound: RoundRecord | null;

  score: number;
  // null until phase === 'gameOver'.
  scoreRating: CrossCluesScoreRating | null;
  packId: string;

  // ----- Redacted per-seat slots -----
  yourSeat: SeatIndex | null;
  // The single hidden-info chokepoint: only non-null when phase ===
  // 'clueGiving' AND the viewing seat IS the clue-giver.
  yourCoord: Coord | null;
  yourRole: CrossCluesPlayerRole;
}
