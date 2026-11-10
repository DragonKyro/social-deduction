import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Avalon — host state
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
  | 'setup' // freshly dealt; each seat must privately acknowledge their role
  | 'teamProposal' // leader picks N players for the current mission
  | 'excaliburAssign' // (Excalibur module) leader-after-team-approval: pick who holds the sword for this quest
  | 'teamVote' // every alive player approves/rejects
  | 'teamVoteReveal' // results of team vote are shown before advancing
  | 'questExecution' // team members privately play success/fail cards
  | 'excaliburUse' // (Excalibur module) sword-holder may flip exactly one teammate's card
  | 'questResolution' // reveal results of the just-played quest
  | 'ladyOfTheLake' // (LotL module) after quests 2/3/4, the LotL token holder privately learns one player's loyalty
  | 'assassinPick' // good has won by quests; evil's assassin picks Merlin
  | 'gameOver';

export interface AvalonSeatState {
  index: SeatIndex;
  name: string;
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
  // Only the COUNT of fail cards is ever recorded — never which seat played
  // which card. That's the whole game.
  failCount: number;
  result: 'success' | 'fail';
}

// One completed team vote. Every vote is public once the whole table has
// voted (rulebook: tokens are flipped together), so the log is public too.
export interface AvalonProposalRecord {
  questNumber: number; // 1..5
  attempt: number; // 1..5 within the quest
  leader: SeatIndex;
  team: SeatIndex[];
  // votes[seat] = true (approve) / false (reject).
  votes: boolean[];
  approved: boolean;
}

// ----------------------------------------------------------------------------
// Optional modules
//
// All three optional modules (Lady of the Lake, Excalibur, Two Lancelots)
// are independent and stackable. A standard 7+ player table commonly
// runs all three. Scaffolded but not implemented in base scope.
// ----------------------------------------------------------------------------

export interface LadyOfTheLakeState {
  holder: SeatIndex;
  pastHolders: SeatIndex[];
  privateReveals: Array<{ by: SeatIndex; target: SeatIndex; alignment: AvalonAlignment }>;
}

export interface ExcaliburState {
  holderSeat: SeatIndex | null;
  usedOnSeat: SeatIndex | null;
  enabled: boolean;
}

export interface AvalonPrivateState {
  phase: AvalonPhase;
  seats: AvalonSeatState[];
  // Seats that have privately seen their role reveal. While phase is 'setup'
  // we wait until every seat has acknowledged before moving on.
  setupAcked: Record<SeatIndex, boolean>;
  currentQuestNumber: number; // 1..5
  // Per-quest config — derived from player count at setup time; never mutates.
  questTrack: Array<{ teamSize: number; failsRequired: number }>;
  questHistory: AvalonQuestRecord[];
  // Every resolved team vote, in order. Public.
  proposalHistory: AvalonProposalRecord[];
  currentLeaderSeat: SeatIndex;
  // Current team-proposal under vote.
  proposedTeam: SeatIndex[];
  // Failed-vote counter. 5 consecutive failed proposals = evil wins.
  failedProposalsThisQuest: number;
  // Role-knowledge dropped into per-seat views via redaction. Computed once
  // at setup.
  roleKnowledge: Record<SeatIndex, Array<{ seat: SeatIndex; label: string }>>;
  // HOST-ONLY. The deal is a pure function of the seed, so this must never be
  // copied into a public view (a peer could re-run `dealRoles`).
  seed: number;
  winnerTeam: AvalonAlignment | null;
  // Set when phase = 'assassinPick' is resolved.
  assassinationTarget: SeatIndex | null;
  // Optional modules. Null when the module isn't enabled for this match.
  ladyOfTheLake: LadyOfTheLakeState | null;
  excalibur: ExcaliburState | null;
  lancelotSwapDeck: Array<'swap' | 'noSwap'> | null;
  lancelotSwapsApplied: number;
}

// === Public view ===

export interface AvalonPublicSeatState {
  index: SeatIndex;
  name: string;
  // Approval votes ARE public after the team vote resolves (rulebook).
  // Suppressed while votes are still being cast.
  voteApprove: boolean | null;
  // Whether this seat has placed its (face-down) vote token yet. Public, like
  // watching someone put a token on the table; the value stays hidden.
  hasVoted: boolean;
  // During questExecution: whether this team member has handed in a card.
  // Never says WHICH card.
  hasPlayedQuestCard: boolean;
  isCurrentLeader: boolean;
  isOnProposedTeam: boolean;
  // True only during the role-reveal phase; tells everyone who has and
  // hasn't acknowledged their role yet (no info leak — just a checklist).
  hasAckedSetup: boolean;
  // Revealed only at game over.
  revealedRole: AvalonRoleId | null;
  revealedAlignment: AvalonAlignment | null;
}

export interface AvalonPublicState {
  phase: AvalonPhase;
  seats: AvalonPublicSeatState[];
  currentQuestNumber: number;
  questTrack: Array<{ teamSize: number; failsRequired: number }>;
  // Which characters are in this game (announced at the table in the real
  // game). Canonical role order, one entry per card, NEVER seat order.
  rolesInPlay: AvalonRoleId[];
  questHistory: AvalonQuestRecord[]; // success/fail only, never which seats failed
  proposalHistory: AvalonProposalRecord[]; // completed (public) team votes
  failedProposalsThisQuest: number;
  proposedTeam: SeatIndex[];
  currentLeaderSeat: SeatIndex;
  winnerTeam: AvalonAlignment | null;
  // Public count of seats that have submitted a quest card this round.
  // Doesn't leak which card they played.
  questCardsSubmitted: number;
  // Set when phase = 'assassinPick' resolves; identifies who the Assassin
  // picked (for the public reveal screen).
  assassinationTarget: SeatIndex | null;

  // Optional-module public surface. The modules are scaffolded only: these are
  // always null in base scope (the engine never enables them).
  ladyOfTheLake: {
    enabled: boolean;
    holder: SeatIndex;
    pastHolders: SeatIndex[];
  } | null;
  excalibur: {
    enabled: boolean;
    holderSeat: SeatIndex | null;
    usedOnSeat: SeatIndex | null;
  } | null;
  lancelotSwapsApplied: number | null;

  // Redacted slots — populated only for the viewing seat.
  yourSeat: SeatIndex | null;
  yourRole: AvalonRoleId | null;
  yourAlignment: AvalonAlignment | null;
  yourRoleKnowledge: Array<{ seat: SeatIndex; label: string }>;
  // Your own vote while the table is still voting (everyone else's is hidden).
  yourVote: boolean | null;
  // If you're on the current quest team, this is "success" or "fail" or null
  // (not yet played); other seats only see the proposed team membership.
  yourQuestCard: boolean | null;
  // Lady of the Lake private knowledge.
  yourLadyOfTheLakeReveals: Array<{ target: SeatIndex; alignment: AvalonAlignment }>;
}
