import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { PlayerState, SkullPrivateState } from './state';

const STARTING_SEAT_SEED_MASK = 0x00_53_4b_75;

export function buildInitial(
  names: string[],
  seed: number,
  challengeTarget: number,
): SkullPrivateState {
  if (names.length < 3 || names.length > 6) {
    throw new Error(`Skull needs 3-6 players (got ${names.length})`);
  }
  const seats = names.map((name, index) => ({ index, name }));
  const rng = makeRng(seed ^ STARTING_SEAT_SEED_MASK);
  const startingSeat = rngInt(rng, names.length);

  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of seats) {
    players[s.index] = {
      index: s.index,
      name: s.name,
      remaining: { roses: 3, skulls: 1 },
      stack: [],
      eliminated: false,
      wins: 0,
    };
  }

  const passed: Record<SeatIndex, boolean> = {};
  const roundOverAcked: Record<SeatIndex, boolean> = {};
  for (const s of seats) {
    passed[s.index] = false;
    roundOverAcked[s.index] = false;
  }

  return {
    phase: 'placeOpening',
    seats,
    players,
    currentSeat: startingSeat,
    roundLeader: startingSeat,
    roundNumber: 1,
    challengeTarget,
    currentBid: 0,
    currentBidder: null,
    passed,
    challenger: null,
    flipsRemaining: 0,
    ownStackCleared: false,
    flips: [],
    roundOverAcked,
    history: [],
    matchWinners: [],
    seed,
    rngCursor: 0,
  };
}

// Reset the table for the next round: keep wins, but clear stacks and
// re-stock disks back into each seat's remaining pool. Eliminated seats
// stay eliminated.
export function nextRound(
  state: SkullPrivateState,
  leader: SeatIndex,
): SkullPrivateState {
  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of state.seats) {
    const p = state.players[s.index]!;
    // Total disks (rose+skull) the player still owns this match.
    const total = p.remaining.roses + p.remaining.skulls + p.stack.length;
    // After a round, all played disks return to the player's pool.
    // Determine the breakdown from the played stack + remaining pre-round.
    // Since we tracked stack contents, just refold them back.
    const roses =
      p.remaining.roses + p.stack.filter((d) => d === 'rose').length;
    const skulls =
      p.remaining.skulls + p.stack.filter((d) => d === 'skull').length;
    players[s.index] = {
      ...p,
      remaining: { roses, skulls },
      stack: [],
      eliminated: total === 0 || p.eliminated,
    };
  }
  const passed: Record<SeatIndex, boolean> = {};
  const roundOverAcked: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) {
    passed[s.index] = false;
    roundOverAcked[s.index] = false;
  }
  // If the new leader is eliminated, walk forward until we find a live one.
  let actualLeader = leader;
  const n = state.seats.length;
  for (let step = 0; step < n; step++) {
    const cand = (leader + step) % n;
    if (!players[cand]!.eliminated) {
      actualLeader = cand;
      break;
    }
  }
  return {
    ...state,
    phase: 'placeOpening',
    players,
    currentSeat: actualLeader,
    roundLeader: actualLeader,
    roundNumber: state.roundNumber + 1,
    currentBid: 0,
    currentBidder: null,
    passed,
    challenger: null,
    flipsRemaining: 0,
    ownStackCleared: false,
    flips: [],
    roundOverAcked,
    rngCursor: state.rngCursor + 1,
  };
}
