import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Liar's Dice — host state
//
// Each player rolls dice in a cup; only they see the result. On a turn,
// raise the bid (more dice OR higher face) or call "liar". If the call is
// wrong (the bid existed), the caller loses a die; if right, the bidder
// loses a die. Last player standing wins.
//
// Optional rules:
//  - wildOnes: 1s count as the bid face (except a bid OF 1s, which excludes them).
//  - spotOn: on your turn you may also call "spot on" — claim the bid is
//    EXACTLY correct. If right, the bidder loses a die; if wrong, you do.
// ============================================================================

export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

export type LiarsDicePhase =
  // Dice are rolled; every alive seat must ack they've seen them before
  // bidding starts.
  | 'rollPending'
  // Active seat must bid up or call.
  | 'bidding'
  // Resolved a call/spot-on — show reveal + loss; ack to advance.
  | 'revealing'
  // Round summary shown; ack to roll the next round.
  | 'roundOver'
  // Match over.
  | 'gameOver';

export interface PlayerState {
  index: SeatIndex;
  name: string;
  // Current rolled dice (face-up to owner only).
  dice: DieFace[];
  // Total dice remaining this match (resets to dice.length each round
  // until they reach 0 = eliminated).
  diceCount: number;
  // True once the seat is permanently out.
  eliminated: boolean;
  // Has acked the current rollPending.
  rollAcked: boolean;
}

export interface Bid {
  count: number; // how many dice
  face: DieFace; // the face
}

export type CallKind = 'liar' | 'spotOn';

export interface RevealRecord {
  // Bid that was challenged.
  bid: Bid;
  // Who called.
  caller: SeatIndex;
  // Which kind of call.
  kind: CallKind;
  // Actual count across all seats (with wildOnes applied if enabled).
  actual: number;
  // Did the caller win the challenge? True → bidder loses a die.
  callerWon: boolean;
  // The seat that lost a die.
  loserSeat: SeatIndex;
  // Per-seat dice at reveal time (for the recap).
  allDice: Record<SeatIndex, DieFace[]>;
}

export interface RoundSummary {
  roundNumber: number;
  // Carry the reveal record forward.
  reveal: RevealRecord;
  // Who was eliminated this round (if anyone).
  eliminatedThisRound: SeatIndex[];
}

export interface LiarsDicePrivateState {
  phase: LiarsDicePhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: Record<SeatIndex, PlayerState>;
  // Whose turn it is to bid (or call).
  currentSeat: SeatIndex;
  // First bidder this round.
  roundLeader: SeatIndex;
  roundNumber: number;

  // Options
  wildOnes: boolean;
  spotOn: boolean;
  // Starting dice per player (configurable in setup; default 5).
  startingDice: number;

  // Current bid (null = bidding hasn't opened yet this round).
  currentBid: Bid | null;
  // Seat that placed the current bid.
  currentBidder: SeatIndex | null;

  // ---- Reveal state ----
  lastReveal: RevealRecord | null;
  // Per-seat ack of the reveal panel.
  revealAcked: Record<SeatIndex, boolean>;

  // ---- Round over ----
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
  // Number of dice (not faces).
  diceCount: number;
  eliminated: boolean;
  rollAcked: boolean;
}

export interface LiarsDicePublicState {
  phase: LiarsDicePhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: PublicPlayer[];
  currentSeat: SeatIndex;
  roundLeader: SeatIndex;
  roundNumber: number;
  wildOnes: boolean;
  spotOn: boolean;
  currentBid: Bid | null;
  currentBidder: SeatIndex | null;
  // Total dice still in play (used for max-count cap on bids).
  totalDice: number;
  lastReveal: RevealRecord | null;
  history: RoundSummary[];
  matchWinners: SeatIndex[];

  // ---- Per-seat ----
  yourSeat: SeatIndex | null;
  yourDice: DieFace[];
  yourAckPending: boolean;
}
