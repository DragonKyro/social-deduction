import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Skull — host state
//
// Each player owns 4 disks (3 roses + 1 skull). Disks are stacked face-down
// in front of each seat; only the owning seat may see the order of their own
// stack. Bidding declares "I can flip N disks without revealing a skull";
// the high bidder then flips that many disks starting from their own stack.
// Hit a skull = lose a disk (challenger removes any one of their disks).
// Win two consecutive challenges = win the match.
// ============================================================================

export type Disk = 'rose' | 'skull';

export type SkullPhase =
  // First-disk phase. Every seat must place their opening disk before
  // bidding can begin. Acks via `placeDisk` action.
  | 'placeOpening'
  // Free-form placement / bid-opening. The active seat must either place
  // another disk OR open the bidding.
  | 'placing'
  // Bidding war. Active seat must raise or pass. When everyone except one
  // bidder has passed, that bidder becomes the challenger.
  | 'bidding'
  // Challenge in progress. Challenger must keep flipping disks (starting
  // with their own stack) until either they hit the bid (success) or hit a
  // skull (fail). Each flip is a separate action so we can show the table.
  | 'revealing'
  // Successful or failed challenge resolved. Show outcome + losses; ack to
  // continue to the next round.
  | 'roundOver'
  // Match over — a player hit the challenge target.
  | 'gameOver';

export interface PlayerState {
  index: SeatIndex;
  name: string;
  // Disks remaining in the seat's personal stash (face-down off-table).
  // Starts at {skulls:1, roses:3}; loses one when this seat fails a
  // challenge or when an opponent's challenge reveals their skull.
  remaining: { roses: number; skulls: number };
  // Stack of disks placed on the table this round, bottom-first. Hidden
  // from other seats; redacted to stackSize in Public.
  stack: Disk[];
  // True once this seat has been eliminated (no disks left).
  eliminated: boolean;
  // Successful challenges this match.
  wins: number;
}

// Snapshot of a single flip in a challenge — drives the reveal UI.
export interface FlipRecord {
  // The seat whose stack was flipped from.
  seat: SeatIndex;
  // Bottom-up index removed from that seat's stack.
  disk: Disk;
}

// Final summary of a completed round.
export interface RoundSummary {
  roundNumber: number;
  // The challenger.
  challenger: SeatIndex;
  bid: number;
  // True if the challenger flipped enough roses to satisfy the bid.
  success: boolean;
  // Each flip in the order they happened (for the recap UI).
  flips: FlipRecord[];
  // If success: the challenger gained a win counter (newWins).
  // If fail: the seat that lost a disk (could be the challenger themselves
  // or the seat whose skull was hit, depending on the order rule).
  loserSeat: SeatIndex | null;
  // The disk that the loser lost. roses ranked higher in loss preference
  // (you don't volunteer your skull) — the engine picks rose first.
  diskLost: Disk | null;
}

export interface SkullPrivateState {
  phase: SkullPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: Record<SeatIndex, PlayerState>;
  // Whose action it is (placing seat / bidder / challenger).
  currentSeat: SeatIndex;
  // The seat that started this round of placing/bidding. We rotate by 1
  // each round; if the prior round was a successful challenge, the
  // challenger goes first instead.
  roundLeader: SeatIndex;
  // Round counter (1-indexed).
  roundNumber: number;
  // Match win target (1, 2, or 3 — picked at setup).
  challengeTarget: number;

  // ---- Bidding state (phase='bidding') ----
  currentBid: number;
  currentBidder: SeatIndex | null;
  // Seats that have passed this bidding round (cannot re-enter).
  passed: Record<SeatIndex, boolean>;

  // ---- Challenge state (phase='revealing') ----
  // The seat doing the flipping (= the winning bidder).
  challenger: SeatIndex | null;
  // Target flips left. Decremented per rose; on hit-skull this drops to 0
  // and the round resolves as a failed challenge.
  flipsRemaining: number;
  // Has the challenger finished flipping their OWN stack yet? If true,
  // they must pick another seat to flip from on the next action.
  ownStackCleared: boolean;
  // Sequence of flips so far this challenge (drives the reveal UI).
  flips: FlipRecord[];

  // ---- Round end ----
  // Per-seat ack to advance to the next round.
  roundOverAcked: Record<SeatIndex, boolean>;
  // Append-only round history.
  history: RoundSummary[];
  // Match winners.
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
  // Total disks visible on the table (just the count — order/kind are
  // hidden for everyone except the owning seat).
  stackSize: number;
  // Roses + skulls remaining in stash. Roses count is hidden (you don't
  // know how many you've played were roses) but the *skull placed* signal
  // is what matters — we surface both as totals.
  disksTotal: number;
  eliminated: boolean;
  wins: number;
}

export interface SkullPublicState {
  phase: SkullPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: PublicPlayer[];
  currentSeat: SeatIndex;
  roundLeader: SeatIndex;
  roundNumber: number;
  challengeTarget: number;
  currentBid: number;
  currentBidder: SeatIndex | null;
  passed: Record<SeatIndex, boolean>;
  challenger: SeatIndex | null;
  flipsRemaining: number;
  ownStackCleared: boolean;
  flips: FlipRecord[];
  // Most recent round summary for the roundOver panel.
  lastRound: RoundSummary | null;
  history: RoundSummary[];
  matchWinners: SeatIndex[];

  // ---- Redacted per-seat slots ----
  yourSeat: SeatIndex | null;
  // Your own stack, bottom→top. Owning seat only.
  yourStack: Disk[];
  // What disks you still have in your stash (off-table).
  yourRemaining: { roses: number; skulls: number };
  yourAckPending: boolean;
}
