import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { DieFace, LiarsDicePrivateState, PlayerState } from './state';

const STARTING_SEAT_SEED_MASK = 0x00_4c_44_69;

export function rollDice(
  count: number,
  seed: number,
  cursor: number,
): { dice: DieFace[]; nextCursor: number } {
  const rng = makeRng((seed ^ 0x6a_9b_ce_03) + cursor);
  const dice: DieFace[] = [];
  for (let i = 0; i < count; i++) {
    const v = (rngInt(rng, 6) + 1) as DieFace;
    dice.push(v);
  }
  return { dice, nextCursor: cursor + 1 };
}

export function buildInitial(
  names: string[],
  seed: number,
  options: { wildOnes: boolean; spotOn: boolean; startingDice: number },
): LiarsDicePrivateState {
  if (names.length < 2 || names.length > 8) {
    throw new Error(`Liar's Dice needs 2-8 players (got ${names.length})`);
  }
  const seats = names.map((name, index) => ({ index, name }));
  const leaderRng = makeRng(seed ^ STARTING_SEAT_SEED_MASK);
  const startingSeat = rngInt(leaderRng, names.length);

  let cursor = 0;
  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of seats) {
    const { dice, nextCursor } = rollDice(options.startingDice, seed, cursor);
    cursor = nextCursor;
    players[s.index] = {
      index: s.index,
      name: s.name,
      dice,
      diceCount: options.startingDice,
      eliminated: false,
      rollAcked: false,
    };
  }
  const revealAcked: Record<SeatIndex, boolean> = {};
  const roundOverAcked: Record<SeatIndex, boolean> = {};
  for (const s of seats) {
    revealAcked[s.index] = false;
    roundOverAcked[s.index] = false;
  }

  return {
    phase: 'rollPending',
    seats,
    players,
    currentSeat: startingSeat,
    roundLeader: startingSeat,
    roundNumber: 1,
    wildOnes: options.wildOnes,
    spotOn: options.spotOn,
    startingDice: options.startingDice,
    currentBid: null,
    currentBidder: null,
    lastReveal: null,
    revealAcked,
    roundOverAcked,
    history: [],
    matchWinners: [],
    seed,
    rngCursor: cursor,
  };
}

export function rerollAll(
  state: LiarsDicePrivateState,
  leader: SeatIndex,
): LiarsDicePrivateState {
  let cursor = state.rngCursor;
  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of state.seats) {
    const p = state.players[s.index]!;
    if (p.eliminated || p.diceCount === 0) {
      players[s.index] = { ...p, dice: [], rollAcked: true };
      continue;
    }
    const { dice, nextCursor } = rollDice(p.diceCount, state.seed, cursor);
    cursor = nextCursor;
    players[s.index] = { ...p, dice, rollAcked: false };
  }
  const revealAcked: Record<SeatIndex, boolean> = {};
  const roundOverAcked: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) {
    revealAcked[s.index] = false;
    roundOverAcked[s.index] = false;
  }
  // If leader is eliminated, walk forward.
  const n = state.seats.length;
  let actualLeader = leader;
  for (let step = 0; step < n; step++) {
    const cand = (leader + step) % n;
    if (!players[cand]!.eliminated) {
      actualLeader = cand;
      break;
    }
  }
  return {
    ...state,
    phase: 'rollPending',
    players,
    currentSeat: actualLeader,
    roundLeader: actualLeader,
    roundNumber: state.roundNumber + 1,
    currentBid: null,
    currentBidder: null,
    lastReveal: null,
    revealAcked,
    roundOverAcked,
    rngCursor: cursor,
  };
}
