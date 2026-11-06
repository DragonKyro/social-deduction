import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { LiarsDiceAction } from './actions';
import { aiChooseAction } from './ai';
import { countMatching, isLegalRaise, isValidBidShape } from './rules';
import { buildInitial, rerollAll } from './setup';
import type {
  DieFace,
  LiarsDicePrivateState,
  LiarsDicePublicState,
  PlayerState,
  RevealRecord,
  RoundSummary,
} from './state';
import { aliveSeats, totalDiceInPlay, viewFor } from './view';

// ============================================================================
// Liar's Dice — module
//
// Hidden info: each seat's rolled dice values. Public surfaces only dice
// COUNT per seat. The single chokepoint `viewFor` (view.ts) redacts
// `yourDice` to the owning seat. On reveal, every seat sees
// `lastReveal.allDice` (no longer hidden since the challenge resolved).
// ============================================================================

export interface LiarsDiceSeatConfig {
  name: string;
  isAI: boolean;
}

export interface LiarsDiceOptions {
  players: LiarsDiceSeatConfig[];
  wildOnes: boolean;
  spotOn: boolean;
  startingDice: number;
}

function getOptions(config: GameConfig): LiarsDiceOptions {
  return config.gameOptions as unknown as LiarsDiceOptions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countFace(state: LiarsDicePrivateState, face: DieFace): number {
  let n = 0;
  for (const i of aliveSeats(state)) n += countMatching(state.players[i]!.dice, face, state.wildOnes);
  return n;
}

function nextLive(state: LiarsDicePrivateState, from: SeatIndex): SeatIndex {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const cand = (from + step) % n;
    if (!state.players[cand]!.eliminated) return cand;
  }
  return from;
}

function withPlayer(
  state: LiarsDicePrivateState,
  seat: SeatIndex,
  patch: Partial<PlayerState>,
): LiarsDicePrivateState {
  return {
    ...state,
    players: {
      ...state.players,
      [seat]: { ...state.players[seat]!, ...patch },
    },
  };
}

function resetAck(state: LiarsDicePrivateState): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
}

/** The acting seat must be a real, still-alive seat. */
function requireLiveSeat(state: LiarsDicePrivateState, seat: unknown): SeatIndex {
  if (typeof seat !== 'number' || !Number.isInteger(seat) || !state.players[seat]) {
    throw new Error('Unknown seat');
  }
  if (state.players[seat]!.eliminated) throw new Error('Eliminated seat cannot act');
  return seat;
}

// Resolve a call. Determines actual count, decides winner, drops a die.
function resolveCall(
  state: LiarsDicePrivateState,
  caller: SeatIndex,
  kind: 'liar' | 'spotOn',
): LiarsDicePrivateState {
  const bid = state.currentBid!;
  const bidder = state.currentBidder!;
  const actual = countFace(state, bid.face);

  // liar: caller wins if the bid was too high. spotOn: caller wins on exact.
  const callerWon = kind === 'liar' ? actual < bid.count : actual === bid.count;
  const loserSeat = callerWon ? bidder : caller;

  const allDice: Record<SeatIndex, DieFace[]> = {};
  for (const s of state.seats) {
    allDice[s.index] = state.players[s.index]!.dice.slice();
  }
  const reveal: RevealRecord = {
    bid: { ...bid },
    bidder,
    caller,
    kind,
    actual,
    callerWon,
    loserSeat,
    allDice,
  };

  // Drop a die from loser.
  const lp = state.players[loserSeat]!;
  const newCount = Math.max(0, lp.diceCount - 1);
  const next = withPlayer(state, loserSeat, {
    diceCount: newCount,
    eliminated: newCount === 0,
  });

  return {
    ...next,
    phase: 'revealing',
    lastReveal: reveal,
    revealAcked: resetAck(next),
  };
}

function nextRoundLeader(state: LiarsDicePrivateState): SeatIndex {
  const lastReveal = state.lastReveal;
  if (!lastReveal) return state.roundLeader;
  // Loser starts the next round (if alive), else the next live seat.
  const loser = lastReveal.loserSeat;
  if (!state.players[loser]!.eliminated) return loser;
  return nextLive(state, loser);
}

// ============================================================================
// Module
// ============================================================================

export const liarsDiceModule: GameModule<
  LiarsDicePrivateState,
  LiarsDicePublicState,
  LiarsDiceAction
> = {
  id: 'liars-dice',
  displayName: "Liar's Dice",
  minPlayers: 2,
  maxPlayers: 8,

  createInitialState(config: GameConfig): LiarsDicePrivateState {
    const opts = getOptions(config);
    const count = opts.players?.length ?? 0;
    if (count < this.minPlayers || count > this.maxPlayers) {
      throw new Error(
        `Liar's Dice requires ${this.minPlayers}-${this.maxPlayers} players (got ${count})`,
      );
    }
    const startingDice = opts.startingDice ?? 5;
    if (!Number.isInteger(startingDice) || startingDice < 1 || startingDice > 10) {
      throw new Error('startingDice must be 1-10');
    }
    return buildInitial(
      opts.players.map((p) => p.name),
      config.seed,
      {
        wildOnes: opts.wildOnes ?? true,
        spotOn: opts.spotOn ?? true,
        startingDice,
      },
    );
  },

  applyAction(
    state: LiarsDicePrivateState,
    action: LiarsDiceAction,
  ): LiarsDicePrivateState {
    if (state.phase === 'gameOver') throw new Error('Game is over');
    switch (action.type) {
      case 'ackRoll': {
        if (state.phase !== 'rollPending') {
          throw new Error('ackRoll only valid in rollPending');
        }
        const seat = requireLiveSeat(state, action.bySeat);
        if (state.players[seat]!.rollAcked) throw new Error('Already acknowledged');
        const next = withPlayer(state, seat, { rollAcked: true });
        const allAcked = aliveSeats(next).every((i) => next.players[i]!.rollAcked);
        if (!allAcked) return next;
        return { ...next, phase: 'bidding', currentSeat: next.roundLeader };
      }

      case 'placeBid': {
        if (state.phase !== 'bidding') {
          throw new Error('placeBid only valid in bidding');
        }
        const seat = requireLiveSeat(state, action.bySeat);
        if (seat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        if (!isValidBidShape(action.bid)) {
          throw new Error('Malformed bid');
        }
        const bid = { count: action.bid.count, face: action.bid.face };
        if (!isLegalRaise(state.currentBid, bid, state.wildOnes)) {
          throw new Error('Illegal bid (must strictly raise the current bid)');
        }
        if (bid.count > totalDiceInPlay(state)) {
          throw new Error('Bid count exceeds total dice in play');
        }
        return {
          ...state,
          currentBid: bid,
          currentBidder: seat,
          roundBids: [...state.roundBids, { seat, bid }],
          currentSeat: nextLive(state, seat),
        };
      }

      case 'call': {
        if (state.phase !== 'bidding') {
          throw new Error('call only valid in bidding');
        }
        const seat = requireLiveSeat(state, action.bySeat);
        if (seat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        if (state.currentBid === null || state.currentBidder === null) {
          throw new Error('Nothing to call — no bid placed');
        }
        if (action.kind !== 'liar' && action.kind !== 'spotOn') {
          throw new Error('Unknown call');
        }
        if (action.kind === 'spotOn' && !state.spotOn) {
          throw new Error('Spot-on rule disabled');
        }
        return resolveCall(state, seat, action.kind);
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
        // The loser of this round was the only seat that could have dropped
        // out, so "eliminated this round" is just them (if they hit 0).
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
        return rerollAll(next, nextRoundLeader(next));
      }

      default:
        throw new Error('Unknown action');
    }
  },

  viewFor,

  isFinished(state: LiarsDicePrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    const opts: LiarsDiceOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
      wildOnes: true,
      spotOn: true,
      startingDice: 5,
    };
    return {
      gameId: 'liars-dice',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
  },
};
