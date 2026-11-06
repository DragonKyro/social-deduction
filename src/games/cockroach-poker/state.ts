import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Cockroach Poker — host state
//
// Deck: 64 cards = 8 creatures × 8 copies, dealt evenly (leftovers are set
// aside unseen). A turn:
//   - The active seat picks a card from their hand, declares a creature, and
//     passes it FACE-DOWN to another seat with the claim.
//   - The holder either
//       a) calls it: "true" (the claim is right) or "false" (it's a lie).
//          The card is revealed. A correct call sends it face-up to the
//          seat that passed it to the holder; a wrong call keeps it face-up
//          in front of the holder; or
//       b) peeks at it secretly, and then MUST pass it on with a new (or the
//          same) claim to a seat that hasn't seen it this chain. If every
//          other seat has seen it, the holder can't peek and must call.
//   - Whoever takes the card face-up starts the next turn.
// Loss: 4 of one creature face-up in front of you, or having to start a
// turn with no cards in hand. The game ends with that single loser.
//
// Hidden info: contents of each seat's hand; the in-transit card (visible
// to the original sender and every seat that peeked it).
// ============================================================================

export const CREATURES = [
  'rat',
  'fly',
  'spider',
  'cockroach',
  'toad',
  'bat',
  'scorpion',
  'stinkbug',
] as const;
export type Creature = (typeof CREATURES)[number];

export const COPIES_PER_CREATURE = 8;
export const LOSING_ROW_COUNT = 4;

export type CockroachPokerPhase =
  // Pre-game ack of the deal (each seat sees their initial hand).
  | 'dealPending'
  // Active seat must pick a card + creature + target.
  | 'passing'
  // Holder must call true/false, or peek then pass on.
  | 'decide'
  // A card was revealed; show outcome; everyone acks.
  | 'revealing'
  // A seat has lost; the match is over.
  | 'gameOver';

export type LossReason = 'fourOfAKind' | 'emptyHand';

export interface PlayerState {
  index: SeatIndex;
  name: string;
  // Cards in hand (creatures, hidden).
  hand: Creature[];
  // Face-up creatures captured (count per type).
  row: Record<Creature, number>;
  // True when this player has lost.
  lost: boolean;
  // Has acked the initial deal.
  dealAcked: boolean;
}

export interface ChainHop {
  from: SeatIndex;
  to: SeatIndex;
  claim: Creature;
}

// The card currently being passed.
export interface PassState {
  card: Creature; // the actual card (hidden from non-peekers)
  claim: Creature; // the current claim
  originalSender: SeatIndex;
  // Seats that have seen the card so far (always includes originalSender;
  // includes every seat that peeked during the chain).
  seenBy: SeatIndex[];
  // Current holder — the seat that must act.
  holder: SeatIndex;
  // True once the holder has peeked; they must now pass it on.
  holderPeeked: boolean;
  // Passes in this chain (for the UI).
  chain: ChainHop[];
}

export interface RevealRecord {
  // The claim that was called and who made it.
  claim: Creature;
  claimant: SeatIndex;
  // The seat that called (the final holder).
  decider: SeatIndex;
  // The decider's call: 'truth' (claim correct) or 'lie' (claim wrong).
  call: 'truth' | 'lie';
  // Was the call correct?
  callerWon: boolean;
  // The seat that takes the card face-up.
  receiver: SeatIndex;
  // The card (now public).
  card: Creature;
  // The full chain, for the recap.
  chain: ChainHop[];
  seenBy: SeatIndex[];
}

export interface CockroachPokerPrivateState {
  phase: CockroachPokerPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: Record<SeatIndex, PlayerState>;
  // Whose turn to pass (between chains).
  currentSeat: SeatIndex;
  // Number of chains resolved so far.
  turnNumber: number;
  // Active pass chain (null between chains).
  pass: PassState | null;
  // Last reveal for the UI.
  lastReveal: RevealRecord | null;
  // Per-seat ack of the reveal.
  revealAcked: Record<SeatIndex, boolean>;
  // Match winners (everyone except the loser).
  matchWinners: SeatIndex[];
  // The single loser seat.
  loserSeat: SeatIndex | null;
  lossReason: LossReason | null;
  // Host-only. Never copied into a public view: the deal is derived from it.
  seed: number;
  rngCursor: number;
}

// ============================================================================
// Public view
// ============================================================================

export interface PublicPlayer {
  index: SeatIndex;
  name: string;
  // Public row.
  row: Record<Creature, number>;
  // Cards in hand (count only).
  handSize: number;
  lost: boolean;
  dealAcked: boolean;
}

export interface CockroachPokerPublicState {
  phase: CockroachPokerPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: PublicPlayer[];
  currentSeat: SeatIndex;
  turnNumber: number;
  // Whoever currently holds the in-transit card (for the UI).
  passHolder: SeatIndex | null;
  passOriginalSender: SeatIndex | null;
  passClaim: Creature | null;
  passHolderPeeked: boolean;
  passChain: ChainHop[];
  // Seats that have already seen the in-transit card this chain (public in
  // the real game — everyone watches who peeks).
  passSeenBy: SeatIndex[];
  // Only non-null in `revealing` / `gameOver`.
  lastReveal: RevealRecord | null;
  matchWinners: SeatIndex[];
  loserSeat: SeatIndex | null;
  lossReason: LossReason | null;
  // Seats whose acknowledgement the current ack phase is waiting on.
  awaitingAck: SeatIndex[];

  // Per-seat slots.
  yourSeat: SeatIndex | null;
  yourHand: Creature[];
  // The actual card in transit IFF the viewing seat has seen it
  // (originalSender or any peeker). Otherwise null.
  yourPeekedCard: Creature | null;
  yourAckPending: boolean;
}
