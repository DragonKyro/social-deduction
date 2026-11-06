import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Secret Hitler — host state
// ============================================================================

export type ShRoleId = 'liberal' | 'fascist' | 'hitler';
export type ShParty = 'liberal' | 'fascist';
export type ShPolicy = 'liberal' | 'fascist';
export type ShVote = 'ja' | 'nein';

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
  /** Driven by the host's AI. Public (the lobby shows it). */
  isAI: boolean;
  role: ShRoleId;
  party: ShParty;
  alive: boolean;
  voteCast: ShVote | null;
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

  // HIDDEN: deck order and discard contents. Only the sizes are public.
  policyDeck: ShPolicy[];
  policyDiscard: ShPolicy[];

  presidentSeat: SeatIndex;
  regularRotationSeat: SeatIndex;
  inSpecialElection: boolean;

  chancellorCandidateSeat: SeatIndex | null;

  // Term limits: the last ELECTED government (set when an election passes,
  // so a vetoed government is still term-limited). Cleared by chaos.
  lastElectedPresident: SeatIndex | null;
  lastElectedChancellor: SeatIndex | null;

  // HIDDEN: the 3 (president) / 2 (chancellor) policies in the session.
  legislativeHand: ShPolicy[];
  // The president refused a veto this session; the chancellor must enact.
  vetoRefused: boolean;

  pendingExec: ShExecutivePower | null;

  lastEnactedPolicy: ShPolicy | null;
  lastEnactedViaTopDeck: boolean;

  // HIDDEN: power results, visible only to the president who used them.
  pendingInvestigation: { by: SeatIndex; target: SeatIndex; party: ShParty } | null;
  pendingPeek: { by: SeatIndex; policies: ShPolicy[] } | null;

  investigations: ShInvestigationRecord[];

  // HIDDEN: the deal + every reshuffle derive from this. Never put it (or
  // anything derived from it) in a public view.
  seed: number;
  reshuffleCount: number;

  winnerTeam: 'liberal' | 'fascist' | null;
  winReason:
    | null
    | 'liberalTrack'
    | 'fascistTrack'
    | 'hitlerExecuted'
    | 'hitlerElected';

  // PUBLIC: every entry is something the whole table saw happen.
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
      // Per seat, revealed together once everyone has voted. null = dead.
      votes: Array<ShVote | null>;
    }
  | {
      kind: 'policyEnacted';
      policy: ShPolicy;
      president: SeatIndex;
      chancellor: SeatIndex;
      viaTopDeck: false;
    }
  | { kind: 'topDeckEnacted'; policy: ShPolicy }
  | { kind: 'vetoDenied'; president: SeatIndex; chancellor: SeatIndex }
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
  isAI: boolean;
  alive: boolean;
  // How this seat voted. null while the vote is open (votes are revealed
  // together) and for seats that didn't vote.
  voteCast: ShVote | null;
  // Whether this seat has cast a ballot in the current election (but not
  // which way). Lets the table see who is still deciding.
  hasVoted: boolean;
  hasAckedSetup: boolean;
  // Public: the table sees who used Investigate on whom (not the result).
  investigated: boolean;
  // Every role, revealed only at game over.
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
  vetoRefused: boolean;

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
  // President during legislativePresident (3), chancellor during
  // legislativeChancellor / vetoRequested (2). Null for everyone else.
  yourLegislativeHand: ShPolicy[] | null;
  // The president's memory of the 2 policies they passed, while the
  // chancellor holds them (legislativeChancellor / vetoRequested).
  yourPassedPolicies: ShPolicy[] | null;
  yourInvestigations: Array<{ target: SeatIndex; party: ShParty }>;
  yourPeek: ShPolicy[] | null;
  yourPendingInvestigationResult: { target: SeatIndex; party: ShParty } | null;
}
