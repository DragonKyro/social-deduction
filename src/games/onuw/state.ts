import type { PlayerId, SeatIndex } from '@/engine/types';

// ============================================================================
// One Night Ultimate Werewolf — host state
// ============================================================================
//
// Single-night structure: deal roles → night phase (each role wakes in a
// fixed order and performs a private action) → day phase (free discussion)
// → vote → resolve. Center cards are a 3-card pool no seat owns; some roles
// peek at or swap with them.
//
// Cards have two identities:
//   - the PRINTED card (`card`): what anyone who looks at it sees.
//   - the EFFECTIVE role (`role`): what it counts as for teams / win
//     conditions. These differ only after a transformation: the Doppelganger
//     card becomes the role it copied, a Paranormal Investigator that saw a
//     werewolf becomes a werewolf. Transformations travel WITH the card, so a
//     Robber who steals the Doppelganger-Seer card becomes a Seer (but sees a
//     "Doppelganger" card when they look at it).

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

export type OnuwTeamId = 'village' | 'werewolves' | 'tanner';

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
  | 'night' // roles act in order; the cursor advances as seats act
  | 'day' // discussion
  | 'voting' // each seat picks a vote target (private)
  | 'resolution' // votes locked, deaths shown
  | 'gameOver';

// ----------------------------------------------------------------------------
// Night observations — per-seat private outputs from night actions.
// ----------------------------------------------------------------------------

export interface OnuwObservationEntry {
  // Human-readable label for the lookup target.
  label: string;
  // Position the observation is about.
  position?: { kind: 'seat' | 'center'; index: number };
  // The PRINTED card seen there (only when the observation revealed a card).
  role?: OnuwRoleId;
  // What this seat was shown to be WITHOUT seeing their card (e.g. the
  // werewolves' thumbs, a fellow Mason, the Seer to a Beholder).
  shownAs?: 'werewolf' | 'mason' | 'seer' | 'thing';
}

export interface OnuwNightObservation {
  // Free-form sentence shown on the seat's night notes.
  text: string;
  entries: OnuwObservationEntry[];
  // Set when this observation tells the seat what it now IS (Robber's new
  // card, Doppelganger copy, PI conversion, Insomniac). 'unknown' = you lost
  // track (Drunk).
  youBecome?: OnuwRoleId | 'unknown';
}

export interface OnuwSeatState {
  index: SeatIndex;
  name: string;
  // Card dealt at the start. Night wake-ups are driven by this.
  dealtRole: OnuwRoleId;
  // Card currently in front of this seat: effective role + printed card.
  finalRole: OnuwRoleId;
  finalCard: OnuwRoleId;
  observations: OnuwNightObservation[];
  voteTarget: SeatIndex | null;
  killed: boolean;
  artifacts: OnuwArtifactId[];
}

// Center cards by slot 0..2. Order is preserved through all swaps.
export interface OnuwCenterCard {
  index: number; // 0..2
  role: OnuwRoleId; // effective
  card: OnuwRoleId; // printed
}

// One entry per night step. The schedule is built from the whole ROLE POOL
// (not just the dealt seats) so that its shape never reveals which roles
// ended up in the center. Steps whose role is entirely in the center have
// no seats and resolve silently. The schedule is host-only state.
export interface OnuwNightStep {
  stepIndex: number;
  // The role this step is for. Multiple seats may share a step (the
  // werewolf wake covers every awake werewolf; masons wake together).
  role: OnuwRoleId;
  seats: SeatIndex[];
  // True for the Doppelganger's own follow-up wake (e.g. Doppel-Insomniac).
  doppel: boolean;
  resolved: boolean;
  interactive: boolean;
}

export interface OnuwPrivateState {
  phase: OnuwPhase;
  centerCards: OnuwCenterCard[];
  seats: OnuwSeatState[];
  // Pre-computed night schedule + cursor. Host-only: the cursor position
  // (and which seats a step covers) would tell everyone who holds which role.
  nightSchedule: OnuwNightStep[];
  nightStepIndex: number;
  // Per-step seat acknowledgement.
  nightStepAcks: Record<number, SeatIndex[]>;
  // Paranormal Investigator: seats looked at so far, per PI seat.
  piLooks: Record<SeatIndex, SeatIndex[]>;
  // Witch: the center card she looked at (and must now hand out), per seat.
  witchPeeks: Record<SeatIndex, number>;
  // Doppelganger copy (seat + PRINTED role copied), once it has happened.
  doppelCopy: { seat: SeatIndex; role: OnuwRoleId } | null;
  // Cards an Alpha Wolf displaced (they go to the Alpha's center slot).
  alphaCenter: { role: OnuwRoleId; card: OnuwRoleId }[];
  // Cards flipped face-up by the Revealer (public from daybreak on).
  revealed: { seat: SeatIndex; card: OnuwRoleId }[];
  // Setup acks (every seat must privately view their role before night).
  setupAcked: Record<SeatIndex, boolean>;
  // Which seats have submitted a vote.
  voteAcks: SeatIndex[];
  // Role pool dealt this match (length = seatCount + 3).
  rolePool: OnuwRoleId[];
  dayDurationSec: number;
  allowNoLynch: boolean;
  // RNG seed of the deal. HOST-ONLY: anyone holding it can recompute the
  // whole deal, so it must never appear in a public view.
  seed: number;
  // Set at resolution.
  winners: SeatIndex[];
  winningTeams: OnuwTeamId[];
  killedSeats: SeatIndex[];
  // seat -> votes received (after Rhino / Prince adjustments).
  voteTally: Record<SeatIndex, number>;
}

// === Public view (per seat) ===

export interface OnuwPublicSeatState {
  index: SeatIndex;
  name: string;
  hasAckedSetup: boolean;
  // Whether the seat has voted (not WHO — that stays hidden until resolution).
  hasVoted: boolean;
  // Public after resolution.
  voteTarget: SeatIndex | null;
  votesReceived: number;
  killed: boolean;
  won: boolean;
  // Revealed only post-resolution: effective role + printed card.
  revealedRole: OnuwRoleId | null;
  revealedCard: OnuwRoleId | null;
  // Face-up via the Revealer (public from daybreak on).
  flippedCard: OnuwRoleId | null;
  artifacts: OnuwArtifactId[];
}

export interface OnuwPublicCenterCard {
  index: number;
  // Revealed only after the vote.
  revealedRole: OnuwRoleId | null;
  revealedCard: OnuwRoleId | null;
}

// What the viewing seat is being asked to do right now at night. Only ever
// present in the acting seat's own view.
export interface OnuwYourNightStep {
  // The role you are acting as (for a Doppelganger, the copied role).
  role: OnuwRoleId;
  asDoppelganger: boolean;
  // Werewolf wake: you saw no other werewolf and may peek a center card.
  loneWolf: boolean;
  // Paranormal Investigator: seats looked at so far this step.
  looked: SeatIndex[];
  // Witch: the center card already looked at (it must now be handed out).
  centerPeeked: number | null;
  // Whether a plain "done / pass" (`nightAck`) is accepted.
  canPass: boolean;
}

export interface OnuwPublicState {
  phase: OnuwPhase;
  seats: OnuwPublicSeatState[];
  centerCards: OnuwPublicCenterCard[];
  // Roles in the deal pool; not which seat holds which.
  rolePool: OnuwRoleId[];
  // Suggested discussion length (the UI shows a countdown; the host calls the vote).
  dayDurationSec: number;
  // Filled only for the seat that owns this view.
  yourSeat: SeatIndex | null;
  yourDealtRole: OnuwRoleId | null;
  // Your card at the end of the night — only after the vote is resolved.
  // (During the game you only know it through your own observations.)
  yourFinalRole: OnuwRoleId | null;
  yourObservations: OnuwNightObservation[];
  yourVoteTarget: SeatIndex | null;
  yourNightStep: OnuwYourNightStep | null;
  // Set at resolution / gameOver.
  winners: SeatIndex[];
  winningTeams: OnuwTeamId[];
  killedSeats: SeatIndex[];
  voteTally: Record<SeatIndex, number>;
  alphaCenter: OnuwRoleId[];
}

export type { PlayerId };
