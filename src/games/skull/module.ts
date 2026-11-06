import { makeRng, rngInt, subSeed } from '@/engine/rng';
import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { SkullAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial, gatherDisks, nextRound } from './setup';
import type {
  Disk,
  PlayerState,
  RoundSummary,
  SkullPrivateState,
  SkullPublicState,
} from './state';
import { viewFor } from './view';

// ============================================================================
// Skull — module
//
// Hidden info: stack contents, each seat's rose/skull split, and the disk a
// failed challenger loses. `viewFor` (view.ts) is the single chokepoint.
//
// Failed challenge (official rules):
//   - hit someone else's skull → that skull's owner removes one of the
//     challenger's disks at random, face-down. Modelled as a host RNG pick.
//   - hit your own skull → you choose which of your disks to discard
//     (`discardDisk`), face-down.
//   Either way only the challenger learns which disk went.
// Next round: the challenger starts. If they were knocked out, the owner of
// the skull that did it starts; if it was their own skull, they choose
// (`chooseLeader`). Last player with disks wins outright.
// ============================================================================

export interface SkullSeatConfig {
  name: string;
  isAI: boolean;
}

export interface SkullOptions {
  players: SkullSeatConfig[];
  challengeTarget: number; // 1 | 2 | 3
}

function getOptions(config: GameConfig): SkullOptions {
  return config.gameOptions as unknown as SkullOptions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSeat(state: SkullPrivateState, seat: unknown): seat is SeatIndex {
  return typeof seat === 'number' && Number.isInteger(seat) && state.players[seat] !== undefined;
}

function isDisk(d: unknown): d is Disk {
  return d === 'rose' || d === 'skull';
}

function aliveSeats(state: SkullPrivateState): SeatIndex[] {
  return state.seats.map((s) => s.index).filter((i) => !state.players[i]!.eliminated);
}

function nextLiveSeat(state: SkullPrivateState, from: SeatIndex): SeatIndex {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const cand = (from + step) % n;
    if (!state.players[cand]!.eliminated) return cand;
  }
  return from;
}

function nextActiveBidder(state: SkullPrivateState, from: SeatIndex): SeatIndex | null {
  const n = state.seats.length;
  for (let step = 1; step < n; step++) {
    const cand = (from + step) % n;
    if (!state.players[cand]!.eliminated && !state.passed[cand]) return cand;
  }
  return null;
}

function totalStackOnTable(state: SkullPrivateState): number {
  return state.seats.reduce((acc, s) => acc + state.players[s.index]!.stack.length, 0);
}

function activeBidders(state: SkullPrivateState): SeatIndex[] {
  return aliveSeats(state).filter((i) => !state.passed[i]);
}

function withPlayer(
  state: SkullPrivateState,
  seat: SeatIndex,
  patch: Partial<PlayerState>,
): SkullPrivateState {
  return {
    ...state,
    players: { ...state.players, [seat]: { ...state.players[seat]!, ...patch } },
  };
}

function freshFlags(state: SkullPrivateState): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
}

function diskCount(p: PlayerState): number {
  return p.remaining.roses + p.remaining.skulls;
}

// Remove one disk from `seat`'s hand (disks are already gathered). Marks
// the seat eliminated when it was their last.
function loseDisk(state: SkullPrivateState, seat: SeatIndex, disk: Disk): SkullPrivateState {
  const p = state.players[seat]!;
  const remaining =
    disk === 'rose'
      ? { ...p.remaining, roses: p.remaining.roses - 1 }
      : { ...p.remaining, skulls: p.remaining.skulls - 1 };
  return withPlayer(state, seat, {
    remaining,
    eliminated: remaining.roses + remaining.skulls === 0,
  });
}

// The skull's owner draws one of the challenger's disks blind. Host RNG,
// keyed on the (private) seed so peers can't predict it.
function randomDisk(state: SkullPrivateState, seat: SeatIndex): Disk {
  const p = state.players[seat]!;
  const total = diskCount(p);
  const rng = makeRng(subSeed(state.seed, 0x5c_0f_f1_7e, state.rngCursor + 1, seat + 1));
  return rngInt(rng, total) < p.remaining.roses ? 'rose' : 'skull';
}

function summary(
  state: SkullPrivateState,
  patch: Pick<RoundSummary, 'success'> & Partial<RoundSummary>,
): RoundSummary {
  return {
    roundNumber: state.roundNumber,
    challenger: state.challenger!,
    bid: state.currentBid,
    flips: state.flips.slice(),
    skullOwner: null,
    loserSeat: null,
    diskLost: null,
    lossMethod: null,
    eliminatedSeat: null,
    nextLeader: null,
    ...patch,
  };
}

// Close the round: record it, and either end the match or wait for acks.
function finishRound(state: SkullPrivateState, rec: RoundSummary): SkullPrivateState {
  const alive = aliveSeats(state);
  const winners = state.seats
    .map((s) => s.index)
    .filter((i) => state.players[i]!.wins >= state.challengeTarget);
  const matchWinners = winners.length > 0 ? winners : alive.length === 1 ? alive : [];
  const over = matchWinners.length > 0;
  return {
    ...state,
    phase: over ? 'gameOver' : 'roundOver',
    history: [...state.history, { ...rec, nextLeader: over ? null : rec.nextLeader }],
    matchWinners,
    roundOverAcked: freshFlags(state),
    currentSeat: rec.challenger,
  };
}

function resolveSuccess(state: SkullPrivateState): SkullPrivateState {
  const c = state.challenger!;
  const next = gatherDisks(withPlayer(state, c, { wins: state.players[c]!.wins + 1 }));
  return finishRound(next, summary(next, { success: true, nextLeader: c }));
}

function resolveFail(state: SkullPrivateState, skullOwner: SeatIndex): SkullPrivateState {
  const c = state.challenger!;
  const gathered = gatherDisks(state);
  const total = diskCount(gathered.players[c]!);
  if (skullOwner === c && total > 1) {
    // Own skull: the challenger picks which disk to discard.
    return { ...gathered, phase: 'discarding', currentSeat: c };
  }
  // Someone else's skull → random; own skull with one disk → no choice.
  const disk = skullOwner === c ? (gathered.players[c]!.remaining.skulls > 0 ? 'skull' : 'rose') : randomDisk(gathered, c);
  return afterLoss(loseDisk(gathered, c, disk), skullOwner, disk, skullOwner === c ? 'chosen' : 'random');
}

function afterLoss(
  state: SkullPrivateState,
  skullOwner: SeatIndex,
  disk: Disk,
  lossMethod: 'random' | 'chosen',
): SkullPrivateState {
  const c = state.challenger!;
  const out = state.players[c]!.eliminated;
  const rec = summary(state, {
    success: false,
    skullOwner,
    loserSeat: c,
    diskLost: disk,
    lossMethod,
    eliminatedSeat: out ? c : null,
    nextLeader: out ? (skullOwner === c ? null : skullOwner) : c,
  });
  if (out && skullOwner === c && aliveSeats(state).length > 1) {
    // Knocked out by their own skull: they pick the next starter. The
    // summary is parked on the private state until they do.
    return { ...state, phase: 'chooseLeader', currentSeat: c, pendingSummary: rec };
  }
  return finishRound(state, rec);
}

// Rulebook: the challenger leads the next round. (Fallback for a missing
// record: next live seat.)
function nextLeaderAfterRound(state: SkullPrivateState): SeatIndex {
  const last = state.history[state.history.length - 1];
  if (!last) return state.roundLeader;
  const leader = last.nextLeader ?? last.challenger;
  if (!state.players[leader]!.eliminated) return leader;
  return nextLiveSeat(state, leader);
}

function startChallenge(state: SkullPrivateState): SkullPrivateState {
  const challenger = state.currentBidder!;
  return {
    ...state,
    phase: 'revealing',
    challenger,
    flipsRemaining: state.currentBid,
    ownStackCleared: state.players[challenger]!.stack.length === 0,
    flips: [],
    currentSeat: challenger,
  };
}

// ============================================================================
// Module
// ============================================================================

export const skullModule: GameModule<SkullPrivateState, SkullPublicState, SkullAction> = {
  id: 'skull',
  displayName: 'Skull',
  minPlayers: 3,
  maxPlayers: 6,

  createInitialState(config: GameConfig): SkullPrivateState {
    const opts = getOptions(config);
    const playerCount = opts.players?.length ?? 0;
    if (playerCount < this.minPlayers || playerCount > this.maxPlayers) {
      throw new Error(
        `Skull requires ${this.minPlayers}-${this.maxPlayers} players (got ${playerCount})`,
      );
    }
    const target = opts.challengeTarget ?? 2;
    if (target !== 1 && target !== 2 && target !== 3) {
      throw new Error(`Skull challengeTarget must be 1, 2, or 3 (got ${target})`);
    }
    return buildInitial(opts.players.map((p) => p.name), config.seed, target);
  },

  // `byUuid` unused: the network layer guarantees `action.bySeat` is the
  // sender's seat; we check that seat against phase + turn.
  applyAction(state: SkullPrivateState, action: SkullAction): SkullPrivateState {
    if (!action || !isSeat(state, action.bySeat)) throw new Error('Unknown seat');
    switch (action.type) {
      case 'placeDisk': {
        if (state.phase !== 'placeOpening' && state.phase !== 'placing') {
          throw new Error(`placeDisk invalid in phase ${state.phase}`);
        }
        if (action.bySeat !== state.currentSeat) throw new Error('Not your turn to place');
        if (!isDisk(action.disk)) throw new Error('Unknown disk');
        const p = state.players[action.bySeat]!;
        if (action.disk === 'rose' && p.remaining.roses === 0) throw new Error('No roses left to place');
        if (action.disk === 'skull' && p.remaining.skulls === 0) throw new Error('No skull left to place');
        const remaining = { ...p.remaining };
        if (action.disk === 'rose') remaining.roses -= 1;
        else remaining.skulls -= 1;
        const next = withPlayer(state, action.bySeat, { remaining, stack: [...p.stack, action.disk] });
        if (state.phase === 'placeOpening') {
          const everyoneOpened = aliveSeats(next).every((i) => next.players[i]!.stack.length >= 1);
          if (everyoneOpened) return { ...next, phase: 'placing', currentSeat: next.roundLeader };
        }
        return { ...next, currentSeat: nextLiveSeat(next, action.bySeat) };
      }

      case 'openBid': {
        if (state.phase !== 'placing') throw new Error('openBid only valid in placing phase');
        if (action.bySeat !== state.currentSeat) throw new Error('Only the active seat may open the bid');
        const onTable = totalStackOnTable(state);
        if (!Number.isInteger(action.bid) || action.bid < 1 || action.bid > onTable) {
          throw new Error(`Bid must be a whole number between 1 and ${onTable}`);
        }
        const passed = freshFlags(state);
        const opened: SkullPrivateState = {
          ...state,
          currentBid: action.bid,
          currentBidder: action.bySeat,
          passed,
          bidLog: [{ seat: action.bySeat, bid: action.bid }],
        };
        const upcoming = nextActiveBidder(opened, action.bySeat);
        // Max bid (nobody can outbid) or nobody else to bid → challenge now.
        if (action.bid === onTable || upcoming === null) return startChallenge(opened);
        return { ...opened, phase: 'bidding', currentSeat: upcoming };
      }

      case 'raiseBid': {
        if (state.phase !== 'bidding') throw new Error('raiseBid only valid in bidding phase');
        if (action.bySeat !== state.currentSeat) throw new Error('Not your turn to bid');
        if (state.passed[action.bySeat]) throw new Error('You already passed');
        const onTable = totalStackOnTable(state);
        if (!Number.isInteger(action.bid) || action.bid <= state.currentBid || action.bid > onTable) {
          throw new Error(`Bid must be a whole number from ${state.currentBid + 1} to ${onTable}`);
        }
        const next: SkullPrivateState = {
          ...state,
          currentBid: action.bid,
          currentBidder: action.bySeat,
          bidLog: [...state.bidLog, { seat: action.bySeat, bid: action.bid }],
        };
        const upcoming = nextActiveBidder(next, action.bySeat);
        if (action.bid === onTable || upcoming === null) return startChallenge(next);
        return { ...next, currentSeat: upcoming };
      }

      case 'passBid': {
        if (state.phase !== 'bidding') throw new Error('passBid only valid in bidding phase');
        if (action.bySeat !== state.currentSeat) throw new Error('Not your turn to pass');
        if (state.passed[action.bySeat]) throw new Error('Already passed');
        if (action.bySeat === state.currentBidder) throw new Error('The high bidder cannot pass');
        const next: SkullPrivateState = {
          ...state,
          passed: { ...state.passed, [action.bySeat]: true },
          bidLog: [...state.bidLog, { seat: action.bySeat, bid: 'pass' }],
        };
        if (activeBidders(next).length <= 1) return startChallenge(next);
        const upcoming = nextActiveBidder(next, action.bySeat);
        if (upcoming === null) return startChallenge(next);
        return { ...next, currentSeat: upcoming };
      }

      case 'flipNext': {
        if (state.phase !== 'revealing') throw new Error('flipNext only valid in revealing phase');
        if (action.bySeat !== state.challenger) throw new Error('Only the challenger may flip');
        const challenger = state.challenger;
        const ownLeft = state.players[challenger]!.stack.length;
        let fromSeat: SeatIndex;
        if (ownLeft > 0) {
          // All of your own stack comes first.
          if (action.fromSeat !== undefined && action.fromSeat !== challenger) {
            throw new Error('Flip all of your own disks first');
          }
          fromSeat = challenger;
        } else {
          if (action.fromSeat === undefined || !isSeat(state, action.fromSeat)) {
            throw new Error('Choose a seat to flip from');
          }
          if (action.fromSeat === challenger) throw new Error('Your own stack is already flipped');
          if (state.players[action.fromSeat]!.stack.length === 0) throw new Error('That seat has no disks');
          fromSeat = action.fromSeat;
        }

        // Flip the top disk face-up. It stays its owner's disk.
        const owner = state.players[fromSeat]!;
        const stack = owner.stack.slice();
        const disk = stack.pop()!;
        let next = withPlayer(state, fromSeat, { stack, revealed: [...owner.revealed, disk] });
        next = { ...next, flips: [...next.flips, { seat: fromSeat, disk }] };

        if (disk === 'skull') return resolveFail(next, fromSeat);

        const flipsRemaining = next.flipsRemaining - 1;
        next = {
          ...next,
          flipsRemaining,
          ownStackCleared: next.players[challenger]!.stack.length === 0,
        };
        if (flipsRemaining <= 0) return resolveSuccess(next);
        return next;
      }

      case 'discardDisk': {
        if (state.phase !== 'discarding') throw new Error('discardDisk only valid after flipping your own skull');
        if (action.bySeat !== state.challenger) throw new Error('Only the challenger discards');
        if (!isDisk(action.disk)) throw new Error('Unknown disk');
        const p = state.players[action.bySeat]!;
        if ((action.disk === 'rose' ? p.remaining.roses : p.remaining.skulls) === 0) {
          throw new Error(`You have no ${action.disk} to discard`);
        }
        return afterLoss(loseDisk(state, action.bySeat, action.disk), action.bySeat, action.disk, 'chosen');
      }

      case 'chooseLeader': {
        if (state.phase !== 'chooseLeader') throw new Error('chooseLeader not expected now');
        if (action.bySeat !== state.challenger) throw new Error('Only the challenger chooses');
        if (!isSeat(state, action.seat) || state.players[action.seat]!.eliminated) {
          throw new Error('Choose a player who is still in');
        }
        const rec = state.pendingSummary ?? summary(state, { success: false, loserSeat: action.bySeat });
        return finishRound({ ...state, pendingSummary: null }, { ...rec, nextLeader: action.seat });
      }

      case 'ackRoundOver': {
        if (state.phase !== 'roundOver') throw new Error('ackRoundOver only valid in roundOver phase');
        if (state.players[action.bySeat]!.eliminated) throw new Error('Eliminated players do not ack');
        const roundOverAcked = { ...state.roundOverAcked, [action.bySeat]: true };
        if (!aliveSeats(state).every((i) => roundOverAcked[i])) return { ...state, roundOverAcked };
        return nextRound({ ...state, roundOverAcked }, nextLeaderAfterRound(state));
      }

      default:
        throw new Error('Unknown action');
    }
  },

  viewFor,

  isFinished(state: SkullPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    const opts: SkullOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
      challengeTarget: 2,
    };
    return {
      gameId: 'skull',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
  },
};
