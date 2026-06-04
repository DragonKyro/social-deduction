import type { SeatIndex } from '@/engine/types';

// ============================================================================
// The Resistance: Avalon — host state
// ============================================================================

// Special-role IDs from the base box. `merlin` and `assassin` are required;
// the rest are optional add-ons configured at lobby time.
export type AvalonRoleId =
  | 'loyalServant'
  | 'merlin'
  | 'percival'
  | 'minionOfMordred'
  | 'assassin'
  | 'morgana'
  | 'mordred' // hidden from Merlin
  | 'oberon' // hidden from other evils
  | 'lancelotGood'
  | 'lancelotEvil';

export type AvalonAlignment = 'good' | 'evil';

export type AvalonPhase =
  | 'setup'
  | 'teamProposal' // leader picks N players for the current mission
  | 'teamVote' // every alive player approves/rejects
  | 'questExecution' // team members privately play success/fail cards
  | 'questResolution' // reveal results
  | 'assassinPick' // good has won by quests; evil's assassin picks Merlin
  | 'gameOver';

export interface AvalonSeatState {
  index: SeatIndex;
  role: AvalonRoleId;
  alignment: AvalonAlignment;
  voteApprove: boolean | null;
  // null = not on the current quest; boolean = the card they played.
  questCard: boolean | null; // true = success, false = fail
}

export interface AvalonQuestRecord {
  questNumber: number; // 1..5
  teamSize: number;
  failsRequired: number; // typically 1, sometimes 2 in 7+ player game's quest 4
  team: SeatIndex[];
  failCount: number;
  result: 'success' | 'fail';
}

export interface AvalonPrivateState {
  phase: AvalonPhase;
  seats: AvalonSeatState[];
  currentQuestNumber: number; // 1..5
  questHistory: AvalonQuestRecord[];
  currentLeaderSeat: SeatIndex;
  // Current team-proposal under vote.
  proposedTeam: SeatIndex[];
  // Failed-vote counter. 5 consecutive failed proposals = evil wins.
  failedProposalsThisQuest: number;
  // Snapshot of role-knowledge so we can hand it to redaction without
  // recomputing each call. Maps seat → list of seats they "see" + label.
  roleKnowledge: Record<SeatIndex, Array<{ seat: SeatIndex; label: string }>>;
  seed: number;
  winnerTeam: AvalonAlignment | null;
  // Final pick when phase = 'assassinPick'.
  assassinationTarget: SeatIndex | null;
}

// === Public view ===

export interface AvalonPublicSeatState {
  index: SeatIndex;
  name: string;
  // Approval votes ARE public after the team vote resolves (rulebook).
  voteApprove: boolean | null;
  isCurrentLeader: boolean;
  isOnProposedTeam: boolean;
  // Revealed only at game over.
  revealedRole: AvalonRoleId | null;
}

export interface AvalonPublicState {
  phase: AvalonPhase;
  seats: AvalonPublicSeatState[];
  currentQuestNumber: number;
  // Per-quest team sizes + fails-required (config-driven, public to all).
  questTrack: Array<{ teamSize: number; failsRequired: number }>;
  questHistory: AvalonQuestRecord[]; // success/fail only, never which seats failed
  failedProposalsThisQuest: number;
  proposedTeam: SeatIndex[];
  currentLeaderSeat: SeatIndex;
  winnerTeam: AvalonAlignment | null;

  // Redacted slots — populated only for the viewing seat.
  yourRole: AvalonRoleId | null;
  yourAlignment: AvalonAlignment | null;
  yourRoleKnowledge: Array<{ seat: SeatIndex; label: string }>;
  // If you're on the current quest team, this is "success" or "fail" or null
  // (not yet played); other seats only see the proposed team membership.
  yourQuestCard: boolean | null;
}
