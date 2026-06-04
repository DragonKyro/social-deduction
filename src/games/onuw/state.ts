import type { PlayerId, SeatIndex } from '@/engine/types';

// ============================================================================
// One Night Ultimate Werewolf — host state
// ============================================================================
//
// Single-night structure: deal roles → night phase (each role wakes in a
// fixed order and performs a private action) → day phase (free discussion,
// timer) → vote → resolve. Center cards are a 3-card pool no seat owns;
// some roles peek at or swap with them.
//
// Each role module under `roles/` declares `wakeOrder`, `nightAction`, and
// any role-specific public-view augmentation. Adding a new role from an
// expansion = a new file + a registry entry; no engine changes needed.

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
  // Note: these roles all integrate cleanly with the standard wake-order
  // engine; no role here changes the day/vote loop or introduces a new
  // phase beyond the existing setup → night → day → vote → resolution.
  | 'auraSeer' // sees which seats woke at night (any seat with a night action)
  | 'cursed' // village team, but loses to werewolves if killed
  | 'prince' // village; cannot be voted out (gets the Cloak artifact)
  | 'apprenticeTanner' // tanner-team-lite: wins if killed without being told otherwise
  | 'beholder' // sees who the seer is
  | 'thing' // village; secretly taps a neighbor to confirm presence at night
  | 'squire' // village; sees where the werewolf cards are (not who holds them)
  | 'bodySnatcher' // swaps own role with another seat; takes their team
  | 'empath' // village; counts werewolves among neighbors
  | 'nostradamus' // village; tries to predict who'll be killed today
  | 'familyMan' // village team, but wins with werewolves if a neighbor is a werewolf
  | 'windyWendy' // moves a single role card to a new position at night
  | 'defenderEr' // village; redirects a single werewolf attack (Daybreak interaction)
  | 'theSponge' // village; absorbs the role-team of a chosen neighbor
  | 'ricochetRhino' // werewolf-team; vote bounces to a chosen seat
  | 'innocentBystander'; // filler village role (no night action)

// ----------------------------------------------------------------------------
// Artifacts (Bonus Roles pack)
//
// Artifacts are role-independent tokens that grant a small ability. Most
// roles in the Bonus Roles pack interact with artifacts (e.g. Prince
// requires the Cloak; Hunter is more interesting with the Bow). At setup
// the host deals 0-N artifacts based on lobby config; each artifact lives
// on a single seat for the duration of the night.
//
// Hidden info: artifact ownership is PUBLIC in this implementation
// (matches Bezier's intent — artifacts are flavor + interaction-prompts,
// not redacted info). The role that REQUIRES the artifact (Prince) is
// still private; an opponent can see "Seat 3 has the Cloak" without
// knowing Seat 3's role.
// ----------------------------------------------------------------------------

export type OnuwArtifactId =
  | 'bowOfTheHunter'
  | 'cloakOfThePrince'
  | 'swordOfTheBodyguard'
  | 'mistOfTheVampire'
  | 'daggerOfTheTraitor'
  | 'alienArtifact';

export type OnuwPhase =
  | 'setup'
  | 'night' // running night actions, but only the host knows which step we're on
  | 'day' // discussion, timer
  | 'voting' // each seat picks a vote target
  | 'resolution' // votes locked, deaths shown
  | 'gameOver';

export interface OnuwNightObservation {
  // What this seat saw during its night step. Stays in `Private` and is
  // copied into the per-seat `Public` only for the owning seat.
  text: string;
  seenRoles?: Array<{ seat: SeatIndex | 'center'; index: number; role: OnuwRoleId }>;
}

export interface OnuwSeatState {
  index: SeatIndex;
  // Dealt role. May differ from `finalRole` after the Robber / Troublemaker
  // / Drunk swap cards. Vote resolution uses `finalRole`.
  dealtRole: OnuwRoleId;
  finalRole: OnuwRoleId;
  observation: OnuwNightObservation | null;
  voteTarget: SeatIndex | null;
  killed: boolean;
  // Bonus Roles: 0+ artifacts held by this seat. Public.
  artifacts: OnuwArtifactId[];
}

export interface OnuwPrivateState {
  phase: OnuwPhase;
  // Three face-down center cards. Indexed 0..2.
  centerCards: OnuwRoleId[];
  seats: OnuwSeatState[];
  // Cursor through the night-order step list. The host advances this as
  // each role's action resolves. Peers can't infer it from the public view.
  nightStepIndex: number;
  // Seed forwarded to module deal/shuffle.
  seed: number;
  winnerTeam: 'village' | 'werewolves' | 'tanner' | null;
}

// === Public view (per seat) ===

export interface OnuwPublicSeatState {
  index: SeatIndex;
  name: string;
  isAlive: boolean;
  hasVoted: boolean;
  // Public artifact ownership.
  artifacts: OnuwArtifactId[];
  // Only populated post-resolution.
  revealedRole: OnuwRoleId | null;
}

export interface OnuwPublicState {
  phase: OnuwPhase;
  seats: OnuwPublicSeatState[];
  // Roles in the deal pool; not which seat holds which. Players need this
  // to reason about possibilities ("there are 2 werewolves total").
  rolePool: OnuwRoleId[];
  // Filled only for the seat that owns this view.
  yourRole: OnuwRoleId | null;
  yourObservation: OnuwNightObservation | null;
  yourVoteTarget: SeatIndex | null;
  winnerTeam: OnuwPrivateState['winnerTeam'];
  // Time remaining on day-phase / night-step timers, broadcast by host.
  timerMsRemaining: number | null;
}

// Marker type used by the (currently unimplemented) Doppelganger expansion
// to remember which seat / role it copied.
export interface DoppelgangerLink {
  seat: SeatIndex;
  role: OnuwRoleId;
  index: number; // step ordering when it acts as the copied role
}

// Helper: build an empty private state from a config. Real role dealing
// happens in `module.createInitialState` once the role pool is known.
export function emptyPrivateState(seed: number): OnuwPrivateState {
  return {
    phase: 'setup',
    centerCards: [],
    seats: [],
    nightStepIndex: 0,
    seed,
    winnerTeam: null,
  };
}

export type { PlayerId };
