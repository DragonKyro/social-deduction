import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { LiarsDiceAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial, rerollAll } from './setup';
import type {
  Bid,
  DieFace,
  LiarsDicePrivateState,
  LiarsDicePublicState,
  PlayerState,
  PublicPlayer,
  RevealRecord,
  RoundSummary,
} from './state';

// ============================================================================
// Liar's Dice — module
//
// Hidden info: each seat's rolled dice values. Public surfaces only dice
// COUNT per seat. The single chokepoint `viewFor` redacts `yourDice` to the
// owning seat. On reveal, every seat sees `lastReveal.allDice` (no longer
// hidden since the challenge resolved).
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

function aliveSeats(state: LiarsDicePrivateState): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => !state.players[i]!.eliminated);
}

function totalDice(state: LiarsDicePrivateState): number {
  return aliveSeats(state).reduce(
    (sum, i) => sum + state.players[i]!.diceCount,
    0,
  );
}

// Count total of a given face across all dice, applying wildOnes if enabled.
// Rule: 1s count as the bid face EXCEPT when the bid IS on 1s.
function countFace(
  state: LiarsDicePrivateState,
  face: DieFace,
): number {
  let n = 0;
  for (const i of aliveSeats(state)) {
    for (const d of state.players[i]!.dice) {
      if (d === face) n += 1;
      else if (state.wildOnes && face !== 1 && d === 1) n += 1;
    }
  }
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

// Validate a bid is a strict raise over `prev`. Standard rule:
//   - more dice OR same dice + higher face.
//   - face must be in 2..6 if prev face is 1 (since 1 is the lowest);
//     when wildOnes is enabled, a 1-bid HALVES the count (rare) — we
//     follow the simpler convention: bidding 1s is allowed at any count > prev.
function isLegalRaise(prev: Bid | null, next: Bid): boolean {
  if (next.count < 1) return false;
  if (next.face < 1 || next.face > 6) return false;
  if (prev === null) return true;
  if (next.count > prev.count) return true;
  if (next.count === prev.count && next.face > prev.face) return true;
  return false;
}

function isAllowedFirstBid(prev: Bid | null): boolean {
  return prev === null;
}
void isAllowedFirstBid;

// Resolve a call. Determines actual count, decides winner, drops a die.
function resolveCall(
  state: LiarsDicePrivateState,
  caller: SeatIndex,
  kind: 'liar' | 'spotOn',
): LiarsDicePrivateState {
  const bid = state.currentBid!;
  const bidder = state.currentBidder!;
  const actual = countFace(state, bid.face);

  let callerWon: boolean;
  let loserSeat: SeatIndex;
  if (kind === 'liar') {
    // Caller wins if actual < bid.count.
    callerWon = actual < bid.count;
    loserSeat = callerWon ? bidder : caller;
  } else {
    // spotOn: caller wins if actual === bid.count.
    callerWon = actual === bid.count;
    loserSeat = callerWon ? bidder : caller;
  }

  const allDice: Record<SeatIndex, DieFace[]> = {};
  for (const s of state.seats) {
    allDice[s.index] = state.players[s.index]!.dice.slice();
  }
  const reveal: RevealRecord = {
    bid,
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
  let next = withPlayer(state, loserSeat, {
    diceCount: newCount,
    eliminated: newCount === 0,
  });

  next = {
    ...next,
    phase: 'revealing',
    lastReveal: reveal,
    revealAcked: resetAck(next),
  };
  return next;
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
    return buildInitial(
      opts.players.map((p) => p.name),
      config.seed,
      {
        wildOnes: opts.wildOnes ?? true,
        spotOn: opts.spotOn ?? true,
        startingDice: opts.startingDice ?? 5,
      },
    );
  },

  applyAction(
    state: LiarsDicePrivateState,
    action: LiarsDiceAction,
  ): LiarsDicePrivateState {
    switch (action.type) {
      case 'ackRoll': {
        if (state.phase !== 'rollPending') {
          throw new Error('ackRoll only valid in rollPending');
        }
        const p = state.players[action.bySeat]!;
        if (p.eliminated) {
          throw new Error('Eliminated seat cannot ack');
        }
        const next = withPlayer(state, action.bySeat, { rollAcked: true });
        const allAcked = aliveSeats(next).every(
          (i) => next.players[i]!.rollAcked,
        );
        if (!allAcked) return next;
        return { ...next, phase: 'bidding', currentSeat: next.roundLeader };
      }

      case 'placeBid': {
        if (state.phase !== 'bidding') {
          throw new Error('placeBid only valid in bidding');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        if (!isLegalRaise(state.currentBid, action.bid)) {
          throw new Error('Illegal bid (must raise count or face)');
        }
        if (action.bid.count > totalDice(state)) {
          throw new Error('Bid count exceeds total dice in play');
        }
        return {
          ...state,
          currentBid: action.bid,
          currentBidder: action.bySeat,
          currentSeat: nextLive(state, action.bySeat),
        };
      }

      case 'call': {
        if (state.phase !== 'bidding') {
          throw new Error('call only valid in bidding');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        if (state.currentBid === null) {
          throw new Error('Nothing to call — no bid placed');
        }
        if (action.kind === 'spotOn' && !state.spotOn) {
          throw new Error('Spot-on rule disabled');
        }
        return resolveCall(state, action.bySeat, action.kind);
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
        // Check match end: only one alive seat.
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
        return rerollAll(next, leader);
      }
    }
  },

  viewFor(
    state: LiarsDicePrivateState,
    seat: SeatIndex | null,
  ): LiarsDicePublicState {
    const players: PublicPlayer[] = state.seats.map((s) => {
      const p = state.players[s.index]!;
      return {
        index: s.index,
        name: s.name,
        diceCount: p.diceCount,
        eliminated: p.eliminated,
        rollAcked: p.rollAcked,
      };
    });

    const yourDice = seat !== null ? state.players[seat]!.dice.slice() : [];
    const yourSeatSorted = yourDice.slice().sort((a, b) => a - b);

    let yourAckPending = false;
    if (seat !== null) {
      const p = state.players[seat]!;
      if (state.phase === 'rollPending')
        yourAckPending = !p.rollAcked && !p.eliminated;
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
      wildOnes: state.wildOnes,
      spotOn: state.spotOn,
      currentBid: state.currentBid,
      currentBidder: state.currentBidder,
      totalDice: totalDice(state),
      lastReveal: state.lastReveal,
      history: state.history.slice(),
      matchWinners: state.matchWinners.slice(),
      yourSeat: seat,
      yourDice: yourSeatSorted as DieFace[],
      yourAckPending,
    };
  },

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
