import type { PlayerId, SeatIndex } from '@/engine/types';

// ============================================================================
// One Night Ultimate Werewolf — host state
// ============================================================================
//
// Single-night structure: deal roles → night phase (each role wakes in a
// fixed order and performs a private action) → day phase (free discussion,
// timer) → vote → resolve. Center cards are a 3-card pool no seat owns;
// some roles peek at or swap with them.

export type OnuwRoleId =
  // ---- Base game ----
  | 'werewolf'
  | 'minion'
  | 'mason'
  | 'seer'
  | 'robber'
  | 'troublemaker'
  | 'tanner'
  | 'drunk'
  | 'insomniac'
  | 'hunter'
  | 'villager'
  // ---- Daybreak expansion ----
  | 'doppelganger'
  | 'witch'
  | 'apprenticeSeer'
  | 'paranormalInvestigator'
  | 'villageIdiot'
  | 'revealer'
  | 'curator'
  | 'alphaWolf'
  | 'mysticWolf'
  | 'dreamWolf'
  // ---- Bonus Roles pack (consolidated Bonus Packs 1-4) ----
  | 'auraSeer'
  | 'cursed'
  | 'prince'
  | 'apprenticeTanner'
  | 'beholder'
  | 'thing'
  | 'squire'
  | 'bodySnatcher'
  | 'empath'
  | 'nostradamus'
  | 'familyMan'
  | 'windyWendy'
  | 'defenderEr'
  | 'theSponge'
  | 'ricochetRhino'
  | 'innocentBystander';

// ----------------------------------------------------------------------------
// Artifacts — kept in the type union for future expansion. Not yet wired
// into setup UI (artifacts are flavor-only for the current build).
// ----------------------------------------------------------------------------

export type OnuwArtifactId =
  | 'bowOfTheHunter'
  | 'cloakOfThePrince'
  | 'swordOfTheBodyguard'
  | 'mistOfTheVampire'
  | 'daggerOfTheTraitor'
  | 'alienArtifact';

export type OnuwPhase =
  | 'setup' // post-deal; each seat must ack their initial role privately
  | 'night' // roles act in order; host advances the cursor
  | 'day' // discussion + cheatsheet timer
  | 'voting' // each seat picks a vote target (private)
  | 'resolution' // votes locked, deaths shown
  | 'gameOver';

// ----------------------------------------------------------------------------
// Night observations — per-seat private outputs from night actions.
// Some night steps produce one note (Seer sees a card, Beholder learns who
// Seer is). Others produce multiple lines (Doppelganger gets both a copy
// note AND any follow-up action result). We model that as a list of
// entries; each entry references either a seat ("Seat 3") or a center
// card ("Center 1") and the role glimpsed there.
// ----------------------------------------------------------------------------

export interface OnuwObservationEntry {
  // Human-readable label for the lookup target.
  label: string;
  // Optional position info — present when the observation revealed a card.
  position?: { kind: 'seat' | 'center'; index: number };
  // Optional revealed role.
  role?: OnuwRoleId;
}

export interface OnuwNightObservation {
  // Free-form sentence shown on the seat's night summary screen.
  text: string;
  entries: OnuwObservationEntry[];
}

export interface OnuwSeatState {
  index: SeatIndex;
  name: string;
  // Dealt role. May differ from `finalRole` after Robber/Troublemaker/Drunk/
  // Witch/Body Snatcher/Doppelganger/Alpha Wolf swaps. Vote resolution uses
  // `finalRole` (the card sitting in front of them at end of night).
  dealtRole: OnuwRoleId;
  finalRole: OnuwRoleId;
  // Multiple observations per seat — Doppelganger may emit two; the
  // Insomniac wake also appends an entry after midnight swaps.
  observations: OnuwNightObservation[];
  voteTarget: SeatIndex | null;
  killed: boolean;
  artifacts: OnuwArtifactId[];
}

// Center cards by slot 0..2. Order is preserved through all swaps; we
// surface this order in the UI so reasoning about "the center role moved
// here" works without spoilers.
export interface OnuwCenterCard {
  index: number; // 0..2
  role: OnuwRoleId;
}

// One entry per night step. We pre-compute the schedule at setup using
// the dealt role pool (a role only appears in the schedule if it acts at
// night). Doppelganger inserts a follow-up step dynamically after it
// copies a role.
export interface OnuwNightStep {
  stepIndex: number;
  // The role this step is for. Multiple seats may share a role (werewolf
  // ×2, masons); the step covers all of them at once.
  role: OnuwRoleId;
  // Seats that hold the role at the START of the night (dealt). Some
  // roles only matter for the dealt set (Insomniac peeks at their final
  // card but is identified by the dealt role).
  seats: SeatIndex[];
  // True once the host has executed (or auto-skipped) this step.
  resolved: boolean;
  // Each role declares whether it expects an interactive action. False =
  // host narrates and auto-advances; True = host blocks until each seat
  // owning the role submits the right action.
  interactive: boolean;
}

export interface OnuwPrivateState {
  phase: OnuwPhase;
  centerCards: OnuwCenterCard[];
  seats: OnuwSeatState[];
  // Pre-computed night schedule + cursor.
  nightSchedule: OnuwNightStep[];
  nightStepIndex: number;
  // Per-step seat acknowledgement — when a step covers multiple seats
  // (e.g. werewolves, masons), we wait until each seat has individually
  // submitted before advancing.
  nightStepAcks: Record<number, SeatIndex[]>;
  // Setup acks (every seat must privately view their role before night
  // starts). Same shape as Avalon.
  setupAcked: Record<SeatIndex, boolean>;
  // Vote-phase acks: which seats have submitted a private vote so the UI
  // knows whose turn it is in hot-seat mode.
  voteAcks: SeatIndex[];
  // Role pool dealt this match (length = seatCount + 3).
  rolePool: OnuwRoleId[];
  // Day discussion config.
  dayDurationSec: number;
  allowNoLynch: boolean;
  seed: number;
  winnerTeam: 'village' | 'werewolves' | 'tanner' | null;
  // Resolved-from-vote: seats whose votes killed them, in order of total
  // votes received. Populated when phase = 'resolution' / 'gameOver'.
  killedSeats: SeatIndex[];
  // Voting tallies — public after resolution. seat -> votes received.
  voteTally: Record<SeatIndex, number>;
}

// === Public view (per seat) ===

export interface OnuwPublicSeatState {
  index: SeatIndex;
  name: string;
  hasAckedSetup: boolean;
  // Whether the seat has submitted a vote this round (not WHO they voted
  // for — that stays hidden until resolution).
  hasVoted: boolean;
  // Public after resolution.
  voteTarget: SeatIndex | null;
  votesReceived: number;
  killed: boolean;
  // Revealed only post-resolution.
  revealedRole: OnuwRoleId | null;
  artifacts: OnuwArtifactId[];
}

export interface OnuwPublicCenterCard {
  index: number;
  // Revealed only at gameOver.
  revealedRole: OnuwRoleId | null;
}

export interface OnuwPublicState {
  phase: OnuwPhase;
  seats: OnuwPublicSeatState[];
  centerCards: OnuwPublicCenterCard[];
  // Roles in the deal pool; not which seat holds which. Players need this
  // to reason about possibilities ("there are 2 werewolves total").
  rolePool: OnuwRoleId[];
  // Night progress (so the day screen can show "1 of 7 wakeups left").
  nightStepIndex: number;
  nightTotalSteps: number;
  // Whose step the host is currently waiting on (role + seats still owed).
  // Populated only during night phase.
  activeNightStep: {
    role: OnuwRoleId;
    seats: SeatIndex[];
    acked: SeatIndex[];
    interactive: boolean;
  } | null;
  // Filled only for the seat that owns this view.
  yourSeat: SeatIndex | null;
  yourDealtRole: OnuwRoleId | null;
  yourFinalRole: OnuwRoleId | null;
  yourObservations: OnuwNightObservation[];
  yourVoteTarget: SeatIndex | null;
  winnerTeam: OnuwPrivateState['winnerTeam'];
  // Set at resolution / gameOver.
  killedSeats: SeatIndex[];
  voteTally: Record<SeatIndex, number>;
}

// Helper: build an empty private state from a config. Real role dealing
// happens in `module.createInitialState` once the role pool is known.
export function emptyPrivateState(seed: number): OnuwPrivateState {
  return {
    phase: 'setup',
    centerCards: [],
    seats: [],
    nightSchedule: [],
    nightStepIndex: 0,
    nightStepAcks: {},
    setupAcked: {},
    voteAcks: [],
    rolePool: [],
    dayDurationSec: 300,
    allowNoLynch: true,
    seed,
    winnerTeam: null,
    killedSeats: [],
    voteTally: {},
  };
}

export type { PlayerId };
