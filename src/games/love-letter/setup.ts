import { makeRng, rngInt, rngShuffle } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type {
  Card,
  LoveLetterPrivateState,
  PlayerState,
  Rank,
} from './state';
import { RANK_COUNTS } from './state';

const STARTING_SEAT_SEED_MASK = 0x00_00_5e_a7;

// Rulebook token targets. Single-seat win at N tokens.
export function tokensToWinFor(playerCount: number): number {
  switch (playerCount) {
    case 2:
      return 7;
    case 3:
      return 5;
    case 4:
      return 4;
    default:
      return 4;
  }
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const r of ranks) {
    for (let i = 0; i < RANK_COUNTS[r]; i++) deck.push(r);
  }
  if (deck.length !== 16) throw new Error(`Internal: deck size ${deck.length}`);
  return deck;
}

// Build the initial private state for a fresh match (round 1). Pure —
// deterministic from (names, seed). Host calls this once at match start.
export function buildInitial(
  names: string[],
  seed: number,
): LoveLetterPrivateState {
  if (names.length < 2 || names.length > 4) {
    throw new Error(`Love Letter needs 2-4 players (got ${names.length})`);
  }
  const seats = names.map((name, index) => ({ index, name }));

  // Pick starting seat (independent RNG stream).
  const leaderRng = makeRng(seed ^ STARTING_SEAT_SEED_MASK);
  const startingSeat = rngInt(leaderRng, names.length);

  const state: LoveLetterPrivateState = {
    phase: 'roundStart',
    seats,
    players: {} as Record<SeatIndex, PlayerState>,
    currentSeat: startingSeat,
    roundNumber: 1,
    tokensToWin: tokensToWinFor(names.length),
    deck: [],
    setAside: null,
    setAsideFaceUp: [],
    pendingGuardPlay: null,
    pendingCard: null,
    lastEffect: null,
    priestPeek: null,
    revealAcked: {},
    startAcked: {},
    roundOverAcked: {},
    history: [],
    matchWinners: [],
    seed,
    rngCursor: 0,
  };

  for (const s of seats) {
    state.players[s.index] = {
      index: s.index,
      name: s.name,
      hand: [],
      discard: [],
      protected: false,
      eliminated: false,
      tokens: 0,
    };
  }

  return dealRound(state, startingSeat);
}

// Shuffle, set aside, deal 1 per seat, advance to roundStart with the
// active seat ready to draw. Used both for round 1 (from buildInitial) and
// for subsequent rounds (from the round-over advance).
export function dealRound(
  state: LoveLetterPrivateState,
  startingSeat: SeatIndex,
): LoveLetterPrivateState {
  // Each round uses a derived seed so the round-1 deal is reproducible AND
  // independent of how many actions happened before. cursor is bumped per
  // round, not per action — that's enough non-determinism for shuffles in
  // a friends-only game.
  const cursor = state.rngCursor;
  const rng = makeRng(state.seed ^ (0x10_b3_e5_57 ^ cursor));
  const deck = rngShuffle(rng, buildDeck());

  // 1) Remove one face-down.
  const setAside = deck.shift()!;
  // 2) In 2-player, reveal three more face-up. (Rulebook: keeps small-game
  //    deduction honest.)
  const setAsideFaceUp: Card[] = [];
  if (state.seats.length === 2) {
    for (let i = 0; i < 3; i++) setAsideFaceUp.push(deck.shift()!);
  }
  // 3) Deal one card per seat.
  const players: Record<SeatIndex, PlayerState> = {};
  for (const s of state.seats) {
    const prior = state.players[s.index]!;
    players[s.index] = {
      ...prior,
      hand: [deck.shift()!],
      discard: [],
      protected: false,
      eliminated: false,
    };
  }

  // 4) Active seat immediately draws (collapse turn-start draw into
  //    dealRound so the seat sees 2 cards when their turn renders). The
  //    drawn card is appended; the held card from the deal remains at
  //    index 0. The UI doesn't care which is which.
  const draw = deck.shift();
  if (draw !== undefined) {
    players[startingSeat] = {
      ...players[startingSeat]!,
      hand: [...players[startingSeat]!.hand, draw],
    };
  }

  const startAcked: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) startAcked[s.index] = false;

  return {
    ...state,
    phase: 'roundStart',
    players,
    currentSeat: startingSeat,
    deck,
    setAside,
    setAsideFaceUp,
    pendingGuardPlay: null,
    pendingCard: null,
    lastEffect: null,
    priestPeek: null,
    revealAcked: {},
    startAcked,
    roundOverAcked: {},
    rngCursor: cursor + 1,
  };
}
