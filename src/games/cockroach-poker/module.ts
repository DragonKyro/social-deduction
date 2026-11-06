import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CockroachPokerAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial } from './setup';
import { CREATURES, LOSING_ROW_COUNT } from './state';
import type {
  CockroachPokerPrivateState,
  CockroachPokerPublicState,
  Creature,
  LossReason,
  PassState,
  PlayerState,
  RevealRecord,
} from './state';
import { aliveSeats, passTargets, viewFor } from './view';

// ============================================================================
// Cockroach Poker — module
//
// Hidden info: each seat's hand + the in-transit card (visible only to the
// original sender and any peeker). `viewFor` (view.ts) redacts both.
// ============================================================================

export interface CockroachPokerSeatConfig {
  name: string;
  isAI: boolean;
}

export interface CockroachPokerOptions {
  players: CockroachPokerSeatConfig[];
}

function getOptions(config: GameConfig): CockroachPokerOptions {
  return config.gameOptions as unknown as CockroachPokerOptions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isCreature(c: unknown): c is Creature {
  return typeof c === 'string' && (CREATURES as readonly string[]).includes(c);
}

function nextLive(state: CockroachPokerPrivateState, from: SeatIndex): SeatIndex {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const cand = (from + step) % n;
    if (!state.players[cand]!.lost) return cand;
  }
  return from;
}

function withPlayer(
  state: CockroachPokerPrivateState,
  seat: SeatIndex,
  patch: Partial<PlayerState>,
): CockroachPokerPrivateState {
  return {
    ...state,
    players: {
      ...state.players,
      [seat]: { ...state.players[seat]!, ...patch },
    },
  };
}

function resetAck(state: CockroachPokerPrivateState): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
}

/** A real seat index that hasn't lost. */
function requireSeat(state: CockroachPokerPrivateState, seat: unknown, what = 'seat'): SeatIndex {
  if (typeof seat !== 'number' || !Number.isInteger(seat) || !state.players[seat]) {
    throw new Error(`Unknown ${what}`);
  }
  if (state.players[seat]!.lost) throw new Error(`That ${what} is out`);
  return seat;
}

function requireHolder(state: CockroachPokerPrivateState, bySeat: unknown): PassState {
  if (state.phase !== 'decide' || !state.pass) throw new Error('No card is being passed');
  const seat = requireSeat(state, bySeat);
  if (seat !== state.pass.holder) throw new Error('Not your decision');
  return state.pass;
}

function endGame(
  state: CockroachPokerPrivateState,
  loser: SeatIndex,
  reason: LossReason,
): CockroachPokerPrivateState {
  const players = { ...state.players, [loser]: { ...state.players[loser]!, lost: true } };
  return {
    ...state,
    players,
    phase: 'gameOver',
    loserSeat: loser,
    lossReason: reason,
    matchWinners: state.seats.map((s) => s.index).filter((i) => i !== loser),
  };
}

// Resolve a pass when the holder decides truth/lie.
function resolveDecision(
  state: CockroachPokerPrivateState,
  decider: SeatIndex,
  call: 'truth' | 'lie',
): CockroachPokerPrivateState {
  const pass = state.pass!;
  const claimCorrect = pass.card === pass.claim;
  const callerWon = (call === 'truth' && claimCorrect) || (call === 'lie' && !claimCorrect);
  // The seat that handed the card to the decider made the claim being called.
  const claimant = pass.chain[pass.chain.length - 1]!.from;
  const receiver = callerWon ? claimant : decider;

  const p = state.players[receiver]!;
  const row = { ...p.row, [pass.card]: p.row[pass.card] + 1 };
  const next = withPlayer(state, receiver, { row });
  const reveal: RevealRecord = {
    claim: pass.claim,
    claimant,
    decider,
    call,
    callerWon,
    receiver,
    card: pass.card,
    chain: pass.chain.map((h) => ({ ...h })),
    seenBy: pass.seenBy.slice(),
  };
  return {
    ...next,
    phase: 'revealing',
    pass: null,
    turnNumber: state.turnNumber + 1,
    lastReveal: reveal,
    revealAcked: resetAck(next),
  };
}

// ============================================================================
// Module
// ============================================================================

export const cockroachPokerModule: GameModule<
  CockroachPokerPrivateState,
  CockroachPokerPublicState,
  CockroachPokerAction
> = {
  id: 'cockroach-poker',
  displayName: 'Cockroach Poker',
  minPlayers: 3,
  maxPlayers: 6,

  createInitialState(config: GameConfig): CockroachPokerPrivateState {
    const opts = getOptions(config);
    const count = opts.players?.length ?? 0;
    if (count < this.minPlayers || count > this.maxPlayers) {
      throw new Error(
        `Cockroach Poker requires ${this.minPlayers}-${this.maxPlayers} players (got ${count})`,
      );
    }
    return buildInitial(opts.players.map((p) => p.name), config.seed);
  },

  applyAction(
    state: CockroachPokerPrivateState,
    action: CockroachPokerAction,
  ): CockroachPokerPrivateState {
    if (state.phase === 'gameOver') throw new Error('Game is over');
    switch (action.type) {
      case 'ackDeal': {
        if (state.phase !== 'dealPending') {
          throw new Error('ackDeal only valid in dealPending');
        }
        const seat = requireSeat(state, action.bySeat);
        if (state.players[seat]!.dealAcked) throw new Error('Already acknowledged');
        const next = withPlayer(state, seat, { dealAcked: true });
        if (!aliveSeats(next).every((i) => next.players[i]!.dealAcked)) return next;
        return { ...next, phase: 'passing' };
      }

      case 'startPass': {
        if (state.phase !== 'passing') {
          throw new Error('startPass only valid in passing');
        }
        const seat = requireSeat(state, action.bySeat);
        if (seat !== state.currentSeat) throw new Error('Not your turn');
        const target = requireSeat(state, action.target, 'target');
        if (target === seat) throw new Error("Can't pass to yourself");
        if (!isCreature(action.claim)) throw new Error('Unknown creature');
        const sender = state.players[seat]!;
        const idx = action.handIndex;
        if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= sender.hand.length) {
          throw new Error('Invalid card index');
        }
        const card = sender.hand[idx]!;
        const hand = sender.hand.slice();
        hand.splice(idx, 1);
        const pass: PassState = {
          card,
          claim: action.claim,
          originalSender: seat,
          seenBy: [seat],
          holder: target,
          holderPeeked: false,
          chain: [{ from: seat, to: target, claim: action.claim }],
        };
        return { ...withPlayer(state, seat, { hand }), phase: 'decide', pass };
      }

      case 'decide': {
        const pass = requireHolder(state, action.bySeat);
        if (pass.holderPeeked) throw new Error('You peeked — you must pass it on');
        if (action.call !== 'truth' && action.call !== 'lie') throw new Error('Unknown call');
        return resolveDecision(state, pass.holder, action.call);
      }

      case 'peek': {
        const pass = requireHolder(state, action.bySeat);
        if (pass.holderPeeked) throw new Error('Already peeked');
        if (passTargets(state, pass).length === 0) {
          throw new Error('Everyone else has seen this card — you must call it');
        }
        return {
          ...state,
          pass: {
            ...pass,
            holderPeeked: true,
            seenBy: pass.seenBy.includes(pass.holder) ? pass.seenBy : [...pass.seenBy, pass.holder],
          },
        };
      }

      case 'passOn': {
        const pass = requireHolder(state, action.bySeat);
        if (!pass.holderPeeked) throw new Error('Peek at the card before passing it on');
        if (!isCreature(action.claim)) throw new Error('Unknown creature');
        const target = requireSeat(state, action.target, 'target');
        if (!passTargets(state, pass).includes(target)) {
          throw new Error('That seat has already seen this card');
        }
        return {
          ...state,
          pass: {
            ...pass,
            claim: action.claim,
            holder: target,
            holderPeeked: false,
            chain: [...pass.chain, { from: pass.holder, to: target, claim: action.claim }],
          },
        };
      }

      case 'ackReveal': {
        if (state.phase !== 'revealing') {
          throw new Error('ackReveal only valid in revealing');
        }
        const seat = requireSeat(state, action.bySeat);
        if (state.revealAcked[seat]) throw new Error('Already acknowledged');
        const next = {
          ...state,
          revealAcked: { ...state.revealAcked, [seat]: true },
        };
        if (!aliveSeats(next).every((i) => next.revealAcked[i])) return next;

        const r = next.lastReveal!;
        if (next.players[r.receiver]!.row[r.card] >= LOSING_ROW_COUNT) {
          return endGame(next, r.receiver, 'fourOfAKind');
        }
        // Whoever took the card starts the next turn — and loses if they
        // have nothing left to pass.
        let starter = r.receiver;
        if (next.players[starter]!.lost) starter = nextLive(next, starter);
        if (next.players[starter]!.hand.length === 0) {
          return endGame(next, starter, 'emptyHand');
        }
        return { ...next, phase: 'passing', currentSeat: starter, lastReveal: null };
      }

      default:
        throw new Error('Unknown action');
    }
  },

  viewFor,

  isFinished(state: CockroachPokerPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    const opts: CockroachPokerOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
    };
    return {
      gameId: 'cockroach-poker',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
  },
};

export { CREATURES };
