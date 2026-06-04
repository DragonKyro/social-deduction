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
  | 'excaliburAssign' // (Excalibur module) leader-after-team-approval: pick who holds the sword for this quest
  | 'teamVote' // every alive player approves/rejects
  | 'questExecution' // team members privately play success/fail cards
  | 'excaliburUse' // (Excalibur module) sword-holder may flip exactly one teammate's card
  | 'questResolution' // reveal results
  | 'ladyOfTheLake' // (LotL module) after quests 2/3/4, the LotL token holder privately learns one player's loyalty
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

// ----------------------------------------------------------------------------
// Optional modules
//
// All three optional modules (Lady of the Lake, Excalibur, Two Lancelots)
// are independent and stackable. A standard 7+ player table commonly
// runs all three.
// ----------------------------------------------------------------------------

export interface LadyOfTheLakeState {
  // The seat currently holding the LotL token. Starts on the seat to the
  // right of the first leader (rulebook). Token can't return to a seat
  // that has previously held it (prevents the obvious endless-investigation
  // loop).
  holder: SeatIndex;
  // Seats that have ever held the LotL token. Used to enforce
  // can't-give-back-to-prior-holder.
  pastHolders: SeatIndex[];
  // Private — each LotL use grants the holder loyalty knowledge of the
  // chosen seat. Stored here so redaction can hand it to ONLY the
  // investigator (mirrors Avalon role-knowledge). Public knowledge: the
  // holder reveals the target's loyalty card (truthfully or not — that's
  // the social-deduction wrinkle), but the engine just records the truth.
  privateReveals: Array<{ by: SeatIndex; target: SeatIndex; alignment: AvalonAlignment }>;
}

export interface ExcaliburState {
  // The team member currently holding Excalibur, for the current quest.
  // Set during `excaliburAssign` after the team is approved; cleared at
  // end of quest. Rulebook: any team member except the quest leader.
  holderSeat: SeatIndex | null;
  // If the holder used the sword this quest, records the target whose
  // card was flipped (success↔fail). Used by the resolver and for the
  // public after-action display.
  usedOnSeat: SeatIndex | null;
  // True if Excalibur is enabled for this match. Persists across all
  // quests; the holder is reassigned each quest.
  enabled: boolean;
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
  // Optional modules. Null when the module isn't enabled for this match.
  ladyOfTheLake: LadyOfTheLakeState | null;
  excalibur: ExcaliburState | null;
  // Lancelot loyalty-swap deck (Two Lancelots). Public counter of swaps
  // performed so far; the actual swap-card sequence is shuffled at setup
  // using seeded RNG and stored host-only.
  lancelotSwapDeck: Array<'swap' | 'noSwap'> | null;
  lancelotSwapsApplied: number;
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

  // Optional-module public surface.
  ladyOfTheLake: {
    enabled: boolean;
    holder: SeatIndex;
    pastHolders: SeatIndex[];
  } | null;
  excalibur: {
    enabled: boolean;
    holderSeat: SeatIndex | null;
    // Post-quest the public learns whether the sword was used and on whom
    // (rulebook — the flip is public), but NEVER the original card value.
    usedOnSeat: SeatIndex | null;
  } | null;
  lancelotSwapsApplied: number | null;

  // Redacted slots — populated only for the viewing seat.
  yourRole: AvalonRoleId | null;
  yourAlignment: AvalonAlignment | null;
  yourRoleKnowledge: Array<{ seat: SeatIndex; label: string }>;
  // If you're on the current quest team, this is "success" or "fail" or null
  // (not yet played); other seats only see the proposed team membership.
  yourQuestCard: boolean | null;
  // Lady of the Lake private knowledge — populated only for seats that
  // have personally used LotL on someone. The label is "good" or "evil"
  // ONLY — never the actual role.
  yourLadyOfTheLakeReveals: Array<{ target: SeatIndex; alignment: AvalonAlignment }>;
}
