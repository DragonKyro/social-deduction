import type { SeatIndex } from '@/engine/types';
import type { ShExecutivePower, ShPhase } from './state';

// ============================================================================
// Rule helpers shared by the reducer, the AI and the UI.
//
// They only read fields that exist on BOTH the private state and the public
// view (seat liveness, the president, the last elected government), so the
// AI and UI can call them on a redacted view and get the same answer the
// host's reducer will enforce.
// ============================================================================

export interface ShEligibilityInput {
  seats: ReadonlyArray<{ index: SeatIndex; alive: boolean }>;
  presidentSeat: SeatIndex;
  lastElectedPresident: SeatIndex | null;
  lastElectedChancellor: SeatIndex | null;
}

export function aliveCount(seats: ReadonlyArray<{ alive: boolean }>): number {
  let n = 0;
  for (const s of seats) if (s.alive) n++;
  return n;
}

// Rulebook: the last elected chancellor is always term-limited. The last
// elected president is too, unless only 5 players remain alive.
export function termLimitedSeats(state: ShEligibilityInput): Set<SeatIndex> {
  const out = new Set<SeatIndex>();
  if (state.lastElectedChancellor !== null) out.add(state.lastElectedChancellor);
  if (aliveCount(state.seats) > 5 && state.lastElectedPresident !== null) {
    out.add(state.lastElectedPresident);
  }
  return out;
}

export function isEligibleChancellor(state: ShEligibilityInput, target: SeatIndex): boolean {
  if (!Number.isInteger(target)) return false;
  if (target === state.presidentSeat) return false;
  const seat = state.seats[target];
  if (!seat || !seat.alive) return false;
  return !termLimitedSeats(state).has(target);
}

export function eligibleChancellors(state: ShEligibilityInput): SeatIndex[] {
  return state.seats.filter((s) => isEligibleChancellor(state, s.index)).map((s) => s.index);
}

export function phaseForPower(power: ShExecutivePower): ShPhase {
  switch (power) {
    case 'investigate':
      return 'execInvestigate';
    case 'specialElection':
      return 'execSpecialElection';
    case 'peekTop3':
      return 'execPeek';
    case 'execute':
      return 'execExecute';
  }
}

/** Shared reveal screens any seat may dismiss (they show public info only). */
export const SHARED_ACK_PHASES: ReadonlySet<ShPhase> = new Set<ShPhase>([
  'electionReveal',
  'policyReveal',
  'topDeckReveal',
]);
