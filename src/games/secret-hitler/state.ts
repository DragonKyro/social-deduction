import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Secret Hitler — host state
// ============================================================================

export type ShRoleId = 'liberal' | 'fascist' | 'hitler';
export type ShParty = 'liberal' | 'fascist';
export type ShPolicy = 'liberal' | 'fascist';

export type ShPhase =
  | 'setup'
  | 'nomination'
  | 'electionVote'
  | 'electionReveal'
  | 'legislativePresident'
  | 'legislativeChancellor'
  | 'vetoRequested'
  | 'policyReveal'
  | 'topDeckReveal'
  | 'execInvestigate'
  | 'execInvestigateReveal'
  | 'execSpecialElection'
  | 'execPeek'
  | 'execExecute'
  | 'gameOver';

export type ShExecutivePower =
  | 'investigate'
  | 'specialElection'
  | 'peekTop3'
  | 'execute';

export interface ShSeatState {
  index: SeatIndex;
  name: string;
  role: ShRoleId;
  party: ShParty;
  alive: boolean;
  voteCast: 'ja' | 'nein' | null;
  hasBeenInvestigated: boolean;
}

export interface ShBoardState {
  liberalEnacted: number;
  fascistEnacted: number;
  electionTracker: number;
  vetoUnlocked: boolean;
}

export interface ShInvestigationRecord {
  by: SeatIndex;
  target: SeatIndex;
  party: ShParty;
}

export interface ShPrivateState {
  phase: ShPhase;
  seats: ShSeatState[];
  setupAcked: Record<SeatIndex, boolean>;
  board: ShBoardState;

  policyDeck: ShPolicy[];
  policyDiscard: ShPolicy[];

  presidentSeat: SeatIndex;
  regularRotationSeat: SeatIndex;
  inSpecialElection: boolean;

  chancellorCandidateSeat: SeatIndex | null;

  lastElectedPresident: SeatIndex | null;
  lastElectedChancellor: SeatIndex | null;

  legislativeHand: ShPolicy[];

  pendingExec: ShExecutivePower | null;

  lastEnactedPolicy: ShPolicy | null;
  lastEnactedViaTopDeck: boolean;

  pendingInvestigation: { by: SeatIndex; target: SeatIndex; party: ShParty } | null;
  pendingPeek: { by: SeatIndex; policies: ShPolicy[] } | null;

  investigations: ShInvestigationRecord[];

  seed: number;
  reshuffleCount: number;

  winnerTeam: 'liberal' | 'fascist' | null;
  winReason:
    | null
    | 'liberalTrack'
    | 'fascistTrack'
    | 'hitlerExecuted'
    | 'hitlerElected';

  log: ShLogEntry[];
}

export type ShLogEntry =
  | { kind: 'roleReveal' }
  | {
      kind: 'electionResult';
      president: SeatIndex;
      chancellor: SeatIndex;
      approved: boolean;
      jaCount: number;
      neinCount: number;
    }
  | {
      kind: 'policyEnacted';
      policy: ShPolicy;
      president: SeatIndex;
      chancellor: SeatIndex;
      viaTopDeck: false;
    }
  | { kind: 'topDeckEnacted'; policy: ShPolicy }
  | { kind: 'vetoUsed'; president: SeatIndex; chancellor: SeatIndex }
  | { kind: 'execution'; by: SeatIndex; target: SeatIndex }
  | { kind: 'investigation'; by: SeatIndex; target: SeatIndex }
  | { kind: 'specialElection'; by: SeatIndex; nextPresident: SeatIndex }
  | { kind: 'peek'; by: SeatIndex }
  | { kind: 'gameOver'; winner: 'liberal' | 'fascist'; reason: ShPrivateState['winReason'] };

// === Public view ============================================================

export interface ShPublicSeatState {
  index: SeatIndex;
  name: string;
  alive: boolean;
  voteCast: 'ja' | 'nein' | null;
  hasAckedSetup: boolean;
  revealedRole: ShRoleId | null;
}

export interface ShPublicState {
  phase: ShPhase;
  seats: ShPublicSeatState[];
  board: ShBoardState;
  trackPowers: (ShExecutivePower | null)[];

  presidentSeat: SeatIndex;
  chancellorCandidateSeat: SeatIndex | null;
  lastElectedPresident: SeatIndex | null;
  lastElectedChancellor: SeatIndex | null;
  inSpecialElection: boolean;

  policyDeckSize: number;
  policyDiscardSize: number;

  pendingExec: ShExecutivePower | null;
  lastEnactedPolicy: ShPolicy | null;
  lastEnactedViaTopDeck: boolean;

  winnerTeam: ShPrivateState['winnerTeam'];
  winReason: ShPrivateState['winReason'];

  log: ShLogEntry[];

  yourSeat: SeatIndex | null;
  yourRole: ShRoleId | null;
  yourParty: ShParty | null;
  yourPartyKnowledge: Array<{ seat: SeatIndex; role: ShRoleId }>;
  yourLegislativeHand: ShPolicy[] | null;
  yourInvestigations: Array<{ target: SeatIndex; party: ShParty }>;
  yourPeek: ShPolicy[] | null;
  yourPendingInvestigationResult: { target: SeatIndex; party: ShParty } | null;
}
