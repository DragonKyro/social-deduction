import { makeRng, rngInt, rngShuffle } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import { CREATURES } from './state';
import type {
  CockroachPokerPrivateState,
  Creature,
  PlayerState,
} from './state';

const STARTING_SEAT_SEED_MASK = 0x00_43_50_4b;

export function buildDeck(): Creature[] {
  const deck: Creature[] = [];
  for (const c of CREATURES) {
    for (let i = 0; i < 8; i++) deck.push(c);
  }
  return deck;
}

function emptyRow(): Record<Creature, number> {
  const out: Record<Creature, number> = {} as Record<Creature, number>;
  for (const c of CREATURES) out[c] = 0;
  return out;
}

export function buildInitial(
  names: string[],
  seed: number,
): CockroachPokerPrivateState {
  if (names.length < 3 || names.length > 6) {
    throw new Error(`Cockroach Poker needs 3-6 players (got ${names.length})`);
  }
  const seats = names.map((name, index) => ({ index, name }));
  const leaderRng = makeRng(seed ^ STARTING_SEAT_SEED_MASK);
  const startingSeat = rngInt(leaderRng, names.length);

  const rng = makeRng(seed ^ 0x65_a4_3b_91);
  const deck = rngShuffle(rng, buildDeck());

  // Deal evenly (any leftovers discarded — rulebook keeps deck even).
  const perPlayer = Math.floor(deck.length / names.length);
  const players: Record<SeatIndex, PlayerState> = {};
  let p = 0;
  for (const s of seats) {
    const hand = deck.slice(p, p + perPlayer);
    p += perPlayer;
    players[s.index] = {
      index: s.index,
      name: s.name,
      hand,
      row: emptyRow(),
      lost: false,
      dealAcked: false,
    };
  }

  const revealAcked: Record<SeatIndex, boolean> = {};
  for (const s of seats) revealAcked[s.index] = false;

  return {
    phase: 'dealPending',
    seats,
    players,
    currentSeat: startingSeat,
    pass: null,
    lastReveal: null,
    revealAcked,
    matchWinners: [],
    loserSeat: null,
    seed,
    rngCursor: 0,
  };
}
