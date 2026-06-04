import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { LiarsPokerAction } from './actions';
import { aiChooseAction } from './ai';
import { claimExists, isStrictRaise } from './hands';
import { buildInitial, dealRound } from './setup';
import type {
  Card,
  LiarsPokerPrivateState,
  LiarsPokerPublicState,
  PlayerState,
  PublicPlayer,
  RevealRecord,
  RoundSummary,
} from './state';

// ============================================================================
// Liar's Poker — module
//
// Hidden info: each seat's own hand (normal players). Dummy-hand inversion:
// dummy seats see NOTHING; every other seat sees the dummy's card. The
// chokepoint is `viewFor` which decides per-seat which cards are visible.
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

function aliveSeats(state: LiarsPokerPrivateState): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => !state.players[i]!.eliminated);
}

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
  const pool = combinedPool(state);
  const exists = claimExists(claim, pool);
  // If claim exists → caller loses; else bidder loses.
  const callerWon = !exists;
  const loserSeat = callerWon ? bidder : caller;
  const allHands: Record<SeatIndex, Card[]> = {};
  for (const s of state.seats) {
    allHands[s.index] = state.players[s.index]!.hand.slice();
  }
  const reveal: RevealRecord = {
    claim,
    caller,
    bidder,
    claimExists: exists,
    callerWon,
    loserSeat,
    allHands,
  };
  // Apply loss to loser.
  const lp = state.players[loserSeat]!;
  let next = state;
  if (lp.isDummy) {
    // Dummies have one card; losing → eliminated.
    next = withPlayer(state, loserSeat, {
      eliminated: true,
      cardCount: 0,
      isDummy: false,
    });
  } else if (lp.cardCount - 1 === 0) {
    if (state.dummyHand) {
      // Dummy life starts next round.
      next = withPlayer(state, loserSeat, {
        cardCount: 0,
        isDummy: true,
      });
    } else {
      next = withPlayer(state, loserSeat, {
        cardCount: 0,
        eliminated: true,
      });
    }
  } else {
    next = withPlayer(state, loserSeat, {
      cardCount: lp.cardCount - 1,
    });
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
    switch (action.type) {
      case 'ackDeal': {
        if (state.phase !== 'dealPending') {
          throw new Error('ackDeal only valid in dealPending');
        }
        const p = state.players[action.bySeat]!;
        if (p.eliminated) throw new Error('Eliminated seat cannot ack');
        const next = withPlayer(state, action.bySeat, { dealAcked: true });
        const allAcked = aliveSeats(next).every(
          (i) => next.players[i]!.dealAcked,
        );
        if (!allAcked) return next;
        return { ...next, phase: 'bidding', currentSeat: next.roundLeader };
      }

      case 'placeClaim': {
        if (state.phase !== 'bidding') {
          throw new Error('placeClaim only valid in bidding');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        if (!isStrictRaise(state.currentClaim, action.claim)) {
          throw new Error('Claim must strictly exceed the previous one');
        }
        return {
          ...state,
          currentClaim: action.claim,
          currentBidder: action.bySeat,
          currentSeat: nextLive(state, action.bySeat),
        };
      }

      case 'callLiar': {
        if (state.phase !== 'bidding') {
          throw new Error('callLiar only valid in bidding');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        if (state.currentClaim === null) {
          throw new Error('No claim to call');
        }
        return resolveCall(state, action.bySeat);
      }

      case 'ackReveal': {
        if (state.phase !== 'revealing') {
          throw new Error('ackReveal only valid in revealing');
        }
        const next = {
          ...state,
          revealAcked: { ...state.revealAcked, [action.bySeat]: true },
        };
        const allAcked = aliveSeats(next).every(
          (i) => next.revealAcked[i],
        );
        if (!allAcked) return next;
        const alive = aliveSeats(next);
        if (alive.length <= 1) {
          const summary: RoundSummary = {
            roundNumber: next.roundNumber,
            reveal: next.lastReveal!,
            eliminatedThisRound: aliveSeats(state).filter(
              (i) => next.players[i]!.eliminated,
            ),
          };
          return {
            ...next,
            phase: 'gameOver',
            history: [...next.history, summary],
            matchWinners: alive,
          };
        }
        const summary: RoundSummary = {
          roundNumber: next.roundNumber,
          reveal: next.lastReveal!,
          eliminatedThisRound: aliveSeats(state).filter(
            (i) => next.players[i]!.eliminated,
          ),
        };
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
        const next = {
          ...state,
          roundOverAcked: {
            ...state.roundOverAcked,
            [action.bySeat]: true,
          },
        };
        const allAcked = aliveSeats(next).every(
          (i) => next.roundOverAcked[i],
        );
        if (!allAcked) return next;
        const leader = nextRoundLeader(next);
        return dealRound(next, leader);
      }
    }
  },

  viewFor(
    state: LiarsPokerPrivateState,
    seat: SeatIndex | null,
  ): LiarsPokerPublicState {
    const players: PublicPlayer[] = state.seats.map((s) => {
      const p = state.players[s.index]!;
      // visibleHand: populated for dummy seats IFF the viewing seat isn't
      // the dummy themselves. Otherwise empty.
      const isDummySeat = p.isDummy && !p.eliminated;
      const reveal = state.lastReveal;
      const inReveal =
        (state.phase === 'revealing' || state.phase === 'roundOver') &&
        reveal !== null;
      let visibleHand: Card[] = [];
      if (inReveal) {
        // After reveal, everyone sees everyone's hand.
        visibleHand = reveal.allHands[s.index] ?? [];
      } else if (isDummySeat && seat !== s.index) {
        visibleHand = p.hand.slice();
      }
      return {
        index: s.index,
        name: s.name,
        cardCount: p.cardCount,
        isDummy: p.isDummy,
        eliminated: p.eliminated,
        dealAcked: p.dealAcked,
        visibleHand,
      };
    });

    // Your hand: normal seats see it; dummies do NOT (they can't see their card).
    let yourHand: Card[] = [];
    if (seat !== null) {
      const me = state.players[seat]!;
      if (!me.isDummy) yourHand = me.hand.slice();
    }

    let yourAckPending = false;
    if (seat !== null) {
      const p = state.players[seat]!;
      if (state.phase === 'dealPending')
        yourAckPending = !p.dealAcked && !p.eliminated;
      else if (state.phase === 'revealing')
        yourAckPending = !state.revealAcked[seat] && !p.eliminated;
      else if (state.phase === 'roundOver')
        yourAckPending = !state.roundOverAcked[seat] && !p.eliminated;
    }

    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
      players,
      currentSeat: state.currentSeat,
      roundLeader: state.roundLeader,
      roundNumber: state.roundNumber,
      cardsPerPlayer: state.cardsPerPlayer,
      dummyHand: state.dummyHand,
      currentClaim: state.currentClaim,
      currentBidder: state.currentBidder,
      lastReveal: state.lastReveal,
      history: state.history.slice(),
      matchWinners: state.matchWinners.slice(),
      yourSeat: seat,
      yourHand,
      yourAckPending,
    };
  },

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
