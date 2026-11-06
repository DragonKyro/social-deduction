import type { GameConfig, SeatIndex } from '@/engine/types';
import type { OnuwAction } from './actions';
import { onuwModule, type OnuwOptions } from './module';
import { buildInitialPrivate, buildNightSchedule } from './setup';
import type { OnuwPrivateState, OnuwRoleId } from './state';
import { aiChooseAction } from './ai';
import { alphaTargets, yourNightStep } from './view';

// Helpers shared by the ONUW tests. Plain functions (no test-runner
// imports) so the file typechecks with the rest of the module.

export function makeConfig(rolePool: OnuwRoleId[], playerCount: number, seed = 1): GameConfig {
  const opts: OnuwOptions = {
    rolePool,
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}`, isAI: false })),
    artifactPool: [],
    dayDurationSec: 300,
    allowNoLynch: true,
  };
  return { gameId: 'onuw', seats: [], seed, gameOptions: opts as unknown as Record<string, unknown> };
}

/** Build a state with a fixed deal: `seatRoles[i]` to seat i, `center` in the middle. */
export function rig(
  seatRoles: OnuwRoleId[],
  center: [OnuwRoleId, OnuwRoleId, OnuwRoleId],
  opts: { seed?: number; allowNoLynch?: boolean } = {},
): OnuwPrivateState {
  const pool = [...seatRoles, ...center];
  const n = seatRoles.length;
  const names = seatRoles.map((_, i) => `P${i + 1}`);
  const base = buildInitialPrivate(n, pool, names, opts.seed ?? 1, 300, opts.allowNoLynch ?? true);
  const seats = base.seats.map((s, i) => ({
    ...s,
    dealtRole: seatRoles[i]!,
    finalRole: seatRoles[i]!,
    finalCard: seatRoles[i]!,
  }));
  return {
    ...base,
    seats,
    centerCards: center.map((r, i) => ({ index: i, role: r, card: r })),
    nightSchedule: buildNightSchedule(seats, pool),
  };
}

export function act(state: OnuwPrivateState, action: OnuwAction): OnuwPrivateState {
  return onuwModule.applyAction(state, action, '');
}

export function ackAll(state: OnuwPrivateState): OnuwPrivateState {
  let s = state;
  for (const seat of s.seats) s = act(s, { type: 'ackRoleReveal', bySeat: seat.index });
  return s;
}

/** The seat(s) currently owed an action at night. */
export function awake(state: OnuwPrivateState): SeatIndex[] {
  return state.seats.map((s) => s.index).filter((i) => yourNightStep(state, i) !== null);
}

/** The simplest legal move for `seat`'s current night step (pass if allowed). */
export function defaultNightMove(state: OnuwPrivateState, seat: SeatIndex): OnuwAction {
  const step = yourNightStep(state, seat);
  if (!step) throw new Error(`seat ${seat} is not awake`);
  if (step.canPass) return { type: 'nightAck', bySeat: seat };
  const n = state.seats.length;
  switch (step.role) {
    case 'doppelganger':
      return { type: 'doppelgangerCopy', bySeat: seat, targetSeat: (seat + 1) % n };
    case 'drunk':
      return { type: 'drunkSwap', bySeat: seat, centerIndex: 0 };
    case 'thing':
      return { type: 'thingTap', bySeat: seat, targetSeat: (seat + 1) % n };
    case 'alphaWolf':
      return { type: 'alphaWolfConvert', bySeat: seat, targetSeat: alphaTargets(state, seat)[0]! };
    default:
      throw new Error(`no default for ${step.role}`);
  }
}

/** Finish the night, letting `choose` override any seat's move. */
export function playNight(
  state: OnuwPrivateState,
  choose: (s: OnuwPrivateState, seat: SeatIndex) => OnuwAction | null = () => null,
): OnuwPrivateState {
  let s = state;
  for (let guard = 0; s.phase === 'night'; guard++) {
    if (guard > 200) throw new Error('night did not end');
    const seat = awake(s)[0];
    if (seat === undefined) throw new Error('night stalled: nobody awake');
    s = act(s, choose(s, seat) ?? defaultNightMove(s, seat));
  }
  return s;
}

export function voteAll(state: OnuwPrivateState, targets: SeatIndex[]): OnuwPrivateState {
  let s = state.phase === 'day' ? act(state, { type: 'startVote' }) : state;
  targets.forEach((t, by) => {
    s = act(s, { type: 'castVote', bySeat: by, targetSeat: t });
  });
  return s;
}

/**
 * All-AI self-play: every seat is driven by `aiChooseAction`; the harness
 * plays the host and dispatches the seatless phase controls (start vote,
 * finish). Every AI proposal must be legal. `onState` sees every state.
 */
export function selfPlay(
  initial: OnuwPrivateState,
  onState: (s: OnuwPrivateState) => void = () => {},
  maxSteps = 500,
): OnuwPrivateState {
  let s = initial;
  onState(s);
  let cursor = 0;
  for (let step = 0; step < maxSteps; step++) {
    if (onuwModule.isFinished(s)) return s;
    const n = s.seats.length;
    let acted = false;
    for (let k = 0; k < n && !acted; k++) {
      const seat = (cursor + k) % n;
      const action = aiChooseAction(s, seat);
      if (!action) continue;
      if ('bySeat' in action && action.bySeat !== seat) {
        throw new Error(`AI seat ${seat} proposed an action for seat ${action.bySeat}`);
      }
      try {
        s = act(s, action);
      } catch (e) {
        throw new Error(`AI seat ${seat} proposed an illegal ${action.type} in ${s.phase}: ${(e as Error).message}`);
      }
      cursor = (seat + 1) % n;
      acted = true;
    }
    if (!acted) {
      if (s.phase === 'day') s = act(s, { type: 'startVote' });
      else if (s.phase === 'resolution') s = act(s, { type: 'ackGameOver' });
      else throw new Error(`stalled in ${s.phase}: no AI seat would act`);
    }
    onState(s);
  }
  throw new Error('self-play did not finish');
}
