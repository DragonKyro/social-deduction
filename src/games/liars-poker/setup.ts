import { makeRng, rngInt, rngShuffle } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type {
  Card,
  CardRank,
  LiarsPokerPrivateState,
  PlayerState,
  Suit,
} from './state';

const STARTING_SEAT_SEED_MASK = 0x00_4c_50_6b;

const ALL_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of ALL_SUITS) {
    for (let r = 2; r <= 14; r++) {
      deck.push({ rank: r as CardRank, suit: s });
    }
  }
  return deck;
}

export function buildInitial(
  names: string[],
  seed: number,
  options: { cardsPerPlayer: number; dummyHand: boolean },
): LiarsPokerPrivateState {
  if (names.length < 2 || names.length > 8) {
    throw new Error(`Liar's Poker needs 2-8 players (got ${names.length})`);
  }
  if (options.cardsPerPlayer < 1 || options.cardsPerPlayer > 5) {
    throw new Error('cardsPerPlayer must be 1-5');
  }
  const seats = names.map((name, index) => ({ index, name }));
  const leaderRng = makeRng(seed ^ STARTING_SEAT_SEED_MASK);
  const startingSeat = rngInt(leaderRng, names.length);

  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of seats) {
    players[s.index] = {
      index: s.index,
      name: s.name,
      hand: [],
      cardCount: options.cardsPerPlayer,
      isDummy: false,
      eliminated: false,
      dealAcked: false,
    };
  }

  const dealAcked: Record<SeatIndex, boolean> = {};
  const revealAcked: Record<SeatIndex, boolean> = {};
  const roundOverAcked: Record<SeatIndex, boolean> = {};
  for (const s of seats) {
    dealAcked[s.index] = false;
    revealAcked[s.index] = false;
    roundOverAcked[s.index] = false;
  }
  void dealAcked;

  const state: LiarsPokerPrivateState = {
    phase: 'dealPending',
    seats,
    players,
    currentSeat: startingSeat,
    roundLeader: startingSeat,
    roundNumber: 1,
    cardsPerPlayer: options.cardsPerPlayer,
    dummyHand: options.dummyHand,
    currentClaim: null,
    currentBidder: null,
    lastReveal: null,
    revealAcked,
    roundOverAcked,
    history: [],
    matchWinners: [],
    seed,
    rngCursor: 0,
  };

  return dealRound(state, startingSeat);
}

export function dealRound(
  state: LiarsPokerPrivateState,
  leader: SeatIndex,
): LiarsPokerPrivateState {
  const cursor = state.rngCursor;
  const rng = makeRng(state.seed ^ (0x12_34_be_ef + cursor));
  const deck = rngShuffle(rng, buildDeck());
  // Deal: each non-eliminated player gets cardCount cards (or 1 for dummy).
  let p = 0;
  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of state.seats) {
    const cur = state.players[s.index]!;
    if (cur.eliminated) {
      players[s.index] = { ...cur, hand: [], dealAcked: true };
      continue;
    }
    const count = cur.isDummy ? 1 : cur.cardCount;
    const hand = deck.slice(p, p + count);
    p += count;
    players[s.index] = { ...cur, hand, dealAcked: false };
  }
  // Walk leader forward if eliminated.
  const n = state.seats.length;
  let actualLeader = leader;
  for (let step = 0; step < n; step++) {
    const cand = (leader + step) % n;
    if (!players[cand]!.eliminated) {
      actualLeader = cand;
      break;
    }
  }
  const revealAcked: Record<SeatIndex, boolean> = {};
  const roundOverAcked: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) {
    revealAcked[s.index] = false;
    roundOverAcked[s.index] = false;
  }
  return {
    ...state,
    phase: 'dealPending',
    players,
    currentSeat: actualLeader,
    roundLeader: actualLeader,
    roundNumber: state.roundNumber === 1 && state.history.length === 0
      ? 1
      : state.roundNumber + 1,
    currentClaim: null,
    currentBidder: null,
    lastReveal: null,
    revealAcked,
    roundOverAcked,
    rngCursor: cursor + 1,
  };
}
