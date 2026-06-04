import { makeRng, rngShuffle } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import { ROLES, ROLE_MAX_COUNT, rolesSortedByWakeOrder } from './roles';
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
    counts[r] = (counts[r] ?? 0) + 1;
    const cap = ROLE_MAX_COUNT[r] ?? 1;
    if (counts[r] > cap) {
      return `Too many copies of ${ROLES[r].name} (max ${cap}).`;
    }
  }
  // At least one werewolf-team card present somewhere.
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
    observations: [],
    voteTarget: null,
    killed: false,
    artifacts: [],
  }));

  const centerCards: OnuwCenterCard[] = centerRoles.map((role, i) => ({
    index: i,
    role,
  }));

  const schedule = buildNightSchedule(seats);
  return { seats, centerCards, schedule };
}

// Build the night schedule. We bucket seats by dealt role, then sort by
// each role's wake-order. Roles with wakeOrder = 1000 (passive / no
// night action) are excluded from the schedule entirely.
export function buildNightSchedule(seats: readonly OnuwSeatState[]): OnuwNightStep[] {
  const dealtRoles = new Set<OnuwRoleId>();
  for (const s of seats) dealtRoles.add(s.dealtRole);
  const ordered = rolesSortedByWakeOrder([...dealtRoles]);
  const out: OnuwNightStep[] = [];
  let stepIndex = 0;
  for (const role of ordered) {
    if (ROLES[role].wakeOrder >= 1000) continue;
    const seatList = seats.filter((s) => s.dealtRole === role).map((s) => s.index);
    out.push({
      stepIndex: stepIndex++,
      role,
      seats: seatList,
      resolved: false,
      interactive: ROLES[role].hasInteractiveAction,
    });
  }
  // Always insert an Insomniac-style "look at final card" step at the end
  // for seats whose dealt role is `insomniac`. (It's already covered by the
  // role's own wakeOrder 80 — we just have to make sure it runs LAST after
  // any swaps. The numeric ordering already handles this.)
  return out;
}

// Some roles get an automatic observation at deal-time or at first wake
// (e.g. Squire sees which positions hold werewolf CARDS — that's a deal-
// time observation; Family Man, Empath, Aura Seer etc. resolve at end of
// night). We compute these in the night-engine step handlers rather than
// here so swaps that happen earlier in the night are reflected.

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
    setupAcked,
    voteAcks: [],
    rolePool: [...rolePool],
    dayDurationSec,
    allowNoLynch,
    seed,
    winnerTeam: null,
    killedSeats: [],
    voteTally: {},
  };
}
