import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CockroachPokerAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial } from './setup';
import { CREATURES } from './state';
import type {
  CockroachPokerPrivateState,
  CockroachPokerPublicState,
  Creature,
  PassState,
  PlayerState,
  PublicPlayer,
  RevealRecord,
} from './state';

// ============================================================================
// Cockroach Poker — module
//
// Hidden info: each seat's hand + the in-transit card (visible only to the
// original sender and any peeker). `viewFor` redacts both.
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

function aliveSeats(state: CockroachPokerPrivateState): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => !state.players[i]!.lost);
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

// Apply a face-up creature to the receiver's row. If they hit 4 of a kind →
// match ends with that seat as the loser.
function placeFaceUp(
  state: CockroachPokerPrivateState,
  receiver: SeatIndex,
  card: Creature,
): CockroachPokerPrivateState {
  const p = state.players[receiver]!;
  const newRow = { ...p.row, [card]: p.row[card] + 1 };
  let next = withPlayer(state, receiver, { row: newRow });
  if (newRow[card] >= 4) {
    next = withPlayer(next, receiver, { lost: true });
  }
  return next;
}

// Resolve a pass when the holder decides truth/lie.
function resolveDecision(
  state: CockroachPokerPrivateState,
  decider: SeatIndex,
  call: 'truth' | 'lie',
): CockroachPokerPrivateState {
  const pass = state.pass!;
  const claimCorrect = pass.card === pass.claim;
  // The decider says either:
  //   'truth' → "I believe the claim is correct."
  //   'lie' → "I think you're lying."
  // The "right" decider (matches actual truth) puts the card on the LIAR.
  // The "wrong" decider takes the card themselves.
  const callerWon =
    (call === 'truth' && claimCorrect) ||
    (call === 'lie' && !claimCorrect);
  // The most-recent sender (the one who handed the card to `decider`).
  const lastChain = pass.chain[pass.chain.length - 1];
  const liar = lastChain ? lastChain.from : pass.originalSender;
  const receiver = callerWon ? liar : decider;
  let next = placeFaceUp(state, receiver, pass.card);
  const reveal: RevealRecord = {
    pass,
    decider,
    call,
    callerWon,
    receiver,
    card: pass.card,
  };
  next = {
    ...next,
    phase: 'revealing',
    pass: null,
    lastReveal: reveal,
    revealAcked: resetAck(next),
  };
  return next;
}

// Pass to another seat with a new claim.
function applyPeekAndPass(
  state: CockroachPokerPrivateState,
  decider: SeatIndex,
  claim: Creature,
  target: SeatIndex,
): CockroachPokerPrivateState {
  const pass = state.pass!;
  if (pass.seenBy.includes(target)) {
    throw new Error("That seat has already seen this card");
  }
  if (target === decider) {
    throw new Error("Can't pass to yourself");
  }
  if (state.players[target]!.lost) {
    throw new Error('That seat is out');
  }
  const newPass: PassState = {
    card: pass.card,
    claim,
    originalSender: pass.originalSender,
    seenBy: pass.seenBy.includes(decider)
      ? pass.seenBy
      : [...pass.seenBy, decider],
    holder: target,
    chain: [...pass.chain, { from: decider, to: target, claim }],
  };
  return {
    ...state,
    phase: 'decide',
    pass: newPass,
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
    switch (action.type) {
      case 'ackDeal': {
        if (state.phase !== 'dealPending') {
          throw new Error('ackDeal only valid in dealPending');
        }
        const next = withPlayer(state, action.bySeat, { dealAcked: true });
        const allAcked = aliveSeats(next).every(
          (i) => next.players[i]!.dealAcked,
        );
        if (!allAcked) return next;
        return { ...next, phase: 'passing', currentSeat: next.currentSeat };
      }

      case 'startPass': {
        if (state.phase !== 'passing') {
          throw new Error('startPass only valid in passing');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Not your turn');
        }
        if (state.players[action.bySeat]!.lost) {
          throw new Error('You are out');
        }
        if (state.players[action.target]!.lost) {
          throw new Error('Target is out');
        }
        if (action.target === action.bySeat) {
          throw new Error("Can't pass to yourself");
        }
        const sender = state.players[action.bySeat]!;
        if (action.handIndex < 0 || action.handIndex >= sender.hand.length) {
          throw new Error('Invalid card index');
        }
        const card = sender.hand[action.handIndex]!;
        const hand = sender.hand.slice();
        hand.splice(action.handIndex, 1);
        let next = withPlayer(state, action.bySeat, { hand });
        const pass: PassState = {
          card,
          claim: action.claim,
          originalSender: action.bySeat,
          seenBy: [action.bySeat],
          holder: action.target,
          chain: [{ from: action.bySeat, to: action.target, claim: action.claim }],
        };
        next = { ...next, phase: 'decide', pass };
        return next;
      }

      case 'decide': {
        if (state.phase !== 'decide') {
          throw new Error('decide only valid in decide phase');
        }
        const p = state.pass;
        if (!p) throw new Error('No active pass');
        if (action.bySeat !== p.holder) {
          throw new Error('Not your decision');
        }
        return resolveDecision(state, action.bySeat, action.call);
      }

      case 'peekAndPass': {
        if (state.phase !== 'decide') {
          throw new Error('peekAndPass only valid in decide phase');
        }
        const p = state.pass;
        if (!p) throw new Error('No active pass');
        if (action.bySeat !== p.holder) {
          throw new Error('Not your decision');
        }
        return applyPeekAndPass(state, action.bySeat, action.claim, action.target);
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
        // After reveal: check match end.
        const lost = next.seats
          .map((s) => s.index)
          .find((i) => next.players[i]!.lost);
        if (lost !== undefined) {
          const winners = next.seats
            .map((s) => s.index)
            .filter((i) => !next.players[i]!.lost);
          return {
            ...next,
            phase: 'gameOver',
            matchWinners: winners,
            loserSeat: lost,
          };
        }
        // Next turn: the receiver of the face-up card leads the next pass.
        const r = next.lastReveal!;
        let nextSeat = r.receiver;
        if (next.players[nextSeat]!.lost) {
          nextSeat = nextLive(next, nextSeat);
        }
        return {
          ...next,
          phase: 'passing',
          currentSeat: nextSeat,
          lastReveal: null,
        };
      }
    }
  },

  viewFor(
    state: CockroachPokerPrivateState,
    seat: SeatIndex | null,
  ): CockroachPokerPublicState {
    const players: PublicPlayer[] = state.seats.map((s) => {
      const p = state.players[s.index]!;
      return {
        index: s.index,
        name: s.name,
        row: { ...p.row },
        handSize: p.hand.length,
        lost: p.lost,
        dealAcked: p.dealAcked,
      };
    });

    const yourHand = seat !== null ? state.players[seat]!.hand.slice() : [];
    const yourPeekedCard =
      seat !== null && state.pass !== null && state.pass.seenBy.includes(seat)
        ? state.pass.card
        : null;

    let yourAckPending = false;
    if (seat !== null) {
      const p = state.players[seat]!;
      if (state.phase === 'dealPending')
        yourAckPending = !p.dealAcked && !p.lost;
      else if (state.phase === 'revealing')
        yourAckPending = !state.revealAcked[seat] && !p.lost;
    }

    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
      players,
      currentSeat: state.currentSeat,
      passHolder: state.pass?.holder ?? null,
      passOriginalSender: state.pass?.originalSender ?? null,
      passClaim: state.pass?.claim ?? null,
      passChain: state.pass?.chain.slice() ?? [],
      passSeenBy: state.pass?.seenBy.slice() ?? [],
      lastReveal: state.lastReveal,
      matchWinners: state.matchWinners.slice(),
      loserSeat: state.loserSeat,
      yourSeat: seat,
      yourHand,
      yourPeekedCard,
      yourAckPending,
    };
  },

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
