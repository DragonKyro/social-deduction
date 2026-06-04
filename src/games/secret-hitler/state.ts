import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Secret Hitler — host state
// ============================================================================

export type ShRoleId = 'liberal' | 'fascist' | 'hitler';
export type ShPolicy = 'liberal' | 'fascist';

export type ShPhase =
  | 'setup'
  | 'nomination' // president picks a chancellor
  | 'electionVote' // every alive player ja/nein
  | 'legislativePresident' // president discards 1 of 3 policies
  | 'legislativeChancellor' // chancellor enacts 1 of remaining 2 (unless vetoed)
  | 'execAction' // an executive power triggered by enacting a fascist policy
  | 'gameOver';

export type ShExecutivePower =
  | 'investigate' // president sees one player's party (not role)
  | 'specialElection' // president picks the next president
  | 'peekTop3' // president sees the top 3 of the policy deck
  | 'execute' // president kills one player
  | 'veto'; // chancellor + president may veto top 2

export interface ShSeatState {
  index: SeatIndex;
  role: ShRoleId;
  // Investigation reveals only `party`, not the actual role (so fascists
  // and Hitler both show as "fascist" when investigated).
  party: 'liberal' | 'fascist';
  alive: boolean;
  voteCast: 'ja' | 'nein' | null;
  // True once any other player has investigated this seat — used to gate
  // double-investigation in rule variants.
  hasBeenInvestigated: boolean;
}

export interface ShBoardState {
  // Track lengths depend on player count: 5-6p use small board, 7-8p
  // medium, 9-10p large. The module looks the track up at game start.
  liberalEnacted: number;
  fascistEnacted: number;
  electionTracker: number; // 0..3, resets to 0 on successful election
  vetoUnlocked: boolean; // becomes true at 5 fascist policies
}

export interface ShPrivateState {
  phase: ShPhase;
  seats: ShSeatState[];
  board: ShBoardState;
  // The undrawn policy deck and the discard. The deck is reshuffled (using
  // seeded RNG) when it has fewer than 3 cards.
  policyDeck: ShPolicy[];
  policyDiscard: ShPolicy[];
  // Current government candidates.
  presidentSeat: SeatIndex;
  chancellorCandidateSeat: SeatIndex | null;
  // Last elected government — these two seats are term-limited next round.
  lastElectedPresident: SeatIndex | null;
  lastElectedChancellor: SeatIndex | null;
  // Policy hand the president (then chancellor) is currently looking at.
  // Lives in private state; redacted to only those seats.
  legislativeHand: ShPolicy[];
  // Executive action queued by enacting a fascist policy.
  pendingExec: ShExecutivePower | null;
  seed: number;
  winnerTeam: 'liberal' | 'fascist' | null;
  // Players who failed an investigation (only visible to the investigator).
  // Stored per-seat: `investigatorSeat -> investigatedSeat -> revealedParty`.
  investigations: Array<{ by: SeatIndex; target: SeatIndex; party: 'liberal' | 'fascist' }>;
}

// === Public view ===

export interface ShPublicSeatState {
  index: SeatIndex;
  name: string;
  alive: boolean;
  voteCast: 'ja' | 'nein' | null; // null until votes are revealed
  // Public party label IF this seat's identity has been forcibly revealed
  // (e.g. by being executed in the late game — president-execution does
  // reveal role). Most of the time this is null.
  revealedRole: ShRoleId | null;
}

export interface ShPublicState {
  phase: ShPhase;
  seats: ShPublicSeatState[];
  board: ShBoardState;
  presidentSeat: SeatIndex;
  chancellorCandidateSeat: SeatIndex | null;
  lastElectedPresident: SeatIndex | null;
  lastElectedChancellor: SeatIndex | null;
  pendingExec: ShExecutivePower | null;
  policyDeckSize: number;
  policyDiscardSize: number;
  winnerTeam: ShPrivateState['winnerTeam'];

  // Redacted slots, filled only for the viewing seat.
  yourRole: ShRoleId | null;
  yourPartyKnowledge: SeatIndex[]; // other fascists you know (incl Hitler if 5-6p)
  yourLegislativeHand: ShPolicy[] | null; // populated only for president/chancellor in legislative phase
  yourInvestigations: Array<{ target: SeatIndex; party: 'liberal' | 'fascist' }>;
  yourPeek: ShPolicy[] | null; // populated only if you used peek-top-3
}
