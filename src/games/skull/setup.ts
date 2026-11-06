import { makeRng, rngInt, subSeed } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { PlayerState, SkullPrivateState } from './state';

const STARTING_SEAT_SEED_MASK = 0x00_53_4b_75;

function freshFlags(state: Pick<SkullPrivateState, 'seats'>): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
}

export function buildInitial(
  names: string[],
  seed: number,
  challengeTarget: number,
): SkullPrivateState {
  if (names.length < 3 || names.length > 6) {
    throw new Error(`Skull needs 3-6 players (got ${names.length})`);
  }
  const seats = names.map((name, index) => ({ index, name }));
  const rng = makeRng(subSeed(seed, STARTING_SEAT_SEED_MASK));
  const startingSeat = rngInt(rng, names.length);

  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of seats) {
    players[s.index] = {
      index: s.index,
      name: s.name,
      remaining: { roses: 3, skulls: 1 },
      stack: [],
      revealed: [],
      eliminated: false,
      wins: 0,
    };
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
    passed: freshFlags({ seats }),
    bidLog: [],
    challenger: null,
    flipsRemaining: 0,
    ownStackCleared: false,
    flips: [],
    roundOverAcked: freshFlags({ seats }),
    history: [],
    matchWinners: [],
    pendingSummary: null,
    seed,
    rngCursor: 0,
  };
}

// Every disk on the table (face-down or flipped) goes back to its owner's
// hand. Called as soon as a challenge resolves, so the table never shows a
// stack size that could hint at which disk was lost.
export function gatherDisks(state: SkullPrivateState): SkullPrivateState {
  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of state.seats) {
    const p = state.players[s.index]!;
    const all = [...p.stack, ...p.revealed];
    players[s.index] = {
      ...p,
      remaining: {
        roses: p.remaining.roses + all.filter((d) => d === 'rose').length,
        skulls: p.remaining.skulls + all.filter((d) => d === 'skull').length,
      },
      stack: [],
      revealed: [],
    };
  }
  return { ...state, players };
}

// Reset the table for the next round, led by `leader` (or the next live
// seat clockwise if `leader` is out).
export function nextRound(state: SkullPrivateState, leader: SeatIndex): SkullPrivateState {
  const gathered = gatherDisks(state);
  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of state.seats) {
    const p = gathered.players[s.index]!;
    players[s.index] = {
      ...p,
      eliminated: p.eliminated || p.remaining.roses + p.remaining.skulls === 0,
    };
  }
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
    ...gathered,
    phase: 'placeOpening',
    players,
    currentSeat: actualLeader,
    roundLeader: actualLeader,
    roundNumber: state.roundNumber + 1,
    currentBid: 0,
    currentBidder: null,
    passed: freshFlags(state),
    bidLog: [],
    challenger: null,
    flipsRemaining: 0,
    ownStackCleared: false,
    flips: [],
    roundOverAcked: freshFlags(state),
    pendingSummary: null,
    rngCursor: state.rngCursor + 1,
  };
}
