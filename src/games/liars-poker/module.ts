import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { LiarsPokerAction } from './actions';
import { aiChooseAction } from './ai';
import { claimExists, isStrictRaise, normalizeClaim } from './hands';
import { buildInitial, dealRound } from './setup';
import type {
  Card,
  LiarsPokerPrivateState,
  LiarsPokerPublicState,
  PlayerState,
  RevealRecord,
  RoundSummary,
} from './state';
import { aliveSeats, viewFor } from './view';

// ============================================================================
// Liar's Poker — module
//
// Hidden info: each seat's own hand (normal players). Dummy-hand inversion:
// dummy seats see NOTHING of their own card; every other seat sees it. The
// chokepoint is `viewFor` (view.ts) which decides per-seat which cards are
// visible.
// ============================================================================

export interface LiarsPokerSeatConfig {
  name: string;
  isAI: boolean;
}

export interface LiarsPokerOptions {
  players: LiarsPokerSeatConfig[];
  cardsPerPlayer: number; // 1..5
  dummyHand: boolean;
}

function getOptions(config: GameConfig): LiarsPokerOptions {
  return config.gameOptions as unknown as LiarsPokerOptions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextLive(state: LiarsPokerPrivateState, from: SeatIndex): SeatIndex {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const cand = (from + step) % n;
    if (!state.players[cand]!.eliminated) return cand;
  }
  return from;
}

function withPlayer(
  state: LiarsPokerPrivateState,
  seat: SeatIndex,
  patch: Partial<PlayerState>,
): LiarsPokerPrivateState {
  return {
    ...state,
    players: {
      ...state.players,
      [seat]: { ...state.players[seat]!, ...patch },
    },
  };
}

function resetAck(state: LiarsPokerPrivateState): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
}

/** The acting seat must be a real, still-alive seat. */
function requireLiveSeat(state: LiarsPokerPrivateState, seat: unknown): SeatIndex {
  if (typeof seat !== 'number' || !Number.isInteger(seat) || !state.players[seat]) {
    throw new Error('Unknown seat');
  }
  if (state.players[seat]!.eliminated) throw new Error('Eliminated seat cannot act');
  return seat;
}

function combinedPool(state: LiarsPokerPrivateState): Card[] {
  const pool: Card[] = [];
  for (const s of state.seats) {
    pool.push(...state.players[s.index]!.hand);
  }
  return pool;
}

function resolveCall(
  state: LiarsPokerPrivateState,
  caller: SeatIndex,
): LiarsPokerPrivateState {
  const claim = state.currentClaim!;
  const bidder = state.currentBidder!;
  const exists = claimExists(claim, combinedPool(state));
  // If claim exists → caller loses; else bidder loses.
  const callerWon = !exists;
  const loserSeat = callerWon ? bidder : caller;
  const allHands: Record<SeatIndex, Card[]> = {};
  for (const s of state.seats) {
    allHands[s.index] = state.players[s.index]!.hand.slice();
  }
  const reveal: RevealRecord = {
    claim: { ...claim },
    caller,
    bidder,
    claimExists: exists,
    callerWon,
    loserSeat,
    allHands,
  };
  // Apply loss to loser.
  const lp = state.players[loserSeat]!;
  let next: LiarsPokerPrivateState;
  if (lp.isDummy) {
    // Dummies are on their last life; losing → eliminated.
    next = withPlayer(state, loserSeat, { eliminated: true, cardCount: 0, isDummy: false });
  } else if (lp.cardCount - 1 <= 0) {
    next = state.dummyHand
      ? withPlayer(state, loserSeat, { cardCount: 0, isDummy: true }) // dummy life from next deal
      : withPlayer(state, loserSeat, { cardCount: 0, eliminated: true });
  } else {
    next = withPlayer(state, loserSeat, { cardCount: lp.cardCount - 1 });
  }
  return {
    ...next,
    phase: 'revealing',
    lastReveal: reveal,
    revealAcked: resetAck(next),
  };
}

function nextRoundLeader(state: LiarsPokerPrivateState): SeatIndex {
  const r = state.lastReveal;
  if (!r) return state.roundLeader;
  if (!state.players[r.loserSeat]!.eliminated) return r.loserSeat;
  return nextLive(state, r.loserSeat);
}

// ============================================================================
// Module
// ============================================================================

export const liarsPokerModule: GameModule<
  LiarsPokerPrivateState,
  LiarsPokerPublicState,
  LiarsPokerAction
> = {
  id: 'liars-poker',
  displayName: "Liar's Poker",
  minPlayers: 2,
  maxPlayers: 8,

  createInitialState(config: GameConfig): LiarsPokerPrivateState {
    const opts = getOptions(config);
    const count = opts.players?.length ?? 0;
    if (count < this.minPlayers || count > this.maxPlayers) {
      throw new Error(
        `Liar's Poker requires ${this.minPlayers}-${this.maxPlayers} players (got ${count})`,
      );
    }
    return buildInitial(
      opts.players.map((p) => p.name),
      config.seed,
      {
        cardsPerPlayer: opts.cardsPerPlayer ?? 3,
        dummyHand: opts.dummyHand ?? true,
      },
    );
  },

  applyAction(
    state: LiarsPokerPrivateState,
    action: LiarsPokerAction,
  ): LiarsPokerPrivateState {
    if (state.phase === 'gameOver') throw new Error('Game is over');
    switch (action.type) {
      case 'ackDeal': {
        if (state.phase !== 'dealPending') {
          throw new Error('ackDeal only valid in dealPending');
        }
        const seat = requireLiveSeat(state, action.bySeat);
        if (state.players[seat]!.dealAcked) throw new Error('Already acknowledged');
        const next = withPlayer(state, seat, { dealAcked: true });
        if (!aliveSeats(next).every((i) => next.players[i]!.dealAcked)) return next;
        return { ...next, phase: 'bidding', currentSeat: next.roundLeader };
      }

      case 'placeClaim': {
        if (state.phase !== 'bidding') {
          throw new Error('placeClaim only valid in bidding');
        }
        const seat = requireLiveSeat(state, action.bySeat);
        if (seat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        const claim = normalizeClaim(action.claim);
        if (!claim) throw new Error('Malformed claim');
        if (!isStrictRaise(state.currentClaim, claim)) {
          throw new Error('Claim must strictly exceed the previous one');
        }
        return {
          ...state,
          currentClaim: claim,
          currentBidder: seat,
          roundClaims: [...state.roundClaims, { seat, claim }],
          currentSeat: nextLive(state, seat),
        };
      }

      case 'callLiar': {
        if (state.phase !== 'bidding') {
          throw new Error('callLiar only valid in bidding');
        }
        const seat = requireLiveSeat(state, action.bySeat);
        if (seat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        if (state.currentClaim === null || state.currentBidder === null) {
          throw new Error('No claim to call');
        }
        return resolveCall(state, seat);
      }

      case 'ackReveal': {
        if (state.phase !== 'revealing') {
          throw new Error('ackReveal only valid in revealing');
        }
        const seat = requireLiveSeat(state, action.bySeat);
        if (state.revealAcked[seat]) throw new Error('Already acknowledged');
        const next = {
          ...state,
          revealAcked: { ...state.revealAcked, [seat]: true },
        };
        const alive = aliveSeats(next);
        if (!alive.every((i) => next.revealAcked[i])) return next;
        const loser = next.lastReveal!.loserSeat;
        const summary: RoundSummary = {
          roundNumber: next.roundNumber,
          reveal: next.lastReveal!,
          eliminatedThisRound: next.players[loser]!.eliminated ? [loser] : [],
        };
        if (alive.length <= 1) {
          return {
            ...next,
            phase: 'gameOver',
            history: [...next.history, summary],
            matchWinners: alive,
          };
        }
        return {
          ...next,
          phase: 'roundOver',
          history: [...next.history, summary],
          roundOverAcked: resetAck(next),
        };
      }

      case 'ackRoundOver': {
        if (state.phase !== 'roundOver') {
          throw new Error('ackRoundOver only valid in roundOver');
        }
        const seat = requireLiveSeat(state, action.bySeat);
        if (state.roundOverAcked[seat]) throw new Error('Already acknowledged');
        const next = {
          ...state,
          roundOverAcked: { ...state.roundOverAcked, [seat]: true },
        };
        if (!aliveSeats(next).every((i) => next.roundOverAcked[i])) return next;
        return dealRound(next, nextRoundLeader(next));
      }

      default:
        throw new Error('Unknown action');
    }
  },

  viewFor,

  isFinished(state: LiarsPokerPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    const opts: LiarsPokerOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
      cardsPerPlayer: 3,
      dummyHand: true,
    };
    return {
      gameId: 'liars-poker',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
  },
};
