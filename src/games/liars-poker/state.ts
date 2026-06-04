import type { SeatIndex } from '@/engine/types';
import type { HandClaim } from './hands';

// ============================================================================
// Liar's Poker — host state
//
// Each player is dealt N cards from a standard 52-card deck. On a turn,
// declare a higher poker hand than the prior claim OR call "liar". On a
// call, all hands are revealed and the combined pool is checked against
// the prior claim. If the claim exists, the caller loses a card; if not,
// the bidder loses a card.
//
// Special rules in this build:
//  - Flushes: declared as {topRank, suit}. Existence requires the exact
//    top card + 4 lower cards of the same suit. LOWER top rank = stronger
//    (since fewer same-suit cards available below). See hands.ts.
//  - Dummy-hand rule: when a player loses their last card, they get one
//    last life — dealt 1 card on the next deal that EVERYONE except them
//    can see. Lose that round → eliminated.
//  - All other hand categories use standard "higher rank stronger".
//  - Combined-pool verification: declared hand must exist somewhere
//    across all players' cards (the union).
// ============================================================================

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
// 11=J, 12=Q, 13=K, 14=A

export interface Card {
  rank: CardRank;
  suit: Suit;
}

export type LiarsPokerPhase =
  | 'dealPending'
  | 'bidding'
  | 'revealing'
  | 'roundOver'
  | 'gameOver';

export interface PlayerState {
  index: SeatIndex;
  name: string;
  // Current hand.
  hand: Card[];
  // Cards owned this round (target hand size).
  cardCount: number;
  // True when this seat is in dummy-hand mode (lost their last card).
  // They get a single card others can see. Losing again = eliminated.
  isDummy: boolean;
  // Permanently out.
  eliminated: boolean;
  // Has acked the deal.
  dealAcked: boolean;
}

export interface RevealRecord {
  // The claim that was challenged.
  claim: HandClaim;
  caller: SeatIndex;
  bidder: SeatIndex;
  // Did the claim exist in the combined pool?
  claimExists: boolean;
  // True → caller won (bidder loses card). False → caller lost.
  callerWon: boolean;
  loserSeat: SeatIndex;
  // Per-seat hands at reveal.
  allHands: Record<SeatIndex, Card[]>;
}

export interface RoundSummary {
  roundNumber: number;
  reveal: RevealRecord;
  eliminatedThisRound: SeatIndex[];
}

export interface LiarsPokerPrivateState {
  phase: LiarsPokerPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: Record<SeatIndex, PlayerState>;
  currentSeat: SeatIndex;
  roundLeader: SeatIndex;
  roundNumber: number;

  // Options.
  cardsPerPlayer: number;
  dummyHand: boolean;

  // Bidding.
  currentClaim: HandClaim | null;
  currentBidder: SeatIndex | null;

  // Reveal.
  lastReveal: RevealRecord | null;
  revealAcked: Record<SeatIndex, boolean>;

  // Round over.
  roundOverAcked: Record<SeatIndex, boolean>;
  history: RoundSummary[];
  matchWinners: SeatIndex[];

  seed: number;
  rngCursor: number;
}

// ============================================================================
// Public view
// ============================================================================

export interface PublicPlayer {
  index: SeatIndex;
  name: string;
  cardCount: number;
  isDummy: boolean;
  eliminated: boolean;
  dealAcked: boolean;
  // For a dummy seat: every OTHER seat sees their card here. For non-dummies,
  // empty. For the dummy seat's own view, also empty (they don't see their
  // own card). Populated by viewFor.
  visibleHand: Card[];
}

export interface LiarsPokerPublicState {
  phase: LiarsPokerPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: PublicPlayer[];
  currentSeat: SeatIndex;
  roundLeader: SeatIndex;
  roundNumber: number;
  cardsPerPlayer: number;
  dummyHand: boolean;
  currentClaim: HandClaim | null;
  currentBidder: SeatIndex | null;
  lastReveal: RevealRecord | null;
  history: RoundSummary[];
  matchWinners: SeatIndex[];

  yourSeat: SeatIndex | null;
  // Your normal hand (empty for dummies — they don't see their own).
  yourHand: Card[];
  yourAckPending: boolean;
}
