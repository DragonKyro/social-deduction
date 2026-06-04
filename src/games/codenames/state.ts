import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Codenames — host state
//
// 25-card grid. One spymaster per team knows which words belong to which team
// (their team / opponent / bystanders / one assassin). Operatives only see
// words + revealed colors. The starting team has 9 cards, the other has 8;
// totals are fixed by the rulebook (9 / 8 / 7 bystanders / 1 assassin).
// ============================================================================

export type TeamColor = 'red' | 'blue';

// What kind of card sits under a word on the spymaster key.
// 'red' / 'blue' belong to that team; 'bystander' = innocent civilian;
// 'assassin' = instant-loss card.
export type CardKind = TeamColor | 'bystander' | 'assassin';

export type CodenamesRoleId = 'red-spymaster' | 'red-operative' | 'blue-spymaster' | 'blue-operative';

export type CodenamesPhase =
  // Spymaster of the team-to-move enters a clue. Operatives see only words.
  | 'clue'
  // Clue is locked in; operatives may guess one card at a time. They stop
  // voluntarily (`endGuessing`) or are forced to stop when they exhaust the
  // hint number + 1 bonus guess, hit a wrong card, or hit the assassin.
  | 'guessing'
  | 'gameOver';

export interface CodenamesCard {
  index: number; // 0..24, fixed position on the 5×5 grid
  word: string;
  kind: CardKind; // hidden info — only spymasters see this pre-reveal
  revealed: boolean; // true once an operative has guessed it
}

export interface CodenamesSeatState {
  index: SeatIndex;
  name: string;
  team: TeamColor;
  // One spymaster per team. The other team members are operatives.
  role: 'spymaster' | 'operative';
}

// Last clue the current spymaster gave. Drives the guessing UI and the
// "you've guessed N — one bonus remaining" counter.
export interface CodenamesClue {
  word: string; // single word, uppercase
  number: number; // 0..9; 0 = "unlimited" per rulebook
  byTeam: TeamColor;
  bySeat: SeatIndex;
}

export interface CodenamesGuessRecord {
  // The board index they guessed.
  cardIndex: number;
  word: string;
  // What the card actually was.
  kind: CardKind;
  // Which team made the guess.
  byTeam: TeamColor;
  bySeat: SeatIndex;
  // Which clue this guess belongs to, by index into `clueHistory`.
  clueIndex: number;
}

export interface CodenamesClueRecord extends CodenamesClue {
  // Number of correct contacts the team made under this clue before
  // stopping (wrong guess, end button, or hit-cap).
  correctGuesses: number;
  // Set when the clue's guessing window closed.
  closed: boolean;
  // Reason the window closed. Useful for the public reveal text.
  closedReason: 'endedVoluntarily' | 'hitWrong' | 'hitAssassin' | 'capReached' | null;
}

export interface CodenamesPrivateState {
  phase: CodenamesPhase;
  seats: CodenamesSeatState[];
  cards: CodenamesCard[]; // length 25
  startingTeam: TeamColor;
  currentTeam: TeamColor;
  // Latest active clue, if any. Cleared when guessing closes.
  currentClue: CodenamesClue | null;
  // Number of guesses already made under `currentClue`. Used to gate the
  // "you may guess one above the clue number" rule.
  guessesThisClue: number;
  clueHistory: CodenamesClueRecord[];
  guessHistory: CodenamesGuessRecord[];
  seed: number;
  winnerTeam: TeamColor | null;
  // When the game ends by hitting the assassin we surface which team did it
  // so the gameover screen can phrase the result correctly.
  loserTeam: TeamColor | null;
}

// ============================================================================
// Public view — what each peer sees.
//
// Spymasters get the full key (kind on every card). Operatives only see
// `kind` on cards that have already been revealed (a card's color is public
// the moment a guess flips it). Spectators see what operatives see.
// ============================================================================

export interface CodenamesPublicCard {
  index: number;
  word: string;
  revealed: boolean;
  // Populated only when:
  //   - the card has been revealed (everyone sees it), OR
  //   - the viewing seat is a spymaster (they see all 25 from the start), OR
  //   - the game is over (final reveal).
  kind: CardKind | null;
}

export interface CodenamesPublicSeatState {
  index: SeatIndex;
  name: string;
  team: TeamColor;
  role: 'spymaster' | 'operative';
}

export interface CodenamesPublicState {
  phase: CodenamesPhase;
  seats: CodenamesPublicSeatState[];
  cards: CodenamesPublicCard[];
  startingTeam: TeamColor;
  currentTeam: TeamColor;
  currentClue: CodenamesClue | null;
  guessesThisClue: number;
  // Per-team remaining counts (computed from board state) — handy to render
  // the score banner without re-walking the cards client-side.
  remaining: { red: number; blue: number };
  clueHistory: CodenamesClueRecord[];
  guessHistory: CodenamesGuessRecord[];
  winnerTeam: TeamColor | null;
  loserTeam: TeamColor | null;

  // Redacted slots — populated only for the viewing seat.
  yourSeat: SeatIndex | null;
  yourTeam: TeamColor | null;
  yourRole: 'spymaster' | 'operative' | null;
}
