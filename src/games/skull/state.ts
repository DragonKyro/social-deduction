import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Skull — host state
//
// Each player owns 4 disks (3 roses + 1 skull). Disks are stacked face-down
// in front of each seat; only the owning seat knows what's in their stack.
// Bidding declares "I can flip N disks without revealing a skull"; the high
// bidder then flips that many, ALL of their own stack first.
//
// Hidden info (redacted by `viewFor` in view.ts):
//   - stack contents (until flipped face-up),
//   - the composition of each player's disks (how many roses / skulls they
//     still own) — others only ever see the COUNT,
//   - which disk a failed challenger lost (only the loser learns it),
//   - the seed / rng cursor (would let a peer predict the random loss).
// ============================================================================

export type Disk = 'rose' | 'skull';

export type SkullPhase =
  // Every live seat places one disk before anything else (sequential here,
  // simultaneous at a real table — order doesn't matter, stacks are hidden).
  | 'placeOpening'
  // The active seat must either place another disk OR open the bidding.
  // A seat with no disks left in hand must bid.
  | 'placing'
  // Bidding war. Active seat must raise or pass. When everyone except one
  // bidder has passed, that bidder becomes the challenger.
  | 'bidding'
  // Challenger flips disks one at a time: their own stack first (top
  // down), then the top disk of opponents' stacks of their choice.
  | 'revealing'
  // The challenger flipped their OWN skull: they choose which of their
  // disks to discard (face-down — nobody else learns which).
  | 'discarding'
  // The challenger was eliminated by their own skull: they choose who
  // starts the next round.
  | 'chooseLeader'
  // Challenge resolved; everyone still in acks to start the next round.
  | 'roundOver'
  // Someone won their 2nd challenge (or is the last player standing).
  | 'gameOver';

export interface DiskCounts {
  roses: number;
  skulls: number;
}

export interface PlayerState {
  index: SeatIndex;
  name: string;
  // Disks in hand (off-table). All disks return to hand when a round ends.
  remaining: DiskCounts;
  // Face-down disks on the table this round, bottom-first.
  stack: Disk[];
  // Disks flipped face-up from this seat's stack this round (in flip
  // order). Still owned by this seat — they go back to hand at round end.
  revealed: Disk[];
  // True once this seat has lost every disk.
  eliminated: boolean;
  // Successful challenges this match.
  wins: number;
}

// One flip in a challenge — public.
export interface FlipRecord {
  // The seat whose stack was flipped from.
  seat: SeatIndex;
  disk: Disk;
}

// Public record of the bidding this round.
export interface BidEntry {
  seat: SeatIndex;
  // The new high bid, or 'pass'.
  bid: number | 'pass';
}

export interface RoundSummary {
  roundNumber: number;
  challenger: SeatIndex;
  bid: number;
  success: boolean;
  flips: FlipRecord[];
  // Fail only: whose skull was flipped (may be the challenger's own).
  skullOwner: SeatIndex | null;
  // Fail only: the seat that lost a disk (always the challenger).
  loserSeat: SeatIndex | null;
  // PRIVATE: the disk the loser lost. `viewFor` nulls it out for everyone
  // except the loser — it's discarded face-down.
  diskLost: Disk | null;
  // How the lost disk was picked: at random by the skull's owner, or
  // chosen by the challenger (own skull).
  lossMethod: 'random' | 'chosen' | null;
  // A seat knocked out of the match this round.
  eliminatedSeat: SeatIndex | null;
  // Who starts the next round (null when the match ended).
  nextLeader: SeatIndex | null;
}

export interface SkullPrivateState {
  phase: SkullPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: Record<SeatIndex, PlayerState>;
  // Whose action it is (placing seat / bidder / challenger).
  currentSeat: SeatIndex;
  // The seat that started this round.
  roundLeader: SeatIndex;
  roundNumber: number;
  // Match win target (1, 2, or 3 — picked at setup; official is 2).
  challengeTarget: number;

  // ---- Bidding ----
  currentBid: number;
  currentBidder: SeatIndex | null;
  // Seats that have passed this bidding round (cannot re-enter).
  passed: Record<SeatIndex, boolean>;
  bidLog: BidEntry[];

  // ---- Challenge ----
  challenger: SeatIndex | null;
  // Roses still needed.
  flipsRemaining: number;
  // Has the challenger flipped all of their own stack yet?
  ownStackCleared: boolean;
  flips: FlipRecord[];

  // ---- Round end ----
  roundOverAcked: Record<SeatIndex, boolean>;
  history: RoundSummary[];
  matchWinners: SeatIndex[];
  // A resolved round waiting on `chooseLeader` before it's recorded.
  pendingSummary: RoundSummary | null;

  // Host-only. Never in a view.
  seed: number;
  rngCursor: number;
}

// ============================================================================
// Public view
// ============================================================================

export interface PublicPlayer {
  index: SeatIndex;
  name: string;
  // Face-down disks on the table (count only).
  stackSize: number;
  // Disks flipped face-up from this seat's stack this round (public).
  revealed: Disk[];
  // How many disks this seat still owns in total (count only — never the
  // rose / skull split).
  disksTotal: number;
  // Disks still in hand (count only). 0 during placing ⇒ must bid.
  handCount: number;
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
  bidLog: BidEntry[];
  challenger: SeatIndex | null;
  flipsRemaining: number;
  ownStackCleared: boolean;
  flips: FlipRecord[];
  // Most recent round summary (diskLost redacted unless you lost it).
  lastRound: RoundSummary | null;
  history: RoundSummary[];
  matchWinners: SeatIndex[];
  // Seats the current phase is waiting on to ack.
  waitingOn: SeatIndex[];

  // ---- Redacted per-seat slots ----
  yourSeat: SeatIndex | null;
  // Your own face-down stack, bottom→top. Owning seat only.
  yourStack: Disk[];
  // Disks in your hand (off-table).
  yourRemaining: DiskCounts;
  yourAckPending: boolean;
}
