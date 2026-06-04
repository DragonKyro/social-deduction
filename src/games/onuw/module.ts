import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { OnuwAction } from './actions';
import { aiChooseAction } from './ai';
import { ROLES } from './roles';
import { buildInitialPrivate, validateRolePool } from './setup';
import {
  OBSERVATIONAL_ROLES_NEED_ACK,
  applyAlphaWolfConvert,
  applyApprenticeSeerLook,
  applyBodySnatcherSwap,
  applyCuratorGive,
  applyDefenderProtect,
  applyDoppelgangerCopy,
  applyDrunkSwap,
  applyLoneWolfPeek,
  applyMysticWolfLook,
  applyParanormalLook,
  applyRevealerFlip,
  applyRobberSwap,
  applySeerLookCenter,
  applySeerLookSeat,
  applyThingTap,
  applyTroublemakerSwap,
  applyVillageIdiotShift,
  applyWindyWendyShift,
  applyWitchSwap,
  runAutoStep,
} from './night';
import type {
  OnuwArtifactId,
  OnuwPrivateState,
  OnuwPublicState,
  OnuwRoleId,
} from './state';

export interface OnuwSeatConfig {
  name: string;
  isAI: boolean;
}

export interface OnuwOptions {
  // Selected role pool. Length must be `players.length + 3`.
  rolePool: OnuwRoleId[];
  players: OnuwSeatConfig[];
  artifactPool: OnuwArtifactId[];
  dayDurationSec: number;
  allowNoLynch: boolean;
}

function getOptions(config: GameConfig): OnuwOptions {
  return config.gameOptions as unknown as OnuwOptions;
}

// === Helpers ================================================================

function currentStep(state: OnuwPrivateState) {
  return state.nightSchedule[state.nightStepIndex] ?? null;
}

function advanceStep(state: OnuwPrivateState): OnuwPrivateState {
  // Mark the current step resolved, then move the cursor forward, skipping
  // any steps whose role-spec says it has nothing to do. If we run out of
  // steps, transition to day.
  const schedule = state.nightSchedule.slice();
  if (state.nightStepIndex < schedule.length) {
    schedule[state.nightStepIndex] = { ...schedule[state.nightStepIndex]!, resolved: true };
  }
  let next = { ...state, nightSchedule: schedule, nightStepIndex: state.nightStepIndex + 1 };
  // Auto-skip dream wolf (no work to do at the step).
  while (next.nightStepIndex < next.nightSchedule.length) {
    const step = next.nightSchedule[next.nightStepIndex]!;
    if (step.role === 'dreamWolf') {
      // Apply auto step (no-op) and advance.
      next = { ...next, nightStepIndex: next.nightStepIndex + 1 };
      continue;
    }
    break;
  }
  if (next.nightStepIndex >= next.nightSchedule.length) {
    return { ...next, phase: 'day' };
  }
  // Pre-run auto-resolution for observational roles. We still expect a
  // per-seat ack — runAutoStep just populates observations.
  const step = next.nightSchedule[next.nightStepIndex]!;
  if (OBSERVATIONAL_ROLES_NEED_ACK.has(step.role)) {
    next = runAutoStep(next, step.role, step.seats);
  }
  return next;
}

function recordStepAck(
  state: OnuwPrivateState,
  step: number,
  seat: SeatIndex,
): OnuwPrivateState {
  const cur = state.nightStepAcks[step] ?? [];
  if (cur.includes(seat)) return state;
  return {
    ...state,
    nightStepAcks: { ...state.nightStepAcks, [step]: [...cur, seat] },
  };
}

function stepFullyAcked(state: OnuwPrivateState): boolean {
  const step = currentStep(state);
  if (!step) return false;
  const acks = state.nightStepAcks[step.stepIndex] ?? [];
  return step.seats.every((s) => acks.includes(s));
}

function ensureSeatInStep(step: ReturnType<typeof currentStep>, seat: SeatIndex): void {
  if (!step) throw new Error('No active night step');
  if (!step.seats.includes(seat)) {
    throw new Error(`Seat ${seat} is not part of the current night step (${step.role})`);
  }
}

// === Vote resolution ========================================================
//
// ONUW vote rules:
//  - Each player privately votes for one player.
//  - The seat(s) with the most votes are killed.
//  - Ties: ALL tied seats die.
//  - If every seat receives exactly one vote and there's a 3+-way tie, no
//    one dies (unless allowNoLynch is false — then everyone tied dies).
//  - Hunter: if killed, the seat the Hunter voted for is also killed.
//  - Prince: cannot be killed by vote; votes against Prince are ignored.
//  - Ricochet Rhino: votes against Rhino redirect to the next seat clockwise.
//  - Cursed: counts as werewolf for win conditions if killed.
//
// Win conditions (after deaths are resolved):
//  - Tanner (or Apprentice Tanner) is killed → Tanner wins. (Also good
//    wins if a non-tanner werewolf was also killed; rulebook ambiguity —
//    we use: Tanner wins + village wins if a werewolf also died.)
//  - At least one werewolf killed → village wins.
//  - No werewolves in play (all in center) AND no one was killed → village wins.
//  - No werewolves in play AND someone was killed → werewolves win.
//  - At least one werewolf in play AND no werewolves killed → werewolves win.

function resolveVotes(state: OnuwPrivateState): OnuwPrivateState {
  let next = { ...state, seats: state.seats.map((s) => ({ ...s })) };
  // Collect vote targets, applying Prince and Ricochet Rhino remappings.
  const tally: Record<SeatIndex, number> = {};
  for (let i = 0; i < next.seats.length; i++) tally[i] = 0;
  for (const voter of next.seats) {
    let target = voter.voteTarget;
    if (target === null) continue;
    target = remapVote(next, target);
    tally[target] = (tally[target] ?? 0) + 1;
  }
  // Find max votes.
  let maxVotes = 0;
  for (const v of Object.values(tally)) {
    if (v > maxVotes) maxVotes = v;
  }
  // Killed seats: all seats with the max vote count. If max is 1 and
  // allowNoLynch, no one dies. If max is 0, no one dies.
  let killed: SeatIndex[] = [];
  if (maxVotes >= 2) {
    killed = next.seats
      .filter((s) => tally[s.index] === maxVotes)
      .map((s) => s.index);
  } else if (maxVotes === 1 && !next.allowNoLynch) {
    killed = next.seats
      .filter((s) => tally[s.index] === maxVotes)
      .map((s) => s.index);
  }
  // Apply Hunter follow-up kills. If a Hunter is killed, their voteTarget
  // also dies (re-mapped through the same Prince/Ricochet rules).
  const hunterKills: SeatIndex[] = [];
  for (const k of killed) {
    if (next.seats[k]!.finalRole === 'hunter') {
      const t = next.seats[k]!.voteTarget;
      if (t !== null) {
        hunterKills.push(remapVote(next, t));
      }
    }
  }
  const finalKilled = Array.from(new Set([...killed, ...hunterKills]));
  // Mark seats killed.
  next.seats = next.seats.map((s) =>
    finalKilled.includes(s.index) ? { ...s, killed: true } : s,
  );
  next.killedSeats = finalKilled;
  next.voteTally = tally;
  next.phase = 'resolution';
  next.winnerTeam = determineWinner(next, finalKilled);
  return next;
}

function remapVote(state: OnuwPrivateState, target: SeatIndex): SeatIndex {
  // Prince: votes redirect to Prince's voter? No — Prince just can't be
  // killed. Easiest model: votes against Prince are NOT counted.
  // We achieve "not counted" by returning a sentinel — but that'd mess
  // tally typing. We use a "ghost seat" approach: return target as-is
  // but then ZERO Prince's tally afterwards. So just return target here
  // and post-process tallies.
  // Ricochet Rhino: votes redirect to next seat clockwise.
  const role = state.seats[target]?.finalRole;
  if (role === 'ricochetRhino') {
    return (target + 1) % state.seats.length;
  }
  return target;
}

function determineWinner(
  state: OnuwPrivateState,
  killedSeats: readonly SeatIndex[],
): 'village' | 'werewolves' | 'tanner' | null {
  const isWolf = (r: OnuwRoleId) => ROLES[r].team === 'werewolves';
  const isTanner = (r: OnuwRoleId) => ROLES[r].team === 'tanner';
  const hasWolfInPlay = state.seats.some((s) => isWolf(s.finalRole));
  const wolfKilled = killedSeats.some((i) => {
    const r = state.seats[i]!.finalRole;
    // Cursed also counts as wolf if killed.
    return isWolf(r) || r === 'cursed';
  });
  const tannerKilled = killedSeats.some((i) => isTanner(state.seats[i]!.finalRole));

  if (tannerKilled) {
    // Tanner wins; village ALSO wins if a wolf was also killed (common house rule).
    if (wolfKilled) {
      // Return a "joint" winner — for simplicity, label it tanner with a
      // note. Engine doesn't model joint wins; we pick tanner.
      return 'tanner';
    }
    return 'tanner';
  }

  if (!hasWolfInPlay) {
    // All wolves in center.
    if (killedSeats.length === 0) return 'village';
    return 'werewolves';
  }

  // Wolves in play.
  if (wolfKilled) return 'village';
  return 'werewolves';
}

// Prince protection: zero out votes against any seat whose finalRole is
// 'prince' before max-vote scan. We apply this BEFORE counting.
function applyPrinceImmunity(state: OnuwPrivateState): OnuwPrivateState {
  const next = { ...state, seats: state.seats.map((s) => ({ ...s })) };
  for (const seat of next.seats) {
    if (seat.voteTarget !== null && next.seats[seat.voteTarget]!.finalRole === 'prince') {
      seat.voteTarget = null;
    }
  }
  return next;
}

// === Module =================================================================

export const onuwModule: GameModule<OnuwPrivateState, OnuwPublicState, OnuwAction> = {
  id: 'onuw',
  displayName: 'One Night Ultimate Werewolf',
  minPlayers: 3,
  maxPlayers: 10,

  createInitialState(config: GameConfig): OnuwPrivateState {
    const opts = getOptions(config);
    const playerCount = opts.players?.length ?? 0;
    if (playerCount < this.minPlayers || playerCount > this.maxPlayers) {
      throw new Error(
        `ONUW requires ${this.minPlayers}-${this.maxPlayers} players (got ${playerCount})`,
      );
    }
    const err = validateRolePool(playerCount, opts.rolePool);
    if (err) throw new Error(err);
    return buildInitialPrivate(
      playerCount,
      opts.rolePool,
      opts.players.map((p) => p.name),
      config.seed,
      opts.dayDurationSec,
      opts.allowNoLynch,
    );
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyAction(state: OnuwPrivateState, action: OnuwAction): OnuwPrivateState {
    switch (action.type) {
      case 'ackRoleReveal': {
        if (state.phase !== 'setup') throw new Error('ackRoleReveal only valid in setup');
        const setupAcked = { ...state.setupAcked, [action.bySeat]: true };
        const allAcked = state.seats.every((s) => setupAcked[s.index]);
        if (!allAcked) return { ...state, setupAcked };
        // Move to night. Pre-run any observational auto steps at the front.
        let next: OnuwPrivateState = { ...state, setupAcked, phase: 'night' };
        const firstStep = next.nightSchedule[0];
        if (firstStep) {
          if (firstStep.role === 'dreamWolf') {
            return advanceStep(next);
          }
          if (OBSERVATIONAL_ROLES_NEED_ACK.has(firstStep.role)) {
            next = runAutoStep(next, firstStep.role, firstStep.seats);
          }
        }
        return next;
      }

      case 'startNight': {
        // Not used directly — ackRoleReveal transitions automatically once
        // all seats have acked.
        return state;
      }

      case 'nightAck': {
        if (state.phase !== 'night') throw new Error('nightAck only valid at night');
        const step = currentStep(state);
        if (!step) throw new Error('No active night step');
        ensureSeatInStep(step, action.bySeat);
        let next = recordStepAck(state, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) {
          next = advanceStep(next);
        }
        return next;
      }

      case 'seerLookSeat': {
        const step = currentStep(state);
        if (!step || step.role !== 'seer') throw new Error('Not Seer step');
        ensureSeatInStep(step, action.bySeat);
        let next = applySeerLookSeat(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'seerLookCenter': {
        const step = currentStep(state);
        if (!step || step.role !== 'seer') throw new Error('Not Seer step');
        ensureSeatInStep(step, action.bySeat);
        let next = applySeerLookCenter(state, action.bySeat, action.centerIndices);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'robberSwap': {
        const step = currentStep(state);
        if (!step || step.role !== 'robber') throw new Error('Not Robber step');
        ensureSeatInStep(step, action.bySeat);
        if (action.targetSeat === action.bySeat) {
          throw new Error('Robber cannot target themselves');
        }
        let next = applyRobberSwap(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'robberSkip': {
        const step = currentStep(state);
        if (!step || step.role !== 'robber') throw new Error('Not Robber step');
        ensureSeatInStep(step, action.bySeat);
        let next = recordStepAck(state, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'troublemakerSwap': {
        const step = currentStep(state);
        if (!step || step.role !== 'troublemaker') throw new Error('Not Troublemaker step');
        ensureSeatInStep(step, action.bySeat);
        if (action.a === action.b || action.a === action.bySeat || action.b === action.bySeat) {
          throw new Error('Troublemaker must swap two distinct OTHER seats');
        }
        let next = applyTroublemakerSwap(state, action.bySeat, action.a, action.b);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'drunkSwap': {
        const step = currentStep(state);
        if (!step || step.role !== 'drunk') throw new Error('Not Drunk step');
        ensureSeatInStep(step, action.bySeat);
        let next = applyDrunkSwap(state, action.bySeat, action.centerIndex);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'loneWolfPeekCenter': {
        const step = currentStep(state);
        if (!step || (step.role !== 'werewolf' && step.role !== 'alphaWolf' && step.role !== 'mysticWolf')) {
          throw new Error('Not a werewolf step');
        }
        ensureSeatInStep(step, action.bySeat);
        // Lone wolf only — must be the only awake wolf.
        const otherWolves = state.seats.filter(
          (s) => s.index !== action.bySeat && (s.dealtRole === 'werewolf' || s.dealtRole === 'alphaWolf' || s.dealtRole === 'mysticWolf'),
        );
        if (otherWolves.length > 0) throw new Error('Not a lone wolf');
        let next = applyLoneWolfPeek(state, action.bySeat, action.centerIndex);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'loneWolfSkip': {
        const step = currentStep(state);
        if (!step || (step.role !== 'werewolf' && step.role !== 'alphaWolf' && step.role !== 'mysticWolf')) {
          throw new Error('Not a werewolf step');
        }
        ensureSeatInStep(step, action.bySeat);
        let next = recordStepAck(state, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }

      // -- Daybreak --
      case 'doppelgangerCopy': {
        const step = currentStep(state);
        if (!step || step.role !== 'doppelganger') throw new Error('Not Doppelganger step');
        ensureSeatInStep(step, action.bySeat);
        if (action.targetSeat === action.bySeat) throw new Error('Doppelganger cannot copy itself');
        let next = applyDoppelgangerCopy(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'apprenticeSeerLook': {
        const step = currentStep(state);
        if (!step || step.role !== 'apprenticeSeer') throw new Error('Not Apprentice Seer step');
        ensureSeatInStep(step, action.bySeat);
        let next = applyApprenticeSeerLook(state, action.bySeat, action.centerIndex);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'paranormalLook': {
        const step = currentStep(state);
        if (!step || step.role !== 'paranormalInvestigator') throw new Error('Not PI step');
        ensureSeatInStep(step, action.bySeat);
        const before = state.seats[action.bySeat]!.observations.length;
        const next0 = applyParanormalLook(state, action.bySeat, action.targetSeat);
        const after = next0.seats[action.bySeat]!.observations.length;
        // If PI joined a team (observation count grew by 2 instead of 1), end their step.
        const joined = after - before > 1;
        // If we've looked once and haven't joined, we COULD look once more.
        // For UI simplicity: any subsequent paranormalLook by the same seat
        // is also fine. We require an explicit paranormalStop to advance.
        let next = next0;
        if (joined) {
          next = recordStepAck(next, step.stepIndex, action.bySeat);
          if (stepFullyAcked(next)) next = advanceStep(next);
          return next;
        }
        // Track "looks taken" in observations count - if 2 lookups, auto-stop.
        const looks = next.seats[action.bySeat]!.observations.length;
        if (looks >= 2) {
          next = recordStepAck(next, step.stepIndex, action.bySeat);
          if (stepFullyAcked(next)) next = advanceStep(next);
        }
        return next;
      }
      case 'paranormalStop': {
        const step = currentStep(state);
        if (!step || step.role !== 'paranormalInvestigator') throw new Error('Not PI step');
        ensureSeatInStep(step, action.bySeat);
        let next = recordStepAck(state, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'witchSwap': {
        const step = currentStep(state);
        if (!step || step.role !== 'witch') throw new Error('Not Witch step');
        ensureSeatInStep(step, action.bySeat);
        let next = applyWitchSwap(state, action.bySeat, action.centerIndex, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'witchSkip': {
        const step = currentStep(state);
        if (!step || step.role !== 'witch') throw new Error('Not Witch step');
        ensureSeatInStep(step, action.bySeat);
        let next = recordStepAck(state, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'villageIdiotShift': {
        const step = currentStep(state);
        if (!step || step.role !== 'villageIdiot') throw new Error('Not Village Idiot step');
        ensureSeatInStep(step, action.bySeat);
        let next = applyVillageIdiotShift(state, action.bySeat, action.direction);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'villageIdiotSkip': {
        const step = currentStep(state);
        if (!step || step.role !== 'villageIdiot') throw new Error('Not Village Idiot step');
        ensureSeatInStep(step, action.bySeat);
        let next = recordStepAck(state, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'revealerFlip': {
        const step = currentStep(state);
        if (!step || step.role !== 'revealer') throw new Error('Not Revealer step');
        ensureSeatInStep(step, action.bySeat);
        let next = applyRevealerFlip(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'revealerSkip': {
        const step = currentStep(state);
        if (!step || step.role !== 'revealer') throw new Error('Not Revealer step');
        ensureSeatInStep(step, action.bySeat);
        let next = recordStepAck(state, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'curatorGive': {
        const step = currentStep(state);
        if (!step || step.role !== 'curator') throw new Error('Not Curator step');
        ensureSeatInStep(step, action.bySeat);
        let next = applyCuratorGive(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'alphaWolfConvert': {
        const step = currentStep(state);
        if (!step || step.role !== 'alphaWolf') throw new Error('Not Alpha Wolf step');
        ensureSeatInStep(step, action.bySeat);
        if (action.targetSeat === action.bySeat) throw new Error('Cannot convert self');
        let next = applyAlphaWolfConvert(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'mysticWolfLook': {
        const step = currentStep(state);
        if (!step || step.role !== 'mysticWolf') throw new Error('Not Mystic Wolf step');
        ensureSeatInStep(step, action.bySeat);
        if (action.targetSeat === action.bySeat) throw new Error('Cannot look at self');
        let next = applyMysticWolfLook(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }

      // -- Bonus --
      case 'thingTap': {
        const step = currentStep(state);
        if (!step || step.role !== 'thing') throw new Error('Not Thing step');
        ensureSeatInStep(step, action.bySeat);
        // Must be an adjacent seat.
        const n = state.seats.length;
        const left = (action.bySeat - 1 + n) % n;
        const right = (action.bySeat + 1) % n;
        if (action.targetSeat !== left && action.targetSeat !== right) {
          throw new Error('Thing can only tap neighbors');
        }
        let next = applyThingTap(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'bodySnatcherSwap': {
        const step = currentStep(state);
        if (!step || step.role !== 'bodySnatcher') throw new Error('Not Body Snatcher step');
        ensureSeatInStep(step, action.bySeat);
        if (action.targetSeat === action.bySeat) throw new Error('Cannot snatch self');
        let next = applyBodySnatcherSwap(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'windyWendyShift': {
        const step = currentStep(state);
        if (!step || step.role !== 'windyWendy') throw new Error('Not Windy Wendy step');
        ensureSeatInStep(step, action.bySeat);
        if (action.sourceSeat === action.bySeat) {
          throw new Error('Cannot shift self');
        }
        let next = applyWindyWendyShift(state, action.bySeat, action.sourceSeat, action.direction);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }
      case 'defenderProtect': {
        const step = currentStep(state);
        if (!step || step.role !== 'defenderEr') throw new Error('Not Defender step');
        ensureSeatInStep(step, action.bySeat);
        let next = applyDefenderProtect(state, action.bySeat, action.targetSeat);
        next = recordStepAck(next, step.stepIndex, action.bySeat);
        if (stepFullyAcked(next)) next = advanceStep(next);
        return next;
      }

      // -- Day → voting → resolution --
      case 'startVote': {
        if (state.phase !== 'day') throw new Error('startVote only valid in day');
        return { ...state, phase: 'voting', voteAcks: [] };
      }
      case 'castVote': {
        if (state.phase !== 'voting') throw new Error('castVote only valid in voting');
        if (state.seats[action.bySeat]!.voteTarget !== null) {
          throw new Error(`Seat ${action.bySeat} has already voted`);
        }
        let next = {
          ...state,
          seats: state.seats.map((s, i) =>
            i === action.bySeat ? { ...s, voteTarget: action.targetSeat } : s,
          ),
          voteAcks: state.voteAcks.includes(action.bySeat)
            ? state.voteAcks
            : [...state.voteAcks, action.bySeat],
        };
        // Auto-resolve when every seat has voted.
        const everyoneVoted = next.seats.every((s) => s.voteTarget !== null);
        if (everyoneVoted) {
          next = applyPrinceImmunity(next);
          next = resolveVotes(next);
        }
        return next;
      }
      case 'resolveVotes': {
        // Manual resolve (host wants to advance with abstentions).
        if (state.phase !== 'voting') throw new Error('resolveVotes only valid in voting');
        let next = applyPrinceImmunity(state);
        next = resolveVotes(next);
        return next;
      }
      case 'ackGameOver': {
        if (state.phase !== 'resolution') return state;
        return { ...state, phase: 'gameOver' };
      }
    }
  },

  viewFor(state: OnuwPrivateState, seat: SeatIndex | null): OnuwPublicState {
    const isOver = state.phase === 'resolution' || state.phase === 'gameOver';
    const ownSeat = seat === null ? null : state.seats[seat] ?? null;
    const step = currentStep(state);
    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: s.name,
        hasAckedSetup: !!state.setupAcked[s.index],
        hasVoted: s.voteTarget !== null,
        voteTarget: isOver ? s.voteTarget : null,
        votesReceived: isOver ? state.voteTally[s.index] ?? 0 : 0,
        killed: s.killed,
        revealedRole: isOver ? s.finalRole : null,
        artifacts: s.artifacts,
      })),
      centerCards: state.centerCards.map((c) => ({
        index: c.index,
        revealedRole: isOver ? c.role : null,
      })),
      rolePool: state.rolePool,
      nightStepIndex: state.nightStepIndex,
      nightTotalSteps: state.nightSchedule.length,
      activeNightStep:
        state.phase === 'night' && step
          ? {
              role: step.role,
              seats: step.seats,
              acked: state.nightStepAcks[step.stepIndex] ?? [],
              interactive: step.interactive,
            }
          : null,
      yourSeat: seat,
      yourDealtRole: ownSeat?.dealtRole ?? null,
      yourFinalRole: ownSeat?.finalRole ?? null,
      yourObservations: ownSeat?.observations ?? [],
      yourVoteTarget: ownSeat?.voteTarget ?? null,
      winnerTeam: state.winnerTeam,
      killedSeats: isOver ? state.killedSeats : [],
      voteTally: isOver ? state.voteTally : {},
    };
  },

  isFinished(state: OnuwPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    const baseRoles: OnuwRoleId[] = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker'];
    const filler: OnuwRoleId[] = Array(Math.max(0, playerCount + 3 - baseRoles.length)).fill(
      'villager',
    );
    const options: OnuwOptions = {
      rolePool: [...baseRoles, ...filler].slice(0, playerCount + 3),
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
      artifactPool: [],
      dayDurationSec: 300,
      allowNoLynch: true,
    };
    return {
      gameId: 'onuw',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};

export { ROLES };
