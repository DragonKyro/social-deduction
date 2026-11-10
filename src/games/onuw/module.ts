import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { OnuwAction } from './actions';
import { aiChooseAction } from './ai';
import { RECOMMENDED_POOLS, ROLES } from './roles';
import { resolveVotes } from './resolve';
import { buildInitialPrivate, validateRolePool } from './setup';
import {
  OBSERVATIONAL_ROLES,
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
  applyWitchLook,
  applyWitchSwap,
  isLoneWolf,
  runAutoStep,
} from './night';
import type {
  OnuwArtifactId,
  OnuwNightStep,
  OnuwPrivateState,
  OnuwPublicState,
  OnuwRoleId,
} from './state';
import { alphaTargets, currentStep, hasActedThisStep, isValidSeat, viewFor, yourNightStep } from './view';

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

// === Night cursor ===========================================================

// Move the cursor to `index`, silently resolving steps that have no seats
// (roles whose cards are all in the center). Entering an observation step
// hands its seats their information immediately.
function activateFrom(state: OnuwPrivateState, index: number): OnuwPrivateState {
  const schedule = state.nightSchedule.slice();
  let i = index;
  while (i < schedule.length && schedule[i]!.seats.length === 0) {
    schedule[i] = { ...schedule[i]!, resolved: true };
    i++;
  }
  let next: OnuwPrivateState = { ...state, nightSchedule: schedule, nightStepIndex: i };
  if (i >= schedule.length) return { ...next, phase: 'day' };
  const step = schedule[i]!;
  if (OBSERVATIONAL_ROLES.has(step.role)) next = runAutoStep(next, step);
  return next;
}

function advanceStep(state: OnuwPrivateState): OnuwPrivateState {
  const schedule = state.nightSchedule.slice();
  schedule[state.nightStepIndex] = { ...schedule[state.nightStepIndex]!, resolved: true };
  return activateFrom({ ...state, nightSchedule: schedule }, state.nightStepIndex + 1);
}

// Record that `seat` is done with the current step; advance once every seat
// of the step is done.
function finishTurn(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const step = currentStep(state)!;
  const acks = state.nightStepAcks[step.stepIndex] ?? [];
  const next: OnuwPrivateState = {
    ...state,
    nightStepAcks: { ...state.nightStepAcks, [step.stepIndex]: [...acks, seat] },
  };
  const done = next.nightStepAcks[step.stepIndex]!;
  return step.seats.every((s) => done.includes(s)) ? advanceStep(next) : next;
}

// Validate that `seat` may take a night action for one of `roles` right now.
function requireTurn(
  state: OnuwPrivateState,
  seat: unknown,
  roles: readonly OnuwRoleId[],
): OnuwNightStep {
  if (state.phase !== 'night') throw new Error('Night actions are only valid at night');
  if (!isValidSeat(state, seat)) throw new Error(`Invalid seat ${String(seat)}`);
  const step = currentStep(state);
  if (!step) throw new Error('No active night step');
  if (!roles.includes(step.role)) {
    throw new Error(`It is not the ${roles.map((r) => ROLES[r].name).join(' / ')} step`);
  }
  if (!step.seats.includes(seat)) throw new Error(`Seat ${seat} is not awake for this step`);
  if (hasActedThisStep(state, seat)) throw new Error(`Seat ${seat} has already acted this step`);
  return step;
}

function requireOther(state: OnuwPrivateState, bySeat: SeatIndex, target: unknown, what: string): SeatIndex {
  if (!isValidSeat(state, target)) throw new Error(`${what}: invalid seat ${String(target)}`);
  if (target === bySeat) throw new Error(`${what}: must target another player`);
  return target;
}

function requireCenter(state: OnuwPrivateState, index: unknown, what: string): number {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= state.centerCards.length) {
    throw new Error(`${what}: invalid center card ${String(index)}`);
  }
  return index;
}

function requireDirection(dir: unknown): 'left' | 'right' {
  if (dir !== 'left' && dir !== 'right') throw new Error(`Invalid direction ${String(dir)}`);
  return dir;
}

function applyNightAction(state: OnuwPrivateState, action: OnuwAction): OnuwPrivateState {
  if (!('bySeat' in action)) throw new Error(`${action.type} must carry bySeat`);
  const by = action.bySeat;
  switch (action.type) {
    case 'nightAck':
    case 'loneWolfSkip':
    case 'paranormalStop':
    case 'robberSkip':
    case 'witchSkip':
    case 'villageIdiotSkip':
    case 'revealerSkip': {
      const roleFor: Partial<Record<OnuwAction['type'], OnuwRoleId[]>> = {
        loneWolfSkip: ['werewolf', 'mysticWolf'],
        paranormalStop: ['paranormalInvestigator'],
        robberSkip: ['robber'],
        witchSkip: ['witch'],
        villageIdiotSkip: ['villageIdiot'],
        revealerSkip: ['revealer'],
      };
      const step = currentStep(state);
      const roles = roleFor[action.type] ?? (step ? [step.role] : []);
      requireTurn(state, by, roles);
      const mine = yourNightStep(state, by)!;
      if (!mine.canPass) throw new Error(`The ${ROLES[mine.role].name} must act`);
      return finishTurn(state, by);
    }

    // -- Base game --
    case 'seerLookSeat': {
      requireTurn(state, by, ['seer']);
      const t = requireOther(state, by, action.targetSeat, 'Seer');
      return finishTurn(applySeerLookSeat(state, by, t), by);
    }
    case 'seerLookCenter': {
      requireTurn(state, by, ['seer']);
      const pair = action.centerIndices;
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('Seer: pick two center cards');
      const a = requireCenter(state, pair[0], 'Seer');
      const b = requireCenter(state, pair[1], 'Seer');
      if (a === b) throw new Error('Seer: pick two different center cards');
      return finishTurn(applySeerLookCenter(state, by, [a, b]), by);
    }
    case 'robberSwap': {
      requireTurn(state, by, ['robber']);
      const t = requireOther(state, by, action.targetSeat, 'Robber');
      return finishTurn(applyRobberSwap(state, by, t), by);
    }
    case 'troublemakerSwap': {
      requireTurn(state, by, ['troublemaker']);
      const a = requireOther(state, by, action.a, 'Troublemaker');
      const b = requireOther(state, by, action.b, 'Troublemaker');
      if (a === b) throw new Error('Troublemaker must swap two different players');
      return finishTurn(applyTroublemakerSwap(state, by, a, b), by);
    }
    case 'drunkSwap': {
      requireTurn(state, by, ['drunk']);
      const c = requireCenter(state, action.centerIndex, 'Drunk');
      return finishTurn(applyDrunkSwap(state, by, c), by);
    }
    case 'loneWolfPeekCenter': {
      requireTurn(state, by, ['werewolf']);
      if (!isLoneWolf(state, by)) throw new Error('Only a lone werewolf may look at a center card');
      const c = requireCenter(state, action.centerIndex, 'Werewolf');
      return finishTurn(applyLoneWolfPeek(state, by, c), by);
    }

    // -- Daybreak --
    case 'doppelgangerCopy': {
      requireTurn(state, by, ['doppelganger']);
      const t = requireOther(state, by, action.targetSeat, 'Doppelganger');
      return finishTurn(applyDoppelgangerCopy(state, by, t), by);
    }
    case 'apprenticeSeerLook': {
      requireTurn(state, by, ['apprenticeSeer']);
      const c = requireCenter(state, action.centerIndex, 'Apprentice Seer');
      return finishTurn(applyApprenticeSeerLook(state, by, c), by);
    }
    case 'paranormalLook': {
      requireTurn(state, by, ['paranormalInvestigator']);
      const t = requireOther(state, by, action.targetSeat, 'Paranormal Investigator');
      const looked = state.piLooks[by] ?? [];
      if (looked.includes(t)) throw new Error('Paranormal Investigator: already looked at that player');
      if (looked.length >= 2) throw new Error('Paranormal Investigator: at most two looks');
      const { state: next, converted } = applyParanormalLook(state, by, t);
      const looks = next.piLooks[by]?.length ?? 0;
      return converted || looks >= 2 ? finishTurn(next, by) : next;
    }
    case 'witchLook': {
      requireTurn(state, by, ['witch']);
      if (state.witchPeeks[by] !== undefined) throw new Error('Witch: already looked at a center card');
      const c = requireCenter(state, action.centerIndex, 'Witch');
      return applyWitchLook(state, by, c);
    }
    case 'witchSwap': {
      requireTurn(state, by, ['witch']);
      const c = requireCenter(state, action.centerIndex, 'Witch');
      const looked = state.witchPeeks[by];
      if (looked !== undefined && looked !== c) throw new Error('Witch: must hand out the card she looked at');
      if (!isValidSeat(state, action.targetSeat)) throw new Error('Witch: invalid seat');
      return finishTurn(applyWitchSwap(state, by, c, action.targetSeat), by);
    }
    case 'villageIdiotShift': {
      requireTurn(state, by, ['villageIdiot']);
      const dir = requireDirection(action.direction);
      return finishTurn(applyVillageIdiotShift(state, by, dir), by);
    }
    case 'revealerFlip': {
      requireTurn(state, by, ['revealer']);
      const t = requireOther(state, by, action.targetSeat, 'Revealer');
      return finishTurn(applyRevealerFlip(state, by, t), by);
    }
    case 'curatorGive': {
      requireTurn(state, by, ['curator']);
      const t = requireOther(state, by, action.targetSeat, 'Curator');
      return finishTurn(applyCuratorGive(state, by, t), by);
    }
    case 'alphaWolfConvert': {
      requireTurn(state, by, ['alphaWolf']);
      const t = requireOther(state, by, action.targetSeat, 'Alpha Wolf');
      if (!alphaTargets(state, by).includes(t)) throw new Error('Alpha Wolf must pick a non-werewolf');
      return finishTurn(applyAlphaWolfConvert(state, by, t), by);
    }
    case 'mysticWolfLook': {
      requireTurn(state, by, ['mysticWolf']);
      const t = requireOther(state, by, action.targetSeat, 'Mystic Wolf');
      return finishTurn(applyMysticWolfLook(state, by, t), by);
    }

    // -- Bonus --
    case 'thingTap': {
      requireTurn(state, by, ['thing']);
      const t = requireOther(state, by, action.targetSeat, 'The Thing');
      const n = state.seats.length;
      if (t !== (by - 1 + n) % n && t !== (by + 1) % n) throw new Error('The Thing can only tap a neighbor');
      return finishTurn(applyThingTap(state, by, t), by);
    }
    case 'bodySnatcherSwap': {
      requireTurn(state, by, ['bodySnatcher']);
      const t = requireOther(state, by, action.targetSeat, 'Body Snatcher');
      return finishTurn(applyBodySnatcherSwap(state, by, t), by);
    }
    case 'windyWendyShift': {
      requireTurn(state, by, ['windyWendy']);
      const src = requireOther(state, by, action.sourceSeat, 'Windy Wendy');
      const dir = requireDirection(action.direction);
      return finishTurn(applyWindyWendyShift(state, by, src, dir), by);
    }
    case 'defenderProtect': {
      requireTurn(state, by, ['defenderEr']);
      if (!isValidSeat(state, action.targetSeat)) throw new Error('Defender-er: invalid seat');
      return finishTurn(applyDefenderProtect(state, by, action.targetSeat), by);
    }
    default:
      throw new Error(`Unknown ONUW action ${(action as { type: string }).type}`);
  }
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
      opts.dayDurationSec ?? 300,
      opts.allowNoLynch ?? true,
    );
  },

  applyAction(state: OnuwPrivateState, action: OnuwAction): OnuwPrivateState {
    switch (action.type) {
      case 'ackRoleReveal': {
        if (state.phase !== 'setup') throw new Error('ackRoleReveal only valid in setup');
        if (!isValidSeat(state, action.bySeat)) throw new Error('Invalid seat');
        if (state.setupAcked[action.bySeat]) throw new Error('Role already acknowledged');
        const setupAcked = { ...state.setupAcked, [action.bySeat]: true };
        const next: OnuwPrivateState = { ...state, setupAcked };
        if (!state.seats.every((s) => setupAcked[s.index])) return next;
        return activateFrom({ ...next, phase: 'night' }, 0);
      }

      case 'startNight':
        throw new Error('The night starts automatically once every player has seen their role');

      case 'startVote': {
        if (state.phase !== 'day') throw new Error('startVote only valid in day');
        return { ...state, phase: 'voting', voteAcks: [] };
      }

      case 'castVote': {
        if (state.phase !== 'voting') throw new Error('castVote only valid in voting');
        const by = action.bySeat;
        if (!isValidSeat(state, by)) throw new Error('Invalid seat');
        if (state.seats[by]!.voteTarget !== null) throw new Error(`Seat ${by} has already voted`);
        const t = requireOther(state, by, action.targetSeat, 'Vote');
        const next: OnuwPrivateState = {
          ...state,
          seats: state.seats.map((s, i) => (i === by ? { ...s, voteTarget: t } : s)),
          voteAcks: [...state.voteAcks, by],
        };
        return next.seats.every((s) => s.voteTarget !== null) ? resolveVotes(next) : next;
      }

      case 'resolveVotes': {
        // Host override: count now, treating missing ballots as abstentions.
        if (state.phase !== 'voting') throw new Error('resolveVotes only valid in voting');
        return resolveVotes(state);
      }

      case 'ackGameOver': {
        if (state.phase !== 'resolution') throw new Error('ackGameOver only valid at resolution');
        return { ...state, phase: 'gameOver' };
      }

      default:
        return applyNightAction(state, action);
    }
  },

  viewFor,

  isFinished(state: OnuwPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    const n = Math.min(this.maxPlayers, Math.max(this.minPlayers, playerCount));
    const options: OnuwOptions = {
      rolePool: (RECOMMENDED_POOLS[n] ?? RECOMMENDED_POOLS[5]!).slice(),
      players: Array.from({ length: n }, (_, i) => ({
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
