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
  // Base game roles
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
  // Daybreak expansion (planned)
  | 'doppelganger'
  | 'witch'
  | 'apprentice-seer'
  | 'paranormal-investigator'
  | 'village-idiot'
  | 'revealer'
  | 'curator'
  | 'alpha-wolf'
  | 'mystic-wolf'
  | 'dream-wolf';

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
