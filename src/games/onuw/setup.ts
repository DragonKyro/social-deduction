import { makeRng, rngShuffle } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import { AWAKE_WOLF_CARDS, ROLES, ROLE_MAX_COUNT, rolesSortedByWakeOrder, wakesAtNight } from './roles';
import type {
  OnuwCenterCard,
  OnuwNightStep,
  OnuwPrivateState,
  OnuwRoleId,
  OnuwSeatState,
} from './state';

// Validate a candidate role pool. The pool must be exactly playerCount + 3
// long (3 center cards), respect the per-role max-copy counts, and contain
// at least one werewolf-team role so the game has a possible werewolf.
export function validateRolePool(playerCount: number, pool: readonly OnuwRoleId[]): string | null {
  const needed = playerCount + 3;
  if (pool.length !== needed) {
    return `Pool size is ${pool.length}, expected ${needed} (players + 3 center).`;
  }
  const counts: Record<string, number> = {};
  for (const r of pool) {
    if (!ROLES[r]) return `Unknown role "${String(r)}".`;
    counts[r] = (counts[r] ?? 0) + 1;
    const cap = ROLE_MAX_COUNT[r] ?? 1;
    if (counts[r] > cap) {
      return `Too many copies of ${ROLES[r].name} (max ${cap}).`;
    }
  }
  const wolfCards = pool.filter((r) => ROLES[r].team === 'werewolves');
  if (wolfCards.length === 0) {
    return 'Pool must include at least one werewolf-team role.';
  }
  return null;
}

export interface DealtSetup {
  seats: OnuwSeatState[];
  centerCards: OnuwCenterCard[];
  schedule: OnuwNightStep[];
}

export function dealRoles(
  playerCount: number,
  rolePool: readonly OnuwRoleId[],
  names: readonly string[],
  seed: number,
): DealtSetup {
  if (rolePool.length !== playerCount + 3) {
    throw new Error(`Role pool size ${rolePool.length} ≠ ${playerCount} + 3`);
  }
  const rng = makeRng(seed);
  const shuffled = rngShuffle(rng, rolePool);
  const seatRoles = shuffled.slice(0, playerCount);
  const centerRoles = shuffled.slice(playerCount, playerCount + 3);

  const seats: OnuwSeatState[] = seatRoles.map((role, i) => ({
    index: i,
    name: names[i] ?? `Seat ${i + 1}`,
    dealtRole: role,
    finalRole: role,
    finalCard: role,
    observations: [],
    voteTarget: null,
    killed: false,
    artifacts: [],
  }));

  const centerCards: OnuwCenterCard[] = centerRoles.map((role, i) => ({ index: i, role, card: role }));

  const schedule = buildNightSchedule(seats, rolePool);
  return { seats, centerCards, schedule };
}

// Build the night schedule from the ROLE POOL, in wake order. Every waking
// role in the pool gets a step even if all its cards are in the center
// (those steps have no seats and resolve silently) — so the schedule never
// depends on where the cards landed. The schedule is host-only anyway; this
// keeps anything derived from it (e.g. Aura Seer counts, timing) honest.
//
// All awake werewolves (Werewolf, Alpha Wolf, Mystic Wolf) share ONE wake
// step (role 'werewolf'); the Alpha and Mystic then get their own steps.
export function buildNightSchedule(
  seats: readonly OnuwSeatState[],
  rolePool: readonly OnuwRoleId[],
): OnuwNightStep[] {
  const roles = new Set<OnuwRoleId>();
  for (const r of rolePool) {
    if (!wakesAtNight(r)) continue;
    roles.add(r);
    if (AWAKE_WOLF_CARDS.has(r)) roles.add('werewolf');
  }
  const ordered = rolesSortedByWakeOrder([...roles]);
  return ordered.map((role, stepIndex) => ({
    stepIndex,
    role,
    seats: seats
      .filter((s) => (role === 'werewolf' ? AWAKE_WOLF_CARDS.has(s.dealtRole) : s.dealtRole === role))
      .map((s) => s.index),
    doppel: false,
    resolved: false,
    interactive: ROLES[role].hasInteractiveAction,
  }));
}

// Compute the initial state from a config-style payload.
export function buildInitialPrivate(
  playerCount: number,
  rolePool: readonly OnuwRoleId[],
  names: readonly string[],
  seed: number,
  dayDurationSec: number,
  allowNoLynch: boolean,
): OnuwPrivateState {
  const { seats, centerCards, schedule } = dealRoles(playerCount, rolePool, names, seed);
  const setupAcked: Record<SeatIndex, boolean> = {};
  for (let i = 0; i < playerCount; i++) setupAcked[i] = false;
  return {
    phase: 'setup',
    centerCards,
    seats,
    nightSchedule: schedule,
    nightStepIndex: 0,
    nightStepAcks: {},
    piLooks: {},
    witchPeeks: {},
    doppelCopy: null,
    alphaCenter: [],
    revealed: [],
    setupAcked,
    voteAcks: [],
    rolePool: [...rolePool],
    dayDurationSec,
    allowNoLynch,
    seed,
    winners: [],
    winningTeams: [],
    killedSeats: [],
    voteTally: {},
  };
}
