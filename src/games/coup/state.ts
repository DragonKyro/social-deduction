import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Coup — host state
// ============================================================================
//
// Bluffing game with imperfect information. Every player has 2 face-down
// influence cards out of 5 base characters (Duke, Assassin, Captain,
// Ambassador, Contessa) + expansion characters. You CAN claim any
// character to take their action — but if challenged and you can't reveal
// it, you lose a card. Lose both = out.

export type CoupCharacter =
  // Base game
  | 'duke' // tax (+3 coins) / blocks foreign-aid
  | 'assassin' // pay 3 to force a player to lose 1 influence
  | 'captain' // steal 2 coins / blocks captain steal
  | 'ambassador' // exchange 2 cards from the deck / blocks captain steal
  | 'contessa' // blocks assassinations
  // Reformation expansion (planned)
  | 'inquisitor' // replaces ambassador: exchange 1, OR look at one of someone's cards
  // Other planned characters
  | 'reformer'
  | 'censor';

export type CoupAction =
  | 'income' // +1 coin (cannot be blocked or challenged)
  | 'foreignAid' // +2 coins (blockable by Duke)
  | 'coup' // pay 7, force target to lose influence (unblockable)
  | 'tax' // +3, claim Duke (challengeable)
  | 'assassinate' // pay 3, target loses influence, claim Assassin (challengeable, blockable by Contessa)
  | 'steal' // -2 from target, claim Captain (challengeable, blockable by Captain/Ambassador)
  | 'exchange'; // draw 2, claim Ambassador (challengeable)

export type CoupPhase =
  | 'setup'
  | 'turnStart' // active player picks an action
  | 'awaitingChallenge' // an action was claimed; window for any opponent to challenge
  | 'awaitingBlock' // action was uncontested; window for an opponent to claim a blocker
  | 'challengeReveal' // the challenged player picks a card to reveal
  | 'loseInfluence' // someone needs to lose a card (coup, assassination, failed challenge, failed block)
  | 'exchangePick' // ambassador/inquisitor draws 2; picks which to return
  | 'gameOver';

export interface CoupSeatState {
  index: SeatIndex;
  // Two face-down cards initially. Lost cards stay in the array as
  // `{ char, revealed: true }` so the public view can show what was lost.
  influences: Array<{ char: CoupCharacter; revealed: boolean }>;
  coins: number;
  // True when both influences have been revealed (out of game).
  eliminated: boolean;
}

// The pending action queue. Coup's challenge/block window is a small state
// machine on top of the active player's primary action.
export interface CoupPendingAction {
  by: SeatIndex;
  action: CoupAction;
  // Target for coup / assassinate / steal.
  target: SeatIndex | null;
  // If a block was claimed, this records the blocker so a counter-challenge
  // resolves against the right card.
  blocker: { by: SeatIndex; character: CoupCharacter } | null;
  // Who challenged this action / block, if anyone.
  challenger: SeatIndex | null;
}

export interface CoupPrivateState {
  phase: CoupPhase;
  seats: CoupSeatState[];
  // The shuffled deck of remaining (non-dealt, non-revealed) cards.
  // Strict secrecy: peers never see the deck. Reshuffles use seeded RNG.
  deck: CoupCharacter[];
  currentSeat: SeatIndex;
  pending: CoupPendingAction | null;
  // During exchange, the active seat is shown their 2 dealt + their 2 current
  // = 4 cards. Stored here so the host can validate the return choice.
  exchangeOffer: CoupCharacter[] | null;
  seed: number;
  winnerSeat: SeatIndex | null;
}

// === Public view ===

export interface CoupPublicSeatState {
  index: SeatIndex;
  name: string;
  coins: number;
  // Hidden cards are reported as { revealed: false }; revealed lost cards
  // show their character.
  influences: Array<{ char: CoupCharacter | null; revealed: boolean }>;
  eliminated: boolean;
}

export interface CoupPublicState {
  phase: CoupPhase;
  seats: CoupPublicSeatState[];
  currentSeat: SeatIndex;
  pending: CoupPendingAction | null;
  deckSize: number;
  winnerSeat: SeatIndex | null;

  // Redacted slots — viewing seat only.
  yourInfluences: Array<{ char: CoupCharacter; revealed: boolean }>;
  // During exchange, the 4-card pick set is shown only to the active seat.
  yourExchangeOffer: CoupCharacter[] | null;
}
