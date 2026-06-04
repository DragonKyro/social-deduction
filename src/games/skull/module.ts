import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { SkullAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial, nextRound } from './setup';
import type {
  Disk,
  FlipRecord,
  PlayerState,
  PublicPlayer,
  RoundSummary,
  SkullPrivateState,
  SkullPublicState,
} from './state';

// ============================================================================
// Skull — module
//
// Hidden info: each seat's own stack contents (which disks are roses / skulls
// and the order). Public surfaces just stack SIZE and disk total. The single
// chokepoint `viewFor` reveals `yourStack` only to the owning seat.
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

function nextActiveBidder(
  state: SkullPrivateState,
  from: SeatIndex,
): SeatIndex | null {
  // Walk forward until we hit a seat that hasn't passed AND isn't eliminated.
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const cand = (from + step) % n;
    if (!state.players[cand]!.eliminated && !state.passed[cand]) return cand;
  }
  return null;
}

function totalStackOnTable(state: SkullPrivateState): number {
  return Object.values(state.players).reduce(
    (acc, p) => acc + p.stack.length,
    0,
  );
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
    players: {
      ...state.players,
      [seat]: { ...state.players[seat]!, ...patch },
    },
  };
}

function resetReveal(state: SkullPrivateState): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
}

// Pick a disk for the loser to forfeit: prefer rose (you never volunteer a
// skull). If no roses, lose the skull. Removes from stash + stack as needed:
// we model "all disks come back into the pool at round end" so disk loss is
// applied to `remaining` post-round.
function applyDiskLoss(
  state: SkullPrivateState,
  seat: SeatIndex,
): { state: SkullPrivateState; diskLost: Disk } {
  const p = state.players[seat]!;
  // Combine remaining + stack to compute totals, then knock one off.
  const rosesTotal =
    p.remaining.roses + p.stack.filter((d) => d === 'rose').length;
  const skullsTotal =
    p.remaining.skulls + p.stack.filter((d) => d === 'skull').length;
  let diskLost: Disk;
  let next = state;
  if (rosesTotal > 0) {
    diskLost = 'rose';
    // Decrement from remaining first, then from stack if needed.
    if (p.remaining.roses > 0) {
      next = withPlayer(state, seat, {
        remaining: { ...p.remaining, roses: p.remaining.roses - 1 },
      });
    } else {
      // Remove one rose from stack — preserve order, drop first occurrence.
      const idx = p.stack.indexOf('rose');
      const stack = p.stack.slice();
      stack.splice(idx, 1);
      next = withPlayer(state, seat, { stack });
    }
  } else if (skullsTotal > 0) {
    diskLost = 'skull';
    if (p.remaining.skulls > 0) {
      next = withPlayer(state, seat, {
        remaining: { ...p.remaining, skulls: p.remaining.skulls - 1 },
      });
    } else {
      const idx = p.stack.indexOf('skull');
      const stack = p.stack.slice();
      stack.splice(idx, 1);
      next = withPlayer(state, seat, { stack });
    }
  } else {
    // Shouldn't reach here — caller checks.
    diskLost = 'rose';
  }
  // If totals just hit zero, mark eliminated.
  const after = next.players[seat]!;
  const totalLeft =
    after.remaining.roses +
    after.remaining.skulls +
    after.stack.length;
  if (totalLeft === 0) {
    next = withPlayer(next, seat, { eliminated: true });
  }
  return { state: next, diskLost };
}

// Resolve a successful challenge: challenger wins one challenge counter.
function resolveSuccess(state: SkullPrivateState): SkullPrivateState {
  const c = state.challenger!;
  const newWins = state.players[c]!.wins + 1;
  let next = withPlayer(state, c, { wins: newWins });
  const matchWon = newWins >= state.challengeTarget;
  const summary: RoundSummary = {
    roundNumber: state.roundNumber,
    challenger: c,
    bid: state.currentBid,
    success: true,
    flips: state.flips.slice(),
    loserSeat: null,
    diskLost: null,
  };
  next = {
    ...next,
    phase: matchWon ? 'gameOver' : 'roundOver',
    history: [...next.history, summary],
    matchWinners: matchWon ? [c] : [],
    roundOverAcked: resetReveal(next),
  };
  return next;
}

// Resolve a failed challenge: the challenger loses a disk (random rose from
// challenger's stash). Rulebook variant: if the skull belonged to the
// challenger themselves, they choose; if it was an opponent's, that
// opponent gets to make the challenger lose a random disk. For UI clarity
// we always drop the challenger's rose (or skull if no roses).
function resolveFail(
  state: SkullPrivateState,
  hitSkullFlip: FlipRecord,
): SkullPrivateState {
  const c = state.challenger!;
  const { state: lossState, diskLost } = applyDiskLoss(state, c);
  const summary: RoundSummary = {
    roundNumber: state.roundNumber,
    challenger: c,
    bid: state.currentBid,
    success: false,
    flips: state.flips.slice(),
    loserSeat: c,
    diskLost,
  };
  // After a fail, leader of next round is the challenger (if still alive),
  // else next live seat. We stash this on the summary so the round-advance
  // helper knows where to go.
  void hitSkullFlip;
  return {
    ...lossState,
    phase: 'roundOver',
    history: [...lossState.history, summary],
    roundOverAcked: resetReveal(lossState),
  };
}

// Determine which seat leads the next round. Rulebook: previous round's
// challenger leads next, regardless of success/fail. If they're now
// eliminated, fall through to the next live seat clockwise.
function nextLeaderAfterRound(state: SkullPrivateState): SeatIndex {
  const last = state.history[state.history.length - 1];
  if (!last) return state.roundLeader;
  const c = last.challenger;
  if (!state.players[c]!.eliminated) return c;
  return nextLiveSeat(state, c);
}

// ============================================================================
// Module
// ============================================================================

export const skullModule: GameModule<
  SkullPrivateState,
  SkullPublicState,
  SkullAction
> = {
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

  applyAction(state: SkullPrivateState, action: SkullAction): SkullPrivateState {
    switch (action.type) {
      case 'placeDisk': {
        if (state.phase !== 'placeOpening' && state.phase !== 'placing') {
          throw new Error(`placeDisk invalid in phase ${state.phase}`);
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Not your turn to place');
        }
        const p = state.players[action.bySeat]!;
        if (action.disk === 'rose' && p.remaining.roses === 0) {
          throw new Error('No roses left to place');
        }
        if (action.disk === 'skull' && p.remaining.skulls === 0) {
          throw new Error('No skull left to place');
        }
        const remaining = { ...p.remaining };
        if (action.disk === 'rose') remaining.roses -= 1;
        else remaining.skulls -= 1;
        let next = withPlayer(state, action.bySeat, {
          remaining,
          stack: [...p.stack, action.disk],
        });
        // placeOpening: advance to next live seat; once everyone has placed
        // their opening disk (stack length == 1 for all live seats),
        // transition to 'placing' with currentSeat = roundLeader.
        if (state.phase === 'placeOpening') {
          const everyoneOpened = aliveSeats(next).every(
            (i) => next.players[i]!.stack.length >= 1,
          );
          if (everyoneOpened) {
            return { ...next, phase: 'placing', currentSeat: next.roundLeader };
          }
          return { ...next, currentSeat: nextLiveSeat(next, action.bySeat) };
        }
        // placing: stay in placing, advance to next live seat (clockwise).
        return { ...next, currentSeat: nextLiveSeat(next, action.bySeat) };
      }

      case 'openBid': {
        if (state.phase !== 'placing') {
          throw new Error('openBid only valid in placing phase');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Only the active seat may open the bid');
        }
        const onTable = totalStackOnTable(state);
        if (action.bid < 1 || action.bid > onTable) {
          throw new Error(`Bid must be between 1 and ${onTable}`);
        }
        // The opener becomes the current bidder; bidding starts. Everyone
        // else is unpassed; opener is implicitly the high bidder.
        const passed: Record<SeatIndex, boolean> = {};
        for (const s of state.seats) passed[s.index] = false;
        // If bid equals on-table disk count, challenge starts immediately
        // (nobody can outbid). Otherwise transition to bidding phase.
        if (action.bid === onTable) {
          return startChallenge({
            ...state,
            currentBid: action.bid,
            currentBidder: action.bySeat,
            passed,
          });
        }
        return {
          ...state,
          phase: 'bidding',
          currentBid: action.bid,
          currentBidder: action.bySeat,
          passed,
          currentSeat: nextActiveBidder(
            { ...state, passed },
            action.bySeat,
          ) ?? action.bySeat,
        };
      }

      case 'raiseBid': {
        if (state.phase !== 'bidding') {
          throw new Error('raiseBid only valid in bidding phase');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Not your turn to bid');
        }
        if (state.passed[action.bySeat]) {
          throw new Error('You already passed');
        }
        if (action.bid <= state.currentBid) {
          throw new Error(`Bid must exceed ${state.currentBid}`);
        }
        const onTable = totalStackOnTable(state);
        if (action.bid > onTable) {
          throw new Error(`Bid cannot exceed table total (${onTable})`);
        }
        const next: SkullPrivateState = {
          ...state,
          currentBid: action.bid,
          currentBidder: action.bySeat,
        };
        // If we hit the maximum, challenge starts immediately.
        if (action.bid === onTable) {
          return startChallenge(next);
        }
        const upcoming = nextActiveBidder(next, action.bySeat);
        if (upcoming === null) {
          // Shouldn't happen — at least one other bidder remained.
          return startChallenge(next);
        }
        return { ...next, currentSeat: upcoming };
      }

      case 'passBid': {
        if (state.phase !== 'bidding') {
          throw new Error('passBid only valid in bidding phase');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Not your turn to pass');
        }
        if (state.passed[action.bySeat]) {
          throw new Error('Already passed');
        }
        const passed = { ...state.passed, [action.bySeat]: true };
        const next = { ...state, passed };
        const remainingBidders = activeBidders(next);
        if (remainingBidders.length === 1) {
          // High bidder is forced into the challenge.
          return startChallenge(next);
        }
        const upcoming = nextActiveBidder(next, action.bySeat);
        if (upcoming === null) {
          return startChallenge(next);
        }
        return { ...next, currentSeat: upcoming };
      }

      case 'flipNext': {
        if (state.phase !== 'revealing') {
          throw new Error('flipNext only valid in revealing phase');
        }
        if (action.bySeat !== state.challenger) {
          throw new Error('Only the challenger may flip');
        }
        // Determine which stack to flip from.
        const challenger = state.challenger!;
        let fromSeat: SeatIndex;
        if (!state.ownStackCleared) {
          // Must keep flipping own stack until empty.
          if (state.players[challenger]!.stack.length === 0) {
            // own stack already empty; treat as cleared.
            // Caller must supply fromSeat to begin flipping opponents.
            if (action.fromSeat === undefined) {
              throw new Error('Choose a seat to flip from');
            }
            if (action.fromSeat === challenger) {
              throw new Error("Your own stack is empty");
            }
            if (state.players[action.fromSeat]!.stack.length === 0) {
              throw new Error('That seat has no disks');
            }
            fromSeat = action.fromSeat;
          } else {
            fromSeat = challenger;
          }
        } else {
          if (action.fromSeat === undefined) {
            throw new Error('Choose a seat to flip from');
          }
          if (action.fromSeat === challenger) {
            throw new Error("Can't return to your own stack after clearing it");
          }
          if (state.players[action.fromSeat]!.stack.length === 0) {
            throw new Error('That seat has no disks');
          }
          fromSeat = action.fromSeat;
        }

        // Flip from top of the chosen stack.
        const targetStack = state.players[fromSeat]!.stack.slice();
        const disk = targetStack.pop()!;
        let next = withPlayer(state, fromSeat, { stack: targetStack });

        const flip: FlipRecord = { seat: fromSeat, disk };
        next = { ...next, flips: [...next.flips, flip] };

        if (disk === 'skull') {
          return resolveFail(next, flip);
        }

        // Rose — count toward the bid.
        const flipsRemaining = next.flipsRemaining - 1;
        next = { ...next, flipsRemaining };

        // If challenger just emptied their own stack, mark cleared.
        const ownStackCleared =
          next.ownStackCleared ||
          (fromSeat === challenger &&
            next.players[challenger]!.stack.length === 0);
        next = { ...next, ownStackCleared };

        if (flipsRemaining === 0) {
          return resolveSuccess(next);
        }
        // Stay in revealing — challenger flips again.
        return next;
      }

      case 'ackRoundOver': {
        if (state.phase !== 'roundOver') {
          throw new Error('ackRoundOver only valid in roundOver phase');
        }
        const roundOverAcked = {
          ...state.roundOverAcked,
          [action.bySeat]: true,
        };
        // Only require alive-seats to ack.
        const alive = aliveSeats(state);
        const allAcked = alive.every((i) => roundOverAcked[i]);
        if (!allAcked) {
          return { ...state, roundOverAcked };
        }
        // Advance to next round.
        const leader = nextLeaderAfterRound(state);
        return nextRound({ ...state, roundOverAcked }, leader);
      }
    }
  },

  viewFor(state: SkullPrivateState, seat: SeatIndex | null): SkullPublicState {
    const players: PublicPlayer[] = state.seats.map((s) => {
      const p = state.players[s.index]!;
      return {
        index: s.index,
        name: s.name,
        stackSize: p.stack.length,
        disksTotal:
          p.remaining.roses + p.remaining.skulls + p.stack.length,
        eliminated: p.eliminated,
        wins: p.wins,
      };
    });

    const yourStack = seat !== null ? state.players[seat]!.stack.slice() : [];
    const yourRemaining =
      seat !== null
        ? { ...state.players[seat]!.remaining }
        : { roses: 0, skulls: 0 };

    let yourAckPending = false;
    if (seat !== null) {
      if (state.phase === 'roundOver')
        yourAckPending = !state.roundOverAcked[seat];
    }

    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
      players,
      currentSeat: state.currentSeat,
      roundLeader: state.roundLeader,
      roundNumber: state.roundNumber,
      challengeTarget: state.challengeTarget,
      currentBid: state.currentBid,
      currentBidder: state.currentBidder,
      passed: { ...state.passed },
      challenger: state.challenger,
      flipsRemaining: state.flipsRemaining,
      ownStackCleared: state.ownStackCleared,
      flips: state.flips.slice(),
      lastRound:
        state.history.length > 0
          ? state.history[state.history.length - 1]!
          : null,
      history: state.history.slice(),
      matchWinners: state.matchWinners.slice(),
      yourSeat: seat,
      yourStack,
      yourRemaining,
      yourAckPending,
    };
  },

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

// ---------------------------------------------------------------------------
// Challenge start helper
// ---------------------------------------------------------------------------

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
