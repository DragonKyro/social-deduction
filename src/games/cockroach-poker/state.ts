import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Cockroach Poker — host state
//
// Deck: 64 cards = 8 creatures × 8 copies. Passes:
//   - Active seat picks a card from their hand, declares a creature, and
//     passes it FACE-DOWN to another seat with the claim.
//   - Recipient decides:
//       a) Accept (believe it's a different creature) → reveal, prove
//          claim wrong: card goes face-up in front of LIAR (sender). If
//          claim right, face-up in front of recipient.
//       b) Challenge (call "I think you're lying") → same reveal logic.
//       (a/b are equivalent in this build — they're presented as
//        "believe (true)" / "believe (lie)".)
//       c) Peek + pass on: look at the card, then pass it onward (possibly
//          with a new claim). Cannot pass to a seat that already saw it
//          this chain. If nobody is left to pass to, must accept/challenge.
// Loss: 4 of any one creature face-up in front of you → you're out (round
// ends, player is the loser of the match). Also: if all seats except you
// have seen the in-transit card, you must accept/challenge.
//
// Hidden info: contents of each seat's hand; contents of the passed card
// (visible to the original sender and any seat that has peeked).
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

export type CockroachPokerPhase =
  // Pre-game ack of the deal (each seat sees their initial hand).
  | 'dealPending'
  // Active seat must pick a card + creature + target.
  | 'passing'
  // Target must decide accept/challenge/peek-and-pass.
  | 'decide'
  // A card was revealed; show outcome; everyone acks.
  | 'revealing'
  // Round over — match win/lose state. (Cockroach is a single round of many
  // passes; "round" here = match.)
  | 'gameOver';

export interface PlayerState {
  index: SeatIndex;
  name: string;
  // Cards in hand (creatures, hidden).
  hand: Creature[];
  // Face-up creatures captured (count per type).
  row: Record<Creature, number>;
  // True when this player loses (4 of one creature OR forced accept w/ no
  // pass option).
  lost: boolean;
  // Has acked the initial deal.
  dealAcked: boolean;
}

// The card currently being passed.
export interface PassState {
  card: Creature;        // the actual card (hidden from non-peekers)
  claim: Creature;       // the current claim
  originalSender: SeatIndex;
  // Seats that have seen the card so far (always includes originalSender;
  // includes any seat that peeked it during the pass chain).
  seenBy: SeatIndex[];
  // Current holder — the seat that must decide. Updates as the pass chain
  // hops.
  holder: SeatIndex;
  // History of passes in this chain (for the UI).
  chain: Array<{ from: SeatIndex; to: SeatIndex; claim: Creature }>;
}

export interface RevealRecord {
  // The pass that was resolved.
  pass: PassState;
  // The seat that decided (the final holder).
  decider: SeatIndex;
  // The decider's call: 'truth' (claim correct) or 'lie' (claim wrong).
  call: 'truth' | 'lie';
  // Was the call correct?
  callerWon: boolean;
  // The seat that has to take the card face-up.
  receiver: SeatIndex;
  // The card (now public).
  card: Creature;
}

export interface CockroachPokerPrivateState {
  phase: CockroachPokerPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: Record<SeatIndex, PlayerState>;
  // Whose turn to pass (between chains). Changes after each chain resolves.
  currentSeat: SeatIndex;
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
  // Whoever currently holds the in-transit card (for the UI).
  passHolder: SeatIndex | null;
  passOriginalSender: SeatIndex | null;
  passClaim: Creature | null;
  passChain: Array<{ from: SeatIndex; to: SeatIndex; claim: Creature }>;
  // Seats that have already seen the in-transit card this chain (for "you
  // can't pass back to these" UI).
  passSeenBy: SeatIndex[];
  lastReveal: RevealRecord | null;
  matchWinners: SeatIndex[];
  loserSeat: SeatIndex | null;

  // Per-seat slots.
  yourSeat: SeatIndex | null;
  yourHand: Creature[];
  // The actual card in transit IFF the viewing seat has seen it
  // (originalSender or any peeker). Otherwise null.
  yourPeekedCard: Creature | null;
  yourAckPending: boolean;
}
